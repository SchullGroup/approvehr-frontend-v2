"use client";

import { useMemo, useState } from "react";
import { TriangleAlert, UserRoundPlus } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Field,
  FilterBar,
  Input,
  Select,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  TextLink,
  useToast,
  type AppliedFilter,
} from "@/components/ui";
import { LoadMore } from "@/components/portal/load-more";
import { ApiError } from "@/lib/api/client";
import type {
  ApiApplication,
  ApiStage,
  ApplicationOutcome,
} from "@/lib/api/recruitment";
import { useCan } from "@/lib/permissions";
import {
  useApplicationMutations,
  usePipelineApplications,
} from "@/lib/store/recruitment";
import { useDebounced } from "@/lib/use-debounced";

const OUTCOME_TONE = {
  IN_PROGRESS: "info",
  OFFER_MADE: "warning",
  HIRED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
} as const;

const OUTCOME_LABEL: Record<string, string> = {
  IN_PROGRESS: "In progress",
  OFFER_MADE: "Offer made",
  HIRED: "Hired",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

/** What the "Show" box offers, and what each asks the API for. */
const OUTCOME_CHOICES: { value: ApplicationOutcome | "ALL"; label: string }[] =
  [
    { value: "IN_PROGRESS", label: "In progress" },
    { value: "OFFER_MADE", label: "Offer made" },
    { value: "HIRED", label: "Hired" },
    { value: "REJECTED", label: "Rejected" },
    { value: "WITHDRAWN", label: "Withdrawn" },
    { value: "ALL", label: "Everyone" },
  ];

/**
 * The real pipeline board — dynamic columns, one per this requisition's own
 * `PipelineStage`, unlike the seeded `RequisitionWorkspace`'s fixed five.
 *
 * ## Newest first, a page at a time, filtered by the server
 *
 * It used to ask for the first two hundred and hide the rest. The API's default
 * for this list is oldest first, so a role with more than two hundred people
 * showed the two hundred who applied first and nothing of this week. Now the
 * order is newest first, the stage, outcome, dates and search are questions to
 * the API, the count in the bar is the API's, and "Load more" fetches the next
 * fifty. The search waits for a pause in typing before it asks.
 *
 * Board only, no table toggle: a stage picker per card reads fine either way,
 * and a second view is a nice-to-have this cutover did not need to match
 * pixel for pixel to be real.
 */
export function RealRequisitionWorkspace({
  requisitionId,
  stages,
}: {
  requisitionId: string;
  stages: ApiStage[];
}) {
  const [outcome, setOutcome] = useState<ApplicationOutcome | "ALL">(
    "IN_PROGRESS",
  );
  const [stageId, setStageId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  /* A keystroke is faster than a request: ask once the typing pauses. */
  const query = useDebounced(search.trim(), 300);
  const rangeBackwards = from !== "" && to !== "" && from > to;

  const { applications, total, loading, settling, error, reload, ...paging } =
    usePipelineApplications(requisitionId, {
      ...(outcome === "ALL" ? {} : { outcome }),
      ...(stageId ? { stageId } : {}),
      ...(query ? { q: query } : {}),
      ...(from && !rangeBackwards ? { from } : {}),
      ...(to && !rangeBackwards ? { to } : {}),
    });
  const mutations = useApplicationMutations();
  const toast = useToast();
  /* `POST /applications/:id/move` is gated on `MANAGE_HIRING` server-side.
     This screen is reachable by anyone holding that or `APPROVE_HIRING` (the
     entry gate in requisition-screen.tsx admits either), and this file had
     no permission check at all — an approver-only account saw a live,
     always-refused stage picker on every row. Same rule the candidate page's
     "Move this candidate" card already applies to the identical action. */
  const canManage = useCan("MANAGE_HIRING");
  const [busyId, setBusyId] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...stages].sort((a, b) => a.order - b.order),
    [stages],
  );

  /* The rows shown answer an earlier question: a filter changed, or the search
     has been typed and not yet sent. Dimmed, not swapped for a skeleton, so the
     board does not collapse and jump. */
  const stale = settling || search.trim() !== query;

  const applied: AppliedFilter[] = [
    ...(outcome !== "IN_PROGRESS"
      ? [
          {
            label: "Showing",
            value:
              OUTCOME_CHOICES.find((choice) => choice.value === outcome)
                ?.label ?? outcome,
            onClear: () => setOutcome("IN_PROGRESS"),
          },
        ]
      : []),
    ...(stageId
      ? [
          {
            label: "Stage",
            value: ordered.find((s) => s.id === stageId)?.name ?? "Selected",
            onClear: () => setStageId(""),
          },
        ]
      : []),
    ...(from
      ? [{ label: "Entered from", value: from, onClear: () => setFrom("") }]
      : []),
    ...(to
      ? [{ label: "Entered to", value: to, onClear: () => setTo("") }]
      : []),
  ];
  const narrowed = applied.length > 0 || search.trim() !== "";
  const clearAll = () => {
    setOutcome("IN_PROGRESS");
    setStageId("");
    setFrom("");
    setTo("");
    setSearch("");
  };

  async function move(application: ApiApplication, stageId: string) {
    setBusyId(application.id);
    try {
      await mutations.move(application.id, stageId);
      reload();
    } catch (error) {
      toast.push({
        title: "Not moved",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusyId(null);
    }
  }

  const filterBar = (
    <FilterBar
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Find a name or email"
      searchLabel="Find a candidate by name or email"
      applied={applied}
      onClearAll={clearAll}
      count={total ?? undefined}
      noun={["candidate", "candidates"]}
      actions={
        <Select
          aria-label="Show candidates who are"
          value={outcome}
          onChange={(event) =>
            setOutcome(event.target.value as ApplicationOutcome | "ALL")
          }
          className="w-auto"
        >
          {OUTCOME_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </Select>
      }
    >
      <Field label="Stage">
        <Select
          value={stageId}
          onChange={(event) => setStageId(event.target.value)}
        >
          <option value="">Every stage</option>
          {ordered.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Entered from" optional>
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => setFrom(event.target.value)}
        />
      </Field>
      <Field
        label="Entered to"
        optional
        {...(rangeBackwards
          ? { error: "That is before the start date, so no dates are applied." }
          : {})}
      >
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => setTo(event.target.value)}
        />
      </Field>
    </FilterBar>
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {filterBar}
        <TableWrap caption="Candidates for this role">
          <THead>
            <TH>Candidate</TH>
            <TH>Stage</TH>
            <TH>Outcome</TH>
          </THead>
          <TBody>
            <TR>
              <TD colSpan={3} className="text-body-sm text-muted">
                Loading…
              </TD>
            </TR>
          </TBody>
        </TableWrap>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        {filterBar}
        <EmptyState
          icon={<TriangleAlert aria-hidden="true" />}
          title="Could not load this pipeline"
          description={error.message}
          action={
            <Button variant="secondary" size="sm" onClick={reload}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {filterBar}

      {applications.length === 0 && !stale ? (
        <EmptyState
          icon={<UserRoundPlus aria-hidden="true" />}
          title={narrowed ? "Nobody matches" : "No candidates yet"}
          description={
            narrowed
              ? "Nobody on this role fits the search and filters above."
              : "Somebody joins this board when a screener screens them in from the application queue."
          }
          action={
            narrowed ? (
              <Button variant="secondary" size="sm" onClick={clearAll}>
                Clear the search and filters
              </Button>
            ) : (
              <ButtonLink
                href="/hiring/postings/applications"
                variant="accent"
                size="sm"
              >
                Open the application queue
              </ButtonLink>
            )
          }
        />
      ) : (
        <div
          aria-busy={stale}
          className={
            stale
              ? "flex flex-col gap-4 opacity-60 transition-opacity"
              : "flex flex-col gap-4 transition-opacity"
          }
        >
          <div className="hidden sm:block">
            <TableWrap caption="Candidates, their stage and outcome">
              <THead>
                <TH>Candidate</TH>
                <TH>Stage</TH>
                <TH>Outcome</TH>
                <TH align="right">Move to</TH>
              </THead>
              <TBody>
                {applications.map((a) => (
                  <TR key={a.id}>
                    <TDPrimary
                      title={
                        <TextLink href={`/hiring/candidates/${a.id}`}>
                          {a.candidateName}
                        </TextLink>
                      }
                      subtitle={a.candidateEmail}
                    />
                    <TD>
                      <Badge tone="neutral" size="sm">
                        {a.stageName ?? "Not placed"}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge
                        tone={OUTCOME_TONE[a.outcome]}
                        size="sm"
                        {...(a.rejectionReason
                          ? { title: a.rejectionReason }
                          : {})}
                      >
                        {OUTCOME_LABEL[a.outcome] ?? a.outcome}
                      </Badge>
                      {/* Most often "Role filled by <name>." — written by the
                          API the instant somebody else's offer on this same
                          requisition is accepted, which rejects everyone
                          else still in progress. Without this, a recruiter
                          watching the board sees people flip to Rejected
                          with an effect and no visible cause. */}
                      {a.rejectionReason && (
                        <p className="mt-0.5 text-meta text-muted">
                          {a.rejectionReason}
                        </p>
                      )}
                    </TD>
                    <TD align="right">
                      {a.outcome === "IN_PROGRESS" && canManage && (
                        <Select
                          value={a.stageId ?? ""}
                          disabled={busyId === a.id}
                          onChange={(e) => void move(a, e.currentTarget.value)}
                          className="ml-auto w-auto"
                        >
                          {ordered.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </div>

          <ul className="divide-y divide-line sm:hidden">
            {applications.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 p-4">
                <div className="min-w-0">
                  <TextLink href={`/hiring/candidates/${a.id}`}>
                    {a.candidateName}
                  </TextLink>
                  <p className="text-body-sm text-muted">{a.candidateEmail}</p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral" size="sm">
                    {a.stageName ?? "Not placed"}
                  </Badge>
                  <Badge tone={OUTCOME_TONE[a.outcome]} size="sm">
                    {OUTCOME_LABEL[a.outcome] ?? a.outcome}
                  </Badge>
                </div>
                {a.rejectionReason && (
                  <p className="text-meta text-muted">{a.rejectionReason}</p>
                )}

                {a.outcome === "IN_PROGRESS" && canManage && (
                  <div>
                    <p className="mb-1 text-meta text-muted">Move to</p>
                    <Select
                      aria-label={`Move ${a.candidateName} to a stage`}
                      value={a.stageId ?? ""}
                      disabled={busyId === a.id}
                      onChange={(e) => void move(a, e.currentTarget.value)}
                    >
                      {ordered.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {applications.length > 0 && (
        <LoadMore
          shown={applications.length}
          total={total}
          noun={["candidate", "candidates"]}
          hasMore={paging.hasMore}
          loading={paging.loadingMore}
          error={paging.moreError}
          onLoadMore={paging.loadMore}
        />
      )}
    </div>
  );
}
