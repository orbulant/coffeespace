import type { InferSelectModel } from "drizzle-orm";
import type { candidates, candidateEvents } from "@/db/schema";
import { REFERENCE_DATE } from "./config";
import { daysBetween, stageLabel } from "./format";

type Candidate = InferSelectModel<typeof candidates>;
type Event = InferSelectModel<typeof candidateEvents>;

/**
 * Momentum: a deterministic 0–100 read on a candidate's trajectory toward a hire.
 * It is NOT a quality score — it measures movement. A candidate advances by reaching
 * later stages, moving recently, and drawing client engagement; momentum decays when
 * they go quiet or get held. Higher momentum ⇒ more likely to reach a successful
 * outcome for this search. Every point is attributed to a factor so the number is
 * explainable rather than a black box.
 */

export type MomentumFactor = { label: string; delta: number };

export type Momentum = {
  score: number; // 0–100
  label: "High" | "Moderate" | "Low" | "Minimal" | "Closed";
  trajectory: "accelerating" | "steady" | "slowing" | "closed";
  factors: MomentumFactor[];
};

const STAGE_RANK: Record<string, number> = {
  new: 0,
  reviewing: 1,
  shortlisted: 2,
  interviewing: 3,
  hired: 4,
};

const REF_ISO = REFERENCE_DATE.toISOString().slice(0, 10);

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function computeMomentum(candidate: Candidate, events: Event[] = []): Momentum {
  if (candidate.stage === "rejected") {
    return {
      score: 0,
      label: "Closed",
      trajectory: "closed",
      factors: [{ label: "Rejected — out of the running", delta: 0 }],
    };
  }

  const factors: MomentumFactor[] = [];
  const add = (label: string, delta: number) => {
    if (delta !== 0) factors.push({ label, delta });
  };
  const has = (type: string) => events.some((e) => e.type === type);

  // An interview already on the calendar means the candidate is in motion, even if
  // the last *logged* event is a little old — so it suppresses the staleness penalty.
  const upcomingInterview = events.some(
    (e) => e.type === "interview_scheduled" && !!e.at && e.at > REF_ISO,
  );

  // 1) How far they've advanced — the dominant signal.
  const rank = STAGE_RANK[candidate.stage] ?? 0;
  add(`Reached ${stageLabel(candidate.stage)}`, rank * 16); // reviewing 16 … interviewing 48

  // Entering client review at all is real progress.
  if (has("submitted_to_client")) add("Submitted to client", 6);

  // 2) Advancement velocity — how recently they moved forward a stage.
  const forwardMoves = events
    .filter((e) => {
      if (e.type !== "moved_stage" || !e.at) return false;
      const from = STAGE_RANK[String(e.meta?.from)] ?? -1;
      const to = STAGE_RANK[String(e.meta?.to)] ?? -1;
      // Genuine advancement only: `from` must be a real pipeline stage, so a
      // reopen (rejected → reviewing) doesn't count as moving forward.
      return from >= 0 && to > from;
    })
    .map((e) => e.at!)
    .sort();
  const lastForward = forwardMoves.at(-1) ?? null;
  if (lastForward) {
    const d = daysBetween(lastForward);
    if (!isNaN(d)) {
      if (d <= 7) add("Advanced a stage this week", 20);
      else if (d <= 14) add("Advanced a stage recently", 12);
      else if (d <= 30) add("Advanced a stage (3+ weeks ago)", 5);
    }
  }

  // 3) Client engagement — the client leaning in raises the odds.
  if (upcomingInterview) add("Interview scheduled", 15);
  if (has("client_commented")) add("Client commented", 8);
  if (has("client_opened_profile")) add("Client opened profile", 4);

  // 4) Staleness — decay when nothing has happened (and no interview pending).
  const lastPast = events
    .filter((e) => e.at && e.at <= REF_ISO)
    .map((e) => e.at!)
    .sort()
    .at(-1);
  if (!upcomingInterview && lastPast) {
    const d = daysBetween(lastPast);
    if (!isNaN(d) && d > 7) {
      const pen = d > 30 ? -25 : d > 14 ? -15 : -8;
      add(`No activity in ${d} days`, pen);
    }
  }

  // 5) Held / blocked — not actually progressing.
  if (
    candidate.stage === "new" &&
    (has("recruiter_awaiting_info") || has("recruiter_flagged"))
  ) {
    add("On hold — not yet submitted", -15);
  }

  const score = clamp(factors.reduce((s, f) => s + f.delta, 0));

  const recentForward = !!lastForward && daysBetween(lastForward) <= 7;
  const goneQuiet = !upcomingInterview && !!lastPast && daysBetween(lastPast) > 14;
  const trajectory: Momentum["trajectory"] =
    recentForward || upcomingInterview ? "accelerating" : goneQuiet ? "slowing" : "steady";

  const label: Momentum["label"] =
    score >= 70 ? "High" : score >= 45 ? "Moderate" : score >= 25 ? "Low" : "Minimal";

  return { score, label, trajectory, factors };
}

/** Search-level momentum: the mean across candidates still in the running. */
export function momentumRollup(
  items: { stage: string; momentum: Momentum }[],
): { score: number; label: Momentum["label"] } {
  const active = items.filter((i) => i.stage !== "rejected" && i.stage !== "hired");
  if (!active.length) return { score: 0, label: "Minimal" };
  const score = Math.round(
    active.reduce((s, i) => s + i.momentum.score, 0) / active.length,
  );
  const label: Momentum["label"] =
    score >= 70 ? "High" : score >= 45 ? "Moderate" : score >= 25 ? "Low" : "Minimal";
  return { score, label };
}
