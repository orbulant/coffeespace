import "server-only";
import { eq, inArray, asc } from "drizzle-orm";
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
} from "@/db/schema";
import { CLIENT_ID } from "./config";
import { computeFlags, type Flag } from "./rules";

export type Client = InferSelectModel<typeof clients>;
export type Role = InferSelectModel<typeof roles>;
export type Candidate = InferSelectModel<typeof candidates>;
export type CandidateEvent = InferSelectModel<typeof candidateEvents>;
export type Feedback = InferSelectModel<typeof feedbackHistory>;
export type Source = InferSelectModel<typeof candidateSources>;
export type Brief = InferSelectModel<typeof aiBriefs>;

export type EnrichedCandidate = Candidate & {
  role: Role;
  flags: Flag[];
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

/** Overview: client, roles, every candidate enriched with rule flags, and a recent-activity feed. */
export async function getOverview() {
  const [client, allRoles, allCandidates, allEvents] = await Promise.all([
    getClient(),
    db.select().from(roles).where(eq(roles.clientId, CLIENT_ID)),
    db.select().from(candidates),
    db.select().from(candidateEvents),
  ]);

  const roleById = new Map(allRoles.map((r) => [r.id, r]));
  const eventsByCandidate = groupBy(allEvents, (e) => e.candidateId);

  const enriched: EnrichedCandidate[] = allCandidates.map((c) => {
    const role = roleById.get(c.roleId)!;
    const evs = eventsByCandidate.get(c.id) ?? [];
    return {
      ...c,
      role,
      flags: computeFlags(c, role, evs),
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
  const evs = await db
    .select()
    .from(candidateEvents)
    .where(inArray(candidateEvents.candidateId, ids));
  const eventsByCandidate = groupBy(evs, (e) => e.candidateId);
  return cands.map((c) => {
    const e = eventsByCandidate.get(c.id) ?? [];
    return { ...c, role, flags: computeFlags(c, role, e), lastEventAt: lastEventAt(e) };
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
    flags: computeFlags(candidate, role!, events),
    latestBrief,
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
