import {
  pgTable,
  pgEnum,
  text,
  boolean,
  integer,
  serial,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Schema notes — the provided seed.json is data, not a schema. We model the
 * entities that have real relationships and a lifecycle as tables, and keep the
 * irregular, free-shaped material (career history, comp, links, rejection,
 * open questions, preferences) in `jsonb`. That is a deliberate tradeoff: for a
 * single client and ten candidates, fully normalising those bags buys nothing
 * and costs velocity. See DESIGN.md.
 */

export const stageEnum = pgEnum("stage", [
  "new",
  "reviewing",
  "shortlisted",
  "interviewing",
  "rejected",
  "hired",
]);

// ── Client (single tenant for v1; auth/multi-tenancy deliberately cut) ──────────
export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull(),
  description: text("description"),
  contacts: jsonb("contacts").$type<Contact[]>().notNull().default([]),
  // Hiring philosophy + past-feedback quotes. This is the AI's framing context.
  preferences: jsonb("preferences").$type<ClientPreferences>(),
});

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  title: text("title").notNull(),
  location: text("location"),
  compBand: jsonb("comp_band").$type<CompBand>(),
  employmentType: text("employment_type"),
  mustHaves: jsonb("must_haves").$type<string[]>().notNull().default([]),
  niceToHaves: jsonb("nice_to_haves").$type<string[]>().notNull().default([]),
  disqualifiers: jsonb("disqualifiers").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("open"),
  hiringManager: text("hiring_manager"),
  openedAt: text("opened_at"),
  targetStart: text("target_start"),
});

export const candidates = pgTable("candidates", {
  id: text("id").primaryKey(),
  roleId: text("role_id")
    .notNull()
    .references(() => roles.id),
  name: text("name").notNull(),
  headline: text("headline"),
  currentCompany: text("current_company"),
  currentTitle: text("current_title"),
  location: text("location"),
  links: jsonb("links").$type<Record<string, string>>(),
  careerHistory: jsonb("career_history").$type<CareerStint[]>().notNull().default([]),
  strengths: jsonb("strengths").$type<string[]>().notNull().default([]),
  concerns: jsonb("concerns").$type<string[]>().notNull().default([]),
  // Nullable on purpose — cand_003 has neither comp nor availability.
  compExpectation: jsonb("comp_expectation").$type<CompExpectation | null>(),
  availability: text("availability"),
  workAuthorization: text("work_authorization"),
  stage: stageEnum("stage").notNull().default("new"),
  calibration: boolean("calibration").notNull().default(false),
  recruiterMemo: jsonb("recruiter_memo").$type<RecruiterMemo | null>(),
  rejection: jsonb("rejection").$type<Rejection | null>(),
  openQuestions: jsonb("open_questions").$type<string[]>().notNull().default([]),
  addedAt: text("added_at"),
});

// Pipeline activity timeline — the data behind "what changed" / staleness.
export const candidateEvents = pgTable("candidate_events", {
  id: serial("id").primaryKey(),
  candidateId: text("candidate_id")
    .notNull()
    .references(() => candidates.id),
  type: text("type").notNull(),
  at: text("at").notNull(),
  actor: text("actor"),
  // from/to/detail/reason vary by event type — keep the rest here.
  meta: jsonb("meta").$type<Record<string, unknown>>(),
});

export const feedbackHistory = pgTable("feedback_history", {
  id: serial("id").primaryKey(),
  candidateId: text("candidate_id")
    .notNull()
    .references(() => candidates.id),
  authorType: text("author_type").notNull(),
  author: text("author"),
  text: text("text").notNull(),
  at: text("at"),
});

// Unstructured source artifacts the AI synthesises over (the Jordan dossier,
// Amara's resume, recruiter Slack notes). `recordedAt` is what powers the
// "freshest artifact wins" source-of-truth rule.
export const candidateSources = pgTable("candidate_sources", {
  id: serial("id").primaryKey(),
  candidateId: text("candidate_id")
    .notNull()
    .references(() => candidates.id),
  kind: text("kind").notNull(), // resume | linkedin | call_transcript | email_thread | recruiter_slack
  title: text("title").notNull(),
  content: text("content").notNull(),
  recordedAt: text("recorded_at"), // ISO date; null = undated/stale
});

// Persisted, editable AI briefs (human-in-the-loop review before they "count").
export const aiBriefs = pgTable("ai_briefs", {
  id: serial("id").primaryKey(),
  candidateId: text("candidate_id")
    .notNull()
    .references(() => candidates.id),
  model: text("model").notNull(),
  content: jsonb("content").$type<CandidateBrief>().notNull(),
  // openevals factual-groundedness score (null if scoring failed/unavailable).
  factuality: jsonb("factuality").$type<FactualityScore | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Persisted pipeline digests (client-scoped). The latest is shown on load so the
// overview is fast; a refresh generates and saves a new one.
export const aiDigests = pgTable("ai_digests", {
  id: serial("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  model: text("model").notNull(),
  content: jsonb("content").$type<PipelineDigest>().notNull(),
  factuality: jsonb("factuality").$type<FactualityScore | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Shared shapes used by both jsonb columns and the app ────────────────────────
export type Contact = {
  name: string;
  title: string;
  email: string;
  role?: string;
};

export type ClientPreferences = {
  hiring_philosophy?: string[];
  response_pattern?: string;
  past_feedback?: string[];
};

export type CompBand = {
  base_min?: number;
  base_max?: number;
  equity?: string;
};

export type CareerStint = {
  company: string;
  title: string;
  start?: string | null;
  end?: string | null;
};

export type CompExpectation = {
  base?: number;
  notes?: string;
};

export type RecruiterMemo = {
  why_we_like?: string[];
  concerns?: string[];
  recommendation?: string;
  written_by?: string;
  written_at?: string;
};

export type Rejection = {
  reason?: string;
  notes?: string;
  rejected_by?: string;
  rejected_at?: string;
};

// The structured AI brief (mirrors the Zod schema in src/lib/ai/schema.ts).
export type CandidateBrief = {
  fit_summary: string;
  why_this_client: string;
  strengths: { point: string; evidence: string }[];
  concerns: { point: string; evidence: string }[];
  hard_stops: { label: string; severity: "blocker" | "warning"; detail: string }[];
  conflicts: {
    field: string;
    values_by_source: { source: string; value: string; recorded_at?: string }[];
    resolved_value: string;
    rule: string;
    confidence: "high" | "medium" | "low";
  }[];
  open_questions: string[];
  confidence_score: number; // 0–100
  confidence_rationale: string;
  recommended_next_action: string;
};

// The persisted pipeline digest (mirrors the Zod schema in src/lib/ai/digest.ts).
export type PipelineDigest = {
  headline: string;
  attention: {
    candidate: string;
    role: string;
    urgency: "high" | "medium" | "low";
    why: string;
    suggested_action: string;
  }[];
};

// Factual-groundedness score produced by openevals (LLM-as-judge). score is 0–1.
export type FactualityScore = {
  score: number;
  comment?: string;
  model: string;
};

export type Stage = (typeof stageEnum.enumValues)[number];
