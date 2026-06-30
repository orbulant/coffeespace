import { z } from "zod";

/**
 * Structured output schema for the candidate brief. Mirrors CandidateBrief in
 * db/schema.ts. The .describe() calls double as guidance to the model — they are
 * sent as the schema description, so they shape generation, not just validation.
 */

const Point = z.object({
  point: z.string(),
  evidence: z.string().describe("What in the sources/record supports this. Don't assert ungrounded claims."),
});

const HardStop = z.object({
  label: z.string(),
  severity: z.enum(["blocker", "warning"]),
  detail: z.string(),
});

const Conflict = z.object({
  field: z.string().describe("The fact that disagrees across sources, e.g. 'Compensation' or 'Location'."),
  values_by_source: z
    .array(
      z.object({
        source: z.string().describe("Which artifact, e.g. 'email (2026-06-25)' or 'seed record'."),
        value: z.string(),
        recorded_at: z.string().optional(),
      }),
    )
    .describe("Every distinct value seen, each attributed to its source."),
  resolved_value: z.string().describe("The value you'd act on, per the source-of-truth rule."),
  rule: z.string().describe("Why you resolved it that way, e.g. 'freshest artifact (email) wins over the stale record'."),
  confidence: z.enum(["high", "medium", "low"]),
});

export const BriefSchema = z.object({
  fit_summary: z
    .string()
    .describe("1–2 sentences. Calibrated overall read for this role — not generic praise."),
  why_this_client: z
    .string()
    .describe(
      "Why THIS specific person would (or wouldn't) thrive at THIS client, grounded in the client's stated hiring philosophy. The client explicitly dislikes keyword-matching and FAANG-pedigree framing — do not produce generic fit language.",
    ),
  strengths: z.array(Point),
  concerns: z.array(Point),
  hard_stops: z
    .array(HardStop)
    .describe("Disqualifiers or band violations that should stop or gate a submission. Empty if none."),
  conflicts: z
    .array(Conflict)
    .describe(
      "Facts that disagree across the structured record and the source artifacts. Resolve with the freshest-artifact-wins rule but always show every value. Empty if sources agree.",
    ),
  open_questions: z
    .array(z.string())
    .describe("Unknowns to resolve before a confident decision. Output these instead of guessing."),
  confidence_score: z
    .number()
    .describe("0–100 overall confidence in this brief given data completeness and source agreement. Lower it when data is missing or sources conflict."),
  confidence_rationale: z.string().describe("One line on what drives the score."),
  recommended_next_action: z.string(),
});

export type BriefObject = z.infer<typeof BriefSchema>;
