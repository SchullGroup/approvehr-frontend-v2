"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Play, UserX } from "lucide-react";
import { PAGE_ICONS } from "@/components/portal/nav-icons";

const FairnessIcon = PAGE_ICONS["/performance/fairness"]!;
import {
  Button,
  IconButton,
  Card,
  CardBody,
  Callout,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  RowActions,
  type RowAction,
  type RowActionItem,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  TextLink,
  useToast,
  Tabs,
  LoadState,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import {
  NextStep,
  ReadyChip,
  type ReadyStep,
  type StepAction,
} from "@/components/performance/next-step";
import { departmentTone } from "@/components/ui/department-card";
import { StageProgress } from "@/components/performance/stage-progress";
import { fallbackCountLine } from "@/lib/performance/appraiser-fill";
import {
  askedLine,
  lastAskedLine,
  notSwitchedOn,
} from "@/lib/performance/notify-objectives";
import type { ApiNotifyObjectives } from "@/lib/api/performance";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  dayLabel,
  outOf5FromBp,
  outOf5Label,
  scoreLabel,
  scoreWords,
  visibleComponents,
  weightLabel,
  type ApiComponentScore,
  type ApiCycle,
  type ApiRevisionRequest,
  type ApiScoreRegister,
  type ApiScoreRow,
  type ReviewCycleStage,
} from "@/lib/api/performance";
import { useCan, usePermissions } from "@/lib/permissions";
import {
  useCycleMutations,
  useCycleRegister,
  useKpis,
  useReviewFlags,
} from "@/lib/store/performance";
import { CalibrateDialog } from "@/components/performance/calibrate-dialog";
import { RevisionDialog } from "@/components/performance/revision-dialog";
import { periodWords } from "../../review-parts";
import { PeriodPeople } from "./period-people";
import { QuestionsPanel } from "./period-questions";
import { QuestionsDialog } from "../../period-dialogs";
import { AskPeersDialog } from "./ask-peers";
import { anybodyToNudge, nudgeAudience, nudgeTitle, peerLine } from "./nudge";
import { CalibrationAudit } from "./fairness/calibration-audit";
import { publishLock, undecidedScores } from "./fairness/publish-lock";
import { flaggedCount } from "./fairness/people-to-review";
import { PeriodWeightsSection } from "./period-weights-section";
import { RenamePeriodDialog } from "./rename-period";

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
  MANAGER: "manager reviews",
  CALIBRATION: "calibration",
};

/** What the next step says for the move out of the current stage. */
const NEXT_BUTTON: Record<string, string> = {
  MANAGER: "Open manager reviews",
  CALIBRATION: "Move to calibration",
};

type PeriodTabId = "people" | "questions" | "marks" | "settings";

