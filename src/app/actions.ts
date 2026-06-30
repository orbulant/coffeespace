"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { candidates, candidateEvents, aiBriefs, aiDigests } from "@/db/schema";
import type { Stage } from "@/db/schema";
import { CLIENT_ID } from "@/lib/config";
import {
  getCandidateFull,
  getClient,
  getOverview,
  getRecentDigests,
  getRecentBriefs,
} from "@/lib/data";
import { synthesizeBrief, type BriefResult } from "@/lib/ai/brief";
import { synthesizeDigest, type DigestResult } from "@/lib/ai/digest";
import { synthesizeRetrospect, type RetrospectResult } from "@/lib/ai/retrospect";
import { scoreFactuality } from "@/lib/ai/factuality";

const ACTOR = "Client (you)";
const today = () => new Date().toISOString().slice(0, 10);

async function recordEvent(
  candidateId: string,
  type: string,
  meta?: Record<string, unknown>,
) {
  await db.insert(candidateEvents).values({
    candidateId,
    type,
    at: today(),
    actor: ACTOR,
    meta: meta ?? null,
  });
}

async function setStage(candidateId: string, to: Stage) {
  const rows = await db
    .select({ stage: candidates.stage })
    .from(candidates)
    .where(eq(candidates.id, candidateId));
  const from = rows[0]?.stage;
  await db
    .update(candidates)
    .set({ stage: to })
    .where(eq(candidates.id, candidateId));
  await recordEvent(candidateId, "moved_stage", { from, to });
}

export async function shortlistCandidate(id: string) {
  await setStage(id, "shortlisted");
  revalidatePath(`/candidates/${id}`);
  revalidatePath("/");
}

export async function moveToStage(id: string, stage: Stage) {
  await setStage(id, stage);
  revalidatePath(`/candidates/${id}`);
  revalidatePath("/");
}

const REJECT_REASONS = [
  "Wrong domain",
  "Too junior",
  "Compensation mismatch",
  "Startup experience",
  "Location / visa",
  "Other",
] as const;

export async function rejectCandidate(
  id: string,
  reason: string,
  notes: string,
) {
  const safeReason = (REJECT_REASONS as readonly string[]).includes(reason)
    ? reason
    : "Other";
  await db
    .update(candidates)
    .set({
      stage: "rejected",
      rejection: {
        reason: safeReason,
        notes: notes?.trim() || undefined,
        rejected_by: ACTOR,
        rejected_at: today(),
      },
    })
    .where(eq(candidates.id, id));
  await recordEvent(id, "rejected", { reason: safeReason });
  revalidatePath(`/candidates/${id}`);
  revalidatePath("/");
}

export async function reopenCandidate(id: string) {
  await db
    .update(candidates)
    .set({ stage: "reviewing", rejection: null })
    .where(eq(candidates.id, id));
  await recordEvent(id, "moved_stage", { from: "rejected", to: "reviewing" });
  revalidatePath(`/candidates/${id}`);
  revalidatePath("/");
}

/** Generate + persist a candidate brief. Returns the result for the client to render. */
export async function generateBrief(id: string): Promise<BriefResult> {
  const [full, client] = await Promise.all([getCandidateFull(id), getClient()]);
  if (!full) return { ok: false, error: "Candidate not found." };

  const result = await synthesizeBrief({
    candidate: full.candidate,
    role: full.role,
    sources: full.sources,
    feedback: full.feedback,
    clientCompany: client?.companyName ?? "the client",
    clientPreferences: client?.preferences ?? null,
  });

  if (!result.ok) return result;

  // Score factual groundedness against the source material the brief was built from.
  const context = JSON.stringify({
    candidate: full.candidate,
    role: full.role,
    sources: full.sources.map((s) => ({
      kind: s.kind,
      recordedAt: s.recordedAt,
      content: s.content,
    })),
    feedback: full.feedback,
    clientPreferences: client?.preferences ?? null,
  });
  const factuality = await scoreFactuality(result.object, context);

  await db.insert(aiBriefs).values({
    candidateId: id,
    model: result.model,
    content: result.object,
    factuality,
  });
  revalidatePath(`/candidates/${id}`);
  return { ...result, factuality };
}

/** Generate + persist the pipeline attention digest. Latest is shown on load. */
export async function generatePipelineDigest(): Promise<DigestResult> {
  const { client, candidates: cands, recentEvents } = await getOverview();

  const digestInput = {
    clientCompany: client?.companyName ?? "the client",
    clientPreferences: client?.preferences ?? null,
    candidates: cands
      .filter((c) => c.stage !== "rejected" && c.stage !== "hired")
      .map((c) => ({
        name: c.name,
        role: c.role.title,
        stage: c.stage,
        flags: c.flags,
        lastEventAt: c.lastEventAt,
      })),
    recentEvents: recentEvents.map((e) => ({
      type: e.type,
      at: e.at,
      candidateName: e.candidateName,
    })),
  };

  const result = await synthesizeDigest(digestInput);
  if (!result.ok) return result;

  const factuality = await scoreFactuality(result.object, JSON.stringify(digestInput));
  await db.insert(aiDigests).values({
    clientId: client?.id ?? CLIENT_ID,
    model: result.model,
    content: result.object,
    factuality,
  });
  revalidatePath("/");
  return { ...result, factuality };
}

/** Retrospect over the last few saved pipeline digests — what changed over time. */
export async function generateDigestRetrospect(): Promise<RetrospectResult> {
  const digests = await getRecentDigests(5);
  const snapshots = [...digests]
    .reverse()
    .map((d) => ({ at: d.createdAt.toISOString(), content: d.content }));
  const result = await synthesizeRetrospect("digest", snapshots);
  if (!result.ok) return result;
  const factuality = await scoreFactuality(result.object, JSON.stringify(snapshots));
  return { ...result, factuality };
}

/** Retrospect over the last few saved briefs for one candidate — what changed over time. */
export async function generateBriefRetrospect(candidateId: string): Promise<RetrospectResult> {
  const briefs = await getRecentBriefs(candidateId, 5);
  const snapshots = [...briefs]
    .reverse()
    .map((b) => ({ at: b.createdAt.toISOString(), content: b.content }));
  const result = await synthesizeRetrospect("brief", snapshots);
  if (!result.ok) return result;
  const factuality = await scoreFactuality(result.object, JSON.stringify(snapshots));
  return { ...result, factuality };
}
