import "server-only";
import { eq, inArray, asc, desc } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  roles,
  candidates,
  candidateEvents,
  feedbackHistory,
  candidateSources,
  aiBriefs,
  aiDigests,
} from "@/db/schema";
import type { FactualityScore } from "@/db/schema";
import { CLIENT_ID } from "./config";
import { computeFlags, detectConflicts, type Flag } from "./rules";
import { computeMomentum, type Momentum } from "./momentum";

export type Client = InferSelectModel<typeof clients>;
export type Role = InferSelectModel<typeof roles>;
export type Candidate = InferSelectModel<typeof candidates>;
export type CandidateEvent = InferSelectModel<typeof candidateEvents>;
export type Feedback = InferSelectModel<typeof feedbackHistory>;
export type Source = InferSelectModel<typeof candidateSources>;
export type Brief = InferSelectModel<typeof aiBriefs>;
export type Digest = InferSelectModel<typeof aiDigests>;

export type EnrichedCandidate = Candidate & {
  role: Role;
  flags: Flag[];
  momentum: Momentum;
  lastEventAt: string | null;
};

function lastEventAt(events: CandidateEvent[]): string | null {
  const dated = events.map((e) => e.at).filter(Boolean).sort();
  return dated.length ? dated[dated.length - 1]! : null;
}

export async function getClient(): Promise<Client | undefined> {
  const rows = await db.select().from(clients).where(eq(clients.id, CLIENT_ID));
  return rows[0];
}

export async function getRole(roleId: string): Promise<Role | undefined> {
  const rows = await db.select().from(roles).where(eq(roles.id, roleId));
  return rows[0];
}

/** Most recently generated pipeline digest (shown on load; null if none yet). */
export async function getLatestDigest(): Promise<Digest | undefined> {
  const rows = await db
    .select()
    .from(aiDigests)
    .where(eq(aiDigests.clientId, CLIENT_ID))
    .orderBy(desc(aiDigests.createdAt))
    .limit(1);
  return rows[0];
}

/** Recent digests, newest first — for the pipeline Retrospect. */
export async function getRecentDigests(limit = 10): Promise<Digest[]> {
  return db
    .select()
    .from(aiDigests)
    .where(eq(aiDigests.clientId, CLIENT_ID))
    .orderBy(desc(aiDigests.createdAt))
    .limit(limit);
}

/** Recent briefs for one candidate, newest first — for the candidate Retrospect. */
export async function getRecentBriefs(candidateId: string, limit = 10): Promise<Brief[]> {
  return db
    .select()
    .from(aiBriefs)
    .where(eq(aiBriefs.candidateId, candidateId))
    .orderBy(desc(aiBriefs.createdAt))
    .limit(limit);
}

/** Overview: client, roles, every candidate enriched with rule flags, and a recent-activity feed. */
export async function getOverview() {
  const [client, allRoles, allCandidates, allEvents, allSources] = await Promise.all([
    getClient(),
    db.select().from(roles).where(eq(roles.clientId, CLIENT_ID)),
    db.select().from(candidates),
    db.select().from(candidateEvents),
    db.select().from(candidateSources),
  ]);

  const roleById = new Map(allRoles.map((r) => [r.id, r]));
  const eventsByCandidate = groupBy(allEvents, (e) => e.candidateId);
  const sourcesByCandidate = groupBy(allSources, (s) => s.candidateId);

  const enriched: EnrichedCandidate[] = allCandidates.map((c) => {
    const role = roleById.get(c.roleId)!;
    const evs = eventsByCandidate.get(c.id) ?? [];
    const srcs = sourcesByCandidate.get(c.id) ?? [];
    return {
      ...c,
      role,
      flags: computeFlags(c, role, evs, srcs),
      momentum: computeMomentum(c, evs),
      lastEventAt: lastEventAt(evs),
    };
  });

  const candidateName = new Map(allCandidates.map((c) => [c.id, c.name]));
  const recentEvents = [...allEvents]
    .filter((e) => !!e.at)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 12)
    .map((e) => ({
      ...e,
      candidateName: candidateName.get(e.candidateId) ?? e.candidateId,
    }));

  return { client, roles: allRoles, candidates: enriched, recentEvents };
}

