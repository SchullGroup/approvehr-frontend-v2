"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CornerDownRight,
  Plus,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  EmptyState,
  Illustration,
  Input,
  Modal,
  ProgressMeter,
  RowActions,
  FilterBar,
  Select,
  LoadState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  Textarea,
  rowClick,
  useToast,
  type AppliedFilter,
} from "@/components/ui";
import { NoticeLine } from "@/components/portal/notice-line";
import { InfoTooltip } from "@/components/ui/field";
import { DepartmentCard as DepartmentCardView } from "@/components/ui/department-card";
import { useDepartments } from "@/lib/store/departments";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import {
  COMPANY_KEY,
  departmentCards,
  departmentKeyOf,
  departmentName,
  goalsForDepartment,
  type DepartmentCard,
} from "@/lib/performance/objectives-by-department";
import { LoadFailure } from "@/components/portal/load-failure";
import { newObjectiveHref } from "@/lib/performance/objective-wizard";
import { approvalWords } from "@/lib/performance/objective-queue";
import { useAction } from "@/lib/use-action";
import {
  SuggestButton,
  SuggestionPanel,
} from "@/components/performance/suggestions";
import { ApiError } from "@/lib/api/client";
import { useTaskSummarySuggestion } from "@/lib/store/ai";
import { useSession } from "@/lib/store/session";
import {
  formatMeasure,
  isDoneMeasure,
  isUnread,
  quarterLabel,
  type ApiGoal,
  type ApiKeyResult,
  type GoalStatus,
} from "@/lib/api/performance";
import {
  APPROVAL_TONE,
  GOAL_STATUS_LABEL,
  GOAL_STATUS_TONE,
  mayBeSubmitted,
  useAppraisals,
  useCycleMutations,
  useKpiMutations,
  useKpis,
  useObjectiveMutations,
  useScoringWeights,
  type GoalNode,
  type KpiScope,
} from "@/lib/store/performance";
import { ApprovalReasonDialog } from "./approval-dialogs";
import { goalFacts } from "./goal-facts";
import {
  kpisAssignedSaid,
  markedDoneSaid,
  measureAddedSaid,
  progressLabel,
  readCountLine,
  readCountShort,
  reopenedSaid,
  sharedSaid,
  type Said,
} from "./objective-copy";
import { SendForAgreementDialog } from "./send-for-agreement";
import {
  AddMeasureDialog,
  AssignKpiDialog,
  StopKpiDialog,
  EditGoalDialog,
  DeleteGoalDialog,
  deleteBlocker,
  mayEditGoal,
} from "./goal-dialogs";
import { CompletedWork } from "@/components/performance/completed-work";
import { useCanUploadObjectives } from "./kpis/import/access";
import { PlanWorkDialog } from "./plan-work-dialog";
import { useAssistantAvailable } from "@/lib/store/ai";
import { useFeatures } from "@/lib/store/features";
import {
  DoneMeasureRow,
  MeasureConfirmProvider,
  type MeasureConfirmActions,
} from "./done-measure";

/**
 * The KPI cascade.
 *
 * ## One tree, three readings
 *
 * Company goal at the top, team goals beneath it, individual beneath those. The
 * indentation is the ladder; the badge on each row says which rung it is, and
 * that is derived — a goal with no owner is the company's, a goal with goals
 * under it is a team's, anything else is one person's.
 *
 * ## Updating progress is one number, inline
 *
 * No dialog. A measure is a row with a number in it, and moving that number is
 * the thing people come here to do — putting it behind "Open → edit → save"
 * turns a five-second job into a five-click one, and the number then does not
 * get updated.
 *
 * ## `lowerIsBetter` renders the right way round
 *
 * A cost or a time-to-hire target progresses as the number **falls**. The bar
 * fills as it falls, because `percent` comes from the API and the API's
 * arithmetic is direction-aware — this screen never divides current by target.
 * The direction is also stated in words beside it, with an arrow, so a
 * cost-reduction row at 50% cannot be misread as half-failed.
 *
 * ## Two axes on every card, and they disagree on purpose
 *
 * `status` is how it is going. `approval` is whether anybody agreed to it. A KPI
 * can be **agreed and off track** at the same time, which is the ordinary case
 * rather than an edge one, so both badges are on the card and neither is derived
 * from the other. One field carrying both would make "nobody has agreed this" and
 * "this is going badly" indistinguishable, and they call for opposite actions.
 *
 * ## An agreed target is frozen here, and the screen says so before it refuses
 *
 * After agreement the *target* cannot move: not the title, not the period, not a
 * measure's target, and no new measure — because adding one changes what
 * delivering the objective means. Progress still moves, which is the half that is
 * not frozen. The API enforces every one of those; this screen stops offering the
 * controls and says why, because a button that returns "that is refused" was a
 * design failure two clicks earlier.
 *
 * Reopening is the one way through, it needs a reason, and the reason is the
 * record: a target that moved with no account of why is the single most common
 * way an appraisal becomes indefensible.
 */
/** Not a cycle id, so it cannot collide with one. */
const NO_PERIOD = "none";

/** The heading of the empty state, by whose objectives are being read. */
export const EMPTY_TITLE: Record<KpiScope, string> = {
  mine: "No objectives yet",
  team: "Nobody in your team has an objective yet",
  company: "The company has no objectives yet",
};

/**
 * Nothing in this reading at all (owner request, 24 Nov 2026).
 *
 * In place of four tiles reading 0, a filter row with nothing to filter and an
 * empty list: one figure, what an objective is, and the way to write one. The
 * quieter way in is for several at once.
 */
