"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { generateBrief } from "@/app/actions";
import type { RoleCandidateWithBrief } from "@/lib/data";
import type { FactualityScore } from "@/db/schema";
import { formatComp } from "@/lib/format";
import {
  Card,
  SectionTitle,
  FlagList,
  StageBadge,
  StageProgress,
  MomentumMeter,
  FactualityBadge,
  Tag,
  cn,
} from "./ui";

// Per-candidate brief state on the role page. "saved" = loaded from the DB on this
// visit; "done" = just generated in the browser this session.
type BriefState = {
  status: "saved" | "idle" | "generating" | "done" | "error";
  confidence: number | null;
  rationale: string | null;
  factuality: FactualityScore | null;
  error?: string;
};

// How many briefs to generate at once — a small pool keeps the page responsive
// without firing every candidate's model call (brief + factuality judge) at once.
const CONCURRENCY = 3;

const initialState = (candidates: RoleCandidateWithBrief[]): Record<string, BriefState> =>
  Object.fromEntries(
    candidates.map((c) => [
      c.id,
      c.brief
        ? {
            status: "saved" as const,
            confidence: c.brief.confidenceScore,
            rationale: c.brief.rationale,
            factuality: c.brief.factuality,
          }
        : { status: "idle" as const, confidence: null, rationale: null, factuality: null },
    ]),
  );

export function RoleBriefs({ candidates }: { candidates: RoleCandidateWithBrief[] }) {
  const [state, setState] = useState<Record<string, BriefState>>(() => initialState(candidates));
  const started = useRef(false);

  const runOne = async (id: string) => {
    setState((s) => ({ ...s, [id]: { ...s[id], status: "generating" } }));
    const r = await generateBrief(id);
    setState((s) => ({
      ...s,
      [id]: r.ok
        ? {
            status: "done",
            confidence: r.object.confidence_score,
            rationale: r.object.confidence_rationale,
            factuality: r.factuality ?? null,
          }
        : { status: "error", confidence: null, rationale: null, factuality: null, error: r.error },
    }));
  };

  // Generate the given candidates with bounded concurrency (a shared cursor that
  // CONCURRENCY workers pull from).
  const generate = async (ids: string[]) => {
    let cursor = 0;
    const worker = async () => {
      while (cursor < ids.length) await runOne(ids[cursor++]);
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  };

  // On first visit: generate a brief for every candidate that doesn't already have
  // one saved. Existing briefs show their saved confidence immediately.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const missing = candidates.filter((c) => !c.brief).map((c) => c.id);
    if (missing.length) void generate(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = candidates.length;
  const ready = candidates.filter((c) => {
    const st = state[c.id]?.status;
    return st === "saved" || st === "done";
  }).length;
  const busy = candidates.some((c) => state[c.id]?.status === "generating");

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionTitle>Candidates · {total}</SectionTitle>
        <div className="flex shrink-0 items-center gap-3">
          <span className={cn("text-xs", busy ? "text-indigo-600" : "text-slate-400")}>
            {busy ? `Generating briefs… ${ready}/${total}` : `${ready}/${total} briefs ready`}
          </span>
          <button
            onClick={() => void generate(candidates.map((c) => c.id))}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Generating…" : "Regenerate all"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {candidates.map((c) => (
          <CandidateRow key={c.id} candidate={c} brief={state[c.id]} />
        ))}
      </div>
    </section>
  );
}

function CandidateRow({
  candidate: c,
  brief,
}: {
  candidate: RoleCandidateWithBrief;
  brief?: BriefState;
}) {
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

        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Momentum</span>
          <MomentumMeter momentum={c.momentum} />
        </div>

        <BriefConfidence brief={brief} />

        <StageProgress stage={c.stage} />
      </Card>
    </Link>
  );
}

function BriefConfidence({ brief }: { brief?: BriefState }) {
  const status = brief?.status ?? "idle";

  if (status === "generating") {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-indigo-600">
        <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
        Generating brief…
      </div>
    );
  }

  if (status === "error") {
    return <p className="mt-2 text-xs text-rose-600">Brief failed — {brief?.error}</p>;
  }

  if ((status === "saved" || status === "done") && brief?.confidence != null) {
    const pct = Math.max(0, Math.min(100, Math.round(brief.confidence)));
    const bar = pct >= 70 ? "bg-emerald-500" : pct >= 45 ? "bg-amber-500" : "bg-rose-500";
    const text = pct >= 70 ? "text-emerald-700" : pct >= 45 ? "text-amber-700" : "text-rose-700";
    return (
      <div className="mt-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">
            Brief confidence
          </span>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
            <span className={cn("block h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
          </span>
          <span className={cn("text-xs font-semibold tabular-nums", text)}>{pct}/100</span>
          {status === "done" && <span className="text-[10px] text-emerald-600">· just generated</span>}
          <FactualityBadge factuality={brief.factuality} />
        </div>
        {brief.rationale && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{brief.rationale}</p>
        )}
      </div>
    );
  }

  return <p className="mt-2 text-xs text-slate-400">Brief not generated yet.</p>;
}
