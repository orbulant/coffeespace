import "server-only";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { AI_MODEL } from "@/lib/config";
import type { FactualityScore } from "@/db/schema";

/**
 * Retrospect: a short "what's changed" read over the timeline of AI generations.
 * Given a chronological series of saved digests (pipeline) or briefs (one
 * candidate), it reports the deltas — what appeared, resolved, shifted, or
 * dropped — rather than re-describing the latest state. Deliberately brief.
 */

export const RetrospectSchema = z.object({
  summary: z
    .string()
    .describe(
      "1–2 sentences: the headline of what's changed across these AI generations over time. If little changed, say so plainly.",
    ),
  changes: z
    .array(
      z.object({
        kind: z.enum(["added", "resolved", "shifted", "removed"]),
        change: z
          .string()
          .describe("One concise line describing a single concrete change between the earlier and later versions."),
      }),
    )
    .describe("The few most important deltas — 2–5 items. Empty if essentially nothing changed."),
});

export type RetrospectObject = z.infer<typeof RetrospectSchema>;

export type RetrospectSnapshot = { at: string; content: unknown };

export type RetrospectResult =
  | { ok: true; object: RetrospectObject; model: string; factuality?: FactualityScore | null }
  | { ok: false; error: string };

export async function synthesizeRetrospect(
  kind: "digest" | "brief",
  snapshots: RetrospectSnapshot[],
): Promise<RetrospectResult> {
  if (snapshots.length < 2) {
    return {
      ok: false,
      error: `Need at least 2 generated ${kind}s to compare — ${
        snapshots.length === 1 ? "there is only 1" : "there are none"
      } so far.`,
    };
  }

  const noun = kind === "digest" ? "pipeline digests" : "candidate briefs";
  const system = `You are writing a short RETROSPECTIVE over a chronological series of AI-generated ${noun}. Report ONLY what has CHANGED across them over time — what newly appeared, what got resolved, what shifted (a confidence score up or down, a concern dropped, priorities reordered, a conflict newly surfaced or resolved), and what disappeared. Be brief and concrete. Do NOT restate the latest content or re-describe things from scratch — focus on the deltas between the earliest and most recent versions. If almost nothing changed, say so and return few or no change items.`;

  const prompt =
    `Chronological ${noun} (oldest first). Compare across versions and report what changed:\n\n` +
    snapshots
      .map((s, i) => `### Version ${i + 1} — generated ${s.at}\n${JSON.stringify(s.content, null, 2)}`)
      .join("\n\n");

  try {
    const { object } = await generateObject({
      model: anthropic(AI_MODEL),
      schema: RetrospectSchema,
      schemaName: "retrospect",
      schemaDescription: "A brief retrospective on what changed across a series of AI generations.",
      system,
      prompt,
      maxOutputTokens: 1000,
    });
    return { ok: true, object, model: AI_MODEL };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Retrospect generation failed.",
    };
  }
}
