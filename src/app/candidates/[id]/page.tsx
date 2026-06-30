import Link from "next/link";
import { notFound } from "next/navigation";
import { getCandidateFull } from "@/lib/data";
import {
  Card,
  FlagList,
  StageBadge,
  MomentumMeter,
  SectionTitle,
  Tag,
  Field,
} from "@/components/ui";
import { DecisionBar } from "@/components/DecisionBar";
import { BriefPanel } from "@/components/BriefPanel";
import { RetrospectPanel } from "@/components/RetrospectPanel";
import {
  formatComp,
  formatMoney,
  formatBand,
  formatDate,
  eventLabel,
  NOT_PROVIDED,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCandidateFull(id);
  if (!data) notFound();

  const {
    candidate: c,
    role,
    events,
    feedback,
    sources,
    flags,
    conflicts,
    momentum,
    latestBrief,
    briefCount,
  } = data;

  const base = c.compExpectation?.base;
  const band = role.compBand;
  let compHint = "Within band";
  if (base == null) compHint = "Not provided — track as open question";
  else if (band?.base_max != null && base > band.base_max)
    compHint = `Above band top (${formatMoney(band.base_max)})`;
  else if (band?.base_min != null && base < band.base_min) compHint = "Below band floor";
  else compHint = `Within band (${formatBand(band)})`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/roles/${role.id}`} className="text-sm text-slate-500 hover:underline">
          ← {role.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
          <StageBadge stage={c.stage} />
          {c.calibration && <Tag tone="indigo">calibration set</Tag>}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {c.headline}
          {c.location ? ` · ${c.location}` : ""}
        </p>
        <div className="mt-2 flex gap-3 text-sm">
          {c.links?.linkedin && (
            <a href={c.links.linkedin} className="text-indigo-600 hover:underline" target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          )}
          {c.links?.resume && (
            <a href={c.links.resume} className="text-indigo-600 hover:underline" target="_blank" rel="noreferrer">
              Resume
            </a>
          )}
          {c.links?.portfolio && (
            <a href={c.links.portfolio} className="text-indigo-600 hover:underline" target="_blank" rel="noreferrer">
              Portfolio
            </a>
          )}
        </div>
      </div>

      {/* Decision */}
      <Card className="p-4">
        <DecisionBar id={c.id} stage={c.stage} />
      </Card>

      {/* Rejection */}
      {c.stage === "rejected" && c.rejection && (
        <Card className="border-rose-200 bg-rose-50/50 p-4">
          <h2 className="text-sm font-semibold text-rose-800">
            Rejected — {c.rejection.reason}
          </h2>
          {c.rejection.notes && <p className="mt-1 text-sm text-rose-700">{c.rejection.notes}</p>}
          <p className="mt-1 text-xs text-rose-500">
            by {c.rejection.rejected_by} · {formatDate(c.rejection.rejected_at)}
          </p>
        </Card>
      )}

      {/* Flags */}
      {flags.length > 0 && (
        <Card className="p-4">
          <SectionTitle>Flags</SectionTitle>
          <div className="space-y-2">
            {flags.map((f, i) => (
              <div key={i} className="text-sm">
                <FlagList flags={[f]} />
                <p className="mt-1 text-slate-600">{f.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Conflicting information — pointed out, not resolved */}
      {conflicts.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/60 p-4">
          <div className="flex items-baseline justify-between">
            <SectionTitle>Conflicting information</SectionTitle>
            <span className="text-xs font-medium text-amber-700">pointed out, not resolved</span>
          </div>
          <div className="space-y-3">
            {conflicts.map((cf, i) => (
              <div key={i}>
                <p className="text-sm font-semibold text-slate-900">{cf.field}</p>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  {cf.values.map((v, j) => (
                    <div
                      key={j}
                      className="rounded-md bg-white p-2 ring-1 ring-inset ring-amber-200"
                    >
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {v.label}
                      </span>
                      <span className="text-sm text-slate-800">{v.value}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-600">{cf.note}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: facts */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <SectionTitle>Decision facts</SectionTitle>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Compensation" hint={compHint}>
                {formatComp(c.compExpectation)}
                {c.compExpectation?.notes ? (
                  <span className="text-slate-500"> · {c.compExpectation.notes}</span>
                ) : null}
              </Field>
              <Field
                label="Availability"
                hint={role.targetStart ? `Role targets ${role.targetStart}` : undefined}
              >
                {c.availability ?? NOT_PROVIDED}
              </Field>
              <Field label="Work authorization">{c.workAuthorization ?? NOT_PROVIDED}</Field>
              <Field label="Current">
                {c.currentTitle} at {c.currentCompany}
              </Field>
            </dl>
          </Card>

          <Card className="grid gap-5 p-5 sm:grid-cols-2">
            <div>
              <SectionTitle>Strengths</SectionTitle>
              <ul className="space-y-1 text-sm text-slate-700">
                {c.strengths.map((s, i) => (
                  <li key={i}>• {s}</li>
                ))}
              </ul>
            </div>
            <div>
              <SectionTitle>Concerns</SectionTitle>
              <ul className="space-y-1 text-sm text-slate-700">
                {c.concerns.map((s, i) => (
                  <li key={i}>• {s}</li>
                ))}
              </ul>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle>Career history</SectionTitle>
            <ul className="space-y-2">
              {c.careerHistory.map((h, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span className="text-slate-800">
                    {h.title} · {h.company}
                  </span>
                  <span className="text-xs text-slate-400">
                    {h.start ?? "?"} – {h.end ?? "present"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <SectionTitle>Recruiter memo</SectionTitle>
            {c.recruiterMemo ? (
              <div className="space-y-3 text-sm">
                {c.recruiterMemo.why_we_like && (
                  <Memo label="Why we like" items={c.recruiterMemo.why_we_like} />
                )}
                {c.recruiterMemo.concerns && (
                  <Memo label="Concerns" items={c.recruiterMemo.concerns} />
                )}
                {c.recruiterMemo.recommendation && (
                  <p>
                    <span className="font-medium text-slate-700">Recommendation: </span>
                    {c.recruiterMemo.recommendation}
                  </p>
                )}
                <p className="text-xs text-slate-400">
                  {c.recruiterMemo.written_by} · {formatDate(c.recruiterMemo.written_at)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No recruiter memo on file. The AI brief can generate an assessment from the record
                and source artifacts.
              </p>
            )}
          </Card>

          {c.openQuestions.length > 0 && (
            <Card className="p-5">
              <SectionTitle>Open questions</SectionTitle>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {c.openQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </Card>
          )}

          {sources.length > 0 && (
            <Card className="p-5">
              <SectionTitle>Source artifacts ({sources.length})</SectionTitle>
              <p className="mb-3 text-xs text-slate-500">
                Raw artifacts behind this candidate. Where they disagree, the AI brief reconciles
                them (freshest source wins) and flags the conflict.
              </p>
              <div className="space-y-2">
                {sources.map((s) => (
                  <details key={s.id} className="rounded-md border border-slate-200">
                    <summary className="cursor-pointer px-3 py-2 text-sm">
                      <span className="font-medium text-slate-800">{s.title}</span>
                      <span className="text-xs text-slate-400">
                        {" "}
                        · {s.kind} · {s.recordedAt ? formatDate(s.recordedAt) : "undated"}
                      </span>
                    </summary>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-slate-100 px-3 py-2 font-mono text-xs text-slate-600">
                      {s.content}
                    </pre>
                  </details>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right: momentum + AI brief + activity */}
        <div className="space-y-6">
          <Card className="p-5">
            <SectionTitle>Momentum</SectionTitle>
            <MomentumMeter momentum={momentum} size="lg" />
          </Card>

          <Card className="p-5">
            <BriefPanel
              candidateId={c.id}
              initialBrief={latestBrief?.content ?? null}
              initialModel={latestBrief?.model}
              initialCreatedAt={latestBrief?.createdAt?.toISOString()}
              initialFactuality={latestBrief?.factuality ?? null}
            />
          </Card>

          <RetrospectPanel kind="brief" candidateId={c.id} historyCount={briefCount} />

          {feedback.length > 0 && (
            <Card className="p-5">
              <SectionTitle>Feedback history</SectionTitle>
              <ul className="space-y-3">
                {feedback.map((f) => (
                  <li key={f.id} className="text-sm">
                    <p className="text-slate-700">{f.text}</p>
                    <p className="text-xs text-slate-400">
                      {f.author} ({f.authorType}) · {formatDate(f.at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <SectionTitle>Activity timeline</SectionTitle>
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                  <div>
                    <p className="text-slate-800">{eventLabel(e.type)}</p>
                    <p className="text-xs text-slate-400">
                      {formatDate(e.at)}
                      {e.actor ? ` · ${e.actor}` : ""}
                      {renderMeta(e.meta)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Memo({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-slate-700">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function renderMeta(meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  if (meta.from && meta.to) return ` · ${meta.from} → ${meta.to}`;
  if (typeof meta.detail === "string") return ` · ${meta.detail}`;
  if (typeof meta.reason === "string") return ` · ${meta.reason}`;
  return "";
}
