"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  shortlistCandidate,
  rejectCandidate,
  reopenCandidate,
  moveToStage,
} from "@/app/actions";
import type { Stage } from "@/db/schema";
import { cn } from "./ui";

const REJECT_REASONS = [
  "Wrong domain",
  "Too junior",
  "Compensation mismatch",
  "Startup experience",
  "Location / visa",
  "Other",
];

export function DecisionBar({ id, stage }: { id: string; stage: Stage }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [notes, setNotes] = useState("");

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  if (stage === "rejected") {
    return (
      <button
        disabled={pending}
        onClick={() => run(() => reopenCandidate(id))}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Reopening…" : "Reopen candidate"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={pending || stage === "shortlisted" || stage === "interviewing"}
          onClick={() => run(() => shortlistCandidate(id))}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          Shortlist
        </button>
        {stage === "shortlisted" && (
          <button
            disabled={pending}
            onClick={() => run(() => moveToStage(id, "interviewing"))}
            className="rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-40"
          >
            Move to interviewing
          </button>
        )}
        <button
          disabled={pending}
          onClick={() => setShowReject((s) => !s)}
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-40",
            showReject
              ? "border-rose-300 bg-rose-50 text-rose-700"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
          )}
        >
          Reject…
        </button>
      </div>

      {showReject && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-rose-700">
            Rejection requires a reason
          </p>
          <div className="flex flex-col gap-2">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              {REJECT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes (encouraged)…"
              rows={2}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await rejectCandidate(id, reason, notes);
                    setShowReject(false);
                  })
                }
                className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {pending ? "Rejecting…" : "Confirm rejection"}
              </button>
              <button
                disabled={pending}
                onClick={() => setShowReject(false)}
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
