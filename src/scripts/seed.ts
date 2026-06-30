/**
 * Seed the database from the provided raw material.
 *
 *   pnpm db:push   # create tables first
 *   pnpm db:seed
 *
 * Idempotent: wipes the seeded tables and re-inserts. Ingests seed.json plus the
 * unstructured artifacts under data/raw — most importantly the five-source Jordan
 * Reyes dossier, which is what the AI brief synthesises (and resolves) over.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "fs";
import path from "path";
import {
  clients,
  roles,
  candidates,
  candidateEvents,
  feedbackHistory,
  candidateSources,
  aiBriefs,
  aiDigests,
} from "../db/schema";

const dataDir = path.join(process.cwd(), "data");

function readRaw(...p: string[]) {
  return readFileSync(path.join(dataDir, "raw", ...p), "utf8").trim();
}

async function main() {
  const { db } = await import("../db");

  const seed = JSON.parse(readFileSync(path.join(dataDir, "seed.json"), "utf8"));

  // Wipe (FK-safe order) so re-seeding is clean.
  await db.delete(aiDigests);
  await db.delete(aiBriefs);
  await db.delete(candidateSources);
  await db.delete(feedbackHistory);
  await db.delete(candidateEvents);
  await db.delete(candidates);
  await db.delete(roles);
  await db.delete(clients);

  // ── Client ──────────────────────────────────────────────────────────────────
  const c = seed.client;
  await db.insert(clients).values({
    id: c.id,
    companyName: c.company_name,
    description: c.description ?? null,
    contacts: c.contacts ?? [],
    preferences: c.preferences ?? null,
  });

  // ── Roles ───────────────────────────────────────────────────────────────────
  await db.insert(roles).values(
    seed.roles.map((r: any) => ({
      id: r.id,
      clientId: r.client_id,
      title: r.title,
      location: r.location ?? null,
      compBand: r.comp_band ?? null,
      employmentType: r.employment_type ?? null,
      mustHaves: r.must_haves ?? [],
      niceToHaves: r.nice_to_haves ?? [],
      disqualifiers: r.disqualifiers ?? [],
      status: r.status ?? "open",
      hiringManager: r.hiring_manager ?? null,
      openedAt: r.opened_at ?? null,
      targetStart: r.target_start ?? null,
    })),
  );

  // calibration_set: tag the named candidates so the UI can surface the bar-setting step.
  const calibrationIds: string[] = seed.calibration_set?.candidate_ids ?? [];

  // ── Candidates (+ events, feedback) ──────────────────────────────────────────
  for (const cand of seed.candidates) {
    await db.insert(candidates).values({
      id: cand.id,
      roleId: cand.role_id,
      name: cand.name,
      headline: cand.headline ?? null,
      currentCompany: cand.current_company ?? null,
      currentTitle: cand.current_title ?? null,
      location: cand.location ?? null,
      links: cand.links ?? null,
      careerHistory: cand.career_history ?? [],
      strengths: cand.strengths ?? [],
      concerns: cand.concerns ?? [],
      compExpectation: cand.comp_expectation ?? null,
      availability: cand.availability ?? null,
      workAuthorization: cand.work_authorization ?? null,
      stage: cand.stage,
      calibration: cand.calibration === true || calibrationIds.includes(cand.id),
      recruiterMemo: cand.recruiter_memo ?? null,
      rejection: cand.rejection ?? null,
      openQuestions: cand.open_questions ?? [],
      addedAt: cand.added_at ?? null,
    });

    const events = (cand.events ?? []).map((ev: any) => {
      const { type, at, actor, ...meta } = ev;
      return {
        candidateId: cand.id,
        type,
        at,
        actor: actor ?? null,
        meta: Object.keys(meta).length ? meta : null,
      };
    });
    if (events.length) await db.insert(candidateEvents).values(events);

    const feedback = (cand.feedback_history ?? []).map((f: any) => ({
      candidateId: cand.id,
      authorType: f.author_type,
      author: f.author ?? null,
      text: f.text,
      at: f.at ?? null,
    }));
    if (feedback.length) await db.insert(feedbackHistory).values(feedback);
  }

  // ── Unstructured sources ──────────────────────────────────────────────────────
  const sources: (typeof candidateSources.$inferInsert)[] = [];

  // Jordan Reyes (cand_001): five sources that disagree. recordedAt powers the
  // "freshest artifact wins" rule — the Jun-25 email is the latest word and
  // contradicts the stale structured record. Dates are approximate where the
  // artifact is undated (resume/linkedin), exact where the conversation is dated.
  const dossier = [
    { file: "resume.txt", kind: "resume", title: "Resume (plain text)", recordedAt: "2026-06-10" },
    { file: "linkedin.txt", kind: "linkedin", title: "LinkedIn profile (scraped)", recordedAt: "2026-06-10" },
    { file: "call-transcript.txt", kind: "call_transcript", title: "Recruiter screening call", recordedAt: "2026-06-18" },
    { file: "email-thread.txt", kind: "email_thread", title: "Email thread (most recent)", recordedAt: "2026-06-25" },
  ];
  for (const d of dossier) {
    sources.push({
      candidateId: "cand_001",
      kind: d.kind,
      title: d.title,
      content: readRaw("dossier-jordan-reyes", d.file),
      recordedAt: d.recordedAt,
    });
  }

  // Amara Okafor (cand_003): a plain-text resume artifact.
  sources.push({
    candidateId: "cand_003",
    kind: "resume",
    title: "Resume (plain text)",
    content: readRaw("sample-resume-amara-okafor.txt"),
    recordedAt: null,
  });

  // Recruiter Slack messages — the "before-state" the portal replaces. One per
  // candidate, in order: Jordan, Wei, Amara, Diego.
  const slackBlocks = readRaw("recruiter-slack-messages.txt")
    .split(/^─{3,}\s*$/m)
    .map((b) => b.trim())
    .filter((b) => b.startsWith("[Recruiter"));
  const slackOrder = ["cand_001", "cand_002", "cand_003", "cand_004"];
  slackBlocks.forEach((block, i) => {
    if (!slackOrder[i]) return;
    sources.push({
      candidateId: slackOrder[i],
      kind: "recruiter_slack",
      title: "Recruiter Slack message",
      content: block,
      recordedAt: null,
    });
  });

  await db.insert(candidateSources).values(sources);

  console.log(
    `Seeded: 1 client, ${seed.roles.length} roles, ${seed.candidates.length} candidates, ${sources.length} sources.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
