import Link from "next/link";
import { notFound } from "next/navigation";
import { getRole, getRoleCandidates, type EnrichedCandidate } from "@/lib/data";
import { Card, FlagList, StageBadge, StageProgress, SectionTitle, Tag } from "@/components/ui";
import { formatBand, formatComp, STAGE_ORDER } from "@/lib/format";
import type { Stage } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function RolePage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;
  const role = await getRole(roleId);
  if (!role) notFound();

  const candidates = await getRoleCandidates(roleId);
  const calibration = candidates.filter((c) => c.calibration);

  // Single ordered list, sorted along the pipeline (new → … → hired → rejected).
  const orderIndex = (s: string) => {
    const i = STAGE_ORDER.indexOf(s as (typeof STAGE_ORDER)[number]);
    return i === -1 ? 99 : i;
  };
  const sorted = [...candidates].sort(
    (a, b) => orderIndex(a.stage) - orderIndex(b.stage) || a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← All searches
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{role.title}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {role.location} · {formatBand(role.compBand)} · target start {role.targetStart ?? "n/a"}
        </p>
      </div>

      <RoleSpec role={role} />

      {calibration.length > 0 && (
        <Card className="border-indigo-200 bg-indigo-50/40 p-4">
          <h2 className="text-sm font-semibold text-indigo-900">Calibration set</h2>
          <p className="mt-1 text-sm text-indigo-800/90">
            The recruiter sent {calibration.map((c) => c.name).join(", ")} first — a deliberate
            spread (a clear strong, a comp-flag, and a stretch) to align on the bar before reviewing
            the full pipeline. Worth calibrating on these before deciding the rest.
          </p>
        </Card>
      )}

      <section>
        <SectionTitle>Candidates · {candidates.length}</SectionTitle>
        <div className="space-y-3">
          {sorted.map((c) => (
            <CandidateRow key={c.id} candidate={c} />
          ))}
        </div>
      </section>
    </div>
  );
}

function RoleSpec({ role }: { role: Awaited<ReturnType<typeof getRole>> }) {
  if (!role) return null;
  return (
    <Card className="grid gap-4 p-5 sm:grid-cols-3">
      <SpecList title="Must-haves" items={role.mustHaves} />
      <SpecList title="Nice-to-haves" items={role.niceToHaves} />
      <SpecList title="Disqualifiers" items={role.disqualifiers} tone="rose" />
    </Card>
  );
}

function SpecList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone?: "rose";
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <ul className="space-y-1 text-sm">
        {items.map((it, i) => (
          <li key={i} className={tone === "rose" ? "text-rose-700" : "text-slate-700"}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CandidateRow({ candidate: c }: { candidate: EnrichedCandidate }) {
  return (
    <Link href={`/candidates/${c.id}`} className="block">
      <Card className="p-4 transition-colors hover:border-slate-300 hover:bg-slate-50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">{c.name}</span>
              {c.calibration && <Tag tone="indigo">calibration</Tag>}
            </div>
            <p className="truncate text-xs text-slate-500">{c.headline}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Comp {formatComp(c.compExpectation)} · {c.availability ?? "availability n/a"}
            </p>
          </div>
          <StageBadge stage={c.stage} />
        </div>
        {c.flags.length > 0 && (
          <div className="mt-2">
            <FlagList flags={c.flags} />
          </div>
        )}
        <StageProgress stage={c.stage} />
      </Card>
    </Link>
  );
}
