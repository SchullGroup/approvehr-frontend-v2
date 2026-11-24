"use client";

import { useId, useMemo, useState } from "react";
import { ChevronRight, Inbox, Target } from "lucide-react";
import { CompletedWork } from "@/components/performance/completed-work";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FilterBar,
  Illustration,
  Select,
  TextLink,
  useToast,
  LoadState,
  type AppliedFilter,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  formatMeasure,
  hasNoReading,
  isDoneMeasure,
  quarterLabel,
  type ApiGoal,
} from "@/lib/api/performance";
import {
  NO_FILTERS,
  filterQueue,
  groupQueue,
  narrowing as isNarrowing,
  periodOf,
  queueOptions,
  targetLine,
  whoseWords,
  type ObjectiveLevelFilter,
  type QueueFilters,
  type QueueGrouping,
} from "@/lib/performance/objective-queue";
import { useDepartments } from "@/lib/store/departments";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useFeatures } from "@/lib/store/features";
import {
  useObjectiveMutations,
  type useObjectiveApprovals,
} from "@/lib/store/performance";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";
import { ApprovalReasonDialog } from "../approval-dialogs";
import { sentBackSaid } from "../objective-copy";
import { AgreedMoment, type Agreement } from "../approvals/agreed-moment";

/**
 * Objectives waiting to be agreed: the To agree tab on Objectives (owner,
 * 24 Nov 2026: "merge the objectives and objectives to agree subs into
 * multiple tabs in one page"), in the rhythm of My approvals. It was a page of
 * its own with a sidebar row; `/performance/approvals` now redirects here.
 *
 * The queue is read by the screen above it, which also shows its count on the
 * tab, and handed in, so one read answers both and a decision moves the count.
 *
 * ## Why this screen exists at all
 *
 * An objective must be agreed **before** the period it covers. Otherwise a
 * manager can set the target after seeing the result, and every rating built on
 * it is an opinion wearing a number. This queue is that rule made operable.
 *
 * ## Two answers
 *
 * **Agree** or **Decline**. Decline needs feedback, and sends it back to whoever
 * wrote it (`POST /goals/:id/send-back`): they can change it and send it again,
 * and it comes back here. The API's terminal refusal (`/reject`) is not offered:
 * the owner asked for two actions, and a declined objective has to stay editable
 * by its owner, which only a send-back does.
 *
 * ## One line a row
 *
 * Each row is the title, its target, whose it is and the period, with the two
 * answers beside it. The rest (what it says, every target with where it stands
 * now, the work linked to it, what happened to it) opens under the row. Agreeing
 * a target you have not read is what this lifecycle exists to prevent, which is
 * why the target is on the row itself and not only behind it.
 *
 * ## An empty queue is two different facts
 *
 * "Nothing waiting" and "you agree nobody's objectives" both render as no rows.
 * `couldHaveQueue` says which.
 */
/** Who agrees what, in one line (owner, 24 Nov 2026). Nobody agrees their own. */
export const AGREE_RULE =
  "A person's objectives go to their line manager, then their department head, then HR. Company and department objectives go to HR. Nobody agrees their own.";

