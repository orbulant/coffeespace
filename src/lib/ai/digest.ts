import "server-only";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { AI_MODEL } from "@/lib/config";
import type { Flag } from "@/lib/rules";
import type { ClientPreferences, FactualityScore } from "@/db/schema";

export const DigestSchema = z.object({
  headline: z
    .string()
    .describe("One sentence: is the search moving, and the single most important thing to do next."),
  attention: z
    .array(
      z.object({
        candidate: z.string(),
        role: z.string(),
        urgency: z.enum(["high", "medium", "low"]),
        why: z.string().describe("Grounded in the provided flags/data — do not invent issues."),
        suggested_action: z.string(),
      }),
    )
    .describe("Only candidates that genuinely need the client's attention now, most urgent first."),
});

export type DigestObject = z.infer<typeof DigestSchema>;

export type DigestCandidate = {
  name: string;
  role: string;
  stage: string;
  flags: Flag[];
  lastEventAt: string | null;
};

export type DigestInput = {
  clientCompany: string;
  clientPreferences: ClientPreferences | null;
  candidates: DigestCandidate[];
  recentEvents: { type: string; at: string; candidateName: string }[];
};

export type DigestResult =
  | { ok: true; object: DigestObject; model: string; factuality?: FactualityScore | null }
  | { ok: false; error: string };

export async function synthesizeDigest(input: DigestInput): Promise<DigestResult> {
  const system = `You write a short "what needs your attention" digest for a busy founder/hiring manager who does not live in recruiting tools and mostly wants confidence the search is progressing.

Rules:
- The "flags" on each candidate are computed by deterministic rules (hard stops, comp-vs-band, missing data, timing, staleness) — treat them as ground truth, not guesses.
- Prioritize: hard stops/blockers first, then decisions that are waiting on the client, then timing risks and stale candidates.
- Be specific and grounded in the data provided. Do not invent issues that aren't in the flags or events.
- Keep each "why" to one tight sentence. Reflect the client's hiring philosophy where relevant.
- If nothing is urgent, return an empty attention list and say the pipeline is healthy in the headline.`;

  const prompt = `Client: ${input.clientCompany}
Hiring philosophy: ${input.clientPreferences?.hiring_philosophy?.join(" | ") ?? "n/a"}

CANDIDATES (with computed flags):
${input.candidates
  .map(
    (c) =>
      `- ${c.name} (${c.role}) — stage: ${c.stage}; last activity: ${c.lastEventAt ?? "none"}; flags: ${
        c.flags.length
          ? c.flags.map((f) => `[${f.severity}] ${f.label}: ${f.detail}`).join(" || ")
          : "none"
      }`,
  )
  .join("\n")}

RECENT ACTIVITY (newest first):
${input.recentEvents.map((e) => `- ${e.at} ${e.candidateName}: ${e.type}`).join("\n")}

Write the digest now.`;

  try {
    const { object } = await generateObject({
      model: anthropic(AI_MODEL),
      schema: DigestSchema,
      schemaName: "pipeline_digest",
      schemaDescription: "A prioritized 'what needs your attention' summary across the hiring pipeline.",
      system,
      prompt,
      maxOutputTokens: 1500,
    });
    return { ok: true, object, model: AI_MODEL };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Digest generation failed.",
    };
  }
}
