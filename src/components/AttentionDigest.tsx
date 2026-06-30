"use client";

import { useState, useTransition } from "react";
import { generatePipelineDigest } from "@/app/actions";
import type { DigestObject } from "@/lib/ai/digest";
import { cn } from "./ui";

export function AttentionDigest() {
  const [digest, setDigest] = useState<DigestObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const generate = () =>
    startTransition(async () => {
      setError(null);
      const r = await generatePipelineDigest();
      if (r.ok) setDigest(r.object);
      else setError(r.error);
    });

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-indigo-900">AI pipeline summary</h2>
          <p className="text-xs text-indigo-700/80">
            A plain-language read on whether the search is moving and what needs you.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={pending}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Summarizing…" : digest ? "Refresh" : "Generate"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-rose-700">Couldn&apos;t summarize: {error}</p>}

      {digest && (
        <div className="mt-3 space-y-3">
          <p className="text-sm font-medium text-slate-900">{digest.headline}</p>
          {digest.attention.length > 0 ? (
            <ul className="space-y-2">
              {digest.attention.map((a, i) => (
                <li key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <UrgencyDot urgency={a.urgency} />
                    <span className="text-sm font-semibold text-slate-900">{a.candidate}</span>
                    <span className="text-xs text-slate-400">· {a.role}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{a.why}</p>
                  <p className="mt-1 text-sm text-indigo-700">→ {a.suggested_action}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">Nothing urgent — the pipeline looks healthy.</p>
          )}
        </div>
      )}
    </div>
  );
}

function UrgencyDot({ urgency }: { urgency: "high" | "medium" | "low" }) {
  const color =
    urgency === "high" ? "bg-rose-500" : urgency === "medium" ? "bg-amber-500" : "bg-slate-400";
  return <span className={cn("h-2 w-2 rounded-full", color)} title={`${urgency} urgency`} />;
}
