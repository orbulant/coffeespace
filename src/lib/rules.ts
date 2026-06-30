import type { InferSelectModel } from "drizzle-orm";
import type { candidates, roles, candidateEvents } from "@/db/schema";
import { daysBetween } from "./format";
import { STALE_AFTER_DAYS } from "./config";

type Candidate = InferSelectModel<typeof candidates>;
type Role = InferSelectModel<typeof roles>;
type Event = InferSelectModel<typeof candidateEvents>;

export type FlagSeverity = "blocker" | "warning" | "info";

export type Flag = {
  type: string;
  severity: FlagSeverity;
  label: string;
  detail: string;
};

const SEVERITY_RANK: Record<FlagSeverity, number> = {
  blocker: 0,
  warning: 1,
  info: 2,
};

const ACTIVE_STAGES = ["reviewing", "shortlisted", "interviewing"];

function needsSponsorship(workAuth?: string | null): boolean {
  if (!workAuth) return false;
  return /sponsor|h-1b|h1b|not authorized|requires? .*visa|relocation \+ visa/i.test(
    workAuth,
  );
}

function roleDisqualifiesSponsorship(role: Role): boolean {
  return (role.disqualifiers ?? []).some((d) => /sponsor|visa/i.test(d));
}

function lastEventDate(events: Event[]): string | null {
  const dated = events
    .map((e) => e.at)
    .filter(Boolean)
    .sort();
  return dated.length ? dated[dated.length - 1]! : null;
}

/**
 * The rule-based "attention" engine. Pure function over a candidate + its role +
 * its events — no AI. Drives the badges on every candidate and feeds the AI
 * digest. Designed to connect candidate facts to role rules (the planted traps),
 * not just render fields.
 */
