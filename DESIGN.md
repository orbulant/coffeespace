# CoffeeSpace Client Portal — Design Document

## The user and the bar

The user is a founder/hiring manager who hired a recruiter precisely so they
*wouldn't* have to live in a recruiting tool. So every screen is built to reduce
one of two things: **time to a confident decision**, or **anxiety that nothing is
happening**. "Show more data" is the failure mode; "surface the one thing that
needs you" is the goal.

---

## Product decisions

### The AI workflow I chose: a synthesized, client-facing candidate brief

The data ships four plausible AI workflows (summarization, synthesis,
prioritization, recommendation). I built the **synthesis** one because it's the
only one the data makes *hard*, and the hardest version is the most valuable:

- Jordan Reyes (`cand_001`) has five sources that disagree on location, comp, and
  TypeScript skill, and the freshest artifact (a Jun-25 email) contradicts the
  structured record. A summarize-this-text feature confidently gets this wrong.
- The brief uses `client.preferences` ("ownership over pedigree", anti-FAANG) as
  framing context, so the output answers *why this person for Tidalwave* rather
  than producing generic praise the client has explicitly said they hate.
- It **outputs open questions and a calibrated confidence score** instead of
  asserting certainty, and connects candidate facts to role rules (sponsorship
  disqualifier, comp band) as explicit hard stops.

That single feature meaningfully improves the recruiter's most repetitive work
(writing client-ready write-ups, half of which don't exist yet — only 5/10
candidates have a recruiter memo) *and* the client's decision quality (they see
the conflict and the source-of-truth call, not a clean lie).

A second, lighter AI surface — an on-demand **pipeline digest** ("what needs your
attention") — sits on the overview. It's deliberately grounded in the
deterministic rule engine (below) rather than free-form, so it can't invent
issues.

### What I deliberately did not build (and why)

- **Auth / multi-tenancy / multi-user.** One hardcoded client. Real, but orthogonal
  to what's being evaluated, and a time sink.
- **Resume/file upload + PDF parsing.** I used the provided text artifacts. The
  ingestion pipeline is real product work but not where the judgment is.
- **Inline brief editing / send-to-client.** Briefs are persisted, regenerable
  drafts clearly labeled "review before sharing." Rich editing is a fast-follow.
- **Real-time, Slack/email integration, notifications.** Out of scope for v1.
- **The other three AI workflows.** Picking one and doing it well beats four shallow ones.

### If I had one more month

Inline editing + approval of briefs with diff tracking; a "calibration" flow that
formally asks the client to rate the three calibration candidates and tunes how
future candidates are framed; feedback-trend analysis across rejections feeding a
sourcing-improvement loop; and an eval harness for the brief (below).

---

## Engineering decisions

### Architecture

Next.js (App Router) on Vercel, Postgres (Neon) via Drizzle, Tailwind, Vercel AI
SDK with the Anthropic provider (`@ai-sdk/anthropic`).

- **RSC for reads, server actions for writes.** Pages are React Server Components
  that query Drizzle directly (`src/lib/data.ts`); decisions and AI generation are
  server actions (`src/app/actions.ts`) that mutate and `revalidatePath`. No
  hand-written API layer.
- **Data model** (`src/db/schema.ts`): tables for the entities with real
  relationships and lifecycle (`clients`, `roles`, `candidates`,
  `candidate_events`, `feedback_history`, `candidate_sources`, `ai_briefs`); `jsonb`
  for the irregular bags (career history, comp, links, rejection, open questions,
  preferences). The key modeling call: the **stale `seed.json` values and the
  source artifacts are stored side by side** — the structured record is never
  silently overwritten. The brief reconciles them at read time and shows its work.
- **Deterministic rule engine** (`src/lib/rules.ts`) is the backbone of "attention":
  sponsorship-vs-disqualifier hard stops, comp-vs-band, missing decision-critical
  fields, timing risk, location conflict, recruiter holds, and staleness. It's a
  pure function over candidate + role + events, so it's testable, cheap, and
  trustworthy — and it's what feeds the AI digest, so the AI can't hallucinate
  problems.
- **Momentum scoring** (`src/lib/momentum.ts`) turns the event timeline into a
  0–100 trajectory signal per candidate (stage depth + how recently they advanced +
  client engagement − staleness/holds), rolled up to a per-search number on the
  overview. Every point is attributed to a named factor, so it's explainable rather
  than a black box — a concrete answer to "is this search progressing?"

### Tradeoffs

- `jsonb` over full normalization: right for 10 candidates / 1 client; I'd
  normalize the high-query-volume bits (events, feedback) first at scale.
- Staleness is computed against a fixed `REFERENCE_DATE` (`src/lib/config.ts`) so
  the June-2026 demo data stays meaningful whenever it's run; production uses `now()`.
- The brief is generated on demand and persisted, not precomputed — cheaper, and it
  keeps a human in the loop.

### What changes first at production scale (hundreds of engagements)

1. **AuthN/Z + multi-tenancy** — row-level scoping by client/engagement, real sessions.
2. **AI cost & latency** — briefs and digests move to a queue with caching and
   per-engagement rate limits; stream long generations; add prompt caching for the
   shared client/role context.
3. **Data ingestion** — the artifact pipeline (resume parsing, source dedup,
   recency extraction) becomes a real service rather than a seed script.
4. **Eval** — the brief gets an offline eval set (below) gating prompt/model changes.

---

## AI design

**Inputs.** Candidate structured record + every source artifact (each labeled with
its `recorded_at`) + recruiter memo (or its absence) + feedback history + the
client's hiring philosophy + the role's must-haves/disqualifiers/comp band.

**Outputs (structured).** A single Zod-validated object (`src/lib/ai/schema.ts`):
fit summary, *why-this-client* framing, strengths/concerns (each with evidence),
hard stops (severity-tagged), **conflicts[]** (`field`, every value-by-source,
resolved value, the rule used, per-conflict confidence), open questions, a 0–100
confidence score with rationale, and a recommended next action.

**Prompting strategy.** A system prompt encodes the rules as hard constraints:
freshest-artifact-wins for conflicts (but always record every value), never assert
an ungrounded fact, frame *why* via the client's stated philosophy (which
explicitly rejects keyword-matching / FAANG pedigree), surface disqualifier hard
stops, and emit open questions instead of guessing. Sources are passed labeled with
their dates so the model can apply recency itself.

