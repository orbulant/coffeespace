import { REFERENCE_DATE } from "./config";
import type { CompBand, CompExpectation, Stage } from "@/db/schema";

export const NOT_PROVIDED = "Not provided";

export function formatMoney(n?: number | null): string {
  if (n == null) return NOT_PROVIDED;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function formatBand(band?: CompBand | null): string {
  if (!band) return NOT_PROVIDED;
  const base =
    band.base_min != null && band.base_max != null
      ? `${formatMoney(band.base_min)}–${formatMoney(band.base_max)} base`
      : "base TBD";
  return band.equity ? `${base} · ${band.equity} equity` : base;
}

export function formatComp(comp?: CompExpectation | null): string {
  if (!comp || comp.base == null) return NOT_PROVIDED;
  return formatMoney(comp.base);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return NOT_PROVIDED;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso; // free-text like "By ~early August"
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function daysBetween(iso: string, ref: Date = REFERENCE_DATE): number {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return NaN;
  return Math.floor((ref.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function relativeDays(iso?: string | null): string {
  if (!iso) return "";
  const n = daysBetween(iso);
  if (isNaN(n)) return "";
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  return `${n} days ago`;
}

const STAGE_LABELS: Record<Stage, string> = {
  new: "New",
  reviewing: "Reviewing",
  shortlisted: "Shortlisted",
  interviewing: "Interviewing",
  rejected: "Rejected",
  hired: "Hired",
};

export function stageLabel(stage: Stage): string {
  return STAGE_LABELS[stage] ?? stage;
}

// Display order for pipeline columns / grouping.
export const STAGE_ORDER: Stage[] = [
  "new",
  "reviewing",
  "shortlisted",
  "interviewing",
  "hired",
  "rejected",
];

// Human-readable label for an event type (e.g. "client_opened_profile").
export function eventLabel(type: string): string {
  const map: Record<string, string> = {
    imported: "Imported",
    recruiter_reviewed: "Recruiter reviewed",
    recruiter_awaiting_info: "Recruiter awaiting info",
    recruiter_flagged: "Recruiter flagged",
    submitted_to_client: "Submitted to client",
    client_opened_profile: "Client opened profile",
    client_commented: "Client commented",
    moved_stage: "Stage changed",
    interview_scheduled: "Interview scheduled",
    rejected: "Rejected",
    shortlisted: "Shortlisted",
  };
  return map[type] ?? type.replace(/_/g, " ");
}
