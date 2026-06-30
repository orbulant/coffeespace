import Link from "next/link";
import {
  getOverview,
  getRecentDigests,
  type EnrichedCandidate,
} from "@/lib/data";
import { sortBySeverity } from "@/lib/rules";
import { Card, FlagList, StageBadge, SectionTitle } from "@/components/ui";
import { AttentionDigest } from "@/components/AttentionDigest";
import { RetrospectPanel } from "@/components/RetrospectPanel";
import {
  eventLabel,
  formatBand,
  relativeDays,
  stageLabel,
  STAGE_ORDER,
} from "@/lib/format";
import { momentumRollup } from "@/lib/momentum";
import type { Stage } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { client, roles, candidates, recentEvents } = await getOverview();

  if (!client) {
    return <NotSeeded />;
  }

  const recentDigests = await getRecentDigests();
  const latestDigest = recentDigests[0];

  const attention = sortBySeverity(
    candidates.filter(
      (c) =>
        c.stage !== "rejected" && c.flags.some((f) => f.severity !== "info"),
    ),
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {client.companyName}
        </h1>
        {client.description && (
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {client.description}
          </p>
        )}
      </header>

      {/* Roles / pipeline health */}
      <section>
        <SectionTitle>Open Role Searches</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          {roles.map((role) => {
            const roleCands = candidates.filter((c) => c.roleId === role.id);
            const roll = momentumRollup(roleCands);
            return (
              <Card key={role.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <Link
                      href={`/roles/${role.id}`}
                      className="text-base font-semibold text-slate-900 hover:underline"
                    >
                      {role.title}
                    </Link>
                    <p className="text-xs text-slate-500">{role.location}</p>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    {roleCands.length} candidates
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {formatBand(role.compBand)}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <StageCounts candidates={roleCands} />
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="uppercase tracking-wide text-slate-400">
                      Search momentum
                    </span>
                    <span className="font-medium text-slate-700">
                      {roll.score} · {roll.label}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${roll.score}%` }}
                    />
                  </div>
                </div>
                <Link
                  href={`/roles/${role.id}`}
                  className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
                >
                  View pipeline →
                </Link>
              </Card>
            );
          })}
        </div>
      </section>

      {/* AI pipeline summary (cached; auto-generates on first load) + retrospect */}
      <section className="space-y-4">
        <AttentionDigest
          initialDigest={latestDigest?.content ?? null}
          initialCreatedAt={latestDigest?.createdAt?.toISOString()}
          initialFactuality={latestDigest?.factuality ?? null}
        />
        <RetrospectPanel kind="digest" historyCount={recentDigests.length} />
      </section>

      {/* Rule-based attention list */}
      <section>
        <SectionTitle>Needs your attention</SectionTitle>
        {attention.length === 0 ? (
          <Card className="p-5 text-sm text-slate-600">
            Nothing flagged right now.
          </Card>
        ) : (
          <Card className="divide-y divide-slate-100">
            {attention.map((c) => (
              <Link
                key={c.id}
                href={`/candidates/${c.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{c.name}</span>
                    <StageBadge stage={c.stage} />
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {c.headline} · {c.role.title}
                  </p>
                </div>
                <div className="shrink-0">
                  <FlagList
                    flags={c.flags.filter((f) => f.severity !== "info")}
                  />
                </div>
              </Link>
            ))}
          </Card>
        )}
      </section>

      {/* Recent activity */}
      <section>
        <SectionTitle>What changed recently</SectionTitle>
        <Card className="divide-y divide-slate-100">
          {recentEvents.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between px-5 py-2.5 text-sm"
            >
              <span className="text-slate-700">
                <Link
                  href={`/candidates/${e.candidateId}`}
                  className="font-medium hover:underline"
                >
                  {e.candidateName}
                </Link>{" "}
                — {eventLabel(e.type)}
                {e.actor ? (
                  <span className="text-slate-400"> by {e.actor}</span>
                ) : null}
              </span>
              <span className="text-xs text-slate-400">
                {relativeDays(e.at)}
              </span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}

function StageCounts({ candidates }: { candidates: EnrichedCandidate[] }) {
  const counts = new Map<Stage, number>();
  for (const c of candidates)
    counts.set(c.stage, (counts.get(c.stage) ?? 0) + 1);
  const present = STAGE_ORDER.filter((s) => counts.has(s));
  if (!present.length)
    return <span className="text-xs text-slate-400">No candidates yet</span>;
  return (
    <>
      {present.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-inset ring-slate-200"
        >
          <span className="font-semibold text-slate-900">{counts.get(s)}</span>
          {stageLabel(s)}
        </span>
      ))}
    </>
  );
}

function NotSeeded() {
  return (
    <Card className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-lg font-semibold">No data yet</h1>
      <p className="mt-2 text-sm text-slate-600">
        The database is reachable but has no client. Create the tables and load
        the seed:
      </p>
      <pre className="mt-4 rounded-md bg-slate-900 p-3 text-left text-xs text-slate-100">
        pnpm db:push{"\n"}pnpm db:seed
      </pre>
    </Card>
  );
}
