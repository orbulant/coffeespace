import Link from "next/link";
import { notFound } from "next/navigation";
import { getRole, getRoleCandidatesWithBriefs } from "@/lib/data";
import { Card } from "@/components/ui";
import { RoleBriefs } from "@/components/RoleBriefs";
import { formatBand, STAGE_ORDER } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RolePage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;
  const role = await getRole(roleId);
  if (!role) notFound();

  const candidates = await getRoleCandidatesWithBriefs(roleId);
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
            spread, from a clear strong down to a stretch, to help you pin down where your bar sits
            before reviewing the full pipeline. Being in this set isn&apos;t a ranking or an
            endorsement; the point is the range. Calibrate on these, then judge the rest against the
            bar you set here.
          </p>
        </Card>
      )}

      <RoleBriefs candidates={sorted} />
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