/** Candidates for a single role, enriched. */
export async function getRoleCandidates(roleId: string): Promise<EnrichedCandidate[]> {
  const role = await getRole(roleId);
  if (!role) return [];
  const cands = await db.select().from(candidates).where(eq(candidates.roleId, roleId));
  if (!cands.length) return [];
  const ids = cands.map((c) => c.id);
  const [evs, srcs] = await Promise.all([
    db.select().from(candidateEvents).where(inArray(candidateEvents.candidateId, ids)),
    db.select().from(candidateSources).where(inArray(candidateSources.candidateId, ids)),
  ]);
  const eventsByCandidate = groupBy(evs, (e) => e.candidateId);
  const sourcesByCandidate = groupBy(srcs, (s) => s.candidateId);
  return cands.map((c) => {
    const e = eventsByCandidate.get(c.id) ?? [];
    const s = sourcesByCandidate.get(c.id) ?? [];
    return {
      ...c,
      role,
      flags: computeFlags(c, role, e, s),
      momentum: computeMomentum(c, e),
      lastEventAt: lastEventAt(e),
    };
  });
}

/** The latest saved brief's headline numbers, for the role-page confidence view. */
export type RoleCandidateBrief = {
  confidenceScore: number;
  rationale: string;
  factuality: FactualityScore | null;
  createdAt: string;
};

export type RoleCandidateWithBrief = EnrichedCandidate & {
  brief: RoleCandidateBrief | null;
};

/**
 * Role candidates enriched with their most recent saved AI brief (or null if none
 * exists yet). Drives the role page, where briefs are generated on visit and their
 * confidence scores are shown inline.
 */
export async function getRoleCandidatesWithBriefs(
  roleId: string,
): Promise<RoleCandidateWithBrief[]> {
  const cands = await getRoleCandidates(roleId);
  if (!cands.length) return [];

  const ids = cands.map((c) => c.id);
  const briefs = await db
    .select()
    .from(aiBriefs)
    .where(inArray(aiBriefs.candidateId, ids))
    .orderBy(desc(aiBriefs.createdAt));

  // Newest-first ordering means the first row we see per candidate is the latest.
  const latestByCandidate = new Map<string, Brief>();
  for (const b of briefs) {
    if (!latestByCandidate.has(b.candidateId)) latestByCandidate.set(b.candidateId, b);
  }

  return cands.map((c) => {
    const b = latestByCandidate.get(c.id);
    return {
      ...c,
      brief: b
        ? {
            confidenceScore: b.content.confidence_score,
            rationale: b.content.confidence_rationale,
            factuality: b.factuality,
            createdAt: b.createdAt.toISOString(),
          }
        : null,
    };
  });
}

/** Everything needed to render a candidate detail page + power the AI brief. */
export async function getCandidateFull(id: string) {
  const candRows = await db.select().from(candidates).where(eq(candidates.id, id));
  const candidate = candRows[0];
  if (!candidate) return null;

  const [role, events, feedback, sources, briefs] = await Promise.all([
    getRole(candidate.roleId),
    db
      .select()
      .from(candidateEvents)
      .where(eq(candidateEvents.candidateId, id))
      .orderBy(asc(candidateEvents.at)),
    db
      .select()
      .from(feedbackHistory)
      .where(eq(feedbackHistory.candidateId, id))
      .orderBy(asc(feedbackHistory.at)),
    db.select().from(candidateSources).where(eq(candidateSources.candidateId, id)),
    db.select().from(aiBriefs).where(eq(aiBriefs.candidateId, id)),
  ]);

  // oldest → newest; undated artifacts first (treated as stale baseline).
  const sortedSources = [...sources].sort((a, b) =>
    (a.recordedAt ?? "") < (b.recordedAt ?? "")
      ? -1
      : (a.recordedAt ?? "") > (b.recordedAt ?? "")
        ? 1
        : 0,
  );
  const latestBrief = [...briefs].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];

  return {
    candidate,
    role: role!,
    events,
    feedback,
    sources: sortedSources,
    flags: computeFlags(candidate, role!, events, sortedSources),
    conflicts: detectConflicts(candidate, role!, sortedSources),
    momentum: computeMomentum(candidate, events),
    latestBrief,
    briefCount: briefs.length,
  };
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}