/** A quiet icon button that goes somewhere. The name is the tooltip and the label. */
function IconLink({
  href,
  label,
  badge = 0,
  children,
}: {
  href: string;
  label: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="relative inline-flex size-9 items-center justify-center rounded-md border border-line text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {children}
      {badge > 0 && (
        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-meta leading-5 text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function PeriodScreen({
  cycleId,
  initialTab,
}: {
  cycleId: string;
  /** From `?tab=questions`, so a link can land on the questions. */
  initialTab?: "questions";
}) {
  const router = useRouter();
  const { loading: accessLoading } = usePermissions();
  const canSeeCompany = useCan("EDIT_RECORDS");
  const canManage = useCan("MANAGE_SETTINGS");
  const canSeeFairness = useCan("VIEW_FAIRNESS");
  const review = useReviewFlags(cycleId, canSeeFairness);
  const detail = useCycleRegister(cycleId, canSeeCompany, canManage);
  const periods = useCycleMutations();
  const toast = useToast();

  const [chasing, setChasing] = useState(false);
  const [confirmingNudge, setConfirmingNudge] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmingStart, setConfirmingStart] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [chosenTab, setPeriodTab] = useState<PeriodTabId | null>(
    initialTab ?? null,
  );
  const [advancing, setAdvancing] = useState(false);
  /* Named lists, not counts, and they survive the toast. Both are somebody who
     finishes the period short, and the fixes are different. */
  const [noObjectives, setNoObjectives] = useState<number>(0);
  /* What Start said about appraisers, as quiet lines: who has HR as their
     appraiser (nobody above them recorded), and who has nobody at all. */
  const [startedWith, setStartedWith] = useState<{
    fallback: string | null;
    nobody: number;
  }>({ fallback: null, nobody: 0 });
  /* "Ask everyone to set objectives": the last answer, and whether this API
     has it at all (a 404 or 410 hides the button for good). */
  const [askedObjectives, setAskedObjectives] =
    useState<Partial<ApiNotifyObjectives> | null>(null);
  const [askingObjectives, setAskingObjectives] = useState(false);
  const [askUnavailable, setAskUnavailable] = useState(false);
  const period = detail.cycle;
  const nudging = nudgeAudience(detail.participants);
  const draft = period?.stage === "DRAFT";
  const published = period?.stage === "PUBLISHED";
  const running = period !== null && !draft && !published;

  /* The page covers the whole company, and somebody who may not see that has
     nothing here to read: their own review and objectives are on their
     Performance page. Not while who they are is still being worked out, which
     would send a reader who can see it away on a hard refresh. */
  const sendAway = !accessLoading && !canSeeCompany;
  useEffect(() => {
    if (sendAway) router.replace("/performance");
  }, [sendAway, router]);

  /* The tabs, and only the ones that have something in them (UAT 23 Nov, L11 for
     the questions: they are read with MANAGE_SETTINGS only, so nobody else is
     offered the tab). People is for a started period, Scores too; the questions
     of a period that has started and has none are not worth a tab, and Settings
     holds nothing that can change once the period is published. */
  const tabs: { id: PeriodTabId; label: string }[] = [
    ...(!draft && canSeeCompany && detail.available
      ? [{ id: "people" as const, label: "People" }]
      : []),
    ...(canManage && (draft || (period?.questionCount ?? 0) > 0)
      ? [{ id: "questions" as const, label: "Questions" }]
      : []),
    ...(draft ? [] : [{ id: "marks" as const, label: "Scores" }]),
    ...(canManage && !published
      ? [{ id: "settings" as const, label: "Settings" }]
      : []),
  ];
  /* A draft has nothing to measure yet, so it opens on its questions. A running
     period opens on its people, and a published one on its scores. */
  const defaultTab: PeriodTabId | undefined = (
    draft
      ? ["questions", "settings"]
      : published
        ? ["marks"]
        : ["people", "marks"]
  )
    .map((id) => tabs.find((tab) => tab.id === id)?.id)
    .find((id) => id !== undefined);
  const periodTab: PeriodTabId | undefined =
    chosenTab !== null && tabs.some((tab) => tab.id === chosenTab)
      ? chosenTab
      : defaultTab;
  const flagged = review.flags ? flaggedCount(review.flags) : 0;

  /* Only while it is actually running: a draft has not started and a
     published one is a record. `undefined` at calibration, which is the last
     stage before publishing. */
  const nextStage = running && period ? STAGE_AFTER[period.stage] : undefined;
  const lock = publishLock(review.flags, period?.stage ?? null);
  /* Whether the fairness check has been read, for somebody who may read it: until
     it has, whether anything is waiting for a decision is not known, and Publish
     would be offered and then refused. */
  const fairnessKnown =
    !canSeeFairness || !review.loading || review.flags !== null;
  const undecided = undecidedScores(review.flags, period?.stage ?? null);

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
      /* A count, never the names: people without an objective are an
         invitation to add them, not a failure (owner, 24 Nov 2026). */
      setNoObjectives(result.withoutAgreedObjectives.length);
      setStartedWith({
        fallback: fallbackCountLine(result.viaFallback),
        nobody: result.withoutAppraiser.length,
      });
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
      toast.push({ title: `${period.name} deleted`, tone: "success" });
      router.push("/performance");
    } catch (error) {
      failed(error);
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  /* What delivery is worth in this period's score, and whether anything exists to
     deliver against: the first step of a period that counts objectives. */
  const objectivesWeight = Math.round(
    (period?.weights?.values.OBJECTIVES ?? 0) / 100,
  );
  const companyObjectives = useKpis("company", draft && canManage);
  const hasObjectives = companyObjectives.goals.length > 0;

  const askForObjectives = async () => {
    setAskingObjectives(true);
    try {
      setAskedObjectives(await periods.notifyObjectives(cycleId));
    } catch (error) {
      if (notSwitchedOn(error)) setAskUnavailable(true);
      else failed(error);
    } finally {
      setAskingObjectives(false);
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
            : "Scores are in. Nothing more is asked of anyone until you publish.",
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
            ? `${result.unscored.length} ${result.unscored.length === 1 ? "person finishes" : "people finish"} with no score: ${result.unscored.join(", ")}.`
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
            : `Reminded ${result.reminded} ${result.reminded === 1 ? "person" : "people"}`,
        tone: "success",
        /* The count that does not add up is the useful one: somebody with no
           sign-in cannot be chased in the app, and saying so beats a number
           that quietly disagrees with the outstanding list. */
        ...(result.noAccount > 0
          ? {
              detail: `${result.noAccount} ${result.noAccount === 1 ? "person has" : "people have"} no sign-in, so the reminder did not reach them.`,
            }
          : {}),
      });
      detail.reload();
    } catch (error) {
      failed(error);
    } finally {
      setChasing(false);
      setConfirmingNudge(false);
    }
  };

  const readySteps: ReadyStep[] =
    canManage && draft && period
      ? [
          {
            id: "objectives",
            label: "Objectives",
            /* Counted when delivery is part of the score: with no objective
                     set there is nothing to deliver against. */
            optional: objectivesWeight === 0,
            done: hasObjectives,
            detail: !hasObjectives
              ? objectivesWeight > 0
                ? `Delivery is ${String(objectivesWeight)}% of the score, and nobody has set an objective yet.`
                : "Optional. Add them if you want them in the score."
              : askedObjectives
                ? [askedLine(askedObjectives), lastAskedLine(askedObjectives)]
                    .filter(Boolean)
                    .join(" ")
                : `Delivery is ${String(objectivesWeight)}% of the score.`,
            action: !hasObjectives
              ? {
                  label: "Set company objectives",
                  href: "/performance/kpis/new",
                }
              : askUnavailable
                ? { label: "Set objectives", href: "/performance/kpis" }
                : {
                    label: "Ask everyone to set objectives",
                    onClick: () => void askForObjectives(),
                    loading: askingObjectives,
                  },
          },
          {
            id: "appraisers",
            label: "Who appraises whom",
            done: true,
            detail: "From the reporting line. Change anyone if you like.",
            action: {
              label: "Review",
              href: `/performance/appraisers?period=${cycleId}`,
            },
          },
          {
            id: "questions",
            label: "Questions",
            done: period.questionCount > 0,
            detail:
              period.questionCount > 0
                ? `${String(period.questionCount)} in the review`
                : "None yet",
            action: {
              label: "Add questions",
              href: `/performance/periods/${cycleId}/questions`,
            },
          },
          {
            id: "weights",
            label: "How the score is made up",
            done: true,
            detail: "The company's weights. Change them on the Settings tab.",
            action: {
              label: "Review",
              onClick: () => setPeriodTab("settings"),
            },
          },
        ]
      : [];
  const stillToDo = readySteps.some((step) => !step.done && !step.optional);

  /* Who has not sent what they owe, and what that leaves to do. `null` while who
     is outstanding is not known to this reader. */
  const waiting = nudging ? nudging.names.length : null;
  /* The move out of this stage, as one action: the next stage, or publishing from
     calibration once no flagged score is waiting for a decision. */
  const moveOn: StepAction | null =
    canManage && running && period
      ? nextStage
        ? {
            label: NEXT_BUTTON[nextStage]!,
            onClick: () => void advance(),
            loading: advancing,
          }
        : period.stage === "CALIBRATION" && lock === null && fairnessKnown
          ? { label: "Publish", onClick: () => setPublishing(true) }
          : null
      : null;
  const remindable =
    canManage &&
    running &&
    nudging !== null &&
    nudging.names.length > 0 &&
    anybodyToNudge(nudging);
  /* The move out of the stage is the next step only once nobody owes anything. While
     somebody does, the reminder is, and the move is in the menu: it stays reachable
     for the person who has to close a stage with somebody on leave. */
  const moveInMenu = remindable && moveOn !== null ? moveOn : null;

  if (sendAway) return null;

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title={period?.name ?? "Appraisal period"}
        meta={
          canManage && period && !published ? (
            <IconButton
              label="Rename this period"
              className="size-8 rounded-md"
              onClick={() => setRenaming(true)}
            >
              <Pencil aria-hidden="true" className="size-4" />
            </IconButton>
          ) : undefined
        }
        subline={
          period ? (
            <>
              {periodWords(period.periodStart, period.periodEnd) && (
                <span>{periodWords(period.periodStart, period.periodEnd)}</span>
              )}
              {period.dueDate && <span>Due {dayLabel(period.dueDate)}</span>}
              {period.departmentIds.length > 0 && (
                <span>
                  {period.departmentIds.length === 1
                    ? "1 department"
                    : `${period.departmentIds.length} departments`}
                </span>
              )}
            </>
          ) : undefined
        }
        action={
          <>
            {/* Not ready (no questions yet) is the Get ready checklist's next
                step, not a button that refuses. */}
            {canManage && draft && period && (
              <>
                <ReadyChip steps={readySteps} />
                <Button
                  size="sm"
                  disabled={stillToDo}
                  title={stillToDo ? "Finish the steps first" : undefined}
                  onClick={() => setConfirmingStart(true)}
                >
                  <Play aria-hidden="true" className="size-3.5" />
                  Start period
                </Button>
              </>
            )}
            {/* The fairness check, as an icon, only while something is flagged:
                it carries the count. With nothing flagged it is a line in the
                menu with the other places this period links to. */}
            {canSeeFairness && !draft && flagged > 0 && (
              <IconLink
                href={`/performance/periods/${cycleId}/fairness`}
                label={`Fairness check, ${String(flagged)} flagged`}
                badge={flagged}
              >
                <FairnessIcon aria-hidden="true" className="size-4" />
              </IconLink>
            )}
            <RowActions
              label="More for this period"
              items={
                [
                  ...(moveInMenu
                    ? [
                        {
                          label: moveInMenu.label,
                          onSelect: () => moveInMenu.onClick?.(),
                        },
                      ]
                    : []),
                  ...(canSeeCompany
                    ? [
                        {
                          label: "Who appraises whom",
                          href: `/performance/appraisers?period=${cycleId}`,
                        },
                      ]
                    : []),
                  ...(canSeeCompany && !draft
                    ? [
                        {
                          label: "Talent map",
                          href: `/performance/periods/${cycleId}/nine-box`,
                        },
                        {
                          label: "Report",
                          href: `/performance/periods/${cycleId}/report`,
                        },
                      ]
                    : []),
                  ...(canSeeFairness && !draft && flagged === 0
                    ? [
                        {
                          label: "Fairness check",
                          href: `/performance/periods/${cycleId}/fairness`,
                        },
                      ]
                    : []),
                  ...(canManage && draft
                    ? [
                        "separator" as const,
                        {
                          label: "Delete period",
                          tone: "danger" as const,
                          onSelect: () => setConfirmingDelete(true),
                        },
                      ]
                    : []),
                ] satisfies RowActionItem[]
              }
            />
          </>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-6">
          {/* How far along it is, and the one thing to do about it. The bar is the
              same one the Periods list draws; the step is a reminder while
              somebody owes a form, then the move to the next stage. */}
          {canSeeCompany && period && !draft && (
            <div className="flex flex-col gap-4">
              <StageProgress
                stage={period.stage}
                tone={departmentTone(period.name)}
                label={period.name}
              />
              {canManage && running && (
                <PeriodNextStep
                  waiting={remindable ? (waiting ?? 0) : 0}
                  known={waiting !== null}
                  undecided={undecided}
                  fairnessHref={
                    canSeeFairness
                      ? `/performance/periods/${cycleId}/fairness?tab=people`
                      : null
                  }
                  moveOn={moveOn}
                  onRemind={() => setConfirmingNudge(true)}
                  noObjectives={noObjectives}
                  startedWith={startedWith}
                />
              )}
            </div>
          )}

          {DEMO_ENABLED && canSeeCompany && !detail.available ? (
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

          {tabs.length > 0 && periodTab !== undefined && (
            <Tabs
              items={tabs}
              value={periodTab}
              onChange={(next) => setPeriodTab(next as PeriodTabId)}
            >
              {periodTab === "people" && !draft && (
                <LoadState
                  loading={detail.loading}
                  error={null}
                  subject="the people"
                  skeleton="list"
                >
                  {detail.participants && (
                    <PeriodPeople rows={detail.participants.rows} />
                  )}
                </LoadState>
              )}
              {periodTab === "questions" && period && canManage && (
                <QuestionsPanel
                  cycleId={cycleId}
                  editable={canManage && period.stage !== "PUBLISHED"}
                  draft={draft}
                  onEdit={() => setQuestionsOpen(true)}
                  onChanged={() => detail.reload()}
                />
              )}
              {periodTab === "marks" &&
                detail.available &&
                !detail.loading &&
                !detail.error && (
                  <div className="flex flex-col gap-6">
                    <Register
                      register={detail.register}
                      cycleId={cycleId}
                      canAskPeers={running && canSeeCompany}
                      canCalibrate={
                        period?.stage === "CALIBRATION" && canManage
                      }
                      canRequestRevision={running && canManage}
                      revisionRequests={detail.revisionRequests}
                      revisionsUnavailable={detail.revisionsUnavailable}
                      onAsked={() => detail.reload()}
                    />
                    {/* Only when a score has been moved: with none, there is
                        nothing to audit and no reason to read the fairness
                        data a second time. */}
                    {(period?.stage === "CALIBRATION" ||
                      period?.stage === "PUBLISHED") &&
                      detail.register?.rows.some((row) => row.calibration) && (
                        <CalibrationAudit cycleId={cycleId} />
                      )}
                  </div>
                )}
              {periodTab === "settings" && period && canManage && (
                <PeriodSettings
                  period={period}
                  draft={draft}
                  onChanged={() => detail.reload()}
                />
              )}
            </Tabs>
          )}
        </div>
      </PageBody>

      {
        <>
          {period && (
            <RenamePeriodDialog
              period={period}
              open={renaming}
              onClose={() => setRenaming(false)}
              onRenamed={() => detail.reload()}
            />
          )}

          {/* The list that changes a period's questions once it has started. A
              draft writes them in the step-by-step form, so it is not mounted
              for one, and mounted it reads them, which is refused without the
              settings permission (L11). `period` is the mount guard; `open` is
              the real signal, threaded through so the `Modal` can see it go
              false and play its exit animation. */}
          {period && canManage && !draft && !published && (
            <QuestionsDialog
              open={questionsOpen}
              cycleId={cycleId}
              onClose={() => {
                setQuestionsOpen(false);
                detail.reload();
              }}
              onUpdate={(id, body) =>
                periods.updateQuestion(id, body).then(() => {})
              }
              onRemove={(id) => periods.removeQuestion(id).then(() => {})}
              onReorder={(ids: string[]) =>
                periods.reorderQuestions(cycleId, ids).then(() => {})
              }
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
              confirmLabel="Publish"
              tone="primary"
              body={`Everybody in ${period.name} will be able to read what their manager wrote about them. This cannot be undone, and anybody with no score finishes with none.`}
            />
          )}

          {/* Who is reminded, by name; the rest of what this says is what the
              button already did. */}
          {confirmingNudge && period && (
            <ConfirmDialog
              open
              onClose={() => setConfirmingNudge(false)}
              onConfirm={() => void chase()}
              loading={chasing}
              title={nudgeTitle(nudging)}
              confirmLabel="Remind"
              tone="primary"
              body={
                nudging !== null ? (
                  <div className="space-y-3">
                    {nudging.names.length > 0 && (
                      <ul
                        aria-label="Who gets a reminder"
                        className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5"
                      >
                        {nudging.names.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    )}
                    {peerLine(nudging) && <p>{peerLine(nudging)}</p>}
                  </div>
                ) : undefined
              }
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
      }
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A running period: the one thing to do next. While somebody owes a form that is
 * a reminder; then, at calibration, the flagged scores that wait for a decision;
 * then the move to the next stage, or publishing. A count of people with no
 * objective is a quiet line under it, never a warning.
 */
function PeriodNextStep({
  waiting,
  known,
  undecided,
  fairnessHref,
  moveOn,
  onRemind,
  noObjectives,
  startedWith,
}: {
  /** People who still owe a form. */
  waiting: number;
  /** Whether who owes what is known to this reader at all. */
  known: boolean;
  /** Flagged scores that wait for a decision before publishing. */
  undecided: number;
  /** Where the flagged scores are decided, for somebody who may see them. */
  fairnessHref: string | null;
  moveOn: StepAction | null;
  onRemind: () => void;
  noObjectives: number;
  startedWith: { fallback: string | null; nobody: number };
}) {
  const lines = [
    noObjectives > 0
      ? `${String(noObjectives)} ${noObjectives === 1 ? "person has" : "people have"} no objective yet. Add them if you want them in the score.`
      : null,
    startedWith.fallback,
    startedWith.nobody > 0
      ? `${String(startedWith.nobody)} ${startedWith.nobody === 1 ? "person has" : "people have"} nobody to appraise them yet. Set a department head.`
      : null,
  ].filter((line): line is string => line !== null);
  const detail = lines.length > 0 ? lines.join(" ") : undefined;

  if (waiting > 0) {
    return (
      <NextStep
        title={`${String(waiting)} still to send`}
        {...(detail ? { detail } : {})}
        action={{ label: "Remind", onClick: onRemind }}
      />
    );
  }
  /* Who owes what is not known to this reader, so nothing can be said about it:
     "everyone has finished" would be a claim made without an answer. */
  if (!known) {
    return detail ? <p className="text-body-sm text-muted">{detail}</p> : null;
  }
  if (undecided > 0 && fairnessHref) {
    return (
      <NextStep
        title={`${String(undecided)} flagged ${undecided === 1 ? "score needs" : "scores need"} a decision`}
        {...(detail ? { detail } : {})}
        action={{ label: "Review", href: fairnessHref }}
      />
    );
  }
  if (moveOn) {
    return (
      <NextStep
        title={
          moveOn.label === "Publish"
            ? "Ready to publish"
            : "Everyone has finished this stage"
        }
        {...(detail ? { detail } : {})}
        action={moveOn}
      />
    );
  }
  return detail ? <p className="text-body-sm text-muted">{detail}</p> : null;
}

/* -------------------------------------------------------------------------- */

/**
 * This period's own settings: what it is scored on, and, while it is a draft, who
 * it appraises. Renaming is the pencil beside the title and deleting is in the
 * header's menu, so neither is repeated here. There is no Settings tab once it is
 * published, because nothing in it can change then.
 */
function PeriodSettings({
  period,
  draft,
  onChanged,
}: {
  period: ApiCycle;
  draft: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PeriodWeightsSection period={period} onChanged={onChanged} />

      {draft && (
        <>
          <Card>
            <CardBody className="flex flex-col gap-3">
              <p className="flex items-center gap-1.5 text-body-sm font-semibold text-ink">
                Who is appraised
                <InfoTooltip
                  label="More about who is appraised"
                  text="Off for both by default. Whoever is left out still appraises their own team. They just do not get a form of their own, so they are not left with no score."
                />
              </p>
              <PeriodToggle
                cycleId={period.id}
                field="appraiseOwner"
                label="Appraise the Owner in this period"
                checked={period.appraiseOwner}
                onChanged={onChanged}
              />
              <PeriodToggle
                cycleId={period.id}
                field="appraiseHrManager"
                label="Appraise the HR manager in this period"
                checked={period.appraiseHrManager}
                onChanged={onChanged}
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col gap-3">
              <PeriodToggle
                cycleId={period.id}
                field="managersCanAddQuestions"
                label="Let managers add their own questions, scoped to their team"
                checked={period.managersCanAddQuestions}
                onChanged={onChanged}
              />
              <PeriodToggle
                cycleId={period.id}
                field="askPotential"
                label="Managers say how far each person could go"
                checked={period.askPotential !== false}
                onChanged={onChanged}
              />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * One yes-or-no setting of a draft period, saved the moment it is flipped.
 *
 * There is nothing to confirm, only a boolean to flip, and `PATCH /cycles/:id`
 * already refuses these once the period has started, so a stale toggle here would
 * fail loudly rather than silently doing nothing. The Owner and HR manager
 * switches are two unrelated decisions with a write each: an HR manager is an
 * employee with a manager like anybody else, so a company that does not appraise
 * the person who owns it may still want its HR manager appraised. They sit on a
 * draft's page because that is where they change anything: the exclusion only
 * applies to somebody with no form in the period.
 */
function PeriodToggle({
  cycleId,
  field,
  label,
  checked,
  onChanged,
}: {
  cycleId: string;
  field:
    | "appraiseOwner"
    | "appraiseHrManager"
    | "managersCanAddQuestions"
    | "askPotential";
  label: string;
  checked: boolean;
  onChanged: () => void;
}) {
  const periods = useCycleMutations();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await periods.updateCycle(cycleId, { [field]: next });
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
      label={label}
      checked={checked}
      disabled={busy}
      onChange={(event) => void toggle(event.target.checked)}
    />
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Where every mark stands.
 *
 * One row per person, and the score column is the place absent-versus-zero shows
 * up most often: a person with nothing recorded gets "Not recorded", never 0%.
 * The sign-off column is one muted word, and a link when there is a review to
 * open. No heading: the tab is called Scores.
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
        <EmptyState
          compact
          icon={<UserX aria-hidden="true" />}
          title="Nobody is in this period"
        />
      </Card>
    );
  }

  const revisable = canRequestRevision && !revisionsUnavailable;
  const revisionOf = (row: ApiScoreRow) =>
    revisionRequests.find((request) => request.employeeId === row.employeeId);

  return (
    <Card>
      <CardBody className="p-0">
        {/* Up to seven columns, one of them (Score) already two lines and a
            breakdown, is unreadable under 375px. Below `sm` this becomes a
            card per person — `RegisterCard` is `RegisterRow`'s sibling, same
            `SignOffCell` / `ScoreParts` / action menu, arranged as a list
            instead of columns. */}
        <div className="hidden sm:block">
          <TableWrap caption="Everybody in this period, their score and their sign-off">
            <THead>
              <TH>Person</TH>
              <TH align="right">
                <span className="inline-flex items-center justify-end gap-1.5">
                  Score
                  {register.weightsFrom === "current" && (
                    <InfoTooltip
                      label="How these scores are weighted"
                      text={`Scored on the company's weights as they are today, totalling ${weightLabel(register.weightsTotalBp)}. This period never locked in its own set, so changing the company's weights would change every score here, including ones already given.`}
                    />
                  )}
                </span>
              </TH>
              <TH>Sign-off</TH>
              {(canAskPeers || canCalibrate || revisable) && (
                <TH align="right">
                  <span className="sr-only">Actions</span>
                </TH>
              )}
            </THead>
            <TBody>
              {register.rows.map((row) => (
                <RegisterRow
                  key={row.employeeId}
                  row={row}
                  cycleId={cycleId}
                  canAskPeers={canAskPeers}
                  canCalibrate={canCalibrate}
                  canRequestRevision={revisable}
                  existingRevision={revisionOf(row)}
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
              canRequestRevision={revisable}
              existingRevision={revisionOf(row)}
              onAsked={onAsked}
            />
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function RegisterRow({
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
      <TD align="right">
        {/* Absent is absent. Nothing recorded is not a mark of nought. */}
        {row.scoreBp === null ? (
          <span className="text-muted">Not recorded</span>
        ) : (
          <>
            <span className="inline-flex items-center justify-end gap-1.5">
              <span className="tabular font-medium text-ink">
                {scoreWords(row)}
              </span>
              {row.components.length > 0 && (
                <InfoTooltip
                  id={`mark-parts-${row.employeeId}`}
                  text={breakdownSentence(row.components)}
                  label={`How ${row.employeeName}’s score is made up`}
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
                Moved from{" "}
                {outOf5Label(outOf5FromBp(row.calibration.originalBp))}
              </span>
            )}
          </>
        )}
      </TD>
      <TD>
        <SignOffCell row={row} sentBack={existingRevision !== undefined} />
      </TD>
      {/* One menu for the acts on a person, not a column and a button each:
          three buttons in three columns made every row three lines long
          (UAT 23 Nov, L13: PERF-38). */}
      {(canAskPeers || canCalibrate || canRequestRevision) && (
        <TD align="right">
          <MarkActions
            row={row}
            cycleId={cycleId}
            canAskPeers={canAskPeers}
            canCalibrate={canCalibrate}
            canRequestRevision={canRequestRevision}
            existingRevision={existingRevision}
            onChanged={onAsked}
          />
        </TD>
      )}
    </TR>
  );
}

/**
 * Ask colleagues, change the score and send back, behind one menu: on a row of
 * the Scores table and on the card a phone shows. The 360 half had no door at all
 * until it was here; calibration is only at its stage and only for somebody with a
 * score; a review can be sent back at any running stage.
 */
function MarkActions({
  row,
  cycleId,
  canAskPeers,
  canCalibrate,
  canRequestRevision,
  existingRevision,
  onChanged,
}: {
  row: ApiScoreRow;
  cycleId: string;
  canAskPeers: boolean;
  canCalibrate: boolean;
  canRequestRevision: boolean;
  existingRevision: ApiRevisionRequest | undefined;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<"peers" | "calibrate" | "revision" | null>(
    null,
  );
  /* The colleagues dialog reads the staff list, so it is mounted only once
     somebody has asked for it, and stays mounted after so it can animate out. */
  const [peersOpened, setPeersOpened] = useState(false);

  const items: RowAction[] = [];
  if (canAskPeers) {
    items.push({
      label: "Ask colleagues",
      onSelect: () => {
        setPeersOpened(true);
        setOpen("peers");
      },
    });
  }
  if (canCalibrate) {
    items.push({
      label: row.calibration ? "Change the moved score" : "Change the score",
      /* No score yet: nothing to change, so no item. */
      available: row.scoreBp !== null,
      onSelect: () => setOpen("calibrate"),
    });
  }
  if (canRequestRevision) {
    items.push({
      label: "Send back",
      /* Already sent back: it is waiting for them, so no second item. */
      available: !existingRevision,
      onSelect: () => setOpen("revision"),
    });
  }

  return (
    <>
      <RowActions label={`More for ${row.employeeName}`} items={items} />
      {peersOpened && (
        <AskPeersDialog
          open={open === "peers"}
          cycleId={cycleId}
          subjectId={row.employeeId}
          subjectName={row.employeeName}
          onClose={() => setOpen(null)}
          onAsked={() => {
            setOpen(null);
            onChanged();
          }}
        />
      )}
      {canCalibrate && (
        <CalibrateDialog
          open={open === "calibrate"}
          onClose={() => setOpen(null)}
          onChanged={onChanged}
          cycleId={cycleId}
          employeeId={row.employeeId}
          employeeName={row.employeeName}
          computedBp={row.computedBp ?? row.scoreBp ?? 0}
          existing={row.calibration}
        />
      )}
      {canRequestRevision && (
        <RevisionDialog
          open={open === "revision"}
          onClose={() => setOpen(null)}
          cycleId={cycleId}
          employeeId={row.employeeId}
          employeeName={row.employeeName}
          onChanged={onChanged}
          /* Both reviews could be meant only once a manager has written theirs;
             before that, the one to send back is the person's own. */
          choose={row.signOff.submitted}
          target={row.signOff.submitted ? "MANAGER" : "SELF"}
        />
      )}
    </>
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
        <div className="flex shrink-0 items-start gap-1 text-right">
          {row.scoreBp === null ? (
            <span className="text-body-sm text-muted">Not recorded</span>
          ) : (
            <span className="tabular font-medium text-ink">
              {scoreWords(row)}
            </span>
          )}
          {(canAskPeers || canCalibrate || canRequestRevision) && (
            <MarkActions
              row={row}
              cycleId={cycleId}
              canAskPeers={canAskPeers}
              canCalibrate={canCalibrate}
              canRequestRevision={canRequestRevision}
              existingRevision={existingRevision}
              onChanged={onAsked}
            />
          )}
        </div>
      </div>

      {row.scoreBp !== null && (
        <div>
          {row.calibration && (
            <p className="text-meta text-muted" title={row.calibration.reason}>
              Moved from {outOf5Label(outOf5FromBp(row.calibration.originalBp))}
            </p>
          )}
          <ScoreParts components={row.components} />
        </div>
      )}

      <SignOffCell row={row} sentBack={existingRevision !== undefined} />
    </li>
  );
}

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

/**
 * The sign-off state, as one muted word and a link where there is a review to open.
 *
 * The four words are the whole vocabulary: **Written** (the manager has written
 * it, and it is not final), **Final** (the person has been told), **Acknowledged**
 * and **Disputed**. Disputed first because it is the only one that obliges
 * somebody else to act; then Acknowledged; then Final, which is the exposure
 * acknowledgement exists to close — silence is not acceptance and this cell must
 * never read as though it were. A person whose manager has not written anything
 * has nothing to say here, and the score beside it already says so.
 */
function SignOffCell({
  row,
  sentBack,
}: {
  row: ApiScoreRow;
  /** Their review is open again, waiting for them to send it. */
  sentBack: boolean;
}) {
  const { signOff } = row;
  const open = signOff.reviewId && (
    <TextLink
      href={`/performance/reviews/${signOff.reviewId}`}
      className="text-meta"
    >
      Open
    </TextLink>
  );
  const word = (text: string, strong = false) => (
    <span
      className={strong ? "text-body-sm text-ink" : "text-body-sm text-muted"}
    >
      {text}
    </span>
  );

  if (sentBack) return word("Sent back");
  if (signOff.disputed) return word("Disputed", true);
  if (signOff.acknowledged) return word("Acknowledged");
  if (signOff.finalised || signOff.submitted) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {word(signOff.finalised ? "Final" : "Written")}
        {open}
      </span>
    );
  }
  return null;
}
