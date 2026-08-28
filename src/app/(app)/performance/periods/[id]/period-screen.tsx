"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCheck,
  ListChecks,
  Lock,
  Play,
  UserX,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Callout,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Spinner,
  Stat,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  Textarea,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  EXCEPTION_CODE_SUMMARY,
  dayLabel,
  groupExceptionsByCode,
  scoreLabel,
  weightLabel,
  type ApiAppraiserMap,
  type ReviewCycleStage,
  type ApiAppraiserMapRow,
  type ApiCycleParticipants,
  type ApiScoreRegister,
  type ApiScoreRow,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import {
  outstandingIn,
  useCycleMutations,
  useCycleRegister,
} from "@/lib/store/performance";
import { QuestionsDialog } from "../../period-dialogs";
import { AppraisersDialog } from "../../appraiser-map";
import { AskPeersButton } from "./ask-peers";

/**
 * Running one appraisal period.
 *
 * ## Everything that happens to a period happens here
 *
 * It used to be spread across a card at the bottom of a tab: write the questions
 * there, start it there, chase people there, publish there — and then come *here*
 * to find out who was outstanding. So the screen named after the period could not
 * act on it and the screen that acted on it was a strip in a list. A product owner
 * read the module and could not work out how to create an appraisal.
 *
 * The list is a list now, and this is the period. Setting it up, starting it,
 * chasing the late ones and publishing the results are the four things a period
 * ever needs, and each appears **only** in the state where it applies.
 *
 * ## The question this screen answers is "who is not finished"
 *
 * Not "how is the company doing" — that is a report, and it is a different
 * screen. A period's owner has one job, which is to reach the end of it with
 * nobody left out, and the two ways somebody gets left out are opposite:
 *
 * | | What it is | Where it comes from |
 * |---|---|---|
 * | **Outstanding** | a form somebody has not got round to | the participant list |
 * | **Nobody appraising them** | a person nobody was ever asked to mark | the appraiser map |
 *
 * Both are surfaced **above** the table, in the payroll run's shape. A blocker
 * buried in row 40 is a blocker nobody read, and that is not a metaphor: the
 * whole reason `PayrollExclusion` exists is that a missing bank account sat in a
 * list nobody scrolled to.
 *
 * ## Nobody appraising somebody is not silence, ever
 *
 * An employee with no appraiser in an open period finishes it with no mark, and
 * every screen looks finished. It is the performance module's missing bank
 * account. The mapping *interface* is behind the `multiAppraiser` flag, because a
 * company with one manager per person must never be shown a weighting table it
 * did not ask for — but the **exception is not behind any flag**, and it must not
 * be, because the company that never opens the mapping screen is exactly the
 * company that will lose somebody. That is why this reads the map here rather
 * than only on the mapping tab, and why it renders whether the flag is on or off.
 *
 * The same two exceptions come back from starting the period, by name, and they
 * are rendered as callouts rather than a toast — a toast is gone in six seconds
 * and somebody has to act on these.
 *
 * ## Scores are integers and an absence is an absence
 *
 * The table's score column prints "No mark" where nothing counted, never 0%.
 * "Scored nought" and "nothing was recorded" are different claims about a person,
 * and only one of them is ever true here.
 */
/**
 * What the next stage is called on the button, and what follows what.
 *
 * `PUBLISHED` is deliberately absent as a destination: closing the period is
 * what publishes it, the API refuses `stage: PUBLISHED` outright, and the
 * "Publish the results" button beside this one is that act with its own
 * confirmation. So this only ever walks SELF → MANAGER → CALIBRATION.
 */
const STAGE_AFTER: Partial<Record<ReviewCycleStage, ReviewCycleStage>> = {
  SELF: "MANAGER",
  MANAGER: "CALIBRATION",
};

const STAGE_NEXT_LABEL: Record<string, string> = {
  MANAGER: "manager review",
  CALIBRATION: "calibration",
};

