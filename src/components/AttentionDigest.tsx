"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { generatePipelineDigest } from "@/app/actions";
import type { PipelineDigest, FactualityScore } from "@/db/schema";
import { cn, FactualityBadge } from "./ui";

export function AttentionDigest({
  initialDigest,
  initialCreatedAt,
  initialFactuality,
}: {
  initialDigest: PipelineDigest | null;
  initialCreatedAt?: string;
  initialFactuality?: FactualityScore | null;
}) {
  const [digest, setDigest] = useState<PipelineDigest | null>(initialDigest);
  const [createdAt, setCreatedAt] = useState<string | undefined>(initialCreatedAt);
  const [factuality, setFactuality] = useState<FactualityScore | null>(initialFactuality ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const autoFired = useRef(false);

  const generate = () =>
    startTransition(async () => {
      setError(null);
      const r = await generatePipelineDigest();
      if (r.ok) {
        setDigest(r.object);
        setCreatedAt(new Date().toISOString());
        setFactuality(r.factuality ?? null);
      } else {
        setError(r.error);
      }
    });

  // On first load: show the saved digest if one exists; otherwise generate one.
  useEffect(() => {
    if (!initialDigest && !autoFired.current) {
      autoFired.current = true;
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-indigo-900">AI pipeline summary</h2>
          <p className="text-xs text-indigo-700/80">
            {createdAt
              ? `Generated ${new Date(createdAt).toLocaleString()}`
              : "A plain-language read on whether the search is moving and what needs you."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <FactualityBadge factuality={factuality} />
          <button
            onClick={generate}
            disabled={pending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "Summarizing…" : digest ? "Refresh" : "Generate"}
          </button>
        </div>
      </div>

      {pending && !digest && (
        <p className="mt-3 text-sm text-indigo-700/80">Summarizing the pipeline…</p>
      )}

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
