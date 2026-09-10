"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCheck,
  ListChecks,
  Lock,
  Play,
  Trash2,
  UserX,
  Users,
  Wand2,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Callout,
  Checkbox,
  ConfirmDialog,
  Disclosure,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
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
import { NOTICE_LINK, NoticeLine } from "@/components/portal/notice-line";
import { cn } from "@/lib/cn";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  EXCEPTION_CODE_SUMMARY,
  dayLabel,
  groupExceptionsByCode,
  ratingWordsFrom,
  scoreLabel,
  weightLabel,
  type ApiAppraiserMap,
  type ApiComponentScore,
  type ReviewCycleStage,
  type ApiAppraiserMapRow,
  type ApiCycle,
  type ApiCycleParticipants,
  type ApiRevisionRequest,
  type ApiScoreRegister,
  type ApiScoreRow,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import {
  outstandingIn,
  useAppraiserMutations,
  useCycleMutations,
  useCycleRegister,
  useRatingScale,
} from "@/lib/store/performance";
import { periodWords } from "../../review-parts";
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
  const router = useRouter();
  const canSeeCompany = useCan("EDIT_RECORDS");
  const canManage = useCan("MANAGE_SETTINGS");
  const detail = useCycleRegister(cycleId, canSeeCompany);
  const periods = useCycleMutations();
  const toast = useToast();

  const [chasing, setChasing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmingStart, setConfirmingStart] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  /* Named lists, not counts, and they survive the toast. Both are somebody who
     finishes the period short, and the fixes are different. */
  const [noAppraiser, setNoAppraiser] = useState<string[] | null>(null);
  const [noObjectives, setNoObjectives] = useState<string[] | null>(null);

  /**
   * The last exceptions map that actually loaded, kept across a background
   * `detail.reload()`.
   *
   * `useCycleRegister` nulls its data the instant `reload()` is called and only
   * repopulates it once the refetch resolves — a "flash blank, then pop back"
   * shape that is harmless for the stat grid below, but not for
   * `NobodyAppraising`: assigning one person inside its "N people have no
   * appraiser" list calls this same `reload()` to pick up the change, which
   * would otherwise unmount that list (wiping which group it had open) on
   * every single save. Twenty-seven people meant twenty-seven trips back
   * through "Review and fix" for one click each. This is fed to it instead of
   * `detail.exceptions` directly, so it keeps rendering the same list, now
   * one person shorter, straight through the reload. */
  const [stableExceptions, setStableExceptions] =
    useState<ApiAppraiserMap | null>(null);
  /* Adjusted during render, not an effect — the "you might not need an
     effect" pattern for remembering the latest non-null value of a prop.
     An effect would apply this a frame late, which is exactly the flash this
     exists to avoid. */
  if (detail.exceptions && detail.exceptions !== stableExceptions) {
    setStableExceptions(detail.exceptions);
  }

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
      setConfirmingStart(false);
    }
  };

  /**
   * Delete the draft outright. Only ever offered on a draft — a running or
   * published period is a record of what people were asked, and the API
   * refuses it for exactly that reason if this is somehow reached anyway.
   */
  const deleteCycle = async () => {
    if (!period) return;
    setDeleting(true);
    try {
      await periods.deleteCycle(cycleId);
      toast.push({
        title: `${period.name} deleted`,
        tone: "success",
        detail: "Nothing was ever sent, so there is nothing to undo.",
      });
      router.push("/performance/periods");
    } catch (error) {
      failed(error);
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
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
          { href: "/performance", label: "Performance" },
          { href: "/performance/periods", label: "Appraisal periods" },
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
              {/* Who this period covers. The scope was write-only: set once in
                  the start-a-period dialog, sent to the API, and shown on no
                  screen afterwards — so "who is in this appraisal" had no
                  answer anywhere in the product, which is the restriction the
                  feedback could not find. Empty means everybody, which is the
                  default and the commonest case, and saying so beats a blank. */}
              <Badge tone="neutral" size="sm">
                {period.departmentIds.length === 0
                  ? "Everybody"
                  : `${period.departmentIds.length} ${period.departmentIds.length === 1 ? "department" : "departments"}`}
              </Badge>
              {/* What the period covers, which used to be inferable only from
                  its name. Absent rather than "no period set": a badge saying
                  a field is empty is noise on every period written before the
                  field existed, and nothing was back-filled. */}
              {periodWords(period.periodStart, period.periodEnd) && (
                <Badge tone="neutral" size="sm">
                  {periodWords(period.periodStart, period.periodEnd)}
                </Badge>
              )}
              {period.managersCanAddQuestions && (
                /* The manager question-writing flow exists, is guarded and is
                   tested, and the feedback could not find it — it lives on the
                   Overview tab behind this flag. Saying the flag is on is what
                   makes the button somebody is looking for findable. */
                <Badge tone="neutral" size="sm">
                  Managers may add questions
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
            {/* The nine-box is the calibration read: performance against
                potential, with everybody it cannot place named. Linked from
                here for the same reason the report is — a screen nobody can
                find is a screen nobody has, and this module has already lost
                the assistant and the tax override that way. */}
            {canSeeCompany && !draft && (
              <ButtonLink
                size="sm"
                variant="secondary"
                href={`/performance/periods/${cycleId}/nine-box`}
              >
                Nine-box
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
            {/* Draft only — a running or published period is a record of what
                people were asked, and the API refuses deleting one anyway.
                Quiet on purpose: this is the one destructive control on the
                page and it must not compete with Start the period for
                attention. */}
            {canManage && draft && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
                Delete this period
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
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setQuestionsOpen(true)}>
                    Write the questions
                  </Button>
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={period.questionCount === 0}
                    onClick={() => setConfirmingStart(true)}
                  >
                    <Play aria-hidden="true" className="size-3.5" />
                    {/* The control says why it is dead, rather than leaving a
                        grey button under copy that implies the competency
                        groups alone are enough. Same shape the importer uses
                        when its own primary action is blocked. */}
                    {period.questionCount === 0
                      ? "Add a question first"
                      : "Start the period"}
                  </Button>
                </div>
                <ManagerQuestionsToggle
                  cycleId={period.id}
                  value={period.managersCanAddQuestions}
                  onChanged={() => detail.reload()}
                />
                <PeriodFramingEditor
                  period={period}
                  onChanged={() => detail.reload()}
                />
              </CardBody>
            </Card>
          )}

          {/* A line each. These were two tinted panels, each with a heading, a
              paragraph explaining the consequence, an action and a Dismiss —
              stacked, immediately after pressing Start, on the screen that
              fixes both. The names are what somebody needs; the essay about
              how a missing part is carried by the rest of the score belongs
              where the score is explained, not over the top of a list of
              people. See `NoticeLine`.

              `withoutAppraiser` is a list of names and not rows (see
              `activateCycle`), so this cannot open the dialog on one person
              directly. Scrolling to the card that can is the honest
              affordance rather than a control that guesses. */}
          {noAppraiser && (
            <NoticeLine tone="danger">
              <span>
                {noAppraiser.length === 1
                  ? `${noAppraiser[0]} has no appraiser`
                  : `${noAppraiser.length} people have no appraiser: ${noAppraiser.join(", ")}`}
              </span>
              <button
                type="button"
                className={NOTICE_LINK}
                onClick={() => {
                  document
                    .getElementById(APPRAISER_EXCEPTIONS_ANCHOR)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Assign appraisers
              </button>
            </NoticeLine>
          )}

          {noObjectives && (
            <NoticeLine tone="warning">
              <span>
                {noObjectives.length === 1
                  ? `${noObjectives[0]} has no agreed objective`
                  : `${noObjectives.length} people have no agreed objective: ${noObjectives.join(", ")}`}
              </span>
              <Link href="/performance/approvals" className={NOTICE_LINK}>
                Agree what is waiting
              </Link>
            </NoticeLine>
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

          {/* `LoadFailure`, not `error.message`.
              -------------------------------------
              This rendered the server's string raw, and the string is not
              always a sentence about a refusal. A route the deployed API does
              not have comes back from the API's own not-found handler as
              `GET /api/v1/performance/cycles/<uuid>/revision-requests could
              not be found.` — a method and a path, on screen, to an HR
              manager. `LoadFailure` supplies its own sentence for a 404 and
              shows the API's only where the API wrote one about the refusal
              itself. See the note at the top of that component. */}
          {detail.error && (
            <LoadFailure
              subject="this appraisal period"
              error={detail.error}
              onRetry={detail.reload}
            />
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
                    : /* Two different reasons weights are still live, and only
                         one of them was being stated. Starting a period is what
                         freezes them, so EVERY period that has not started yet
                         is "Live" — and it was being told it "started before
                         weights were frozen", two lines under a badge reading
                         `not started`. The legacy case is real but rare; the
                         not-started case is every new period there is, and the
                         useful thing to say about it is that a change now
                         still lands. */
                      period.stage === "DRAFT"
                      ? "Whatever they are when this period starts is what it keeps"
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

          {/* Fed the stable snapshot, not `detail.exceptions` — see its own
              comment above. Gated on the snapshot rather than on
              `detail.available && !detail.loading` so this survives the very
              reload its own "Assign" button triggers. */}
          {stableExceptions && (
            <NobodyAppraising
              cycleId={cycleId}
              exceptions={stableExceptions}
              draft={draft}
              onFixed={() => detail.reload()}
            />
          )}

          {detail.available && !detail.loading && (
            <>
              <Outstanding
                rows={outstanding}
                participants={detail.participants}
              />
              <Register
                register={detail.register}
                cycleId={cycleId}
                canAskPeers={running && canSeeCompany}
                canCalibrate={period?.stage === "CALIBRATION" && canManage}
                canRequestRevision={running && canManage}
                revisionRequests={detail.revisionRequests}
                revisionsUnavailable={detail.revisionsUnavailable}
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
          /* Every stage but published. The API refuses a rearrangement once
             the form is a record, so the dialog drops the handles entirely
             there rather than offering a drag that would be undone. */
          {...(period.stage !== "PUBLISHED"
            ? {
                onReorder: (ids: string[]) =>
                  periods.reorderQuestions(cycleId, ids).then(() => {}),
              }
            : {})}
          /* Only on a draft. The API refuses a copy onto a period that has
             started, and the dialog drops the whole offer without this prop
             rather than showing a button that would be refused. */
          {...(period.stage === "DRAFT"
            ? {
                onCopyFrom: (sourceCycleId: string) =>
                  periods.copyQuestions(cycleId, sourceCycleId),
              }
            : {})}
          /* Same gate as `onCopyFrom`, same reason: the API refuses this
             once the cycle has started. */
          {...(period.stage === "DRAFT"
            ? {
                onAddStandard: () =>
                  periods.addStandardQuestions(cycleId).then(() => {}),
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

      {/* Moved here from the card's own description: the moment somebody is
          about to press it is when "the form is fixed after this" actually
          matters, not on page load before they have looked at anything. */}
      {confirmingStart && period && (
        <ConfirmDialog
          open
          onClose={() => setConfirmingStart(false)}
          onConfirm={() => void start()}
          loading={starting}
          title="Start the period?"
          confirmLabel="Start it"
          tone="primary"
          body="Everybody gets their form today, and the questions are fixed the moment it starts — add any more first."
        />
      )}

      {confirmingDelete && period && (
        <ConfirmDialog
          open
          onClose={() => setConfirmingDelete(false)}
          onConfirm={() => void deleteCycle()}
          loading={deleting}
          title="Delete this period?"
          confirmLabel="Delete it"
          tone="danger"
          body={`Nothing has been sent for ${period.name}, so nothing is lost by deleting it — the questions go with it, and this cannot be undone.`}
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
/**
 * The anchor the activation callout scrolls to.
 *
 * One constant rather than a string in two files, because a mistyped id here is
 * a button that silently does nothing — the exact failure the rule about
 * resolvable errors exists to prevent, wearing a fix.
 */
const APPRAISER_EXCEPTIONS_ANCHOR = "appraiser-exceptions";

function NobodyAppraising({
  cycleId,
  exceptions,
  draft,
  onFixed,
}: {
  cycleId: string;
  exceptions: ApiAppraiserMap | null;
  /** Before the period starts, when starting it is itself the fix. */
  draft: boolean;
  onFixed: () => void;
}) {
  const appraisers = useAppraiserMutations();
  const toast = useToast();
  const [filling, setFilling] = useState(false);

  /**
   * The same act `activateCycle` performs, on its own button.
   *
   * A second control for one mutation is usually how two screens come to
   * disagree, and it is safe here for a reason worth stating: `auto` is
   * **idempotent and only ever fills blanks** — `autoAssignFromReportingLine`
   * skips anybody already mapped — so pressing it twice, or pressing it and
   * then starting the period, cannot double-assign or overwrite a mapping
   * somebody built by hand. That is not true of the payment batch this
   * codebase refuses to give two doors.
   *
   * It exists because the alternative was navigating away from the screen that
   * raised the problem to find the button that answers it.
   */
  const fillFromReportingLine = async () => {
    setFilling(true);
    try {
      const result = await appraisers.autoAssign(cycleId);
      toast.push({
        title:
          result.created === 0
            ? "Everybody already has an appraiser"
            : result.created === 1
              ? "1 person given their line manager"
              : `${result.created} people given their line manager`,
        tone: "success",
        /* Named, not counted. These are the people who would otherwise finish
           the period with no mark at all, and a number tells nobody who to go
           and look at. */
        ...(result.withoutManager.length > 0
          ? {
              detail: `Still nobody appraising: ${result.withoutManager.join(", ")}. They have no manager either, so assign somebody by hand.`,
            }
          : {}),
      });
      onFixed();
    } catch (caught) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setFilling(false);
    }
  };

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
    <Card id={APPRAISER_EXCEPTIONS_ANCHOR}>
      <CardHeader
        title="Who is appraising whom"
        description={
          exceptions.counts.unassigned === 0
            ? "What is wrong with the mapping, by name."
            : draft
              ? /* The sentence this replaced said only "set a manager on their
                   record, or assign an appraiser" — true, and it invited
                   somebody to do by hand what starting the period does for
                   everybody at once. On a draft that is a hundred clicks
                   offered in place of one, and it was reported as exactly
                   that. */
                "Starting the period gives everybody their line manager automatically — nobody here needs assigning by hand first. Do it now with the button below if you would rather see the mapping before you start, and assign anybody the reporting line cannot cover."
              : "Somebody with no appraiser finishes this period with no mark. Set a manager on their record, or assign an appraiser."
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
        {exceptions.counts.unassigned > 0 && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              loading={filling}
              disabled={filling}
              onClick={() => void fillFromReportingLine()}
            >
              <Wand2 aria-hidden="true" className="size-4" />
              Fill in from the reporting line
            </Button>
          </div>
        )}
        {groupExceptionsByCode(flat).map((group) => {
          const tone =
            group.severity === "BLOCKER"
              ? "border-danger-line bg-danger-soft"
              : "border-warning-line bg-warning-soft";

          /* One person, and the fix is the same fix.
             ------------------------------------------
             This branch used to render the message as a bare paragraph with no
             button, while the branch below — the identical problem affecting
             two or more people — got "Review and fix" and the assign dialog.
             So a period with one person missing an appraiser was the *only*
             shape of that problem with no way to resolve it, which is precisely
             backwards: one is the easy case.

             `byRow` already holds the row the dialog needs. */
          if (group.items.length === 1) {
            const issue = group.items[0]!;
            const row = byRow.get(issue.employeeId);
            return (
              <div
                key={issue.key}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-body-sm text-ink",
                  tone,
                )}
              >
                <span>{issue.message}</span>
                {row && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAssigning(row)}
                  >
                    {row.appraisers.length === 0 ? "Assign" : "Change"}
                  </Button>
                )}
              </div>
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
            /* `reviewing` stays open on purpose. This dialog is most often
               reached from inside the "N people have no appraiser yet" list,
               and closing that list after every single save turned a
               twenty-seven-person backlog into twenty-seven trips back
               through "Review and fix". `onFixed` reloads the period, which
               reloads `exceptions`, which the modal's own `people` list is
               filtered from below — the person just assigned drops out of it
               on its own. The list closes itself once nothing is left in it
               (the `rows.length === 0` branch above returns before reaching
               this JSX at all), or whenever the reader clicks "Done". */
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
        {/* A period nobody is in yet has no ratio to state. "0 of 0" reads as
            a measurement, and the tick below it read as a period that had gone
            perfectly — over a set nobody had been added to. Same rule
            `period-status.tsx` states beside its own `notYet`. */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Self-reviews in"
            value={
              counts.people === 0
                ? "Nobody has a form yet"
                : `${counts.selfDone} of ${counts.people}`
            }
          />
          <Stat
            label="Manager reviews in"
            value={
              counts.people === 0
                ? "No manager review is due yet"
                : `${counts.managerDone} of ${counts.people}`
            }
          />
          <Stat label="Forms outstanding" value={String(rows.length)} />
        </div>

        {counts.people === 0 ? (
          <p className="text-body-sm text-muted">
            Nobody is in this period yet, so nothing has been asked for.
          </p>
        ) : rows.length === 0 ? (
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
  /* Before the early returns: a hook cannot run conditionally. */
  const { scale } = useRatingScale();
  const ratingWords = ratingWordsFrom(scale.levels);

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
                    ? ` · ${ratingWords(manager.rating)}`
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
  canRequestRevision,
  revisionRequests,
  revisionsUnavailable,
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
  /** The period is running (not DRAFT, not PUBLISHED) and the reader may change settings. */
  canRequestRevision: boolean;
  /** Everybody currently sent back for another pass, across the whole cycle. */
  revisionRequests: ApiRevisionRequest[];
  revisionsUnavailable: boolean;
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
            ? `Scored on the weights locked in when this period started, totalling ${weightLabel(register.weightsTotalBp)}. Changing the company's weights later will not move these marks.`
            : `Scored on the company's weights as they stand today, totalling ${weightLabel(register.weightsTotalBp)}. This period never locked in its own copy, so changing the company's weights would recalculate every mark here, including ones already given.`
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
            {canRequestRevision && !revisionsUnavailable && <TH>Revision</TH>}
          </THead>
          <TBody>
            {register.rows.map((row) => (
              <RegisterRow
                key={row.employeeId}
                row={row}
                cycleId={cycleId}
                canAskPeers={canAskPeers}
                canCalibrate={canCalibrate}
                canRequestRevision={canRequestRevision && !revisionsUnavailable}
                existingRevision={revisionRequests.find(
                  (request) => request.employeeId === row.employeeId,
                )}
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
  canRequestRevision,
  existingRevision,
  onAsked,
}: {
  row: ApiScoreRow;
  cycleId: string;
  canAskPeers: boolean;
  /** The period is at CALIBRATION and the reader may change settings. */
  canCalibrate: boolean;
  /** The period is running and the reader may change settings. */
  canRequestRevision: boolean;
  /** This person's open revision request, or none. */
  existingRevision: ApiRevisionRequest | undefined;
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
            <ScoreParts components={row.components} />
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
            <CalibrateButton cycleId={cycleId} row={row} onChanged={onAsked} />
          )}
        </TD>
      )}
      {/* Same running window as calibration, but not restricted to it: a
          review can need another pass at any stage while people are still
          writing, not only once everybody has finished. */}
      {canRequestRevision && (
        <TD>
          <RevisionButton
            cycleId={cycleId}
            row={row}
            existing={existingRevision}
            onChanged={onAsked}
          />
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
/**
 * What a mark is made of, under the mark.
 *
 * The feedback asks for the final score "broken down by specific metrics, such
 * as behavioural competence and KPIs" — and the breakdown was already on the
 * wire the whole time. `ApiComponentScore` carries a score, a weight, an
 * effective weight and the API's own sentence for why a component was left
 * out; three screens render it and the register, which is where a cycle owner
 * actually reads a company's marks, showed only the final figure.
 *
 * Rendered as a line rather than behind a reveal. A total nobody can account
 * for is the thing the whole scoring model exists to avoid, and hiding the
 * account behind a click means most readers never see it.
 *
 * **Excluded components are named, not dropped.** A component with nothing
 * recorded and a component weighted at nothing are different facts, and the
 * API distinguishes them; showing only what counted would leave a reader
 * wondering why four sections produced three figures. `scoreBp` null renders
 * as an em dash and never as 0% — absent is not zero, here as everywhere.
 */
function ScoreParts({ components }: { components: ApiComponentScore[] }) {
  if (components.length === 0) return null;
  return (
    <span className="mt-1 block text-meta leading-relaxed text-muted">
      {components.map((part, index) => (
        <span key={part.component}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <span
            className={part.included ? undefined : "text-faint"}
            /* The API's sentence for the exclusion, never one written here. */
            {...(part.excludedNote ? { title: part.excludedNote } : {})}
          >
            {part.label}{" "}
            <span className="tabular">
              {part.scoreBp === null ? "—" : scoreLabel(part.scoreBp)}
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}

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
 * Whether managers may add their own questions to this draft.
 *
 * Lives on the setup card rather than its own settings screen because it is
 * one fact about one draft, changed rarely — the same reasoning that keeps
 * scope and the reminder as disclosures on `StartPeriodDialog` rather than a
 * separate page. Saves immediately on change: there is nothing to confirm,
 * only a boolean to flip, and `PATCH /cycles/:id` already refuses this once
 * the period has started, so a stale toggle here would fail loudly rather
 * than silently doing nothing.
 */
/**
 * What a draft period covers, and what to tell people — editable until it
 * starts.
 *
 * ## Why it is here and not on the start dialog alone
 *
 * The dialog asks for all of this, and somebody creating a period in a hurry
 * skips it. The scope cannot be offered here — the API reads `departmentIds`
 * once, at activation, so a control for it after the fact would silently do
 * nothing — but these four are read every time a form is opened, so they stay
 * editable for as long as the period is a draft and there is no form yet.
 *
 * Behind a reveal, closed, with the current answer in the summary. It is not a
 * blocker: a period with no stated instructions still runs.
 *
 * ## Both dates or neither
 *
 * Checked here, and the API checks the **resulting row** rather than the
 * patch — `{ periodStart: null }` on its own leaves an end with no start, and
 * looks perfectly consistent as a payload. Clearing is `null`, which is why
 * the two dates are sent together as a pair either way.
 */
function PeriodFramingEditor({
  period,
  onChanged,
}: {
  period: ApiCycle;
  onChanged: () => void;
}) {
  const periods = useCycleMutations();
  const toast = useToast();

  const [start, setStart] = useState(period.periodStart ?? "");
  const [end, setEnd] = useState(period.periodEnd ?? "");
  const [instructions, setInstructions] = useState(period.instructions ?? "");
  const [guideUrl, setGuideUrl] = useState(period.guideUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    start !== (period.periodStart ?? "") ||
    end !== (period.periodEnd ?? "") ||
    instructions !== (period.instructions ?? "") ||
    guideUrl !== (period.guideUrl ?? "");

  const save = async () => {
    if (Boolean(start) !== Boolean(end)) {
      setError("A period needs a start and an end. Set both, or clear both.");
      return;
    }
    if (start && end && start > end) {
      setError("The period ends before it starts.");
      return;
    }
    if (guideUrl.trim() && !/^https?:\/\//i.test(guideUrl.trim())) {
      setError("A guide link has to start with http:// or https://.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await periods.updateCycle(period.id, {
        /* Sent as a pair, and `null` where cleared — the API's rule is about
           the row that results, not the fields that arrived. */
        periodStart: start || null,
        periodEnd: end || null,
        instructions: instructions.trim() || null,
        guideUrl: guideUrl.trim() || null,
      });
      onChanged();
      toast.push({
        title: "Saved",
        tone: "success",
        detail: "Everybody's form will show this above the first question.",
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not save that. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Disclosure
      title="What this period covers, and what to tell people"
      meta={
        periodWords(period.periodStart, period.periodEnd) ??
        (period.instructions ? "No dates set" : "Nothing set")
      }
      hint="Shown above the first question on everybody's form."
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field optional label="Period covered — from">
            <Input
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </Field>
          <Field optional label="to">
            <Input
              type="date"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </Field>
        </div>
        <Field optional label="Instructions">
          <Textarea
            rows={5}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </Field>
        <p className="text-meta text-muted">
          Plain text. Line breaks are kept, so a blank line makes a new
          paragraph.
        </p>
        <Field optional label="A link to your own guide">
          <Input
            type="url"
            inputMode="url"
            value={guideUrl}
            placeholder="https://…"
            onChange={(event) => setGuideUrl(event.target.value)}
          />
        </Field>
        {error && (
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-ink"
          >
            {error}
          </p>
        )}
        <div>
          <Button
            variant="accent"
            size="sm"
            loading={saving}
            disabled={!dirty}
            onClick={() => void save()}
          >
            Save
          </Button>
        </div>
      </div>
    </Disclosure>
  );
}

function ManagerQuestionsToggle({
  cycleId,
  value,
  onChanged,
}: {
  cycleId: string;
  value: boolean;
  onChanged: () => void;
}) {
  const periods = useCycleMutations();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const toggle = async (checked: boolean) => {
    setBusy(true);
    try {
      await periods.updateCycle(cycleId, {
        managersCanAddQuestions: checked,
      });
      onChanged();
    } catch (caught) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Could not change that setting.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Checkbox
      label="Let managers add their own questions, scoped to their team"
      checked={value}
      disabled={busy}
      onChange={(event) => void toggle(event.target.checked)}
    />
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
      setFailed("Say why in a few more words: this is the record of it.");
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
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void clear()}
                >
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
                placeholder="Moderated at the calibration meeting: the team's targets were set higher than the rest of the department."
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

/**
 * Sending one person's review back for another pass.
 *
 * ## A reopened review, not an edited one
 *
 * Opening a request clears that one review's submission and sign-off — the
 * person sees it as unfinished again — without touching the cycle's stage or
 * anyone else's review. It resolves itself the moment they resubmit; there
 * is no separate "cancel" action here because there is nothing to undo once
 * they have. `existing` is only ever an *open* request — the API's own list
 * already drops resolved ones — so its presence alone is the whole state:
 * requested and not yet answered.
 *
 * ## The reason is required, same as calibration
 *
 * A review sent back with no account of why is not feedback, and the API
 * enforces the same ten-character floor `CalibrateButton` does — this checks
 * it first so the refusal is immediate rather than a round trip.
 *
 * ## Which review
 *
 * The table's sign-off column is the *manager's* review, but the person
 * being sent back to redo something might be the employee themself. Asked
 * directly rather than guessed from the row, because a wrong guess here
 * reopens the wrong person's work.
 */
function RevisionButton({
  cycleId,
  row,
  existing,
  onChanged,
}: {
  cycleId: string;
  row: ApiScoreRow;
  existing: ApiRevisionRequest | undefined;
  onChanged: () => void;
}) {
  const periods = useCycleMutations();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [targetStage, setTargetStage] = useState<"SELF" | "MANAGER">("MANAGER");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const start = () => {
    setTargetStage("MANAGER");
    setReason("");
    setFailed(null);
    setOpen(true);
  };

  const save = async () => {
    if (reason.trim().length < 10) {
      setFailed("Say why in a sentence: this is the record of it.");
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await periods.requestRevision(cycleId, {
        employeeId: row.employeeId,
        targetStage,
        reason: reason.trim(),
      });
      toast.push({
        title: `Sent back to ${row.employeeName}`,
        tone: "success",
        detail:
          targetStage === "SELF"
            ? "Their self-appraisal is open for another pass."
            : "Their manager review is open for another pass.",
      });
      setOpen(false);
      onChanged();
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "Could not send that back.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (existing) {
    return (
      <span
        className="text-meta text-muted"
        title={`${existing.targetStage === "SELF" ? "Self-appraisal" : "Manager review"} — ${existing.reason}`}
      >
        Sent back, awaiting resubmission
      </span>
    );
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={start}>
        Send back
      </Button>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={`Send ${row.employeeName}'s review back`}
          description="Reopens that one review so they can redo it. Nobody else's review moves."
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="accent"
                loading={busy}
                onClick={() => void save()}
              >
                Send it back
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Which review" required>
              <Select
                value={targetStage}
                disabled={busy}
                onChange={(event) =>
                  setTargetStage(event.target.value as "SELF" | "MANAGER")
                }
              >
                <option value="MANAGER">Manager review</option>
                <option value="SELF">Self-appraisal</option>
              </Select>
            </Field>

            <Field
              label="Why"
              required
              {...(failed ? { error: failed } : {})}
              help="This is kept with the request and is what they see for it."
            >
              <Textarea
                rows={3}
                value={reason}
                disabled={busy}
                placeholder="The objectives section is missing answers for two of the agreed goals. Please complete before resubmitting."
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
