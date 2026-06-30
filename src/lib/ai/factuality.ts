import "server-only";
import { createLLMAsJudge } from "openevals";
import { ChatAnthropic } from "@langchain/anthropic";
import { AI_MODEL } from "@/lib/config";
import type { FactualityScore } from "@/db/schema";

/**
 * Factual-groundedness scoring via openevals' LLM-as-judge. For every AI artifact
 * (brief / digest / retrospect) we run a separate judge pass that scores how well
 * the OUTPUT is supported by the CONTEXT it was generated from — a trust signal so
 * a user knows whether to rely on the generated text. The judge runs on Claude
 * (`@langchain/anthropic`), same model family as the generators. Best-effort: if
 * the eval fails it returns null and never blocks the primary generation.
 */

const FACTUALITY_PROMPT = `You are scoring the FACTUAL GROUNDEDNESS of an AI-generated artifact against the source material it was produced from.

Score from 0.0 to 1.0 how well the OUTPUT is supported by the CONTEXT:
- 1.0 — every substantive claim is directly grounded in the context; nothing is fabricated or overstated.
- around 0.5 — mostly grounded, but one or more claims are unsupported or exaggerated.
- 0.0 — key claims are fabricated or contradict the context.

Important: expressing uncertainty, listing open questions, flagging conflicts, or noting that information was "not provided" is GOOD and must NOT be penalized — that is honest handling of missing data. Only penalize unsupported statements presented as fact.

<context>
{context}
</context>

<output>
{outputs}
</output>`;

let judge: ChatAnthropic | undefined;
function getJudge(): ChatAnthropic {
  if (!judge) judge = new ChatAnthropic({ model: AI_MODEL, maxTokens: 1024 });
  return judge;
}

export async function scoreFactuality(
  output: unknown,
  context: string,
): Promise<FactualityScore | null> {
  try {
    const evaluator = createLLMAsJudge({
      prompt: FACTUALITY_PROMPT,
      feedbackKey: "factuality",
      judge: getJudge(),
      continuous: true, // 0–1 float
      useReasoning: true, // populates `comment` with the judge's rationale
    });
    const res = await evaluator({ outputs: output, context });
    const score = typeof res.score === "number" ? res.score : res.score ? 1 : 0;
    return { score, comment: res.comment, model: AI_MODEL };
  } catch {
    return null;
  }
}