export function PeriodScreen({ cycleId }: { cycleId: string }) {
  const canSeeCompany = useCan("EDIT_RECORDS");
  const canManage = useCan("MANAGE_SETTINGS");
  const detail = useCycleRegister(cycleId, canSeeCompany);
  const periods = useCycleMutations();
  const toast = useToast();

  const [chasing, setChasing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  /* Named lists, not counts, and they survive the toast. Both are somebody who
     finishes the period short, and the fixes are different. */
  const [noAppraiser, setNoAppraiser] = useState<string[] | null>(null);
  const [noObjectives, setNoObjectives] = useState<string[] | null>(null);

  const period = detail.cycle;
  const outstanding = outstandingIn(detail.participants);
  const draft = period?.stage === "DRAFT";
  const published = period?.stage === "PUBLISHED";
  const running = period !== null && !draft && !published;

  /* Only while it is actually running: a draft has not started and a
     published one is a record. `undefined` at calibration, which is the last
     stage before publishing. */
  const nextStage = running && period ? STAGE_AFTER[period.stage] : undefined;

  const failed = (error: unknown) => {
    toast.push({
      title: "That did not work",
      tone: "danger",
      detail:
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
    });
  };

  /**
   * Starting it, kept apart from every other mutation because the result matters.
   *
   * `withoutAppraiser` is the list of people who would finish with no mark and
   * `withoutAgreedObjectives` is the list with nothing to be judged on. A helper
   * that threw the response away would throw away the only warning anybody gets.
   */
  const start = async () => {
    if (!period) return;
    setStarting(true);
    try {
      const result = await periods.activate(cycleId);
      toast.push({
        title: `${period.name} started`,
        tone: "success",
        detail: `${result.reviewsCreated} ${result.reviewsCreated === 1 ? "form" : "forms"} written · ${result.notified} told in the app. Nothing here sends email.`,
      });
      setNoAppraiser(
        result.withoutAppraiser.length > 0 ? result.withoutAppraiser : null,
      );
      setNoObjectives(
        result.withoutAgreedObjectives.length > 0
          ? result.withoutAgreedObjectives
          : null,
      );
      detail.reload();
    } catch (error) {
      failed(error);
    } finally {
      setStarting(false);
    }
  };

  const advance = async () => {
    if (!period || !nextStage) return;
    setAdvancing(true);
    try {
      await periods.advance(cycleId, nextStage);
      toast.push({
        title: `${period.name} moved to ${STAGE_NEXT_LABEL[nextStage]}`,
        tone: "success",
        detail:
          nextStage === "MANAGER"
            ? "Managers write their reviews now. Self-reviews already in are kept."
            : "Marks are in. Nothing else is asked for until you publish.",
      });
      detail.reload();
    } catch (error) {
      failed(error);
    } finally {
      setAdvancing(false);
    }
  };

  const publish = async () => {
    if (!period) return;
    try {
      const result = await periods.publish(cycleId);
      toast.push({
        title: `${period.name} published`,
        tone: "success",
        detail:
          result.unscored.length > 0
            ? `${result.unscored.length} ${result.unscored.length === 1 ? "person finishes" : "people finish"} with no mark: ${result.unscored.join(", ")}.`
            : "Every manager's review is now readable by the person it is about.",
      });
      detail.reload();
    } catch (error) {
      failed(error);
    } finally {
      setPublishing(false);
    }
  };

  const chase = async () => {
    setChasing(true);
    try {
      const result = await periods.remind(cycleId);
      toast.push({
        title:
          result.outstanding === 0
            ? "Nobody owes anything"
            : `Nudged ${result.reminded} ${result.reminded === 1 ? "person" : "people"}`,
        tone: "success",
        /* The count that does not add up is the useful one: somebody with no
           sign-in cannot be chased in the app, and saying so beats a number
           that quietly disagrees with the outstanding list. */
        ...(result.noAccount > 0
          ? {
              detail: `${result.noAccount} ${result.noAccount === 1 ? "person has" : "people have"} no sign-in, so they were not reached. Nothing here sends email.`,
            }
          : {}),
      });
      detail.reload();
    } catch (error) {
      failed(error);
    } finally {
      setChasing(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/performance", label: "KPIs & appraisals" },
          { href: "/performance?tab=periods", label: "Appraisal periods" },
        ]}
        title={period?.name ?? "Appraisal period"}
        meta={
          period ? (
            <>
              <Badge tone={published ? "neutral" : "info"} size="sm" dot>
                {period.stageLabel}
              </Badge>
              {period.scoringFrozen && (
                <Badge
                  tone="accent"
                  size="sm"
                  icon={<Lock aria-hidden="true" />}
                >
                  Weights frozen
                </Badge>
              )}
            </>
          ) : undefined
        }
        action={
          <>
            {/* The outcome is a different question from "who is not finished",
                and a different screen. Linked from here because this is where
                somebody is when they decide they want it. */}
            {canSeeCompany && !draft && (
              <ButtonLink
                size="sm"
                href={`/performance/periods/${cycleId}/report`}
              >
                See the report
              </ButtonLink>
            )}
            {/* The stage never moved on its own, and nothing moved it: the
                endpoint has always accepted `MANAGER` and `CALIBRATION`,
                gated and ordered correctly, and had no caller — so every
                period in the product read "self-review" right up until it was
                published, whatever was actually happening in it. This is that
                button. Forward only; the API refuses going back, and refuses
                publishing this way. */}
            {canManage && nextStage && (
              <Button
                size="sm"
                loading={advancing}
                onClick={() => void advance()}
              >
                <ArrowRight aria-hidden="true" className="size-3.5" />
                Move to {STAGE_NEXT_LABEL[nextStage]}
              </Button>
            )}
            {canManage && running && (
              <Button size="sm" loading={chasing} onClick={() => void chase()}>
                Nudge who is late
              </Button>
            )}
            {canManage && running && (
              <Button size="sm" onClick={() => setPublishing(true)}>
                Publish the results
              </Button>
            )}
          </>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-6">
          {/* Setting it up is the whole of this screen while it is a draft, so it
              is first and it is the only accent control on the page. `canManage`
              rather than `canSeeCompany`: starting a period and reading everybody's
              marks are two different permissions, and somebody who holds only the
              first still has to be able to start it. */}
          {canManage && draft && period && (
            <Card>
              <CardHeader
                title="Set it up, then start it"
                description="Nobody has been asked anything yet. Starting it writes one form for every employee and tells them all in the app."
                action={
                  <Badge
                    tone={period.questionCount > 0 ? "neutral" : "warning"}
                    size="sm"
                    icon={<ListChecks aria-hidden="true" />}
                  >
                    {period.questionCount === 1
                      ? "1 question"
                      : `${period.questionCount} questions`}
                  </Badge>
                }
              />
              <CardBody className="flex flex-col gap-3">
                <p className="text-body-sm leading-relaxed text-body">
                  The four groups of competencies are asked either way. These
                  questions are what you want people to answer in their own
                  words, or mark out of five, on top of them. Add them now —
                  once the period has started the form is fixed, because
                  changing a question people have already answered changes what
                  they answered.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setQuestionsOpen(true)}>
                    Write the questions
                  </Button>
                  <Button
                    variant="accent"
                    size="sm"
                    loading={starting}
                    disabled={period.questionCount === 0}
                    onClick={() => void start()}
                  >
                    <Play aria-hidden="true" className="size-3.5" />
                    Start the period
                  </Button>
                </div>
                {period.questionCount === 0 && (
                  <p className="text-meta text-muted">
                    A form with no questions asks nobody anything, so it cannot
                    be started yet.
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {/* Not a toast. Somebody has to act on these, and a toast is gone in
              six seconds. They stay until the page is left or somebody dismisses
              them. */}
          {noAppraiser && (
            <Callout
              tone="danger"
              title="Some people have nobody appraising them"
            >
              <p>
                {noAppraiser.join(", ")}{" "}
                {noAppraiser.length === 1 ? "has" : "have"} no manager, so
                starting this period gave them no appraiser. They will finish it
                with no mark unless somebody is assigned.
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-3">
                <span>
                  Set a manager on their record, or assign an appraiser.
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setNoAppraiser(null)}
                >
                  Dismiss
                </Button>
              </p>
            </Callout>
          )}

          {noObjectives && (
            <Callout
              tone="warning"
              title="Some people have nothing agreed to be judged on"
            >
              <p>
                {noObjectives.join(", ")}{" "}
                {noObjectives.length === 1 ? "has" : "have"} no agreed objective
                in this period. Delivery against objectives is one of the four
                parts an appraisal is made of, so that part of their mark cannot
                be worked out — it is left out rather than scored zero, and the
                rest of their score carries the difference.
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-3">
                <Link
                  href="/performance/approvals"
                  className="font-medium underline-offset-2 hover:underline"
                >
                  Agree what is waiting
                </Link>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setNoObjectives(null)}
                >
                  Dismiss
                </Button>
              </p>
            </Callout>
          )}

          {/* Not a permission problem and not an outage. Two different sentences,
              because sending somebody to look for the wrong one wastes an
              afternoon. */}
          {!canSeeCompany ? (
            /* An empty state, not a notice on an empty page.
               ------------------------------------------------
               A `Callout` on an otherwise blank screen reads as a warning about
               something that went wrong. Nothing went wrong: this page is a
               company-wide aggregate and this reader is not the audience for
               it. An empty state with an icon and a way onward is what a screen
               that is simply not for you should look like — and it sends them
               to the one that is. */
            <Card>
              <EmptyState
                icon={<Users aria-hidden="true" />}
                title="This page is a company-wide view"
                description="Your own review and objectives are on the performance screen."
                action={
                  <ButtonLink href="/performance" variant="accent" size="sm">
                    Go to your performance
                  </ButtonLink>
                }
              />
            </Card>
          ) : DEMO_ENABLED && !detail.available ? (
            <Callout tone="warning" title="Demo data, this browser only">
              <p>{detail.refusal}</p>
            </Callout>
          ) : null}

          {detail.error && (
            <p className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink">
              {detail.error.message}
            </p>
          )}

          {period && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Stage"
                value={period.stageLabel}
                {...(period.dueDate
                  ? { hint: `Answers due ${dayLabel(period.dueDate)}` }
                  : {})}
              />
              <Stat
                label="Questions"
                value={String(period.questionCount)}
                hint={
                  period.questionCount === 0
                    ? "A form with no questions asks nobody anything"
                    : "Asked across the self and manager forms"
                }
              />
              <Stat
                label="Forms in this period"
                value={String(period.reviewCount)}
                hint="One self-review each, plus one per appraiser"
              />
              <Stat
                label="Scoring weights"
                value={period.scoringFrozen ? "Frozen" : "Live"}
                hint={
                  period.scoringFrozen
                    ? "A later change to the company's weights cannot move these marks"
                    : "This period started before weights were frozen onto a period"
                }
              />
            </div>
          )}

          {detail.loading && (
            <Card>
              <CardBody className="flex items-center gap-2 text-body-sm text-muted">
                <Spinner size="sm" />
                Reading the period
              </CardBody>
            </Card>
          )}

          {detail.available && !detail.loading && (
            <>
              <NobodyAppraising
                cycleId={cycleId}
                exceptions={detail.exceptions}
                onFixed={() => detail.reload()}
              />
              <Outstanding
                rows={outstanding}
                participants={detail.participants}
              />
              <Register
                register={detail.register}
                cycleId={cycleId}
                canAskPeers={running && canSeeCompany}
                canCalibrate={period?.stage === "CALIBRATION" && canManage}
                onAsked={() => detail.reload()}
              />
              <MultiAppraiserReviews participants={detail.participants} />
            </>
          )}
        </div>
      </PageBody>

      {questionsOpen && period && (
        <QuestionsDialog
          cycleId={cycleId}
          periodName={period.name}
          onClose={() => {
            setQuestionsOpen(false);
            detail.reload();
          }}
          onAdd={(body) => periods.addQuestion(cycleId, body).then(() => {})}
          onUpdate={(id, body) =>
            periods.updateQuestion(id, body).then(() => {})
          }
          onRemove={(id) => periods.removeQuestion(id).then(() => {})}
          /* Only on a draft. The API refuses a copy onto a period that has
             started, and the dialog drops the whole offer without this prop
             rather than showing a button that would be refused. */
          {...(period.stage === "DRAFT"
            ? {
                onCopyFrom: (sourceCycleId: string) =>
                  periods.copyQuestions(cycleId, sourceCycleId),
              }
            : {})}
        />
      )}

      {/* One-way, and the confirmation says which way. Every manager's review
          becomes readable by the person it is about the moment this lands. */}
      {publishing && period && (
        <ConfirmDialog
          open
          onClose={() => setPublishing(false)}
          onConfirm={() => void publish()}
          title="Publish the results?"
          confirmLabel="Publish it"
          tone="primary"
          body={`Everybody in ${period.name} will be able to read what their manager wrote about them. This cannot be undone, and anybody with no mark finishes with none.`}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The people something is wrong with, by name, above everything else.
 *
 * `NO_APPRAISER` is a WARNING in a draft and a BLOCKER once the cycle is
 * running, which is the API's decision and the right one: colouring the whole
 * company red before anybody has started teaches people to ignore the colour.
 *
 * An empty list is stated rather than left blank. "Everybody has an appraiser" is
 * a fact worth reading, and a card that simply disappears when the news is good
 * is a card nobody trusts when it comes back.
 *
 * ## One line per problem, not one line per person
 *
 * A company where nobody has been mapped yet can have thirty people sharing
 * the exact same `NO_APPRAISER` sentence, and thirty near-identical lines is
 * not thirty facts — it is one fact said thirty times. `groupExceptionsByCode`
 * collapses a repeated one to a count with a **Review and fix** button; a
 * genuinely different problem, or a lone occurrence of this one, still gets
 * its own full sentence. See its own header on `lib/api/performance.ts`.
 */
function NobodyAppraising({
  cycleId,
  exceptions,
  onFixed,
}: {
  cycleId: string;
  exceptions: ApiAppraiserMap | null;
  onFixed: () => void;
}) {
  const [reviewing, setReviewing] = useState<{
    code: string;
    severity: "BLOCKER" | "WARNING";
  } | null>(null);
  const [assigning, setAssigning] = useState<ApiAppraiserMapRow | null>(null);

  if (!exceptions) return null;

  const rows = exceptions.rows.filter((row) => row.exceptions.length > 0);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader title="Who is appraising whom" />
        <CardBody className="flex items-center gap-2 text-body-sm text-body">
          <CheckCheck aria-hidden="true" className="size-4 text-success-text" />
          All {exceptions.counts.people} people have somebody appraising them,
          and every set of weights makes a whole mark.
        </CardBody>
      </Card>
    );
  }

  const byRow = new Map(rows.map((row) => [row.employeeId, row]));
  const flat = rows.flatMap((row) =>
    row.exceptions.map((issue) => ({
      key: `${row.employeeId}-${issue.code}`,
      employeeId: row.employeeId,
      ...issue,
    })),
  );
  const blockerCount = flat.filter(
    (issue) => issue.severity === "BLOCKER",
  ).length;
  const warningCount = flat.length - blockerCount;

  return (
    <Card>
      <CardHeader
        title="Who is appraising whom"
        description={
          exceptions.counts.unassigned > 0
            ? "Somebody with no appraiser finishes this period with no mark. Set a manager on their record, or assign an appraiser."
            : "What is wrong with the mapping, by name."
        }
        action={
          <Badge
            tone={blockerCount > 0 ? "danger" : "warning"}
            size="sm"
            icon={<UserX aria-hidden="true" />}
          >
            {blockerCount > 0
              ? `${blockerCount} ${blockerCount === 1 ? "blocker" : "blockers"}`
              : `${warningCount} to look at`}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-2">
        {groupExceptionsByCode(flat).map((group) => {
          const tone =
            group.severity === "BLOCKER"
              ? "border-danger-line bg-danger-soft"
              : "border-warning-line bg-warning-soft";

          if (group.items.length === 1) {
            const issue = group.items[0]!;
            return (
              <p
                key={issue.key}
                className={cn(
                  "rounded-md border px-3.5 py-2.5 text-body-sm text-ink",
                  tone,
                )}
              >
                {issue.message}
              </p>
            );
          }

          return (
            <div
              key={group.code}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-body-sm text-ink",
                tone,
              )}
            >
              <span>
                {EXCEPTION_CODE_SUMMARY[
                  group.code as keyof typeof EXCEPTION_CODE_SUMMARY
                ](group.items.length)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setReviewing({ code: group.code, severity: group.severity })
                }
              >
                Review and fix
              </Button>
            </div>
          );
        })}
      </CardBody>

      {reviewing && (
        <ReviewGroupModal
          title={EXCEPTION_CODE_SUMMARY[
            reviewing.code as keyof typeof EXCEPTION_CODE_SUMMARY
          ](
            flat.filter(
              (issue) =>
                issue.code === reviewing.code &&
                issue.severity === reviewing.severity,
            ).length,
          )}
          people={flat
            .filter(
              (issue) =>
                issue.code === reviewing.code &&
                issue.severity === reviewing.severity,
            )
            .map((issue) => byRow.get(issue.employeeId))
            .filter((row): row is ApiAppraiserMapRow => row !== undefined)}
          onClose={() => setReviewing(null)}
          onAssign={(row) => setAssigning(row)}
        />
      )}

      {assigning && (
        <AppraisersDialog
          cycleId={cycleId}
          row={assigning}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null);
            setReviewing(null);
            onFixed();
          }}
        />
      )}
    </Card>
  );
}

