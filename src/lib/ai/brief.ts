import "server-only";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { AI_MODEL } from "@/lib/config";
import { BriefSchema, type BriefObject } from "./schema";
import type {
  Candidate,
  Role,
  Source,
  Feedback,
} from "@/lib/data";
import type { ClientPreferences } from "@/db/schema";

export type BriefInput = {
  candidate: Candidate;
  role: Role;
  sources: Source[];
  feedback: Feedback[];
  clientCompany: string;
  clientPreferences: ClientPreferences | null;
};

const SYSTEM = (company: string) => `You are a senior recruiting analyst writing a client-facing candidate brief for ${company}, a hiring manager who does not live in recruiting tools and needs to make a confident decision quickly.

Hard rules:
- SOURCE OF TRUTH: When facts disagree across artifacts, the freshest artifact wins (each source is labeled with its recorded date). NEVER silently overwrite or drop the older value — record every value in "conflicts" with its source, then state the resolved value and the rule you used. The structured record can lag behind the newest conversation.
- GROUNDING: Do not assert any fact you cannot point to in a provided source or the structured record. If something is unknown, it is an open question, not an assumption.
- FRAMING: Explain WHY this specific person fits THIS client, using their stated hiring philosophy. This client explicitly dislikes keyword-matching and treats FAANG pedigree as no plus by itself — generic "strong engineer, great fit" language is a failure.
- HARD STOPS: If a role disqualifier applies to this candidate (e.g. the role cannot sponsor and the candidate needs sponsorship, or comp is above band), surface it as a hard_stop. Do not bury it.
- UNCERTAINTY: Output open_questions instead of inventing answers. Calibrate confidence_score down when decision-critical data is missing or sources conflict.`;

function renderSources(sources: Source[]): string {
  if (!sources.length) return "(no separate source artifacts — only the structured record below)";
  return sources
    .map((s) => {
      const when = s.recordedAt ? `recorded ${s.recordedAt}` : "undated / possibly stale";
      return `--- SOURCE: ${s.kind} · ${s.title} · ${when} ---\n${s.content}`;
    })
    .join("\n\n");
}

function renderPrompt(input: BriefInput): string {
  const { candidate: c, role: r, feedback, clientPreferences: prefs, sources } = input;
  const memo = c.recruiterMemo
    ? JSON.stringify(c.recruiterMemo, null, 2)
    : "(none — this candidate has no recruiter memo; you may need to generate the assessment from scratch)";

  return `# CLIENT HIRING CONTEXT
Company: ${input.clientCompany}
Hiring philosophy: ${prefs?.hiring_philosophy?.join(" | ") ?? "n/a"}
Past client feedback (recurring themes): ${prefs?.past_feedback?.join(" | ") ?? "n/a"}

# ROLE: ${r.title}
Location: ${r.location ?? "n/a"}
Comp band: ${JSON.stringify(r.compBand ?? {})}
Must-haves: ${(r.mustHaves ?? []).join("; ")}
Nice-to-haves: ${(r.niceToHaves ?? []).join("; ")}
Disqualifiers: ${(r.disqualifiers ?? []).join("; ")}
Target start: ${r.targetStart ?? "n/a"}

# CANDIDATE STRUCTURED RECORD (may be stale relative to the source artifacts)
Name: ${c.name} — ${c.headline ?? ""}
Current: ${c.currentTitle ?? ""} at ${c.currentCompany ?? ""}
Location: ${c.location ?? "n/a"}
Career history: ${JSON.stringify(c.careerHistory ?? [])}
Stated strengths: ${(c.strengths ?? []).join("; ")}
Stated concerns: ${(c.concerns ?? []).join("; ")}
Comp expectation: ${c.compExpectation ? JSON.stringify(c.compExpectation) : "NOT PROVIDED"}
Availability: ${c.availability ?? "NOT PROVIDED"}
Work authorization: ${c.workAuthorization ?? "n/a"}
Stage: ${c.stage}
Recruiter-tracked open questions: ${(c.openQuestions ?? []).join("; ") || "none recorded"}

# RECRUITER MEMO
${memo}

# CLIENT/RECRUITER FEEDBACK OVER TIME
${feedback.length ? feedback.map((f) => `- (${f.at ?? "?"}, ${f.authorType}) ${f.text}`).join("\n") : "none"}

# SOURCE ARTIFACTS (each labeled with its recorded date — apply the freshest-wins rule)
${renderSources(sources)}

Produce the brief now.`;
}

export type BriefResult =
  | { ok: true; object: BriefObject; model: string }
  | { ok: false; error: string };

export async function synthesizeBrief(input: BriefInput): Promise<BriefResult> {
  try {
    const { object } = await generateObject({
      model: anthropic(AI_MODEL),
      schema: BriefSchema,
      schemaName: "candidate_brief",
      schemaDescription: "A client-facing recruiting brief that resolves source conflicts and surfaces uncertainty.",
      system: SYSTEM(input.clientCompany),
      prompt: renderPrompt(input),
      maxOutputTokens: 2500,
    });
    return { ok: true, object, model: AI_MODEL };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Brief generation failed.",
    };
  }
}
