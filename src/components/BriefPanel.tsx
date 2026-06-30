"use client";

import { useState, useTransition } from "react";
import { generateBrief } from "@/app/actions";
import type { CandidateBrief } from "@/db/schema";
import { cn } from "./ui";

export function BriefPanel({
  candidateId,
  initialBrief,
  initialModel,
  initialCreatedAt,
}: {
  candidateId: string;
  initialBrief: CandidateBrief | null;
  initialModel?: string;
  initialCreatedAt?: string;
}) {
  const [brief, setBrief] = useState<CandidateBrief | null>(initialBrief);
  const [model, setModel] = useState<string | undefined>(initialModel);
  const [createdAt, setCreatedAt] = useState<string | undefined>(initialCreatedAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const generate = () =>
    startTransition(async () => {
      setError(null);
      const r = await generateBrief(candidateId);
      if (r.ok) {
        setBrief(r.object);
        setModel(r.model);
        setCreatedAt(new Date().toISOString());
      } else {
        setError(r.error);
      }
    });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          AI candidate brief
        </h2>
        <button
          onClick={generate}
          disabled={pending}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Synthesizing…" : brief ? "Regenerate" : "Generate brief"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Couldn&apos;t generate the brief: {error}
        </div>
      )}

      {!brief && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          Synthesizes a client-facing brief from the structured record <em>and</em> the source
          artifacts — resolving conflicts with a freshest-source-wins rule, framing fit against{" "}
          Tidalwave&apos;s hiring philosophy, and surfacing open questions instead of guessing.
        </div>
      )}

      {brief && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-md bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700">
            <span className="font-semibold">AI-generated draft</span>
            <span>· review before sharing with the client</span>
            {model && <span className="ml-auto font-mono text-[11px] text-indigo-400">{model}</span>}
          </div>

          <Confidence score={brief.confidence_score} rationale={brief.confidence_rationale} />

          <Block title="Fit summary">
            <p className="text-sm text-slate-800">{brief.fit_summary}</p>
          </Block>

          <Block title="Why this person for Tidalwave">
            <p className="text-sm text-slate-800">{brief.why_this_client}</p>
          </Block>

          {brief.hard_stops.length > 0 && (
            <Block title="Hard stops & flags">
              <ul className="space-y-2">
                {brief.hard_stops.map((h, i) => (
                  <li
                    key={i}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm ring-1 ring-inset",
                      h.severity === "blocker"
                        ? "bg-red-50 text-red-800 ring-red-200"
                        : "bg-amber-50 text-amber-800 ring-amber-200",
                    )}
                  >
                    <span className="font-semibold">{h.label}</span> — {h.detail}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {brief.conflicts.length > 0 && (
            <Block title="Conflicts & uncertainty">
              <div className="space-y-3">
                {brief.conflicts.map((c, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-800">{c.field}</span>
                      <ConfidenceChip level={c.confidence} />
                    </div>
                    <ul className="mt-1.5 space-y-0.5">
                      {c.values_by_source.map((v, j) => (
                        <li key={j} className="text-xs text-slate-600">
                          <span className="font-mono text-slate-400">{v.source}</span>
                          {v.recorded_at ? ` (${v.recorded_at})` : ""}: {v.value}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-sm text-slate-800">
                      <span className="font-medium text-emerald-700">Resolved:</span>{" "}
                      {c.resolved_value}
                    </p>
                    <p className="text-xs italic text-slate-500">Rule: {c.rule}</p>
                  </div>
                ))}
              </div>
            </Block>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Block title="Strengths">
              <PointList points={brief.strengths} tone="emerald" />
            </Block>
            <Block title="Concerns">
              <PointList points={brief.concerns} tone="amber" />
            </Block>
          </div>

          {brief.open_questions.length > 0 && (
            <Block title="Open questions">
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {brief.open_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </Block>
          )}

          <Block title="Recommended next action">
            <p className="text-sm font-medium text-slate-900">{brief.recommended_next_action}</p>
          </Block>

          {createdAt && (
            <p className="text-xs text-slate-400">
              Generated {new Date(createdAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PointList({
  points,
  tone,
}: {
  points: { point: string; evidence: string }[];
  tone: "emerald" | "amber";
}) {
  const dot = tone === "emerald" ? "bg-emerald-500" : "bg-amber-500";
  if (!points.length) return <p className="text-sm text-slate-400">None noted.</p>;
  return (
    <ul className="space-y-2">
      {points.map((p, i) => (
        <li key={i} className="text-sm">
          <span className="flex gap-2">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
            <span>
              <span className="text-slate-800">{p.point}</span>
              <span className="block text-xs text-slate-500">{p.evidence}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Confidence({ score, rationale }: { score: number; rationale: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 45 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">Confidence</span>
        <span className="font-semibold text-slate-900">{pct}/100</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{rationale}</p>
    </div>
  );
}

function ConfidenceChip({ level }: { level: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-rose-100 text-rose-700",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", styles[level])}>
      {level} confidence
    </span>
  );
}