/**
 * Everybody caught by one collapsed exception group, named — the detail a
 * summary line deliberately does not carry. "Assign" opens the exact same
 * dialog `appraiser-map.tsx`'s own table uses, so there is one appraiser
 * editor in the product, not a second one built for this modal.
 */
function ReviewGroupModal({
  title,
  people,
  onClose,
  onAssign,
}: {
  title: string;
  people: ApiAppraiserMapRow[];
  onClose: () => void;
  onAssign: (row: ApiAppraiserMapRow) => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="lg"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
        {people.map((row) => (
          <li
            key={row.employeeId}
            className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5"
          >
            <span className="min-w-0">
              <span className="block text-body-sm font-medium text-ink">
                {row.employeeName}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-2 text-meta text-muted">
                <span>{row.jobTitle}</span>
                {row.departmentName && <span>{row.departmentName}</span>}
              </span>
            </span>
            <Button variant="secondary" size="sm" onClick={() => onAssign(row)}>
              {row.appraisers.length === 0 ? "Assign" : "Change"}
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/**
 * Who has not sent a form yet, by name and by what is missing.
 *
 * The counts come from the API and the rows are derived from the same payload, so
 * "12 of 18 self-reviews in" and the list underneath it cannot disagree.
 */
function Outstanding({
  rows,
  participants,
}: {
  rows: {
    employeeId: string;
    employeeName: string;
    what: string;
    reviewId: string;
  }[];
  participants: ApiCycleParticipants | null;
}) {
  if (!participants) return null;
  const { counts } = participants;

  return (
    <Card>
      <CardHeader
        title="Still to come in"
        description="A form somebody has not got round to. Different from nobody being asked at all, which is above."
      />
      <CardBody className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Self-reviews in"
            value={`${counts.selfDone} of ${counts.people}`}
          />
          <Stat
            label="Manager reviews in"
            value={`${counts.managerDone} of ${counts.people}`}
          />
          <Stat label="Forms outstanding" value={String(rows.length)} />
        </div>

        {rows.length === 0 ? (
          <p className="flex items-center gap-2 text-body-sm text-body">
            <CheckCheck
              aria-hidden="true"
              className="size-4 text-success-text"
            />
            Everything asked for has come in.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={`${row.employeeId}-${row.reviewId}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"
              >
                <span className="text-body-sm text-ink">{row.what}</span>
                <Link
                  href={`/performance/reviews/${row.reviewId}`}
                  className="text-body-sm font-medium text-accent-text underline-offset-2 hover:underline"
                >
                  Open it
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Every manager review, for anybody more than one manager appraises.
 *
 * `Register` below is right to show one row per person — finalisation is what
 * picks a single mark of record out of several manager reviews, and the sign-off
 * column follows whichever review that pick lands on. But before anybody has
 * finalised anything, that pick is provisional, and it is only ever one of the
 * reviews: a second appraiser's already-written form has nowhere else in this
 * screen to be opened, read or finalised from. This card is that place, for
 * every person more than one manager review exists for — nothing here duplicates
 * `Register`'s job of naming the mark of record; it exists so every appraiser's
 * review, not just the one currently picked, has a link somewhere.
 *
 * Renders nothing for a company running one manager per person, which is the
 * default and the common case: every `managers` array below is length 1 or 0,
 * so the filter below empties the card away rather than showing a table that
 * repeats `Register`.
 */
function MultiAppraiserReviews({
  participants,
}: {
  participants: ApiCycleParticipants | null;
}) {
  if (!participants) return null;
  const rows = participants.rows.filter((row) => row.managers.length > 1);
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Manager reviews, by appraiser"
        description="More than one manager appraises some of these people. Every one of their reviews is listed here, not only the one picked as the mark of record."
      />
      <CardBody className="flex flex-col gap-2">
        {rows.flatMap((row) =>
          row.managers.map((manager) => (
            <div
              key={manager.reviewId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"
            >
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-ink">
                  {manager.managerName} on {row.employeeName}
                </p>
                <p className="mt-1 text-meta text-muted">
                  {manager.finalised
                    ? "Final"
                    : manager.submitted
                      ? "Written, not final"
                      : "Not written yet"}
                  {manager.rating !== null
                    ? ` · ${manager.rating} out of 5`
                    : ""}
                </p>
              </div>
              <Link
                href={`/performance/reviews/${manager.reviewId}`}
                className="text-body-sm font-medium text-accent-text underline-offset-2 hover:underline"
              >
                {manager.finalised
                  ? "Open"
                  : manager.submitted
                    ? "Finalise"
                    : "Open"}
              </Link>
            </div>
          )),
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Where every mark stands.
 *
 * One row per person, and the score column is the place absent-versus-zero shows
 * up most often: a person with nothing recorded gets "No mark", never 0%. The
 * sign-off column carries three separate facts and reads whichever applies, in
 * order of what somebody has to do about it.
 */
function Register({
  register,
  cycleId,
  canAskPeers,
  canCalibrate,
  onAsked,
}: {
  register: ApiScoreRegister | null;
  cycleId: string;
  /** Running, and the reader is HR or somebody's manager — the API's own rule. */
  canAskPeers: boolean;
  /**
   * The period is at CALIBRATION and the reader may change settings.
   *
   * The whole column is absent otherwise. Calibration is what the stage *is*
   * for, and offering it during self-review would be adjusting a mark nobody
   * has finished writing.
   */
  canCalibrate: boolean;
  onAsked: () => void;
}) {
  if (!register) return null;

  if (register.rows.length === 0) {
    return (
      <Card>
        <CardHeader title="Where the marks stand" />
        <EmptyState
          compact
          icon={<UserX aria-hidden="true" />}
          title="Nobody is in this period"
          description="Starting a period creates a form for every employee who is not archived or exited."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Where the marks stand"
        description={
          register.weightsFrom === "snapshot"
            ? `Weighted with the set frozen onto this period, totalling ${weightLabel(register.weightsTotalBp)}.`
            : `Weighted with the company's current set, totalling ${weightLabel(register.weightsTotalBp)}. This period has no frozen weights, so a change to them would move these marks.`
        }
        action={
          <span className="flex flex-wrap gap-2">
            {register.counts.unscored > 0 && (
              <Badge tone="danger" size="sm">
                {register.counts.unscored} unscored
              </Badge>
            )}
            {register.counts.awaitingAcknowledgement > 0 && (
              <Badge tone="warning" size="sm">
                {register.counts.awaitingAcknowledgement} unanswered
              </Badge>
            )}
            {register.counts.disputed > 0 && (
              <Badge tone="danger" size="sm">
                {register.counts.disputed} disputed
              </Badge>
            )}
          </span>
        }
      />
      <CardBody className="p-0">
        <TableWrap caption="Everybody in this period, their score and their sign-off">
          <THead>
            <TH>Person</TH>
            <TH>Objectives agreed</TH>
            <TH align="right">Score</TH>
            <TH>Sign-off</TH>
            {canAskPeers && <TH>Feedback</TH>}
            {canCalibrate && <TH>Calibration</TH>}
          </THead>
          <TBody>
            {register.rows.map((row) => (
              <RegisterRow
                key={row.employeeId}
                row={row}
                cycleId={cycleId}
                canAskPeers={canAskPeers}
                canCalibrate={canCalibrate}
                onAsked={onAsked}
              />
            ))}
          </TBody>
        </TableWrap>
      </CardBody>
    </Card>
  );
}

function RegisterRow({
  row,
  cycleId,
  canAskPeers,
  canCalibrate,
  onAsked,
}: {
  row: ApiScoreRow;
  cycleId: string;
  canAskPeers: boolean;
  /** The period is at CALIBRATION and the reader may change settings. */
  canCalibrate: boolean;
  onAsked: () => void;
}) {
  return (
    <TR>
      <TD>
        {/* The name is the link to their trend across periods. One mark is a
            snapshot; the argument about a rating is almost always about whether
            it moved. */}
        <Link
          href={`/performance/history/${row.employeeId}`}
          className="font-medium text-ink underline-offset-2 hover:text-accent-text hover:underline"
        >
          {row.employeeName}
        </Link>
        <span className="mt-0.5 block text-meta text-muted">
          {row.jobTitle}
          {row.departmentName ? ` · ${row.departmentName}` : ""}
        </span>
      </TD>
      <TD>
        <span className="tabular">{row.objectives.agreed}</span>
        {row.objectives.awaitingApproval > 0 && (
          <span className="mt-0.5 block text-meta text-muted">
            {row.objectives.awaitingApproval} waiting to be agreed
          </span>
        )}
      </TD>
      <TD align="right">
        {/* Absent is absent. Nothing recorded is not a mark of nought. */}
        {row.scoreBp === null ? (
          <span className="text-muted">No mark</span>
        ) : (
          <>
            <span className="tabular font-medium text-ink">
              {scoreLabel(row.scoreBp)}
            </span>
            {/* A moved mark never stands on its own. The computed figure is
                what the answers produced and it survives beside the decision,
                because "why is this person's mark different" is the question
                the calibration row exists to answer. Checked for the object,
                never for a falsy figure — a mark moved to nothing is still a
                calibration. */}
            {row.calibration && (
              <span
                className="mt-0.5 block text-meta text-muted"
                title={row.calibration.reason}
              >
                Moved from {scoreLabel(row.calibration.originalBp)}
              </span>
            )}
          </>
        )}
      </TD>
      <TD>
        <SignOffCell row={row} />
      </TD>
      {/* The 360 half, which had no door at all until now: the endpoint was
          written, guarded and tested, and the product could render peer
          answers it had no way of asking for. */}
      {canAskPeers && (
        <TD>
          <AskPeersButton
            cycleId={cycleId}
            subjectId={row.employeeId}
            subjectName={row.employeeName}
            onAsked={onAsked}
          />
        </TD>
      )}
      {/* Only at the calibration stage, and only for somebody who has a mark.
          Moving a figure that does not exist yet is not calibration, it is
          inventing one — and the whole column is absent before the stage
          because a mark still being written is not one anybody should be
          adjusting. */}
      {canCalibrate && (
        <TD>
          {row.scoreBp === null ? (
            <span className="text-meta text-muted">No mark yet</span>
          ) : (
            <CalibrateButton
              cycleId={cycleId}
              row={row}
              onChanged={onAsked}
            />
          )}
        </TD>
      )}
    </TR>
  );
}

/**
 * The sign-off state, in one phrase, ordered by what has to happen next.
 *
 * Disputed first because it is the only one that obliges somebody else to act.
 * Then unanswered, which is the exposure acknowledgement exists to close —
 * silence is not acceptance and this cell must never read as though it were.
 */
function SignOffCell({ row }: { row: ApiScoreRow }) {
  const signOff = row.signOff;

  if (signOff.disputed) {
    return (
      <Badge tone="danger" size="sm" dot>
        Disputed
      </Badge>
    );
  }
  if (signOff.acknowledged) {
    return (
      <Badge tone="success" size="sm" dot>
        Acknowledged
      </Badge>
    );
  }
  if (signOff.finalised) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Badge tone="warning" size="sm" dot>
          Not answered yet
        </Badge>
        {signOff.reviewId && (
          <Link
            href={`/performance/reviews/${signOff.reviewId}`}
            className="text-meta font-medium text-accent-text underline-offset-2 hover:underline"
          >
            Open
          </Link>
        )}
      </span>
    );
  }
  if (signOff.submitted) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Badge tone="info" size="sm" dot>
          Written, not final
        </Badge>
        {signOff.reviewId && (
          <Link
            href={`/performance/reviews/${signOff.reviewId}`}
            className="text-meta font-medium text-accent-text underline-offset-2 hover:underline"
          >
            Finalise
          </Link>
        )}
      </span>
    );
  }
  /* No review at all is a different fact from an unwritten one, and it is the
     appraiser-map exception above rather than a state of this cell. */
  return (
    <span className="text-body-sm text-muted">
      {signOff.reviewId === null ? "No manager review" : "Not written yet"}
    </span>
  );
}

/**
 * Moving one person's mark, and putting it back.
 *
 * ## A row, not an edit
 *
 * The same shape as a payroll exclusion, deliberately: a figure, a reason, a
 * person, a date. The computed mark is never overwritten — `row.computedBp`
 * still reads what the answers produced and `row.scoreBp` reads what the
 * company decided — because the question this has to answer a year later is
 * *"why is this person's mark different"*, and an edit in place cannot answer
 * it.
 *
 * ## The reason is required, and that is the feature
 *
 * The API's floor is ten characters and this says so before the refusal rather
 * than after it. A mark that moved with no account of why is the single most
 * common way an appraisal becomes indefensible — the same argument that puts a
 * required reason on reopening an agreed objective.
 *
 * ## Percent in, basis points out
 *
 * People think in percentages and the API stores basis points, so the field
 * takes a percentage and converts once, here. Whole percentages only: a mark
 * calibrated to 73.5% invites an argument about the half that no moderation
 * meeting has ever actually had.
 */
function CalibrateButton({
  cycleId,
  row,
  onChanged,
}: {
  cycleId: string;
  row: ApiScoreRow;
  onChanged: () => void;
}) {
  const periods = useCycleMutations();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const existing = row.calibration;

  const start = () => {
    /* Seeded with what is on screen, so somebody nudging a mark by two points
       does not retype it. The reason is deliberately NOT seeded from the old
       one — a new decision needs a new account of itself. */
    setPercent(
      String(Math.round((existing?.calibratedBp ?? row.scoreBp ?? 0) / 100)),
    );
    setReason("");
    setFailed(null);
    setOpen(true);
  };

  const save = async () => {
    const value = Number(percent);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setFailed("Give a whole percentage between 0 and 100.");
      return;
    }
    if (reason.trim().length < 10) {
      setFailed("Say why in a few more words — this is the record of it.");
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await periods.calibrate(cycleId, row.employeeId, {
        calibratedBp: value * 100,
        reason: reason.trim(),
      });
      toast.push({
        title: `${row.employeeName}'s mark is now ${String(value)}%`,
        tone: "success",
        detail: "What the answers produced is kept beside it.",
      });
      setOpen(false);
      onChanged();
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "Could not move that mark.",
      );
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await periods.clearCalibration(cycleId, row.employeeId);
      toast.push({
        title: `${row.employeeName}'s mark is back to what the answers produced`,
        tone: "success",
      });
      setOpen(false);
      onChanged();
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "Could not put that mark back.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={start}>
        {existing ? "Change it" : "Move the mark"}
      </Button>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={`Move ${row.employeeName}'s mark`}
          description={`The answers produced ${scoreLabel(row.computedBp ?? row.scoreBp ?? 0)}.`}
          size="sm"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Only offered where there is something to undo, and away from
                  the save button — it is the destructive half. */}
              {existing ? (
                <Button variant="ghost" disabled={busy} onClick={() => void clear()}>
                  Put it back
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="accent"
                  loading={busy}
                  onClick={() => void save()}
                >
                  Save the change
                </Button>
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            {existing && (
              <Callout tone="neutral" title="It has already been moved">
                Now {scoreLabel(existing.calibratedBp)}, from{" "}
                {scoreLabel(existing.originalBp)}
                {existing.calibratedByName
                  ? `, by ${existing.calibratedByName}`
                  : ""}
                . The reason given was &ldquo;{existing.reason}&rdquo;.
              </Callout>
            )}

            <Field
              label="Mark it as"
              required
              {...(failed ? { error: failed } : {})}
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  className="w-28"
                  value={percent}
                  disabled={busy}
                  onChange={(event) => setPercent(event.target.value)}
                />
                <span className="text-body-sm text-muted">%</span>
              </div>
            </Field>

            <Field
              label="Why"
              required
              help="This is kept with the mark and is what explains it if anybody asks later."
            >
              <Textarea
                rows={3}
                value={reason}
                disabled={busy}
                placeholder="Moderated at the calibration meeting — the team's targets were set higher than the rest of the department."
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>

            <p className="text-meta text-muted">
              What the answers produced is kept beside this, not replaced.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