export function ObjectivesToAgree({
  approvals,
  strip,
}: {
  approvals: ReturnType<typeof useObjectiveApprovals>;
  /** The page's tabs, drawn at the top like the other tabs draw them. */
  strip?: React.ReactNode;
}) {
  const objectives = useObjectiveMutations();
  const features = useFeatures();
  const toast = useToast();
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const { flat: departmentList } = useDepartments();

  const [filters, setFilters] = useState<QueueFilters>(NO_FILTERS);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [agreeing, setAgreeing] = useState<ApiGoal | null>(null);
  const [declining, setDeclining] = useState<ApiGoal | null>(null);
  /* The agreement just made, above the queue until the next decision. */
  const [agreed, setAgreed] = useState<Agreement | null>(null);

  /* Which department a personal objective belongs to is its owner's, and only
     the staff list knows that (the same rule as the Objectives cards). */
  const owners = useMemo(
    () =>
      new Map(
        directory.people.map((person) => [person.id, person.departmentId]),
      ),
    [directory.people],
  );
  const departmentNames = useMemo(
    () => new Map(departmentList.map((one) => [one.id, one.name])),
    [departmentList],
  );
  const options = useMemo(
    () => queueOptions(approvals.queue, owners, departmentList),
    [approvals.queue, owners, departmentList],
  );
  const shown = useMemo(
    () => filterQueue(approvals.queue, filters, owners),
    [approvals.queue, filters, owners],
  );
  const groups = useMemo(
    () => groupQueue(shown, filters.group, owners, departmentNames),
    [shown, filters.group, owners, departmentNames],
  );
  const narrowing = isNarrowing(filters);

  if (!features.loading && !features.appraisals) {
    return (
      <div className="flex flex-col gap-6">
        {strip !== undefined && (
          /* At its own width, as on the other tabs, not stretched by the
             column it sits in. */
          <div className="flex flex-wrap items-center gap-3">{strip}</div>
        )}
        <EmptyState
          plain
          icon={<Target aria-hidden="true" />}
          title="Appraisals are switched off"
          description="Agreeing objectives before the period they cover is part of the appraisal module. Turn it on and this fills itself."
          action={
            <TextLink href="/settings/features" className="text-body-sm">
              Open feature settings
            </TextLink>
          }
        />
      </div>
    );
  }

  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const set = (patch: Partial<QueueFilters>) =>
    setFilters((was) => ({ ...was, ...patch }));
  const label = (list: [string, string][], key: string) =>
    list.find(([id]) => id === key)?.[1] ?? key;
  const LEVEL_WORDS: Record<Exclude<ObjectiveLevelFilter, "">, string> = {
    company: "The company's",
    department: "A department's",
    personal: "One person's",
  };
  const applied: AppliedFilter[] = [
    ...(filters.person
      ? [
          {
            label: "Person",
            value: label(options.people, filters.person),
            onClear: () => set({ person: "" }),
          },
        ]
      : []),
    ...(filters.department
      ? [
          {
            label: "Department",
            value: label(options.departments, filters.department),
            onClear: () => set({ department: "" }),
          },
        ]
      : []),
    ...(filters.period
      ? [
          {
            label: "Period",
            value: label(options.periods, filters.period),
            onClear: () => set({ period: "" }),
          },
        ]
      : []),
    ...(filters.level
      ? [
          {
            label: "Level",
            value: LEVEL_WORDS[filters.level],
            onClear: () => set({ level: "" }),
          },
        ]
      : []),
  ];

  const answered = !approvals.loading && !approvals.error;

  return (
    <>
      <div className="flex flex-col gap-6">
        {strip !== undefined && (
          /* At its own width, as on the other tabs, not stretched by the
             column it sits in. */
          <div className="flex flex-wrap items-center gap-3">{strip}</div>
        )}
        <p className="text-body-sm text-muted">{AGREE_RULE}</p>
        {answered && approvals.queue.length > 0 && (
          <FilterBar
            search={filters.search}
            onSearchChange={(search) => set({ search })}
            searchLabel="Search the objectives waiting by title, person or department"
            searchPlaceholder="Search objectives…"
            applied={applied}
            {...(narrowing || filters.group !== ""
              ? { onClearAll: () => setFilters(NO_FILTERS) }
              : {})}
            count={narrowing ? shown.length : undefined}
            noun={["objective", "objectives"]}
            sort={
              <Select
                aria-label="Group the list"
                value={filters.group}
                onChange={(event) =>
                  set({ group: event.target.value as QueueGrouping })
                }
              >
                <option value="">Not grouped</option>
                <option value="department">By department</option>
                <option value="person">By person</option>
              </Select>
            }
          >
            {options.people.length > 0 && (
              <Select
                aria-label="Filter by person"
                value={filters.person}
                onChange={(event) => set({ person: event.target.value })}
              >
                <option value="">Anybody</option>
                {options.people.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
            <Select
              aria-label="Filter by department"
              value={filters.department}
              onChange={(event) => set({ department: event.target.value })}
            >
              <option value="">Any department</option>
              {options.departments.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by period"
              value={filters.period}
              onChange={(event) => set({ period: event.target.value })}
            >
              <option value="">Any period</option>
              {options.periods.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by level"
              value={filters.level}
              onChange={(event) =>
                set({ level: event.target.value as ObjectiveLevelFilter })
              }
            >
              <option value="">Any level</option>
              {options.levels.map((level) =>
                level === "" ? null : (
                  <option key={level} value={level}>
                    {LEVEL_WORDS[level]}
                  </option>
                ),
              )}
            </Select>
          </FilterBar>
        )}

        {agreed && (
          <AgreedMoment
            key={agreed.n}
            agreement={agreed}
            onDismiss={() => setAgreed(null)}
          />
        )}

        <LoadState
          loading={approvals.loading}
          error={approvals.error}
          subject="the objectives waiting on you"
          onRetry={approvals.reload}
          hasData={approvals.queue.length > 0}
          skeleton="list"
        >
          {approvals.queue.length === 0 ? (
            <Card>
              {approvals.couldHaveQueue ? (
                <EmptyState
                  art={<Illustration name="coffee-break" />}
                  title="Nothing waiting to be agreed"
                  description="New ones show up here when somebody sends an objective to be agreed."
                />
              ) : (
                <EmptyState
                  plain
                  icon={<Inbox aria-hidden="true" />}
                  title="You agree nobody's objectives"
                  description="This fills up for whoever people report to. Yours are on the Objectives page, where you can send them to be agreed."
                />
              )}
            </Card>
          ) : shown.length === 0 ? (
            <Card>
              <EmptyState
                mood="search"
                icon={<Target aria-hidden="true" />}
                title="Nothing matches that"
                description={`None of the ${String(approvals.queue.length)} waiting match your filters.`}
                action={
                  <Button
                    variant="ghost"
                    onClick={() => setFilters(NO_FILTERS)}
                  >
                    Clear the filters
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-6">
              {groups.map((group) => (
                <section
                  key={group.key}
                  aria-label={group.name || "Waiting to be agreed"}
                  className="flex flex-col gap-3"
                >
                  {group.name && (
                    <h2 className="text-meta font-semibold text-muted">
                      {group.name} · {group.goals.length}
                    </h2>
                  )}
                  <ul className="flex flex-col gap-3">
                    {group.goals.map((goal) => (
                      <li key={goal.id}>
                        <QueueRow
                          goal={goal}
                          open={open.has(goal.id)}
                          onToggle={() => toggle(goal.id)}
                          onAgree={() => setAgreeing(goal)}
                          onDecline={() => setDeclining(goal)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </LoadState>
      </div>

      <ConfirmDialog
        open={agreeing !== null}
        onClose={() => setAgreeing(null)}
        title={`Agree "${agreeing?.title ?? ""}"?`}
        confirmLabel="Agree"
        tone="primary"
        body={
          <span>
            {agreeing ? whoseWords(agreeing) : "The owner"} will be judged on
            this for{" "}
            {agreeing?.reviewCycleName ??
              quarterLabel(agreeing?.dueQuarter ?? null)}
            . It is fixed from now on. Progress can still change, but changing
            the objective itself needs a revision that records who changed it
            and why.
          </span>
        }
        onConfirm={async () => {
          if (!agreeing) return;
          try {
            await objectives.agree(agreeing.id);
            setAgreed((previous) => ({
              goal: agreeing,
              n: (previous?.n ?? 0) + 1,
            }));
            setAgreeing(null);
            approvals.reload();
          } catch (error) {
            toast.push({
              title: "That did not work",
              tone: "danger",
              detail:
                error instanceof ApiError
                  ? error.message
                  : "Something went wrong. Try again.",
            });
          }
        }}
      />

      <ApprovalReasonDialog
        act={declining ? "decline" : null}
        goalTitle={declining?.title ?? null}
        open={declining !== null}
        onClose={() => setDeclining(null)}
        onConfirm={async (reason) => {
          if (!declining) return;
          /* A refusal throws, so the dialog stays open with the feedback
             still typed and the server's sentence under it. */
          await objectives.sendBack(declining.id, reason);
          const said = sentBackSaid(declining);
          toast.push({
            title: said.title,
            tone: said.tone ?? "success",
            ...(said.detail ? { detail: said.detail } : {}),
          });
          setAgreed(null);
          setDeclining(null);
          approvals.reload();
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One objective: a line to decide on, and the rest under it.
 *
 * The toggle and the two answers are siblings, never one inside the other: a
 * button inside a button is invalid, and pressing Agree must never also open
 * the row.
 */
export function QueueRow({
  goal,
  open,
  onToggle,
  onAgree,
  onDecline,
}: {
  goal: ApiGoal;
  open: boolean;
  onToggle: () => void;
  onAgree: () => void;
  onDecline: () => void;
}) {
  const detailId = useId();
  const period = periodOf(goal);
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-3 p-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={onToggle}
          className="flex min-w-0 flex-1 basis-64 items-start gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <ChevronRight
            aria-hidden="true"
            className={
              "mt-0.5 size-4 shrink-0 text-muted transition-transform motion-reduce:transition-none " +
              (open ? "rotate-90" : "")
            }
          />
          <span className="min-w-0">
            <span className="block break-words text-body-sm text-ink">
              <span className="font-medium">{goal.title}</span>
              <span className="text-muted"> · {targetLine(goal)}</span>
            </span>
            <span className="mt-1 block text-meta text-muted">
              {whoseWords(goal)} · {period.name}
              {goal.revisionCount > 0 &&
                ` · reopened ${goal.revisionCount === 1 ? "once" : `${String(goal.revisionCount)} times`}`}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="approve"
            size="sm"
            onClick={onAgree}
            aria-label={`Agree, ${goal.title}`}
          >
            Agree
          </Button>
          <Button
            size="sm"
            onClick={onDecline}
            aria-label={`Decline, ${goal.title}`}
          >
            Decline
          </Button>
        </div>
      </div>
      {open && <RowDetail goal={goal} id={detailId} />}
    </Card>
  );
}

function RowDetail({ goal, id }: { goal: ApiGoal; id: string }) {
  const timeZone = useOrgTimezone();
  return (
    <div
      id={id}
      className="flex flex-col gap-4 border-t border-line px-4 py-4 text-body-sm"
    >
      {goal.description && (
        <p className="whitespace-pre-line leading-relaxed text-body">
          {goal.description}
        </p>
      )}

      {goal.keyResults.length === 0 ? (
        <p className="text-body">
          No target on this one. It can be agreed, and its progress will be the
          figure the owner states rather than one that counts itself.
        </p>
      ) : (
        <div>
          <h3 className="text-meta font-semibold text-muted">Targets</h3>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {goal.keyResults.map((measure) => (
              <li key={measure.id} className="text-body">
                <span className="font-medium text-ink">{measure.label}</span>
                {", "}
                {isDoneMeasure(measure) ? (
                  "done or not done"
                ) : (
                  <span className="tabular">
                    from {formatMeasure(measure.startValue, measure.unit)} to{" "}
                    {formatMeasure(measure.targetValue, measure.unit)}
                  </span>
                )}
                {measure.lowerIsBetter && " (counting down)"}
                {/* Where it stands now. An objective already at its target
                    before anybody agreed it is the post-hoc target this
                    lifecycle exists to catch. */}
                {isDoneMeasure(measure) ? (
                  measure.confirmedAt ? (
                    <span className="ml-1.5 font-medium text-warning-text">
                      · already confirmed as done
                    </span>
                  ) : (
                    <span className="ml-1.5 text-muted">· not done yet</span>
                  )
                ) : measure.met ? (
                  <span className="ml-1.5 font-medium text-warning-text">
                    · already met
                  </span>
                ) : hasNoReading(measure) ? (
                  <span className="ml-1.5 text-muted">
                    · nothing recorded yet
                  </span>
                ) : (
                  <span className="ml-1.5 tabular text-muted">
                    · now {formatMeasure(measure.currentValue, measure.unit)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <CompletedWork goal={goal} lazy />

      <div>
        <h3 className="text-meta font-semibold text-muted">History</h3>
        <ul className="mt-1.5 flex flex-col gap-1 text-body">
          {goal.submittedAt && (
            <li>
              Sent to be agreed on {formatDateShort(goal.submittedAt, timeZone)}
            </li>
          )}
          {goal.revisionCount > 0 && (
            <li>
              {goal.revisionCount === 1
                ? "Reopened once after it was agreed"
                : `Reopened ${String(goal.revisionCount)} times after it was agreed`}
            </li>
          )}
          {!goal.submittedAt && goal.revisionCount === 0 && (
            <li className="text-muted">Nothing else recorded.</li>
          )}
        </ul>
        {goal.approvalNote && (
          <p className="mt-2 border-l-2 border-line-strong pl-3 leading-relaxed text-body">
            {goal.approvalNote}
          </p>
        )}
      </div>
    </div>
  );
}
