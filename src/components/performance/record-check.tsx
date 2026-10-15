"use client";

import { Badge, Disclosure, Spinner } from "@/components/ui";
import { SuggestButton } from "@/components/performance/suggestions";
import type {
  ApiClaim,
  ApiClaims,
  ApiReviewFlag,
  ApiReviewStatus,
} from "@/lib/api/performance";
import { useReviewFlag } from "@/lib/store/performance";
import { useAutoReviewNote, type SuggestState } from "@/lib/store/ai";

export const pct = (bp: number) => `${(bp / 100).toFixed(1)}%`;
export const points = (bp: number) =>
  `${bp > 0 ? "+" : bp < 0 ? "−" : ""}${Math.abs(bp / 100).toFixed(1)} pts`;

// Exact, never rounded: the note quotes these same figures.
export const exactPct = (bp: number) => `${String(bp / 100)}%`;
export const exactPoints = (bp: number) =>
  `${bp > 0 ? "+" : bp < 0 ? "−" : ""}${String(Math.abs(bp) / 100)} pts`;

export const STATUS: Record<
  ApiReviewStatus,
  { label: string; tone: "warning" | "neutral" }
> = {
  below: { label: "Below their record", tone: "warning" },
  above: { label: "Above their record", tone: "warning" },
  matches: { label: "Matches their record", tone: "neutral" },
  unclear: { label: "Can't tell", tone: "neutral" },
};

export function StatusBadge({ status }: { status: ApiReviewStatus }) {
  return (
    <Badge tone={STATUS[status].tone} size="sm" dot>
      {STATUS[status].label}
    </Badge>
  );
}

export function NotePanel({ state }: { state: SuggestState }) {
  if (state.loading) {
    return (
      <div className="flex items-center gap-2 text-body-sm text-muted">
        <Spinner size="sm" />
        Writing a note
      </div>
    );
  }
  if (state.error)
    return <p className="text-body-sm text-danger-text">{state.error}</p>;
  const outcome = state.outcome;
  if (!outcome) return null;
  if (!outcome.available)
    return <p className="text-body-sm text-muted">{outcome.reason}</p>;
  const note = outcome.suggestions[0];
  if (!note) return null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-canvas p-3">
      <p className="text-body-sm font-semibold text-ink">{note.title}</p>
      <p className="text-body-sm text-body">{note.detail}</p>
      <Disclosure title="Based on" dense region={false}>
        <ul className="list-disc space-y-1 pl-5 text-body-sm text-muted">
          {outcome.groundedIn.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </Disclosure>
      <p className="text-meta text-muted">
        Written by AI from the figures and what each side wrote. It can be
        wrong.
      </p>
    </div>
  );
}

export function RecordCheck({
  cycleId,
  flag,
  active = true,
  claims: given,
}: {
  cycleId: string;
  flag: ApiReviewFlag;
  active?: boolean;
  /** Pass when the caller already holds them; otherwise they are fetched. */
  claims?: ApiClaims | null;
}) {
  const fetched = useReviewFlag(
    cycleId,
    flag.employeeId,
    active && given === undefined,
  );
  const claims = given === undefined ? fetched.claims : given;
  const { objectives, peers, history } = flag.evidence;
  const flagged = flag.status === "below" || flag.status === "above";
  const note = useAutoReviewNote(cycleId, flag.employeeId, active && flagged);
  const failed =
    note.error !== null || (note.outcome !== null && !note.outcome.available);

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-meta text-muted">Mark</dt>
          <dd className="text-body-md font-semibold text-ink">
            {exactPct(flag.markBp)}
          </dd>
        </div>
        <div>
          <dt className="text-meta text-muted">Record suggests</dt>
          <dd className="text-body-md font-semibold text-ink">
            {flag.expectedBp === null
              ? "Not enough evidence"
              : exactPct(flag.expectedBp)}
          </dd>
        </div>
        <div>
          <dt className="text-meta text-muted">Gap</dt>
          <dd
            className={`text-body-md font-semibold ${flagged ? "text-warning-text" : "text-ink"}`}
          >
            {flag.gapBp === null ? "—" : exactPoints(flag.gapBp)}
          </dd>
        </div>
      </dl>

      <div>
        <p className="mb-1 text-meta font-semibold text-faint">Evidence</p>
        <ul className="space-y-1 text-body-sm text-body">
          <li>
            Objectives:{" "}
            {objectives.scoreBp === null
              ? "none agreed for this period"
              : `${String(objectives.agreed)} agreed, ${String(objectives.measured)} measured by key results, ${exactPct(objectives.scoreBp)} achieved`}
          </li>
          <li>
            Peer feedback:{" "}
            {peers?.averageBp != null
              ? `${exactPct(peers.averageBp)} from ${String(peers.responses)} colleagues`
              : "fewer than 3 colleagues answered"}
          </li>
          <li>
            Previous periods:{" "}
            {history
              ? `${exactPct(history.averageBp)} over ${String(history.periods)}`
              : "none on record"}
          </li>
        </ul>
      </div>

      {flagged && (
        <div>
          <p className="mb-1 text-meta font-semibold text-faint">
            Patterns that apply
          </p>
          {flag.patterns.length ? (
            <ul className="list-disc space-y-1 pl-5 text-body-sm text-body">
              {flag.patterns.map((pattern) => (
                <li key={pattern.text}>{pattern.text}</li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-body">
              No known pattern applies. Worth asking their manager what the mark
              is based on.
            </p>
          )}
        </div>
      )}

      {flagged && (
        <div className="flex flex-col gap-2">
          <NotePanel state={note} />
          {failed && (
            <div>
              <SuggestButton
                label="Try again"
                loading={note.loading}
                onClick={note.retry}
              />
            </div>
          )}
        </div>
      )}

      {claims && <ClaimsView claims={claims} />}
    </div>
  );
}

function ClaimsView({ claims }: { claims: ApiClaims }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-3">
        <p className="text-meta font-semibold text-faint">Manager’s claim</p>
        {claims.manager.length ? (
          claims.manager.map((claim) => (
            <ClaimBox key={claim.author} claim={claim} by={claim.author} />
          ))
        ) : (
          <p className="text-body-sm text-muted">
            No written review submitted yet.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-meta font-semibold text-faint">Employee’s claim</p>
        {claims.employee ? (
          <>
            {(claims.employee.rating ||
              claims.employee.summary ||
              claims.employee.answers.length > 0) && (
              <ClaimBox claim={claims.employee} by="Self-review" />
            )}
            {claims.employee.onFinalMark && (
              <p className="text-body-sm text-body">
                {claims.employee.onFinalMark}
              </p>
            )}
          </>
        ) : (
          <p className="text-body-sm text-muted">
            No self-review submitted yet.
          </p>
        )}
      </div>
    </div>
  );
}

function ClaimBox({ claim, by }: { claim: ApiClaim; by: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body-sm font-semibold text-ink">{by}</span>
        {claim.rating && (
          <Badge tone="neutral" size="sm">
            {claim.rating}
          </Badge>
        )}
      </div>
      {claim.summary && (
        <p className="text-body-sm text-body">{claim.summary}</p>
      )}
      {claim.answers.length > 0 && (
        <dl className="flex flex-col gap-2">
          {claim.answers.map((answer) => (
            <div key={answer.question}>
              <dt className="text-meta text-muted">{answer.question}</dt>
              <dd className="text-body-sm text-body">{answer.answer}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
