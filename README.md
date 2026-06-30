# CoffeeSpace — Client Portal

A minimal client-facing hiring portal: a founder/hiring manager reviews candidates
submitted for their roles, makes shortlist/reject decisions, sees what needs their
attention, and generates an **AI candidate brief** that synthesizes conflicting
source material into a client-ready, uncertainty-aware write-up.

See **[DESIGN.md](./DESIGN.md)** for product/engineering/AI decisions.

## Stack

- **Next.js 16** (App Router, RSC + server actions) · **Tailwind v4**
- **Drizzle ORM** → **Neon Postgres**
- **Vercel AI SDK** (`generateObject` + Zod) + **`@ai-sdk/anthropic`** → **Claude Sonnet 4.6** (`claude-sonnet-4-6`)

## Prerequisites

- Node 20+ and `pnpm`
- A **Neon Postgres** connection string (free tier is fine)
- An **`ANTHROPIC_API_KEY`** — the AI brief/digest call Claude directly via `@ai-sdk/anthropic`

## Run it locally

```bash
pnpm install

# 1. Point at a Postgres DB. Easiest: Vercel dashboard → Storage → create a Neon
#    database, then pull its connection string:
vercel env pull .env.local         # pulls DATABASE_URL from the linked Neon store
#    …or add it yourself to .env.local:
#    DATABASE_URL=postgres://...neon.tech/...?sslmode=require

# 2. Add your Anthropic key to .env.local (the AI brief/digest call Claude directly):
#    ANTHROPIC_API_KEY=sk-ant-...

# 3. Create tables and load the provided seed (client, 2 roles, 10 candidates,
#    the Jordan dossier, recruiter Slack notes).
pnpm db:push
pnpm db:seed

# 4. Start the app.
pnpm dev      # http://localhost:3000
```

> The AI brief / digest call Claude via `@ai-sdk/anthropic`, which reads
> `ANTHROPIC_API_KEY` from `.env.local`. Everything except the two AI buttons works
> without it.

## Deploy (Vercel)

1. Import the repo into Vercel.
2. **Storage → add a Neon database** — `DATABASE_URL` is injected automatically.
3. Add **`ANTHROPIC_API_KEY`** to the project's Environment Variables, then deploy.
4. Seed the production DB once: `DATABASE_URL=<prod url> pnpm db:seed`.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Run the app |
| `pnpm db:push` | Create/sync tables from the Drizzle schema |
| `pnpm db:seed` | Load `data/seed.json` + `data/raw/*` (idempotent) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm build` | Production build (needs `DATABASE_URL`) |

## Where things live

```
src/db/schema.ts        Drizzle schema (tables + jsonb shapes)
src/scripts/seed.ts     Ingests seed.json + raw artifacts (incl. the dossier)
src/lib/data.ts         RSC query helpers (enriched candidates, overview)
src/lib/rules.ts        Deterministic "attention" engine (hard stops, comp band, …)
src/lib/ai/brief.ts     Candidate brief synthesis (generateObject + Zod)
src/lib/ai/digest.ts    Pipeline "what needs your attention" summary
src/app/actions.ts      Server actions: shortlist / reject / move / generate
src/app/                Overview · /roles/[id] · /candidates/[id]
```

## How the app handles the messy data

The seed is intentionally incomplete and contradictory. The portal engages it
rather than rendering the happy path:

| In the data | How the portal handles it |
|---|---|
| `cand_003` null comp + availability | Explicit "Not provided" + a "Missing key info" flag and open question — never blank/undefined |
| `cand_002` comp above band | "Comp above band" flag, shown against the role band, not as a fact |
| `cand_005` needs sponsorship; role disqualifies it | Connected to the role disqualifier → **blocker** hard stop |
| `cand_006` already rejected | Renders rejection reason + structured feedback + timeline |
| `cand_007` strong but 3 months out; Lead vs "wants IC" | Timing-risk flag; the IC/Lead tension surfaces in the brief |
| Jordan dossier (5 conflicting sources) | Brief resolves with **freshest-source-wins** and shows every value in a Conflicts card |
| Missing recruiter memos (5/10) | The brief generates the assessment from the record + artifacts |
| `client.preferences` | Used as AI framing context (ownership over pedigree, anti-FAANG) |
| `calibration_set` | Surfaced on the role page as a "calibrate the bar first" step |
| `open_questions` | Shown per-candidate; the brief **outputs** open questions instead of guessing |

## Deliberate cuts (v1)

Auth/multi-tenancy (one hardcoded client), file upload + PDF parsing, inline brief
editing, real-time/Slack/email. Rationale in DESIGN.md.
