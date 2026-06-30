import Link from "next/link";
import type { Flag, FlagSeverity } from "@/lib/rules";
import type { Momentum } from "@/lib/momentum";
import type { Stage, FactualityScore } from "@/db/schema";
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

const TRAJECTORY: Record<Momentum["trajectory"], [glyph: string, cls: string]> = {
  accelerating: ["↑", "text-emerald-600"],
  steady: ["→", "text-slate-400"],
  slowing: ["↓", "text-amber-600"],
  closed: ["×", "text-rose-500"],
};

function momentumColor(score: number, closed: boolean): string {
  if (closed) return "bg-slate-300";
  if (score >= 70) return "bg-emerald-500";
  if (score >= 45) return "bg-indigo-500";
  if (score >= 25) return "bg-amber-500";
  return "bg-slate-400";
}

export function MomentumMeter({
  momentum,
  size = "sm",
}: {
  momentum: Momentum;
  size?: "sm" | "lg";
}) {
  const closed = momentum.trajectory === "closed";
  const color = momentumColor(momentum.score, closed);
  const [glyph, glyphCls] = TRAJECTORY[momentum.trajectory];

  if (size === "lg") {
    return (
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold text-slate-900">
            {closed ? "—" : momentum.score}
          </span>
          <span className="text-sm text-slate-500">
            {closed ? "Closed" : `/ 100 · ${momentum.label}`}
          </span>
          <span className={cn("ml-auto text-sm capitalize", glyphCls)}>
            {glyph} {momentum.trajectory}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn("h-full rounded-full", color)}
            style={{ width: `${closed ? 100 : momentum.score}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Higher momentum = more likely to reach a successful hire — from stage progression,
          how recently they moved, and client engagement.
        </p>
        {momentum.factors.length > 0 && (
          <ul className="mt-3 space-y-1">
            {momentum.factors.map((f, i) => (
              <li key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{f.label}</span>
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    f.delta > 0
                      ? "text-emerald-600"
                      : f.delta < 0
                        ? "text-rose-600"
                        : "text-slate-400",
                  )}
                >
                  {f.delta > 0 ? `+${f.delta}` : f.delta === 0 ? "—" : f.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <span
          className={cn("block h-full rounded-full", color)}
          style={{ width: `${closed ? 100 : momentum.score}%` }}
        />
      </span>
      <span className="text-xs font-medium text-slate-600">
        {closed ? "Closed" : `${momentum.score} ${momentum.label}`}
      </span>
      <span className={cn("text-xs", glyphCls)} title={momentum.trajectory}>
        {glyph}
      </span>
    </span>
  );
}

// openevals factual-groundedness score (0–1) shown as a trust chip; hover for rationale.
export function FactualityBadge({ factuality }: { factuality?: FactualityScore | null }) {
  if (!factuality) return null;
  const pct = Math.round(factuality.score * 100);
  const cls =
    pct >= 80
      ? "bg-emerald-100 text-emerald-700"
      : pct >= 50
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-700";
  return (
    <span
      title={factuality.comment ?? undefined}
      className={cn(
        "inline-flex shrink-0 items-center rounded px-2 py-0.5 text-xs font-medium",
        cls,
      )}
    >
      Factuality {pct}%
    </span>
  );
}

// Shown on the calibration tags so the indigo chip can't be misread as a "top pick" —
// calibration is a bar-setting sample, not a ranking. Keep wording in sync with the
// Calibration set card on the role page.
export const CALIBRATION_HINT =
  "Sent up front as a deliberate spread to calibrate the bar — not a ranking or endorsement.";

export function Tag({
  children,
  tone = "slate",
  title,
}: {
  children: React.ReactNode;
  tone?: "slate" | "amber" | "indigo";
  title?: string;
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-100 text-amber-800",
    indigo: "bg-indigo-50 text-indigo-700",
  };
  return (
    <span title={title} className={cn("inline-flex rounded px-2 py-0.5 text-xs font-medium", tones[tone])}>
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