**Structured outputs.** `generateObject` (Vercel AI SDK) with a Zod schema, using
the Anthropic provider (`@ai-sdk/anthropic`) on `claude-sonnet-4-6`. Sonnet 4.6 for
fast, cheap synthesis; one-line swap to `claude-opus-4-8` for max quality.

**Human review / editing.** Briefs render as persisted **drafts** labeled "review
before sharing," and are regenerable. Decisions (shortlist/reject) are human-only
and require structured rejection reasons.

**Failure handling.** Generation is wrapped; on model or schema-validation failure
the action returns a typed error and the UI shows a graceful fallback — the rest of
the candidate page (the full structured record) always renders. The AI never blocks
a decision.

**Communicating uncertainty / conflict.** This is the centerpiece, not an
afterthought, and it works at two levels. **Deterministically**, a "Conflicting
information" card on every candidate page points out disagreements it can verify
without guessing — a structured record that's gone stale relative to a newer source
artifact (Jordan's Jun-25 email postdating the record), or a management-track title
against an IC role (Lena) — showing *both* values and explicitly *not* resolving
them, plus a "Conflicting info" badge on the pipeline lists. **In the AI brief**, a
"Conflicts & uncertainty" card goes further into the free-text sources: each
disagreeing fact, every value with its source and date, the resolved value, the
rule used, a confidence bar, and explicit open questions. The client sees the call
*and* the doubt.

**How I'd evaluate whether it's useful.** Leading product signals: brief
accept-without-edit rate, edit distance, and time-to-decision after a brief is
generated. Quality signals via a labeled eval set: conflict-detection
recall/precision on the dossier (does it catch the comp/location/TS disagreements
and pick the freshest source?), hard-stop precision (does it always flag the
sponsorship disqualifier and comp-over-band, never invent one?), and a
groundedness/hallucination check (every asserted fact traceable to a source).
Outcome signal: do briefs correlate with faster, stickier hiring decisions.