export function EmptyObjectives({
  scope,
  href,
  showUpload = false,
  uploadHref = "/performance/kpis/import",
}: {
  scope: KpiScope;
  /** Where New objective goes, or null when this person cannot write one. */
  href: string | null;
  /** Upload objectives, as the quieter way in, for people who may. */
  showUpload?: boolean;
  uploadHref?: string;
}) {
  const toast = useToast();
  const appraisals = useAppraisals();
  const periods = useCycleMutations();
  const scoring = useScoringWeights();
  const [asking, setAsking] = useState(false);
  /* What objectives are worth in the score, so the page says why they matter. */
  const weight = Math.round(
    (scoring.weights?.rows.find((row) => row.component === "OBJECTIVES")
      ?.weightBp ?? 0) / 100,
  );
  /* Somebody can only be asked in the name of a period, so the button waits for one. */
  const period = appraisals.cycles.find((one) => one.stage !== "PUBLISHED");
  const mayAsk = href !== null && scope === "company" && period !== undefined;

  const ask = async () => {
    if (!period) return;
    setAsking(true);
    try {
      const result = await periods.notifyObjectives(period.id);
      toast.push({
        title: "Everyone has been asked",
        tone: "success",
        detail: `${String(result.notified)} ${result.notified === 1 ? "person was" : "people were"} told in the app.`,
      });
    } catch (caught) {
      toast.push({
        title: "That did not send",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setAsking(false);
    }
  };

  return (
    <Card>
      <EmptyState
        art={<Illustration name={href ? "welcome" : "shrug"} height={144} />}
        title={EMPTY_TITLE[scope]}
        description={
          weight > 0
            ? scope === "company"
              ? `Delivery against objectives is ${String(weight)}% of an appraisal score. Start with the company's objectives, then ask each department to set theirs.`
              : `Delivery against objectives is ${String(weight)}% of your appraisal score. Set yours so it counts.`
            : "An objective is what somebody aims for, with a target to measure it, and it is agreed before the period it covers."
        }
        {...(href
          ? {
              action: (
                <div className="flex flex-col items-center gap-3">
                  <ButtonLink variant="accent" href={href}>
                    <Plus aria-hidden="true" className="size-4" />
                    {scope === "company"
                      ? "Set a company objective"
                      : "New objective"}
                  </ButtonLink>
                  {mayAsk && (
                    <Button
                      variant="secondary"
                      loading={asking}
                      onClick={() => void ask()}
                    >
                      Ask everyone to set theirs
                    </Button>
                  )}
                  {showUpload && (
                    <Link
                      href={uploadHref}
                      className="text-body-sm font-medium text-accent-text underline-offset-2 hover:underline"
                    >
                      Upload objectives
                    </Link>
                  )}
                </div>
              ),
            }
          : {})}
      />
    </Card>
  );
}

export function KpisTab({
  scope,
  department = null,
  departmentHref,
  strip,
}: {
  scope: KpiScope;
  /**
   * The page's tab strip, when the page draws one with more than whose
   * objectives in it (To agree). Left out, the scopes are drawn here.
   */
  strip?: React.ReactNode;
  /** The department open on "Whole company", from the address. Null: the cards. */
  department?: string | null;
  /** Where a department card goes, and where "All departments" goes back to. */
  departmentHref?: (key: string | null) => string;
}) {
  const kpis = useKpis(scope);
  /* The whole company opens on one card per department (owner request, 24
     Nov). A personal objective belongs to its owner's department, which only
     the staff list knows, so the cards wait for it rather than counting
     everybody's under "No department" for a moment. */
  const grouping = scope === "company" && departmentHref !== undefined;
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const { flat: departmentList } = useDepartments();
  const owners = useMemo(
    () =>
      new Map(
        directory.people.map((person) => [person.id, person.departmentId]),
      ),
    [directory.people],
  );
  const membersByDepartment = useMemo(() => {
    const byKey: Record<string, string[]> = {};
    for (const person of directory.people) {
      if (!person.departmentId) continue;
      (byKey[person.departmentId] ??= []).push(person.fullName);
    }
    return byKey;
  }, [directory.people]);
  const cards = useMemo(
    () =>
      grouping
        ? departmentCards(
            kpis.goals,
            departmentList.filter((one) => !one.archived),
            owners,
          )
        : [],
    [grouping, kpis.goals, departmentList, owners],
  );
  const opened = grouping && department !== null ? department : null;
  const openedGoals = useMemo(
    () =>
      opened === null ? null : goalsForDepartment(kpis.goals, opened, owners),
    [opened, kpis.goals, owners],
  );
  /* What the list, the search and the filters work over: the open
     department's objectives, or everybody's. */
  const pool = openedGoals ?? kpis.goals;
  const mutations = useKpiMutations();
  const objectives = useObjectiveMutations();
  const canUpload = useCanUploadObjectives();
  const toast = useToast();
  const { actingId } = useSession();

  /* New objective is a page of its own (owner request, 24 Nov 2026), and
     "Add an objective under this" is the same page started under one. Both
     come back here: the address carries where they were. */
  const router = useRouter();
  const backHere =
    scope === "company" && department
      ? `/performance/kpis?scope=company&department=${encodeURIComponent(department)}`
      : `/performance/kpis?scope=${scope}`;
  const newObjective = (parentId?: string) =>
    newObjectiveHref({
      back: backHere,
      ...(parentId ? { parent: parentId } : {}),
    });
  const addUnder = (parentId: string) => router.push(newObjective(parentId));

  const [assigning, setAssigning] = useState<ApiGoal | null>(null);
  const [addingTo, setAddingTo] = useState<ApiGoal | null>(null);
  const [stopping, setStopping] = useState<ApiGoal | null>(null);
  const [editing, setEditing] = useState<ApiGoal | null>(null);
  const [deleting, setDeleting] = useState<ApiGoal | null>(null);
  const [completing, setCompleting] = useState<ApiGoal | null>(null);
  const [sending, setSending] = useState<ApiGoal | null>(null);
  const [reopening, setReopening] = useState<ApiGoal | null>(null);
  const [planning, setPlanning] = useState<ApiGoal | null>(null);
  const assistant = useAssistantAvailable();
  const features = useFeatures();
  const canPlan = assistant.available && features.projects;

  /**
   * Narrowing the cascade.
   *
   * **Client-side, and that is the decision rather than the shortcut.** The API
   * filters this list perfectly well — `q` over title and description,
   * `approval`, `status`, `ownerId` — and two things here make asking it wrong:
   *
   * - **The stats above must not move.** "24 KPIs being tracked" and "2 of 21
   *   measures" are claims about the company. Fetching a narrowed list would
   *   leave them describing the filter instead, under labels that say
   *   otherwise — the same defect as a headcount true of the wrong noun.
   * - **The cascade is a tree.** It is assembled here from a flat list, so
   *   filtering the list and rebuilding is one call, while a filtered fetch
   *   returns rows whose parents may be missing and hands the tree back
   *   half-built.
   *
   * `useKpis` already loads a single page of 200 for exactly that reason, so
   * everything being searched is in memory. A company past 200 objectives has
   * an incomplete cascade today, filter or no filter, and that is `useKpis` to
   * fix rather than this.
   */
  const [search, setSearch] = useState("");
  const [approval, setApproval] = useState("");
  const [progress, setProgress] = useState("");
  const [owner, setOwner] = useState("");
  /** A cycle id, or `NO_PERIOD` for the objectives that belong to none. */
  const [period, setPeriod] = useState("");

  /* Every write reports its own failure through the one place that decides
     what a failure says — see `lib/use-action.ts`. Worth knowing what changed
     when this stopped being hand-rolled: a write that *times out* no longer
     claims nothing was saved, because on a POST that is a claim this side
     cannot make. */
  const action = useAction();
  /**
   * A write whose toast is built from what it returned.
   *
   * A fixed title cannot say which objective, for whom or in what state, and
   * those are in the answer. The failure is still `action`'s: a toast naming
   * what the server said.
   */
  const announced = async <T,>(
    act: () => Promise<T>,
    said: (value: T) => Said,
    subject?: string,
  ) => {
    const outcome = await action.run(act, {
      ...(subject ? { subject } : {}),
      onDone: kpis.reload,
    });
    if (outcome.ok) {
      const toSay = said(outcome.value);
      toast.push({
        title: toSay.title,
        tone: toSay.tone ?? "success",
        ...(toSay.detail ? { detail: toSay.detail } : {}),
      });
    }
    return outcome;
  };

  /* Written once because the cards and the just-made objective's detail both
     hand them to `GoalDetailModal`. */
  const shareGoal = (goal: ApiGoal) =>
    void announced(
      () => mutations.shareGoal(goal.id),
      (result) => sharedSaid(goal.title, result.shared),
    );
  const recordMeasure = async (
    measureId: string,
    value: string,
    note?: string,
  ) => {
    await mutations.recordProgress(measureId, value, note);
    if (kpis.source === "api") kpis.reload();
  };

  /* A manager's word that a done-or-not-done measure is done. Each reports its
     own failure through `announced`, so a refusal shows the API's sentence, and
     answers whether it saved so the row knows whether to close its note box. */
  const measureConfirm: MeasureConfirmActions = {
    confirm: async (measureId, note) =>
      (
        await announced(
          () => mutations.confirmMeasure(measureId, note),
          (measure) => ({ title: `"${measure.label}" is confirmed as done` }),
        )
      ).ok,
    unconfirm: async (measureId) =>
      (
        await announced(
          () => mutations.unconfirmMeasure(measureId),
          (measure) => ({
            title: `"${measure.label}" is back to not done`,
            tone: "info",
          }),
        )
      ).ok,
  };

  /**
   * What each dropdown offers, taken from the objectives themselves.
   *
   * `approvalLabel` arrives on every row and `lib/store/performance.ts` says in
   * as many words not to keep a second copy of those five strings, so the
   * options are built from the data. Two things follow, both wanted: the
   * wording cannot drift from the badges beside it, and a state nothing is in
   * is never offered — a filter that can only ever return nothing is a dead
   * control.
   */
  const approvalOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const goal of kpis.goals) {
      if (!seen.has(goal.approval))
        seen.set(goal.approval, approvalWords(goal));
    }
    return [...seen];
  }, [kpis.goals]);

  const ownerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const goal of kpis.goals) {
      if (goal.ownerId && goal.ownerName && !seen.has(goal.ownerId)) {
        seen.set(goal.ownerId, goal.ownerName);
      }
    }
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [kpis.goals]);

  /**
   * The periods these objectives are filed against, plus the ones filed
   * against none.
   *
   * `NO_PERIOD` earns its place. An objective with no `reviewCycleId` is
   * invisible to every appraisal mark, and that is not a state anybody sets on
   * purpose — it is what a cleared period leaves behind, or a KPI created
   * before the field existed. Being able to ask "which of these count towards
   * nothing" is most of the reason to filter on this at all.
   */
  const periodOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const goal of kpis.goals) {
      if (goal.reviewCycleId && goal.reviewCycleName) {
        seen.set(goal.reviewCycleId, goal.reviewCycleName);
      }
    }
    const named: [string, string][] = [...seen].sort((a, b) =>
      b[1].localeCompare(a[1]),
    );
    return kpis.goals.some((goal) => goal.reviewCycleId === null)
      ? [...named, [NO_PERIOD, "Not in a period"] as [string, string]]
      : named;
  }, [kpis.goals]);

  const term = search.trim().toLowerCase();
  const narrowing =
    term !== "" ||
    approval !== "" ||
    progress !== "" ||
    owner !== "" ||
    period !== "";

  const matching = useMemo(() => {
    if (!narrowing) return pool;
    return pool.filter((goal) => {
      /* Title and description — the same two columns the API's own `q` covers,
         so searching here and searching there cannot come to mean different
         things. */
      if (
        term !== "" &&
        !goal.title.toLowerCase().includes(term) &&
        !(goal.description ?? "").toLowerCase().includes(term)
      ) {
        return false;
      }
      if (approval !== "" && goal.approval !== approval) return false;
      if (progress !== "" && goal.status !== progress) return false;
      /* A company or department objective has no owner. It is not "somebody
         else's", it is nobody's — so it drops out of an owner filter rather
         than being counted against whoever is selected. */
      if (owner !== "" && goal.ownerId !== owner) return false;
      if (period === NO_PERIOD && goal.reviewCycleId !== null) return false;
      if (
        period !== "" &&
        period !== NO_PERIOD &&
        goal.reviewCycleId !== period
      ) {
        return false;
      }
      return true;
    });
  }, [pool, narrowing, term, approval, progress, owner, period]);

  /* A flat list, by title: no cascade, no company objective pinned above the
     rest (owner, 24 Nov 2026). `matching` is the pool narrowed by the search
     and filters, or the whole pool. */
  const flat = [...matching].sort((x, y) => x.title.localeCompare(y.title));

  /* The cards stand in for the list until a department is opened, or a
     search or a filter asks across all of them. */
  const showCards = grouping && opened === null && !narrowing;
  const openedName = opened === null ? null : departmentName(cards, opened);

  const clearFilters = () => {
    setSearch("");
    setApproval("");
    setProgress("");
    setOwner("");
    setPeriod("");
  };

  /* `label` is the dimension and `value` is the choice — the chip renders them
     apart, so putting "Agreement: Agreed" in the label would read twice. */
  const applied: AppliedFilter[] = [
    ...(approval === ""
      ? []
      : [
          {
            label: "Agreement",
            value:
              approvalOptions.find(([key]) => key === approval)?.[1] ??
              approval,
            onClear: () => setApproval(""),
          },
        ]),
    ...(progress === ""
      ? []
      : [
          {
            label: "Progress",
            value: GOAL_STATUS_LABEL[progress as GoalStatus],
            onClear: () => setProgress(""),
          },
        ]),
    ...(owner === ""
      ? []
      : [
          {
            label: "Owner",
            value: ownerOptions.find(([id]) => id === owner)?.[1] ?? "somebody",
            onClear: () => setOwner(""),
          },
        ]),
    ...(period === ""
      ? []
      : [
          {
            label: "Period",
            value:
              periodOptions.find(([id]) => id === period)?.[1] ?? "a period",
            onClear: () => setPeriod(""),
          },
        ]),
  ];

  /* Nothing at all in this reading, as an answer and not while it loads or
     after it failed: the filters and an empty list are replaced by one empty
     state that says what an objective is and offers to write one. */
  const empty = !kpis.loading && !kpis.error && kpis.goals.length === 0;
  const unsent = kpis.goals.filter(
    (goal) => goal.approval === "DRAFT" || goal.approval === "NEEDS_REVISION",
  );

  /* The filter controls, behind the filter icon. */
  const FILTERS = (
    <>
      <Select
        aria-label="Filter by agreement"
        value={approval}
        onChange={(event) => setApproval(event.target.value)}
      >
        <option value="">Any agreement</option>
        {approvalOptions.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filter by progress"
        value={progress}
        onChange={(event) => setProgress(event.target.value)}
      >
        <option value="">Any progress</option>
        {(["ON_TRACK", "AT_RISK", "OFF_TRACK", "DONE"] as GoalStatus[]).map(
          (key) => (
            <option key={key} value={key}>
              {GOAL_STATUS_LABEL[key]}
            </option>
          ),
        )}
      </Select>
      {periodOptions.length > 0 && (
        <Select
          aria-label="Filter by appraisal period"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
        >
          <option value="">Any period</option>
          {periodOptions.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </Select>
      )}
      {ownerOptions.length > 0 && (
        <Select
          aria-label="Filter by owner"
          value={owner}
          onChange={(event) => setOwner(event.target.value)}
        >
          <option value="">Anybody</option>
          {ownerOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      )}
    </>
  );

  const content = (
    <div className="flex flex-col gap-6">
      {(strip !== undefined || (DEMO_ENABLED && kpis.source === "demo")) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {strip}
          {DEMO_ENABLED && kpis.source === "demo" && (
            <Badge tone="warning" size="sm">
              Demo · numbers stay in this browser
            </Badge>
          )}
        </div>
      )}

      <LoadFailure
        subject="your objectives"
        error={kpis.error}
        onRetry={kpis.reload}
      />

      {empty ? (
        <EmptyObjectives
          scope={scope}
          href={mutations.editable ? newObjective() : null}
          {...(mutations.editable && canUpload ? { showUpload: true } : {})}
        />
      ) : (
        <>
          {/* No figures above the list (owner, 24 Nov 2026: "remove
              objectives being tracked, average progress, just large cards"),
              and none of the lines that used to sit here about what waits to
              be agreed: the To agree tab carries that count. */}
          {unsent.length > 0 && (
            <NoticeLine tone="warning">
              {unsent.length === 1
                ? "1 objective has not been sent to be agreed yet"
                : `${unsent.length} objectives have not been sent to be agreed yet`}
            </NoticeLine>
          )}

          {opened !== null && departmentHref && (
            <div className="flex flex-col items-start gap-1">
              <ButtonLink
                variant="ghost"
                size="sm"
                href={departmentHref(null)}
                className="-ml-2"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                All departments
              </ButtonLink>
              <h2 className="text-h4 font-semibold text-ink">
                {openedName ?? "Objectives"}
              </h2>
            </div>
          )}

          {kpis.goals.length > 0 && !kpis.loading && (
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchLabel="Search objectives by title or detail"
              searchPlaceholder="Search objectives…"
              applied={applied}
              {...(narrowing ? { onClearAll: clearFilters } : {})}
              count={narrowing ? matching.length : undefined}
              noun={["objective", "objectives"]}
            >
              {FILTERS}
            </FilterBar>
          )}

          {kpis.loading ? (
            <LoadState
              loading
              error={null}
              subject="the objectives"
              skeleton="list"
            >
              {null}
            </LoadState>
          ) : kpis.error ? null : showCards ? (
            directory.loading ? (
              <LoadState
                loading
                error={null}
                subject="the departments"
                skeleton="list"
              >
                {null}
              </LoadState>
            ) : (
              <DepartmentGrid
                cards={cards}
                hrefOf={departmentHref!}
                members={membersByDepartment}
              />
            )
          ) : narrowing && matching.length === 0 ? (
            <EmptyState
              mood="search"
              icon={<Target aria-hidden="true" />}
              title="Nothing matches that"
              description={`None of the ${String(pool.length)} objectives match your filters.`}
              action={
                <Button variant="ghost" onClick={clearFilters}>
                  Clear the filters
                </Button>
              }
            />
          ) : flat.length === 0 ? (
            <EmptyState
              plain
              icon={<Target aria-hidden="true" />}
              title="No objectives here yet"
              description="Nothing in this department is filed as an objective yet."
            />
          ) : (
            /* A flat, even grid. An opened department is two sections: its
               own objectives (level department) in larger cards, then its
               members' under "Team members" (owner, 24 Nov 2026). */
            (() => {
              const card = (goal: ApiGoal, asRow = false) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  depth={0}
                  asRow={asRow}
                  editable={mutations.editable}
                  actingId={actingId}
                  canPlan={canPlan}
                  onAddMeasure={setAddingTo}
                  onAddChild={addUnder}
                  onAssign={setAssigning}
                  onComplete={setCompleting}
                  onStop={setStopping}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                  onShare={shareGoal}
                  onSubmit={setSending}
                  onReopen={setReopening}
                  onRecord={recordMeasure}
                  onPlan={setPlanning}
                />
              );
              const split = opened !== null && opened !== COMPANY_KEY;
              if (!split) {
                return (
                  <div className="grid gap-3 lg:grid-cols-2 min-[1600px]:grid-cols-3">
                    {flat.map((goal) => card(goal))}
                  </div>
                );
              }
              const own = (goal: ApiGoal) =>
                departmentKeyOf(goal, owners) === opened;
              const departmentGoals = flat.filter(
                (goal) => goal.level === "department" && own(goal),
              );
              const members = flat.filter(
                (goal) => goal.level !== "department" && own(goal),
              );
              return (
                <div className="flex flex-col gap-6">
                  {departmentGoals.length > 0 && (
                    <section className="flex flex-col gap-3">
                      <h3 className="text-body-md font-semibold text-ink">
                        Department objectives
                      </h3>
                      <div className="grid auto-rows-fr gap-4 md:grid-cols-2">
                        {departmentGoals.map((goal) => card(goal))}
                      </div>
                    </section>
                  )}
                  {members.length > 0 && (
                    <section className="flex flex-col gap-3">
                      <h3 className="text-body-md font-semibold text-ink">
                        Team members
                      </h3>
                      <TableWrap caption="Team members' objectives">
                        <THead>
                          <TH>Objective</TH>
                          <TH>Owner</TH>
                          <TH align="right">Progress</TH>
                          <TH>Agreed</TH>
                          <TH>Status</TH>
                        </THead>
                        <TBody>{members.map((goal) => card(goal, true))}</TBody>
                      </TableWrap>
                    </section>
                  )}
                </div>
              );
            })()
          )}
        </>
      )}

      <AssignKpiDialog
        open={assigning !== null}
        parent={
          assigning
            ? {
                id: assigning.id,
                title: assigning.title,
                departmentId: assigning.departmentId,
                dueQuarter: assigning.dueQuarter,
              }
            : null
        }
        onClose={() => setAssigning(null)}
        onAssign={async (parentId, body) => {
          const result = await mutations.assignObjective(parentId, body);
          /* Who got one, not how many. Somebody who picked eight and saw six
             appear is owed the two names rather than a tick — and "already
             had it" is a perfectly good outcome, so it is not an error. */
          const said = kpisAssignedSaid({
            owners: result.created.flatMap((kpi) =>
              kpi.ownerName ? [kpi.ownerName] : [],
            ),
            alreadyHad: result.alreadyHad.map((one) => one.name),
            parentTitle: assigning?.title ?? null,
          });
          toast.push({
            title: said.title,
            tone: said.tone ?? "success",
            ...(said.detail ? { detail: said.detail } : {}),
          });
          kpis.reload();
          setAssigning(null);
          return result;
        }}
      />

      <AddMeasureDialog
        open={addingTo !== null}
        goalTitle={addingTo?.title ?? null}
        onClose={() => setAddingTo(null)}
        onAdd={async (body) => {
          if (!addingTo) return;
          const outcome = await announced(
            () => mutations.addKeyResult(addingTo.id, body),
            (measure) => measureAddedSaid(measure, addingTo.title),
          );
          if (outcome.ok) setAddingTo(null);
        }}
      />

      <StopKpiDialog
        open={stopping !== null}
        goalTitle={stopping?.title ?? null}
        onClose={() => setStopping(null)}
        onStop={async (reason) => {
          if (!stopping) return;
          /* `action.run` rather than `announced`, for `notice`: the
             API returns a sentence saying what it could not do —
             "Recorded as off track. Goal status has no separate cancelled
             yet." — and nothing was showing it. So the card afterwards read
             "Agreed · Off track", indistinguishable from an objective that
             is merely going badly, with no account of the difference. The
             server explaining its own limitation is worth more than
             silence; the limitation itself is BE-35. */
          const outcome = await action.run(
            () => mutations.cancelGoal(stopping.id, reason),
            {
              success: `"${stopping.title}" stopped`,
              subject: "the objective",
              notice: (goal) => goal.note,
              onDone: kpis.reload,
            },
          );
          if (outcome.ok) setStopping(null);
        }}
      />

      <EditGoalDialog
        goal={editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSave={async (id, body) => {
          const outcome = await action.run(
            () => mutations.updateGoal(id, body),
            {
              success: "Changes saved",
              subject: "the objective",
              onDone: kpis.reload,
            },
          );
          if (outcome.ok) setEditing(null);
          return outcome.ok;
        }}
      />

      <DeleteGoalDialog
        goal={deleting}
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onDelete={async (goal) => {
          const outcome = await action.run(
            () => mutations.deleteGoal(goal.id),
            {
              success: `"${goal.title}" deleted`,
              subject: "the objective",
              onDone: kpis.reload,
            },
          );
          if (outcome.ok) setDeleting(null);
          return outcome.ok;
        }}
      />

      <ApprovalReasonDialog
        act={reopening ? "revise" : null}
        goalTitle={reopening?.title ?? null}
        open={reopening !== null}
        onClose={() => setReopening(null)}
        onConfirm={async (reason) => {
          if (!reopening) return;
          const outcome = await announced(
            () => objectives.revise(reopening.id, reason),
            () => reopenedSaid(reopening.title),
          );
          if (outcome.ok) setReopening(null);
        }}
      />

      <SendForAgreementDialog
        goal={sending}
        viewerId={actingId}
        onClose={() => setSending(null)}
        send={async (goal) => {
          /* Silent on success: the dialog turns into the announcement, or into
             a warning when nobody else was asked to agree it. */
          const outcome = await action.run(() => objectives.submit(goal.id), {
            onDone: kpis.reload,
          });
          return outcome.ok ? { value: outcome.value } : null;
        }}
      />

      <ConfirmDialog
        open={completing !== null}
        onClose={() => setCompleting(null)}
        title={`Mark "${completing?.title ?? ""}" done?`}
        confirmLabel="Mark done"
        tone="primary"
        onConfirm={async () => {
          if (!completing) return;
          const outcome = await announced(
            () => mutations.completeGoal(completing.id),
            (result) =>
              markedDoneSaid({
                title: completing.title,
                measures: completing.keyResults.length,
                /* The API's own count, and this card's when an older one does
                   not send it. */
                shortOfTarget:
                  typeof result.measuresShortOfTarget === "number"
                    ? result.measuresShortOfTarget
                    : completing.keyResults.filter((m) => !m.met).length,
              }),
          );
          if (outcome.ok) setCompleting(null);
        }}
        body={
          completing && completing.keyResults.some((measure) => !measure.met)
            ? `${completing.keyResults.filter((m) => !m.met).length} of its targets are not met. You can still mark it done; the numbers stay as they are.`
            : "Progress goes to 100% and it leaves the tracked list."
        }
      />

      {planning && (
        <PlanWorkDialog
          goal={planning}
          open
          onClose={() => setPlanning(null)}
        />
      )}
    </div>
  );

  return (
    <MeasureConfirmProvider value={measureConfirm}>
      {content}
    </MeasureConfirmProvider>
  );
}

/* -------------------------------------------------------------------------- */

/** One rung of the ladder, and everything beneath it. */
/**
 * One card per department on "Whole company": its name, how many objectives it
 * has and, only when there are any, how many are behind. Plain text, no chart.
 * Each card is a link, so it can be opened in a new tab and the address says
 * which department is open. One to a row on a phone.
 */
export function DepartmentGrid({
  cards,
  hrefOf,
  members = {},
}: {
  cards: readonly DepartmentCard[];
  hrefOf: (key: string) => string;
  /** Names of people in each department, by card key: three faces go on the card. */
  members?: Record<string, readonly string[]>;
}) {
  return (
    <ul className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <li key={card.key} className="min-w-0">
          <DepartmentCardView
            name={card.name}
            href={hrefOf(card.key)}
            line={
              card.count === 0
                ? "No objectives yet"
                : card.count === 1
                  ? "1 objective"
                  : `${String(card.count)} objectives`
            }
            members={members[card.key] ?? []}
          />
        </li>
      ))}
    </ul>
  );
}