export function computeFlags(
  candidate: Candidate,
  role: Role,
  events: Event[] = [],
  sources: { kind: string; recordedAt: string | null }[] = [],
): Flag[] {
  const flags: Flag[] = [];

  // 1. Sponsorship vs role disqualifier (hard stop).
  if (needsSponsorship(candidate.workAuthorization)) {
    const blocked = roleDisqualifiesSponsorship(role);
    flags.push({
      type: "work_authorization",
      severity: blocked ? "blocker" : "warning",
      label: blocked ? "Hard stop: sponsorship" : "Work authorization",
      detail: blocked
        ? `${candidate.workAuthorization}. This role explicitly cannot sponsor — connect to the role's disqualifiers before submitting.`
        : `${candidate.workAuthorization}. Confirm this is workable for the role.`,
    });
  }

  // 2. Comp vs band.
  const base = candidate.compExpectation?.base;
  const max = role.compBand?.base_max;
  const min = role.compBand?.base_min;
  if (base != null && max != null) {
    if (base > max) {
      flags.push({
        type: "comp_over_band",
        severity: "warning",
        label: "Comp above band",
        detail: `Expects $${base.toLocaleString()} base vs role band top of $${max.toLocaleString()}.${
          candidate.compExpectation?.notes ? ` "${candidate.compExpectation.notes}"` : ""
        }`,
      });
    } else if (base === max) {
      flags.push({
        type: "comp_top_of_band",
        severity: "info",
        label: "Top of band",
        detail: `At the top of the band ($${max.toLocaleString()}).`,
      });
    } else if (min != null && base < min) {
      flags.push({
        type: "comp_below_band",
        severity: "info",
        label: "Below band",
        detail: `Below the band floor — often a seniority signal.`,
      });
    }
  }

  // 3. Missing decision-critical fields.
  const missing: string[] = [];
  if (candidate.compExpectation?.base == null) missing.push("compensation");
  if (!candidate.availability) missing.push("availability");
  if (missing.length) {
    flags.push({
      type: "missing_info",
      severity: "warning",
      label: "Missing key info",
      detail: `Not provided: ${missing.join(" and ")}. Track as open question, don't assume.`,
    });
  }

  // 4. Timing risk (months out vs target start).
  if (candidate.availability && /month/i.test(candidate.availability)) {
    flags.push({
      type: "timing_risk",
      severity: "warning",
      label: "Timing risk",
      detail: `Available in ${candidate.availability}${
        role.targetStart ? ` — role targets ${role.targetStart}.` : "."
      }`,
    });
  }

  // 5. Location conflict (in-office role, out-of-area candidate).
  if (
    role.location &&
    /in-office/i.test(role.location) &&
    candidate.location &&
    !/san francisco|sf\b/i.test(candidate.location)
  ) {
    flags.push({
      type: "location_conflict",
      severity: "warning",
      label: "Location conflict",
      detail: `Role is ${role.location}; candidate is in ${candidate.location}.`,
    });
  }

  // 6. Recruiter holding (awaiting info / flagged).
  const holdEvent = events.find(
    (e) => e.type === "recruiter_awaiting_info" || e.type === "recruiter_flagged",
  );
  if (holdEvent && candidate.stage === "new") {
    const detail =
      (holdEvent.meta?.detail as string | undefined) ?? "held before submitting";
    flags.push({
      type: "recruiter_hold",
      severity: "info",
      label: "Recruiter holding",
      detail: `Not yet submitted — ${detail}.`,
    });
  }

  // 7. Staleness (active stage, no recent activity).
  if (ACTIVE_STAGES.includes(candidate.stage)) {
    const last = lastEventDate(events);
    if (last) {
      const days = daysBetween(last);
      if (!isNaN(days) && days > STALE_AFTER_DAYS) {
        flags.push({
          type: "stale",
          severity: "info",
          label: "Going stale",
          detail: `No activity in ${days} days while ${candidate.stage}.`,
        });
      }
    }
  }

  // Conflicting information — surfaced as a single flag here; the detailed,
  // value-by-value breakdown is produced by detectConflicts() for the detail page.
  const cf = conflictFlag(detectConflicts(candidate, role, sources));
  if (cf) flags.push(cf);

  return flags.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/**
 * Conflict detection: where information about a candidate disagrees, point it out
 * with BOTH values rather than silently trusting one. Deterministic and honest —
 * it flags the kinds of disagreement we can verify without guessing. The AI brief
 * goes further and reconciles values buried in free-text source artifacts.
 */
export type CandidateConflict = {
  field: string;
  values: { label: string; value: string }[];
  note: string;
};

const LEAD_TITLE = /\b(lead|manager|director|head of|vp|vice president|chief)\b/i;
const IC_ROLE = /\b(engineer|designer|developer)\b/i;

export function detectConflicts(
  candidate: Candidate,
  role: Role,
  sources: { kind: string; recordedAt: string | null }[] = [],
): CandidateConflict[] {
  const conflicts: CandidateConflict[] = [];

  // A) The structured record may be stale relative to a newer source artifact.
  const record = candidate.addedAt;
  const newer = sources
    .filter((s) => s.recordedAt && record && s.recordedAt > record)
    .sort((a, b) => (a.recordedAt! < b.recordedAt! ? 1 : -1));
  if (newer.length) {
    const latest = newer[0];
    conflicts.push({
      field: "Record may be out of date",
      values: [
        { label: "Structured record", value: `captured ${record}` },
        { label: `Newest source — ${latest.kind}`, value: `${latest.recordedAt} (newer)` },
      ],
      note: "A source artifact postdates the structured record, so the comp / location / availability shown may be stale. The latest source is treated as the source of truth — verify the fields against it (the AI brief lists each value and reconciles them).",
    });
  }

  // B) Management/lead track vs an individual-contributor role.
  if (
    candidate.currentTitle &&
    LEAD_TITLE.test(candidate.currentTitle) &&
    role.title &&
    IC_ROLE.test(role.title) &&
    !LEAD_TITLE.test(role.title)
  ) {
    conflicts.push({
      field: "Seniority track",
      values: [
        { label: "Current title", value: candidate.currentTitle },
        { label: "This role", value: `${role.title} (individual contributor)` },
      ],
      note: "Currently on a lead/management track, but this is an IC seat. Confirm they want to go hands-on rather than assuming either way.",
    });
  }

  return conflicts;
}

export function conflictFlag(conflicts: CandidateConflict[]): Flag | null {
  if (!conflicts.length) return null;
  return {
    type: "conflict",
    severity: "warning",
    label: "Conflicting info",
    detail: `${conflicts.map((c) => c.field.toLowerCase()).join("; ")} — surfaced, not resolved.`,
  };
}

export function topSeverity(flags: Flag[]): FlagSeverity | null {
  if (!flags.length) return null;
  return flags.reduce<FlagSeverity>(
    (acc, f) => (SEVERITY_RANK[f.severity] < SEVERITY_RANK[acc] ? f.severity : acc),
    "info",
  );
}

export function sortBySeverity<T extends { flags: Flag[] }>(items: T[]): T[] {
  const rank = (t: T) => {
    const s = topSeverity(t.flags);
    return s ? SEVERITY_RANK[s] : 99;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}
