"use client";

import { useState, useTransition } from "react";
import { generateDigestRetrospect, generateBriefRetrospect } from "@/app/actions";
import type { RetrospectObject } from "@/lib/ai/retrospect";
import type { FactualityScore } from "@/db/schema";
import { cn, FactualityBadge } from "./ui";

export function RetrospectPanel({
  kind,
  candidateId,
  historyCount,
}: {
  kind: "digest" | "brief";
  candidateId?: string;
  historyCount: number;
}) {
  const [data, setData] = useState<RetrospectObject | null>(null);
  const [factuality, setFactuality] = useState<FactualityScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const enough = historyCount >= 2;
  const noun = kind === "digest" ? "pipeline digests" : "briefs";

  const run = () =>
    startTransition(async () => {
      setError(null);
      const r =
        kind === "digest"
          ? await generateDigestRetrospect()
          : await generateBriefRetrospect(candidateId!);
      if (r.ok) {
        setData(r.object);
        setFactuality(r.factuality ?? null);
      } else {
        setError(r.error);
      }
    });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Retrospect</h2>
          <p className="text-xs text-slate-500">
            What&apos;s changed across the last {Math.min(historyCount, 5)} {noun}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <FactualityBadge factuality={factuality} />
          <button
            onClick={run}
            disabled={pending || !enough}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {pending ? "Analyzing…" : data ? "Re-run" : "Analyze"}
          </button>
        </div>
      </div>

      {!enough && (
        <p className="mt-3 text-sm text-slate-500">
          Not enough history yet — generate at least 2 {kind === "digest" ? "digests" : "briefs"}{" "}
          (refresh / regenerate) to compare.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

      {data && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-slate-800">{data.summary}</p>
          {data.changes.length > 0 && (
            <ul className="space-y-1.5">
              {data.changes.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <ChangeTag kind={c.kind} />
                  <span className="text-slate-700">{c.change}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ChangeTag({ kind }: { kind: "added" | "resolved" | "shifted" | "removed" }) {
  const map = {
    added: ["+ new", "bg-emerald-100 text-emerald-700"],
    resolved: ["✓ resolved", "bg-emerald-100 text-emerald-700"],
    shifted: ["~ shifted", "bg-amber-100 text-amber-800"],
    removed: ["− dropped", "bg-slate-100 text-slate-600"],
  } as const;
  const [text, cls] = map[kind];
  return (
    <span
      className={cn(
        "mt-0.5 inline-flex shrink-0 items-center rounded px-1.5 text-[11px] font-medium",
        cls,
      )}
    >
      {text}
    </span>
  );
}