function GoalBranch({
  node,
  editable,
  actingId,
  canPlan,
  onAddMeasure,
  onAddChild,
  onAssign,
  onComplete,
  onStop,
  onEdit,
  onDelete,
  onShare,
  onSubmit,
  onReopen,
  onRecord,
  onPlan,
}: {
  node: GoalNode;
  editable: boolean;
  /** Signed-in person's own employee id — decides who may log a task. */
  actingId: string | null;
  canPlan: boolean;
  onAddMeasure: (goal: ApiGoal) => void;
  onAddChild: (parentId: string) => void;
  onAssign: (goal: ApiGoal) => void;
  onComplete: (goal: ApiGoal) => void;
  onStop: (goal: ApiGoal) => void;
  onEdit: (goal: ApiGoal) => void;
  onDelete: (goal: ApiGoal) => void;
  onShare: (goal: ApiGoal) => void;
  onSubmit: (goal: ApiGoal) => void;
  onReopen: (goal: ApiGoal) => void;
  onRecord: (measureId: string, value: string, note?: string) => Promise<void>;
  onPlan: (goal: ApiGoal) => void;
}) {
  /**
   * Siblings with nothing under them sit side by side. Anything that is itself
   * a parent gets its own full-width row.
   *
   * The cascade is a ladder — "everything below ladders up to it" is the whole
   * claim the screen makes — so a flat grid over every objective would throw
   * away the one relationship this screen exists to show. But there is no
   * ladder *between siblings*: four personal KPIs under one team KPI are four
   * peers, and stacking them in a single column is a scroll bought for nothing.
   *
   * So the split is by whether a node carries children of its own. A parent
   * stays full width, because the things indented beneath it have to read as
   * beneath it. Leaves pair up. Indentation still carries the depth in both
   * cases, and a branch that happens to have no leaf siblings renders exactly
   * as it did before.
   */
  const leaves = node.children.filter((child) => child.children.length === 0);
  const branches = node.children.filter((child) => child.children.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <GoalCard
        goal={node}
        depth={node.depth}
        editable={editable}
        actingId={actingId}
        canPlan={canPlan}
        onAddMeasure={onAddMeasure}
        onAddChild={onAddChild}
        onAssign={onAssign}
        onComplete={onComplete}
        onStop={onStop}
        onEdit={onEdit}
        onDelete={onDelete}
        onShare={onShare}
        onSubmit={onSubmit}
        onReopen={onReopen}
        onRecord={onRecord}
        onPlan={onPlan}
      />

      {leaves.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2 min-[1600px]:grid-cols-3">
          {leaves.map((child) => (
            <GoalCard
              key={child.id}
              goal={child}
              depth={child.depth}
              editable={editable}
              actingId={actingId}
              canPlan={canPlan}
              onAddMeasure={onAddMeasure}
              onAddChild={onAddChild}
              onAssign={onAssign}
              onComplete={onComplete}
              onStop={onStop}
              onEdit={onEdit}
              onDelete={onDelete}
              onShare={onShare}
              onSubmit={onSubmit}
              onReopen={onReopen}
              onRecord={onRecord}
              onPlan={onPlan}
            />
          ))}
        </div>
      )}

      {branches.map((child) => (
        <GoalBranch
          key={child.id}
          node={child}
          editable={editable}
          actingId={actingId}
          canPlan={canPlan}
          onAddMeasure={onAddMeasure}
          onAddChild={onAddChild}
          onAssign={onAssign}
          onComplete={onComplete}
          onStop={onStop}
          onEdit={onEdit}
          onDelete={onDelete}
          onShare={onShare}
          onSubmit={onSubmit}
          onReopen={onReopen}
          onRecord={onRecord}
          onPlan={onPlan}
        />
      ))}
    </div>
  );
}

