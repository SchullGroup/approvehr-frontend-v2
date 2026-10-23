"use client";

import { useCallback, useState } from "react";
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
  TextLink,
  useToast,
  Tabs,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import { NOTICE_LINK, NoticeLine } from "@/components/portal/notice-line";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  ratingWordsFrom,
  scoreLabel,
  visibleComponents,
  weightLabel,
  weightsFromNote,
  type ApiComponentScore,
  type ReviewCycleStage,
  type ApiCycle,
  type ApiCycleParticipants,
  type ApiRevisionRequest,
  type ApiScoreRegister,
  type ApiScoreRow,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import {
  outstandingIn,
  useCycleMutations,
  useCycleRegister,
  useRatingScale,
  useReviewFlags,
} from "@/lib/store/performance";
import { CalibrateDialog } from "@/components/performance/calibrate-dialog";
import { periodWords } from "../../review-parts";
import { QuestionsDialog } from "../../period-dialogs";
import { SectionsDialog } from "../../sections-dialog";
import { AskPeersButton } from "./ask-peers";
import { CalibrationAudit } from "./fairness/calibration-audit";
import { FairnessStatus, publishLock } from "./fairness/fairness-status";
import { PeriodWeightsSection } from "./period-weights-section";

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
  const canSeeFairness = useCan("VIEW_FAIRNESS");
  const review = useReviewFlags(cycleId, canSeeFairness);
  const detail = useCycleRegister(cycleId, canSeeCompany);
  const periods = useCycleMutations();
  const toast = useToast();

  const [chasing, setChasing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmingStart, setConfirmingStart] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  /* Latches on the first open and never clears — see the mount below. */
  const [sectionsEverOpened, setSectionsEverOpened] = useState(false);
  const openSections = useCallback(() => {
    setSectionsEverOpened(true);
    setSectionsOpen(true);
  }, []);
  const [publishing, setPublishing] = useState(false);
  const [periodTab, setPeriodTab] = useState<"overview" | "marks">("overview");
  const [advancing, setAdvancing] = useState(false);
  /* Named lists, not counts, and they survive the toast. Both are somebody who
     finishes the period short, and the fixes are different. */
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
  const lock = publishLock(review.flags, period?.stage ?? null);

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
        detail: `${result.reviewsCreated} ${result.reviewsCreated === 1 ? "form" : "forms"} created · ${result.notified} told in the app. No emails are sent from here.`,
      });
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
        detail: "Nobody had been sent anything, so there is nothing to undo.",
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
            : "Marks are in. Nothing more is asked of anyone until you publish.",
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
            : "People can now read what their manager wrote about them.",
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
            ? "Nobody is late"
            : `Nudged ${result.reminded} ${result.reminded === 1 ? "person" : "people"}`,
        tone: "success",
        /* The count that does not add up is the useful one: somebody with no
           sign-in cannot be chased in the app, and saying so beats a number
           that quietly disagrees with the outstanding list. */
        ...(result.noAccount > 0
          ? {
              detail: `${result.noAccount} ${result.noAccount === 1 ? "person has" : "people have"} no sign-in, so the reminder did not reach them. No emails are sent from here.`,
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
            {/* The sections the whole company is appraised against, reachable
                at every stage.

                While the period is a draft this sits in the setup card beside
                "Write the questions", which is where somebody writing a form
                wants it. Once the period starts that card is gone — and the
                framework is not the period's, so the way into it must not go
                with it. A section outlives every period filed under it, and a
                name typed wrongly on day one would otherwise be uncorrectable
                the moment anybody started an appraisal. */}
            {canManage && !draft && (
              <Button size="sm" variant="secondary" onClick={openSections}>
                Sections and subsections
              </Button>
            )}
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
            {canSeeFairness && !draft && (
              <ButtonLink
                size="sm"
                variant="secondary"
                href={`/performance/periods/${cycleId}/fairness`}
              >
                Fairness check
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
              <Button
                size="sm"
                disabled={lock !== null}
                title={lock ?? undefined}
                onClick={() => setPublishing(true)}
              >
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
          {running && canSeeFairness && (
            <FairnessStatus
              cycleId={cycleId}
              stage={period?.stage ?? null}
              flags={review.flags}
              loading={review.loading}
              error={review.error}
              reload={review.reload}
            />
          )}
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
                  {/* Its own control rather than something inside the question
                      form, because it is not this period's: sections and the
                      subsections under them are the company's framework, shared
                      by every period. Somebody comes here to read what an
                      appraisal is made of and correct a name, which is a
                      different errand from writing this period's questions. */}
                  <Button variant="secondary" size="sm" onClick={openSections}>
                    Sections and subsections
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
                <AppraiseLeadersToggle
                  cycleId={period.id}
                  appraiseOwner={period.appraiseOwner}
                  appraiseHrManager={period.appraiseHrManager}
                  onChanged={() => detail.reload()}
                />
                <PeriodFramingEditor
                  period={period}
                  onChanged={() => detail.reload()}
                />
              </CardBody>
            </Card>
          )}

          {/* Editable on a draft, and read-only from the moment it starts, so
              it is shown to anybody who can read the period. */}
          {period && (canManage || !draft) && (
            <PeriodWeightsSection
              period={period}
              onChanged={() => detail.reload()}
            />
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
                title="This page covers the whole company"
                description="Your own review and objectives are on your Performance page."
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

          <Tabs
            items={[
              { id: "overview", label: "Overview" },
              { id: "marks", label: "Marks" },
            ]}
            value={periodTab}
            onChange={(next) => setPeriodTab(next as "overview" | "marks")}
          >
            {periodTab === "overview" && (
              <div className="flex flex-col gap-6">
                {period && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Stat
                      label="Questions"
                      value={String(period.questionCount)}
                      hint={
                        period.questionCount === 0
                          ? "No questions yet, so nobody would be asked anything"
                          : "Used on both the self and manager forms"
                      }
                    />
                    <Stat
                      label="Forms in this period"
                      value={String(period.reviewCount)}
                      hint="One self-review each, plus one per appraiser"
                    />
                  </div>
                )}

                {detail.loading && (
                  <Card>
                    <CardBody className="flex items-center gap-2 text-body-sm text-muted">
                      <Spinner size="sm" />
                      Loading the period
                    </CardBody>
                  </Card>
                )}

                {detail.available && !detail.loading && (
                  <>
                    <Outstanding
                      rows={outstanding}
                      participants={detail.participants}
                    />
                    <MultiAppraiserReviews participants={detail.participants} />
                  </>
                )}
              </div>
            )}
            {periodTab === "marks" && detail.available && !detail.loading && (
              <div className="flex flex-col gap-6">
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
                {(period?.stage === "CALIBRATION" ||
                  period?.stage === "PUBLISHED") && (
                  <CalibrationAudit cycleId={cycleId} />
                )}
              </div>
            )}
          </Tabs>
        </div>
      </PageBody>

      {/* Framework-level, so it is not inside the `period` guard below: a
          section exists whether or not this period has loaded.

          Mounted from the first open rather than always, and kept mounted
          afterwards. `useSections` and `useFramework` fetch on mount, and a
          panel nobody has opened should not spend two requests on every load
          of this page. Keeping it mounted after that is what lets `Modal` see
          `open` go false and play its exit animation — the same reason
          `QuestionsDialog` below takes `open` as a prop. */}
      {sectionsEverOpened && (
        <SectionsDialog
          open={sectionsOpen}
          onClose={() => setSectionsOpen(false)}
        />
      )}

      {/* `period` is unrelated data, not the open/closed signal — kept as the
          mount guard since the dialog cannot render without it. `open` is the
          real signal, threaded through so `QuestionsDialog`'s `Modal` can see
          it go false and play its exit animation instead of the whole dialog
          vanishing with `questionsOpen` itself. */}
      {period && (
        <QuestionsDialog
          open={questionsOpen}
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
          body="Everyone gets their form today, and the questions cannot be changed once it starts, so add any more first."
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
          body={`Nobody has been sent anything for ${period.name} yet. Deleting it removes its questions too, and this cannot be undone.`}
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

  /**
   * Both halves of each ratio, from one source.
   *
   * The manager denominator was `counts.people` — the headcount — and that is
   * only right for a company where everybody has exactly one appraiser. It
   * read *"Manager reviews in 0 of 10"* on a period where one of the ten has
   * no manager review at all, on the same card that said 18 forms were
   * outstanding (9 self + 9 manager), and two clicks away the overview strip
   * reported 0 of 9 for the same figure.
   *
   * A manager review is a **review**, not a person: somebody with two
   * appraisers owes two and somebody with none owes none. So the denominator
   * is how many exist, counted off the same rows the numerator is counted
   * off. `period-status.tsx` already states this rule for the report
   * endpoint's `managerIn + managerOutstanding`; this screen reads a
   * different endpoint and had not been given it.
   *
   * Self is derived the same way rather than kept on `counts.people`. It is
   * very nearly always the headcount — everybody gets one — but `self` is
   * nullable on a participant, and a ratio whose two halves come from
   * different places is exactly the defect above.
   */
  const managerTotal = participants.rows.reduce(
    (total, row) => total + row.managers.length,
    0,
  );
  const managerIn = participants.rows.reduce(
    (total, row) => total + row.managers.filter((one) => one.submitted).length,
    0,
  );
  const selfTotal = participants.rows.filter((row) => row.self !== null).length;
  const selfIn = participants.rows.filter((row) => row.self?.submitted).length;

  return (
    <Card>
      <CardHeader
        title="Still to come in"
        description="Forms that were asked for and have not been sent yet. People nobody asked are listed above."
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
              selfTotal === 0 ? (
                <span className="text-faint">—</span>
              ) : (
                `${selfIn} of ${selfTotal}`
              )
            }
          />
          <Stat
            label="Manager reviews in"
            value={
              managerTotal === 0 ? (
                <span className="text-faint">—</span>
              ) : (
                `${managerIn} of ${managerTotal}`
              )
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
                <TextLink
                  href={`/performance/reviews/${row.reviewId}`}
                  className="text-body-sm"
                >
                  Open it
                </TextLink>
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
        description="Some of these people have more than one appraiser. Every review is listed here, including the ones that are not the main rating."
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
              <TextLink
                href={`/performance/reviews/${manager.reviewId}`}
                className="text-body-sm"
              >
                {manager.finalised
                  ? "Open"
                  : manager.submitted
                    ? "Finalise"
                    : "Open"}
              </TextLink>
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
          description="Starting a period gives every current employee a form."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Where the marks stand"
        description={
          register.weightsFrom === "period"
            ? `${weightsFromNote("period")} Totalling ${weightLabel(register.weightsTotalBp)}. They lock in when the period starts.`
            : register.weightsFrom === "snapshot"
              ? `Scored on the weights locked in when this period started, totalling ${weightLabel(register.weightsTotalBp)}. Changing the company's weights later will not move these marks.`
              : `Scored on the company's weights as they are today, totalling ${weightLabel(register.weightsTotalBp)}. This period never locked in its own set, so changing the company's weights would change every mark here, including ones already given.`
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
        {/* Up to seven columns, one of them (Score) already two lines and a
            breakdown, is unreadable under 375px. Below `sm` this becomes a
            card per person — `RegisterCard` is `RegisterRow`'s sibling, same
            `SignOffCell` / `ScoreParts` / action buttons, arranged as a list
            instead of columns. */}
        <div className="hidden sm:block">
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
                  canRequestRevision={
                    canRequestRevision && !revisionsUnavailable
                  }
                  existingRevision={revisionRequests.find(
                    (request) => request.employeeId === row.employeeId,
                  )}
                  onAsked={onAsked}
                />
              ))}
            </TBody>
          </TableWrap>
        </div>

        <ul className="divide-y divide-line sm:hidden">
          {register.rows.map((row) => (
            <RegisterCard
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
        </ul>
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
        <TextLink href={`/performance/history/${row.employeeId}`}>
          {row.employeeName}
        </TextLink>
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
            <span className="inline-flex items-center justify-end gap-1.5">
              <span className="tabular font-medium text-ink">
                {scoreLabel(row.scoreBp)}
              </span>
              {row.components.length > 0 && (
                <InfoTooltip
                  id={`mark-parts-${row.employeeId}`}
                  text={breakdownSentence(row.components)}
                  label={`How ${row.employeeName}’s mark is made up`}
                />
              )}
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

/** `RegisterRow`'s sibling: the same person, as a card instead of a row. */
function RegisterCard({
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
  canCalibrate: boolean;
  canRequestRevision: boolean;
  existingRevision: ApiRevisionRequest | undefined;
  onAsked: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/performance/history/${row.employeeId}`}
            className="font-medium text-ink underline-offset-2 hover:text-accent-text hover:underline"
          >
            {row.employeeName}
          </Link>
          <p className="mt-0.5 text-meta text-muted">
            {row.jobTitle}
            {row.departmentName ? ` · ${row.departmentName}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {row.scoreBp === null ? (
            <span className="text-body-sm text-muted">No mark</span>
          ) : (
            <span className="tabular font-medium text-ink">
              {scoreLabel(row.scoreBp)}
            </span>
          )}
        </div>
      </div>

      {row.scoreBp !== null && (
        <div>
          {row.calibration && (
            <p className="text-meta text-muted" title={row.calibration.reason}>
              Moved from {scoreLabel(row.calibration.originalBp)}
            </p>
          )}
          <ScoreParts components={row.components} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted">
        <span className="tabular">
          {row.objectives.agreed} objective
          {row.objectives.agreed === 1 ? "" : "s"} agreed
          {row.objectives.awaitingApproval > 0 &&
            ` · ${row.objectives.awaitingApproval} waiting`}
        </span>
      </div>

      <div>
        <SignOffCell row={row} />
      </div>

      {(canAskPeers || canCalibrate || canRequestRevision) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-2">
          {canAskPeers && (
            <AskPeersButton
              cycleId={cycleId}
              subjectId={row.employeeId}
              subjectName={row.employeeName}
              onAsked={onAsked}
            />
          )}
          {canCalibrate &&
            (row.scoreBp === null ? (
              <span className="text-meta text-muted">No mark yet</span>
            ) : (
              <CalibrateButton
                cycleId={cycleId}
                row={row}
                onChanged={onAsked}
              />
            ))}
          {canRequestRevision && (
            <RevisionButton
              cycleId={cycleId}
              row={row}
              existing={existingRevision}
              onChanged={onAsked}
            />
          )}
        </div>
      )}
    </li>
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
 * A total nobody can account for is the thing the whole scoring model exists to
 * avoid. On a phone the card carries the account as a line under the mark. In
 * the table a row stays within two lines, so the same account sits behind the
 * info icon beside the mark, one hover away.
 *
 * **Excluded components are counted, not dropped.** A component with nothing
 * recorded and a component weighted at nothing are different facts, and the
 * API distinguishes them; the line says how many were left out and the tooltip
 * names each with the API's sentence, so a reader is never left wondering why
 * four sections produced three figures. A missing figure is never shown as 0%:
 * absent is not zero, here as everywhere.
 */
function ScoreParts({ components }: { components: ApiComponentScore[] }) {
  const { counted, leftOut } = splitComponents(components);
  if (counted.length === 0 && leftOut.length === 0) return null;
  return (
    <span className="mt-1 block text-meta leading-relaxed text-muted">
      {counted.map((part, index) => (
        <span key={part.component}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          {part.label}{" "}
          <span className="tabular">{scoreLabel(part.scoreBp ?? 0)}</span>
        </span>
      ))}
      {leftOut.length > 0 && (
        <span className="text-faint" title={leftOutSentence(leftOut)}>
          {counted.length > 0 && <span aria-hidden="true"> · </span>}
          {leftOut.length} left out
        </span>
      )}
    </span>
  );
}

function splitComponents(all: ApiComponentScore[]) {
  const components = visibleComponents(all);
  const counted = components.filter(
    (part) => part.included && part.scoreBp !== null,
  );
  const leftOut = components.filter(
    (part) => !(part.included && part.scoreBp !== null),
  );
  return { counted, leftOut };
}

/* The API's own sentence for each exclusion, never one written here. */
function leftOutSentence(leftOut: ApiComponentScore[]): string {
  return leftOut
    .map((part) => `${part.label}: ${part.excludedNote ?? "nothing recorded"}`)
    .join(" ");
}

/** The whole account of a mark in one sentence, for the table's tooltip. */
export function breakdownSentence(components: ApiComponentScore[]): string {
  const { counted, leftOut } = splitComponents(components);
  const parts = counted
    .map((part) => `${part.label} ${scoreLabel(part.scoreBp ?? 0)}`)
    .join(", ");
  const rest =
    leftOut.length > 0 ? ` Left out: ${leftOutSentence(leftOut)}` : "";
  return `${parts || "Nothing counted yet"}.${rest}`;
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
          <TextLink
            href={`/performance/reviews/${signOff.reviewId}`}
            className="text-meta"
          >
            Open
          </TextLink>
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
          <TextLink
            href={`/performance/reviews/${signOff.reviewId}`}
            className="text-meta"
          >
            Finalise
          </TextLink>
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
          <Field optional label="Period covered, from">
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
 * Whether the Owner and the HR manager are appraised in this period.
 *
 * Two checkboxes and two independent writes, because they are two unrelated
 * decisions: an HR manager is an employee with a manager like anybody else, so
 * a company that does not appraise the person who owns it may still want its
 * HR manager appraised. Sending both every time would make one an edit nobody
 * made.
 *
 * ## Why this sits on a draft's card and is not refused afterwards
 *
 * The API does not guard either field to `DRAFT`, and that is deliberate
 * rather than an oversight to mirror: the exclusion only ever applies to
 * somebody with **no form in the period**, so switching one off after the
 * forms are written leaves everybody who already has one exactly where they
 * are. It is rendered with the draft's other settings because that is where it
 * changes anything, not because the API would refuse it later.
 */
function AppraiseLeadersToggle({
  cycleId,
  appraiseOwner,
  appraiseHrManager,
  onChanged,
}: {
  cycleId: string;
  appraiseOwner: boolean;
  appraiseHrManager: boolean;
  onChanged: () => void;
}) {
  const periods = useCycleMutations();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const toggle = async (
    field: "appraiseOwner" | "appraiseHrManager",
    checked: boolean,
  ) => {
    setBusy(true);
    try {
      await periods.updateCycle(cycleId, { [field]: checked });
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
    <div className="flex flex-col gap-2">
      <Checkbox
        label="Appraise the Owner in this period"
        checked={appraiseOwner}
        disabled={busy}
        onChange={(event) => void toggle("appraiseOwner", event.target.checked)}
      />
      <Checkbox
        label="Appraise the HR manager in this period"
        checked={appraiseHrManager}
        disabled={busy}
        onChange={(event) =>
          void toggle("appraiseHrManager", event.target.checked)
        }
      />
      <p className="text-meta text-muted">
        Off for both by default. Whoever is left out still appraises their own
        team. They just do not get a form of their own, so they are not left
        with no mark.
      </p>
    </div>
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {row.calibration ? "Change it" : "Change the mark"}
      </Button>
      <CalibrateDialog
        open={open}
        onClose={() => setOpen(false)}
        onChanged={onChanged}
        cycleId={cycleId}
        employeeId={row.employeeId}
        employeeName={row.employeeName}
        computedBp={row.computedBp ?? row.scoreBp ?? 0}
        existing={row.calibration}
      />
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
        title={`${existing.targetStage === "SELF" ? "Self-appraisal" : "Manager review"}, ${existing.reason}`}
      >
        Sent back, waiting for them to send it again
      </span>
    );
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={start}>
        Send back
      </Button>

      {/* No open-gating here, matching `CalibrateButton` above: `Modal` reads
          its own `useDismiss` state, so it has to stay mounted with the real
          `open` passed through rather than being unmounted by this wrapper. */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Send ${row.employeeName}'s review back`}
        description="Opens that one review again so they can redo it. Nobody else's review changes."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="accent" loading={busy} onClick={() => void save()}>
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
    </>
  );
}
