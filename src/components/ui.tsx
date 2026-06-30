import Link from "next/link";
import type { Flag, FlagSeverity } from "@/lib/rules";
import type { Stage } from "@/db/schema";
import { stageLabel } from "@/lib/format";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </h2>
  );
}

const SEVERITY_STYLES: Record<FlagSeverity, string> = {
  blocker: "bg-red-50 text-red-700 ring-red-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  info: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function FlagBadge({ flag }: { flag: Flag }) {
  return (
    <span
      title={flag.detail}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        SEVERITY_STYLES[flag.severity],
      )}
    >
      {flag.label}
    </span>
  );
}

export function FlagList({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f, i) => (
        <FlagBadge key={`${f.type}-${i}`} flag={f} />
      ))}
    </div>
  );
}

const STAGE_STYLES: Record<Stage, string> = {
  new: "bg-slate-100 text-slate-600",
  reviewing: "bg-blue-50 text-blue-700",
  shortlisted: "bg-emerald-50 text-emerald-700",
  interviewing: "bg-violet-50 text-violet-700",
  hired: "bg-emerald-600 text-white",
  rejected: "bg-rose-50 text-rose-700",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STAGE_STYLES[stage],
      )}
    >
      {stageLabel(stage)}
    </span>
  );
}

// Horizontal pipeline stepper showing which stage a candidate is in.
const PIPELINE: Stage[] = ["new", "reviewing", "shortlisted", "interviewing", "hired"];

export function StageProgress({ stage }: { stage: Stage }) {
  if (stage === "rejected") {
    return (
      <div className="mt-3">
        <div className="h-1.5 w-full rounded-full bg-rose-500" />
        <p className="mt-1 text-center text-[11px] font-semibold text-rose-600">Rejected</p>
      </div>
    );
  }
  const current = PIPELINE.indexOf(stage);
  return (
    <div className="mt-3">
      <div className="flex gap-1">
        {PIPELINE.map((s, i) => (
          <div
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i <= current ? "bg-emerald-500" : "bg-slate-200",
            )}
          />
        ))}
      </div>
      <div className="mt-1 flex">
        {PIPELINE.map((s, i) => (
          <span
            key={s}
            className={cn(
              "flex-1 text-center text-[10px]",
              i === current
                ? "font-semibold text-emerald-700"
                : i < current
                  ? "text-slate-500"
                  : "text-slate-300",
            )}
          >
            {stageLabel(s)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Tag({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "amber" | "indigo";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-100 text-amber-800",
    indigo: "bg-indigo-50 text-indigo-700",
  };
  return (
    <span className={cn("inline-flex rounded px-2 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function LinkButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}