export function GoalCard({
  goal,
  depth,
  editable,
  actingId,
  canPlan,
  onAddMeasure,
  onAddChild,
  onAssign,
  onComplete,
  onStop,
  onEdit,
  onDelete,
  onShare,
  onSubmit,
  onReopen,
  onRecord,
  onPlan,
  emphasis = false,
  asRow = false,
}: {
  goal: ApiGoal;
  depth: number;
  /** One row of a table instead of a card: the department's members. */
  asRow?: boolean;
  /** A department's own objective: larger text and more room (owner, 24 Nov 2026). */
  emphasis?: boolean;
  editable: boolean;
  /** Signed-in person's own employee id — decides who may log a task. */
  actingId: string | null;
  canPlan?: boolean | undefined;
  onAddMeasure: (goal: ApiGoal) => void;
  onAddChild: (parentId: string) => void;
  onAssign: (goal: ApiGoal) => void;
  onComplete: (goal: ApiGoal) => void;
  onStop: (goal: ApiGoal) => void;
  onEdit: (goal: ApiGoal) => void;
  onDelete: (goal: ApiGoal) => void;
  onShare: (goal: ApiGoal) => void;
  onSubmit: (goal: ApiGoal) => void;
  onReopen: (goal: ApiGoal) => void;
  onRecord: (measureId: string, value: string, note?: string) => Promise<void>;
  onPlan?: ((goal: ApiGoal) => void) | undefined;
}) {
  const facts = goalFacts(goal);
  const { progress, done, reads } = facts;

  /* The detail is a modal, and this is the card's only piece of state.
     Everything the modal renders comes from the same `goal` the card has, so
     opening one costs no request and cannot show a different reading of the
     objective from the one on the card behind it. */
  const [open, setOpen] = useState(false);

  if (asRow) {
    return (
      <>
        <TR interactive onClick={rowClick(() => setOpen(true))}>
          <TD>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className="text-left font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {goal.title}
            </button>
          </TD>
          <TD>
            <span className="flex items-center gap-2">
              {goal.ownerName && <Avatar name={goal.ownerName} size="xs" />}
              <span className="truncate">
                {goal.ownerName ?? goal.departmentName ?? "No owner"}
              </span>
            </span>
          </TD>
          <TD align="right">
            <span className="tabular">
              {reads?.read === 0
                ? readCountShort(reads)
                : `${String(progress)}%`}
            </span>
          </TD>
          <TD>
            <Badge tone={APPROVAL_TONE[goal.approval]} size="sm" dot>
              {approvalWords(goal)}
            </Badge>
          </TD>
          <TD>
            <Badge tone={GOAL_STATUS_TONE[goal.status]} size="sm" dot>
              {GOAL_STATUS_LABEL[goal.status]}
            </Badge>
          </TD>
        </TR>
        <GoalDetailModal
          goal={goal}
          open={open}
          onClose={() => setOpen(false)}
          {...facts}
          editable={editable}
          canPlan={canPlan}
          onAddMeasure={onAddMeasure}
          onAddChild={onAddChild}
          onAssign={onAssign}
          onComplete={onComplete}
          onStop={onStop}
          onEdit={onEdit}
          onDelete={onDelete}
          onShare={onShare}
          onSubmit={onSubmit}
          onReopen={onReopen}
          onRecord={onRecord}
          onPlan={onPlan}
        />
      </>
    );
  }

  return (
    <>
      {/*
       * The compressed card.
       *
       * This was ~240px: title, rung, owner, period, two badges, a labelled
       * progress bar, every measure, the task log, the freeze paragraph and
       * five buttons — per objective, down a single column, so nine of them
       * was a two-thousand-pixel scroll and four hundred words of identical
       * policy text between a reader and nine figures. The card was sized by
       * its rarest control rather than by its content.
       *
       * What stays on the face is what somebody scanning a cascade is actually
       * reading for: whose it is, how far along, and the two states. Everything
       * that is detail, and every action, is one click away.
       *
       * ## What deliberately did *not* move
       *
       * `approvalNote` — the reason somebody sent an objective back or refused
       * it. A refusal whose reason is behind a click is a refusal nobody can
       * act on, and the note is the whole of what makes a second version of an
       * objective make sense. It is the one piece of prose worth its space
       * here, and it only renders while there is one.
       */}
      <div
        className={cn(
          "rounded-lg border border-line",
          goal.companyWide ? "bg-canvas" : "bg-surface",
          done && "opacity-75",
        )}
        style={{ marginLeft: Math.min(depth, 4) * 20 }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className={cn(
            "flex w-full flex-col rounded-lg text-left transition-colors hover:border-accent-line hover:bg-sunken/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
            emphasis ? "gap-3.5 p-5" : "gap-2.5 p-3.5",
          )}
          data-emphasis={emphasis ? "true" : undefined}
        >
          <div className="flex w-full items-start justify-between gap-3">
            <div className="flex min-w-0 gap-2.5">
              {depth > 0 && (
                <CornerDownRight
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-faint"
                />
              )}
              <p
                className={cn(
                  "min-w-0 font-medium text-ink",
                  emphasis ? "text-h4" : "text-body-sm",
                )}
              >
                {goal.title}
              </p>
            </div>
            {/* With none of its measures read the figure is the 0 the objective
                was made with, and a 0% on the face of a card is a claim that the
                work has not moved. So it is not drawn: what is said instead is
                that nobody has measured it. With some read, the figure stands
                and the count beside it says how much of it is a reading. */}
            {reads?.read === 0 ? (
              <span className="shrink-0 text-meta text-muted">
                {readCountShort(reads)}
              </span>
            ) : (
              <span className="shrink-0 text-right">
                <span
                  className={cn(
                    "tabular block font-medium text-ink",
                    emphasis ? "text-body-lg" : "text-body-sm",
                  )}
                >
                  {progress}%
                </span>
                {reads && (
                  <span className="block text-meta text-muted">
                    {readCountShort(reads)}
                  </span>
                )}
              </span>
            )}
          </div>

          <div
            className={cn(
              "flex w-full flex-wrap items-center justify-between gap-2 text-muted",
              emphasis ? "text-body-sm" : "text-meta",
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {goal.companyWide ? (
                <span>Everyone</span>
              ) : goal.ownerName ? (
                <>
                  <Avatar name={goal.ownerName} size="xs" />
                  <span className="truncate">{goal.ownerName}</span>
                </>
              ) : (
                /* A department's shared target reads as the department, the
                   way a company's reads as "Everyone". Only a rung with
                   neither is genuinely unowned. */
                <span className="truncate">
                  {goal.departmentName ?? "No owner"}
                </span>
              )}
            </span>

            {/* Two axes, both shown, on the face. Agreed and off track at once
                is the ordinary case and one badge carrying both would hide
                whichever mattered — the reason this stayed on the card. */}
            <span className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5">
              <Badge tone={APPROVAL_TONE[goal.approval]} size="sm" dot>
                {approvalWords(goal)}
              </Badge>
              <Badge tone={GOAL_STATUS_TONE[goal.status]} size="sm" dot>
                {GOAL_STATUS_LABEL[goal.status]}
              </Badge>
            </span>
          </div>
        </button>

        {goal.approvalNote && (
          <div className="mx-3.5 mb-3.5 flex flex-col gap-2">
            {/* Declined: the feedback is the reason, and where it is changed
                is the same page an objective is written on (owner, 24 Nov). */}
            <p className="border-l-2 border-line-strong pl-3 text-body-sm leading-relaxed text-body">
              {goal.approval === "NEEDS_REVISION" && (
                <span className="block text-meta text-muted">
                  Feedback when it was declined
                </span>
              )}
              {goal.approvalNote}
            </p>
            {goal.approval === "NEEDS_REVISION" &&
              editable &&
              mayEditGoal(goal) && (
                <ButtonLink
                  size="sm"
                  href={newObjectiveHref({ edit: goal.id })}
                  className="self-start"
                >
                  Edit and resend
                </ButtonLink>
              )}
          </div>
        )}
      </div>

      <GoalDetailModal
        goal={goal}
        open={open}
        onClose={() => setOpen(false)}
        {...facts}
        editable={editable}
        canPlan={canPlan}
        onAddMeasure={onAddMeasure}
        onAddChild={onAddChild}
        onAssign={onAssign}
        onComplete={onComplete}
        onStop={onStop}
        onEdit={onEdit}
        onDelete={onDelete}
        onShare={onShare}
        onSubmit={onSubmit}
        onReopen={onReopen}
        onRecord={onRecord}
        onPlan={onPlan}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One objective in full: what it is, what measures it, and what may be done
 * to it.
 *
 * ## Why a modal rather than a taller card
 *
 * Everything here is true of one objective and matters only once somebody has
 * picked that objective. On the card it cost every reader of the cascade the
 * same space whether they cared or not — and the pieces that cost the most
 * (the five actions and the freeze paragraph) are the ones the fewest readers
 * want. A dialog is the shape of "I have chosen this one".
 *
 * ## Nothing here is new, and nothing was dropped
 *
 * Every control, refusal and sentence is the one that was on the card, with
 * the same conditions on it. The freeze paragraph in particular is now
 * directly above the buttons it constrains, which is where it was always
 * trying to be: it explains why "Add a measure" is absent, and on the card it
 * sat eighty pixels away from the gap it was explaining.
 */
function GoalDetailModal({
  goal,
  open,
  onClose,
  rung,
  progress,
  done,
  canShare,
  noPeriod,
  reads,
  editable,
  canPlan,
  onAddMeasure,
  onAddChild,
  onAssign,
  onComplete,
  onStop,
  onEdit,
  onDelete,
  onShare,
  onSubmit,
  onReopen,
  onRecord,
  onPlan,
}: {
  goal: ApiGoal;
  open: boolean;
  onClose: () => void;
  rung: string;
  progress: number;
  done: boolean;
  canShare: boolean;
  noPeriod: boolean;
  /** From `goalFacts`: null unless some measure is unread (see `readCount`). */
  reads: { read: number; of: number } | null;
  editable: boolean;
  /** Assistant connected and Projects switched on. */
  canPlan?: boolean | undefined;
  onAddMeasure: (goal: ApiGoal) => void;
  onAddChild: (parentId: string) => void;
  onAssign: (goal: ApiGoal) => void;
  onComplete: (goal: ApiGoal) => void;
  onStop: (goal: ApiGoal) => void;
  onEdit: (goal: ApiGoal) => void;
  onDelete: (goal: ApiGoal) => void;
  onShare: (goal: ApiGoal) => void;
  onSubmit: (goal: ApiGoal) => void;
  onReopen: (goal: ApiGoal) => void;
  onRecord: (measureId: string, value: string, note?: string) => Promise<void>;
  onPlan?: ((goal: ApiGoal) => void) | undefined;
}) {
  /* Every action closes the dialog before it runs. All eight open a second
     dialog of their own — a confirm, a form, a share sheet — and two stacked
     dialogs is a trap: the one underneath keeps the focus ring and neither
     says which Escape belongs to it. */
  const act = (run: () => void) => () => {
    onClose();
    run();
  };

  return (
    <Modal open={open} onClose={onClose} title={goal.title} size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-meta text-muted">
          <Badge
            tone={goal.level === "personal" ? "neutral" : "accent"}
            size="sm"
          >
            {rung}
          </Badge>
          <Badge tone={APPROVAL_TONE[goal.approval]} size="sm" dot>
            {approvalWords(goal)}
          </Badge>
          {goal.targetFrozen && (
            <InfoTooltip
              label="Why it is fixed"
              text="Agreed: the title, period and targets are fixed. Progress can still change."
            />
          )}
          <Badge tone={GOAL_STATUS_TONE[goal.status]} size="sm" dot>
            {GOAL_STATUS_LABEL[goal.status]}
          </Badge>
          {goal.companyWide ? (
            <span>Everyone</span>
          ) : goal.ownerName ? (
            <span className="flex items-center gap-1.5">
              <Avatar name={goal.ownerName} size="xs" />
              {goal.ownerName}
            </span>
          ) : (
            <span>{goal.departmentName ?? "No owner"}</span>
          )}
          {/* The appraisal period is what makes this scoreable; a bare quarter
              is what companies typed before periods existed and is still
              allowed. */}
          <span>{goal.reviewCycleName ?? quarterLabel(goal.dueQuarter)}</span>
          {goal.revisionCount > 0 && (
            <span>
              {goal.revisionCount === 1
                ? "Reopened once"
                : `Reopened ${goal.revisionCount} times`}
            </span>
          )}
          {goal.parentTitle && <span>Under {goal.parentTitle}</span>}
        </div>

        {/* With nothing read, the label says so and the figure is not drawn: a 0%
            beside "nothing read yet" would be the claim the label denies. */}
        <ProgressMeter
          value={progress}
          showValue={reads?.read !== 0}
          size="sm"
          tone={
            done
              ? "ink"
              : goal.status === "OFF_TRACK"
                ? "danger"
                : goal.status === "AT_RISK"
                  ? "warning"
                  : "accent"
          }
          label={progressLabel(goal.keyResults.length, reads)}
        />

        {/* Said only when it is a warning: "4 of 4 read" on every card is noise.
            With none read, the bar above is the 0 the objective was made with
            and not a result, so the line says so. */}
        {reads && (
          <p className="text-body-sm text-body">{readCountLine(reads)}</p>
        )}

        {goal.keyResults.length > 0 ? (
          <ul className="flex flex-col gap-3 border-t border-line pt-4">
            {goal.keyResults.map((measure) =>
              isDoneMeasure(measure) ? (
                <DoneMeasureRow
                  key={measure.id}
                  measure={measure}
                  goalOwnerId={goal.ownerId}
                />
              ) : (
                <MeasureRow
                  key={measure.id}
                  measure={measure}
                  goalId={goal.id}
                  editable={!done}
                  onRecord={onRecord}
                />
              ),
            )}
          </ul>
        ) : (
          <p className="text-body-sm text-body">
            No target yet, so its progress has to be entered by hand.
          </p>
        )}

        {/* The finished project tasks linked to this, for whoever is reading it
            to see what went into it. Read-only; nothing here is graded. */}
        {open && <CompletedWork goal={goal} />}

        {noPeriod && goal.approval !== "AGREED" && (
          <p className="text-body-sm text-body">
            Give this a quarter before you send it to be agreed, so it can be
            agreed before that quarter starts.
          </p>
        )}

        {/* Two actions at most, then a menu: a row of four buttons asks the reader to
            choose between things that are not equally likely. In order of how often
            each is the next thing to do; what does not fit goes under the dots,
            and the one that cannot be undone goes last. Each is only listed where
            the API will take it, so none comes back as a refusal. */}
        {(() => {
          type Item = {
            key: string;
            label: string;
            onSelect?: () => void;
            href?: string;
            tone?: "danger";
          };
          const items: Item[] = [];
          if (mayBeSubmitted(goal)) {
            items.push(
              goal.approval === "NEEDS_REVISION" &&
                editable &&
                mayEditGoal(goal)
                ? {
                    key: "resend",
                    label: "Edit and resend",
                    href: newObjectiveHref({ edit: goal.id }),
                  }
                : {
                    key: "submit",
                    label:
                      goal.approval === "NEEDS_REVISION"
                        ? "Send it again"
                        : "Send to be agreed",
                    onSelect: act(() => onSubmit(goal)),
                  },
            );
          }
          if (goal.approval === "AGREED" && !done) {
            items.push({
              key: "reopen",
              label: "Reopen the objective",
              onSelect: act(() => onReopen(goal)),
            });
            if (canPlan && onPlan) {
              items.push({
                key: "plan",
                label: "Plan work",
                onSelect: act(() => onPlan(goal)),
              });
            }
          }
          if (editable) {
            if (!done)
              items.push({
                key: "done",
                label: "Mark done",
                onSelect: act(() => onComplete(goal)),
              });
            if (!goal.targetFrozen) {
              items.push({
                key: "target",
                label: "Add a target",
                onSelect: act(() => onAddMeasure(goal)),
              });
            }
            if (mayEditGoal(goal))
              items.push({
                key: "edit",
                label: "Edit",
                onSelect: act(() => onEdit(goal)),
              });
            items.push({
              key: "child",
              label: "Add an objective under this",
              onSelect: act(() => onAddChild(goal.id)),
            });
            if (goal.ownerId === null) {
              items.push({
                key: "assign",
                label: "Give an objective to people",
                onSelect: act(() => onAssign(goal)),
              });
            }
            if (canShare)
              items.push({
                key: "share",
                label: "Tell the people affected",
                onSelect: act(() => onShare(goal)),
              });
            if (!done)
              items.push({
                key: "stop",
                label: "Stop this objective",
                onSelect: act(() => onStop(goal)),
              });
            if (deleteBlocker(goal) === null) {
              items.push({
                key: "delete",
                label: "Delete",
                tone: "danger",
                onSelect: act(() => onDelete(goal)),
              });
            }
          }
          const shown = items.slice(0, 2);
          const more = items.slice(2);
          if (items.length === 0) return null;
          return (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {shown.map((item, index) =>
                item.href ? (
                  <ButtonLink
                    key={item.key}
                    variant={index === 0 ? "accent" : "secondary"}
                    size="sm"
                    href={item.href}
                  >
                    {item.label}
                  </ButtonLink>
                ) : (
                  <Button
                    key={item.key}
                    variant={index === 0 ? "accent" : "secondary"}
                    size="sm"
                    onClick={item.onSelect}
                  >
                    {item.label}
                  </Button>
                ),
              )}
              {more.length > 0 && (
                <RowActions
                  label="More for this objective"
                  items={more.map((item) => ({
                    key: item.key,
                    label: item.label,
                    ...(item.href ? { href: item.href } : {}),
                    ...(item.onSelect ? { onSelect: item.onSelect } : {}),
                    ...(item.tone ? { tone: item.tone } : {}),
                  }))}
                />
              )}
            </div>
          );
        })()}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One measure, with the number editable in place.
 *
 * The Save button appears only once the value has actually changed, so the row
 * is a reading until you make it an edit. The input is `inputMode="decimal"`
 * rather than `type="number"`: a decimal string is what the API stores, spinners
 * on a business figure invite a stray scroll, and `type="number"` silently
 * discards a value it cannot parse.
 */
export function MeasureRow({
  measure,
  goalId,
  editable,
  onRecord,
}: {
  measure: ApiKeyResult;
  /** The objective this measure belongs to. Grounds the write-up suggestion. */
  goalId: string;
  editable: boolean;
  onRecord: (measureId: string, value: string, note?: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const summary = useTaskSummarySuggestion();

  /* Nobody has entered a reading. Its "current value" is the start it was made
     with, so it is not shown as one: the box is empty and asks for a first
     reading. Typing the same number as the start is still a reading (0 can be
     the honest answer), which is why an unread measure is saveable even when
     the draft equals the figure behind it. */
  const unread = isUnread(measure);
  const value = draft ?? (unread ? "" : measure.currentValue);
  const changed =
    draft !== null &&
    draft.trim() !== "" &&
    (unread || draft.trim() !== measure.currentValue);

  const save = async () => {
    if (!changed) return;
    setSaving(true);
    setFailed(null);
    try {
      await onRecord(
        measure.id,
        (draft ?? "").trim(),
        note.trim() || undefined,
      );
      setDraft(null);
      setNote("");
      summary.clear();
    } catch (error) {
      setFailed(
        error instanceof ApiError
          ? error.message
          : "Could not save that number. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-body-sm font-medium text-ink">
          {measure.label}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Badge
            tone="neutral"
            size="sm"
            icon={
              measure.lowerIsBetter ? (
                <TrendingDown aria-hidden="true" />
              ) : (
                <TrendingUp aria-hidden="true" />
              )
            }
          >
            {measure.lowerIsBetter ? "Counting down" : "Counting up"}
          </Badge>
          {unread && (
            <Badge tone="warning" size="sm">
              Not read yet
            </Badge>
          )}
          {!unread && measure.met && (
            <Badge tone="accent" size="sm" icon={<Check aria-hidden="true" />}>
              Met
            </Badge>
          )}
        </span>
      </div>

      {/* No bar for a measure nobody has read: a bar at 0% is a result, and the
          0 is only where the measure began. What being unread costs is said once,
          under the objective's own bar, because it is a fact about that figure;
          repeating it under every unread measure said the same sentence four
          times in a row to somebody with one unread measure. */}
      {!unread && (
        <ProgressMeter
          value={measure.percent}
          showValue
          size="sm"
          tone={measure.met ? "ink" : "accent"}
        />
      )}

      <p className="tabular text-body-sm text-body">
        {unread
          ? "No reading yet"
          : `Now ${formatMeasure(measure.currentValue, measure.unit)}`}{" "}
        · aiming for {formatMeasure(measure.targetValue, measure.unit)} ·
        started at {formatMeasure(measure.startValue, measure.unit)}
      </p>

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={
              unread
                ? `First reading for ${measure.label}`
                : `Latest number for ${measure.label}`
            }
            inputMode="decimal"
            className="h-8 w-36"
            {...(unread ? { placeholder: "First reading" } : {})}
            value={value}
            onChange={(event) => setDraft(event.target.value)}
          />
          {measure.unit && (
            <span className="text-body-sm text-muted">{measure.unit}</span>
          )}
          {changed && (
            <>
              <Button
                variant="accent"
                size="sm"
                loading={saving}
                onClick={() => void save()}
              >
                Save<span className="sr-only"> {measure.label}</span>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setDraft(null);
                  setNote("");
                  summary.clear();
                }}
              >
                Undo
              </Button>
            </>
          )}
        </div>
      )}

      {/* The note the API has always accepted and nothing has ever rendered.
          `progressSchema` takes `{ currentValue, note }` and `recordProgress`
          has carried a third argument the whole time — so a number moved and
          the reason it moved was lost, which is the fact somebody actually
          needs at the review. It appears only once the number has changed:
          asking "what did you do" beside a figure nobody has touched is a
          question about nothing. */}
      {editable && changed && (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={2}
            aria-label={`What moved ${measure.label}`}
            placeholder="What moved it? Closed the Ikeja rollout…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SuggestButton
              loading={summary.loading}
              label="Write this up for me"
              onClick={() =>
                void summary.ask({ goalId, headline: note.trim() })
              }
            />
            {note.trim().length > 0 && note.trim().length < 10 && (
              <span className="text-meta text-muted">
                A few more words and it can draft the rest.
              </span>
            )}
          </div>
          <SuggestionPanel
            state={summary}
            onDismiss={summary.clear}
            useLabel="Use this wording"
            emptyHint="Your words, expanded. Check it before you save."
            /* Replaces the headline with the fuller version, in an editable box
               somebody still has to press Save under. The suggestion is built
               from what they typed and adds no achievement they did not
               mention — see `modules/ai/service.ts#suggestTaskSummary`. */
            onUse={(suggestion) =>
              setNote(suggestion.detail || suggestion.title)
            }
          />
        </div>
      )}

      {failed && (
        <p className="text-body-sm text-danger-text" role="status">
          {failed}
        </p>
      )}
    </li>
  );
}
