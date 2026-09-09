"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
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
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  ProgressMeter,
  SegmentedControl,
  FilterBar,
  Select,
  Spinner,
  Stat,
  Textarea,
  useToast,
  type AppliedFilter,
} from "@/components/ui";
import { NOTICE_LINK, NoticeLine } from "@/components/portal/notice-line";
import { LoadFailure } from "@/components/portal/load-failure";
import {
  SuggestButton,
  SuggestionPanel,
} from "@/components/performance/suggestions";
import { ApiError } from "@/lib/api/client";
import { useTaskSummarySuggestion } from "@/lib/store/ai";
import { useSession } from "@/lib/store/session";
import {
  formatMeasure,
  quarterLabel,
  type ApiGoal,
  type ApiKeyResult,
  type GoalStatus,
} from "@/lib/api/performance";
import {
  APPROVAL_TONE,
  GOAL_STATUS_LABEL,
  GOAL_STATUS_TONE,
  toCascade,
  SCOPE_LABEL,
  mayBeSubmitted,
  useKpiMutations,
  useKpis,
  useObjectiveMutations,
  type GoalNode,
  type KpiScope,
} from "@/lib/store/performance";
import { ApprovalReasonDialog } from "./approval-dialogs";
import {
  AddMeasureDialog,
  AssignKpiDialog,
  NewKpiDialog,
  StopKpiDialog,
} from "./goal-dialogs";
import { TaskLogPanel } from "./task-log";

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

/**
 * How the list is ordered, when it is not the cascade's own order.
 *
 * The default is deliberately **not** a date. The cascade sorts by rung —
 * company, then department, then personal — because the indentation is the
 * argument the screen is making, and a date order destroys it. So choosing a
 * date here **flattens the tree on purpose**, and the screen says so: what was
 * asked for is a chronological list, and a list is what it gives.
 */
const ORDERS = [
  ["updated", "Changed most recently"],
  ["created", "Newest first"],
  ["created-asc", "Oldest first"],
] as const;

type Order = (typeof ORDERS)[number][0];

export function KpisTab({
  scope,
  scopes,
  onScopeChange,
}: {
  scope: KpiScope;
  scopes: KpiScope[];
  onScopeChange: (scope: KpiScope) => void;
}) {
  const kpis = useKpis(scope);
  const mutations = useKpiMutations();
  const objectives = useObjectiveMutations();
  const toast = useToast();
  const { actingId } = useSession();

  const [creating, setCreating] = useState<{ parentId?: string } | null>(null);
  const [assigning, setAssigning] = useState<ApiGoal | null>(null);
  const [addingTo, setAddingTo] = useState<ApiGoal | null>(null);
  const [stopping, setStopping] = useState<ApiGoal | null>(null);
  const [completing, setCompleting] = useState<ApiGoal | null>(null);
  const [sending, setSending] = useState<ApiGoal | null>(null);
  const [reopening, setReopening] = useState<ApiGoal | null>(null);

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
  /** Empty means the cascade's own rung order. */
  const [order, setOrder] = useState<Order | "">("");

  /** Every write reports its own failure. The API's message is the useful part. */
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.push({ title: success, tone: "success" });
      kpis.reload();
      return true;
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
      return false;
    }
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
      if (!seen.has(goal.approval)) seen.set(goal.approval, goal.approvalLabel);
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
    if (!narrowing) return kpis.goals;
    return kpis.goals.filter((goal) => {
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
  }, [kpis.goals, narrowing, term, approval, progress, owner, period]);

  const cascade = useMemo(() => {
    if (order !== "") {
      /* Flat, every row a root. The card reads correctly at depth 0 — that is
         the path a company with no nesting already takes — and `parentTitle`
         on the row keeps the context the indentation was carrying. */
      const dated = [...matching].sort((a, b) => {
        if (order === "updated") return b.updatedAt.localeCompare(a.updatedAt);
        return order === "created"
          ? b.createdAt.localeCompare(a.createdAt)
          : a.createdAt.localeCompare(b.createdAt);
      });
      return dated.map((goal) => ({ ...goal, children: [], depth: 0 }));
    }
    /* `toCascade` already makes a goal whose parent is absent into a root
       rather than dropping it — the documented behaviour, and exactly what a
       search result wants: every match visible, with `parentTitle` to say what
       it sits under. */
    return narrowing ? toCascade(matching) : kpis.cascade;
  }, [order, narrowing, matching, kpis.cascade]);

  const clearFilters = () => {
    setSearch("");
    setApproval("");
    setProgress("");
    setOwner("");
    setPeriod("");
    setOrder("");
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

  /* Same rule as `GoalBranch` applies to a node's children, applied to the
     roots: no ladder between peers, so peers pair up, and anything heading a
     cascade keeps its own row. */
  const rootLeaves = cascade.filter((node) => node.children.length === 0);
  const rootBranches = cascade.filter((node) => node.children.length > 0);

  const tracked = kpis.goals.filter((goal) => goal.status !== "DONE");
  const waiting = kpis.goals.filter(
    (goal) => goal.approval === "AWAITING_APPROVAL",
  );
  const unsent = kpis.goals.filter(
    (goal) => goal.approval === "DRAFT" || goal.approval === "NEEDS_REVISION",
  );
  const attention = tracked.filter(
    (goal) => goal.status === "AT_RISK" || goal.status === "OFF_TRACK",
  );
  const measures = kpis.goals.flatMap((goal) => goal.keyResults);
  const hit = measures.filter((measure) => measure.met).length;
  /* Null, not 0. A mean over nothing is not zero progress — it is no progress
     recorded, and the two read identically on a Stat while meaning opposite
     things. Same rule the module's own `period-status.tsx` states with
     `notYet`. */
  const average =
    tracked.length === 0
      ? null
      : Math.round(
          tracked.reduce(
            (sum, goal) => sum + (goal.measuredProgress ?? goal.progress),
            0,
          ) / tracked.length,
        );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {scopes.length > 1 ? (
          <SegmentedControl<KpiScope>
            label="Whose KPIs to show"
            value={scope}
            onChange={onScopeChange}
            options={scopes.map((id) => ({
              value: id,
              label: SCOPE_LABEL[id],
            }))}
          />
        ) : (
          <span className="text-body-sm text-muted">{SCOPE_LABEL[scope]}</span>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {DEMO_ENABLED && kpis.source === "demo" && (
            <Badge tone="warning" size="sm">
              Demo · numbers stay in this browser
            </Badge>
          )}
          {mutations.editable && (
            <Button variant="accent" size="sm" onClick={() => setCreating({})}>
              <Plus aria-hidden="true" className="size-4" />
              New KPI
            </Button>
          )}
        </div>
      </div>

      <LoadFailure
        subject="the KPI cascade"
        error={kpis.error}
        onRetry={kpis.reload}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="KPIs being tracked" value={String(tracked.length)} />
        <Stat
          label="Average progress"
          value={average === null ? "Nothing tracked yet" : `${average}%`}
          {...(average === null
            ? {}
            : {
                hint:
                  tracked.length === 1
                    ? "across 1 KPI"
                    : `across ${tracked.length} KPIs`,
              })}
        />
        <Stat
          label="Needs attention"
          value={String(attention.length)}
          {...(attention.length > 0
            ? { trend: { direction: "down" as const, label: "Behind" } }
            : {})}
        />
        <Stat
          label="Measures at target"
          /* "0 of 0" is a measurement of a set nobody has created. */
          value={
            measures.length === 0
              ? "None set yet"
              : `${hit} of ${measures.length}`
          }
        />
      </div>

      {/* Delivery against objectives is one of the four parts an appraisal is
          made of, and only an **agreed** objective counts towards it. Somebody
          whose KPIs are all drafts is somebody who will be unscored on that
          part, so the count is on the page rather than discovered at the end of
          the period.

          A line, not a panel. This was a tinted box headed "Not everything here
          can be scored yet" over a sentence explaining what an agreed objective
          counts towards — the product explaining its own scoring rules to
          somebody who came to look at their objectives. The two counts are the
          fact; `NoticeLine` carries the argument. */}
      {waiting.length > 0 && (
        <NoticeLine tone="warning">
          <span>
            {waiting.length === 1
              ? "1 objective is waiting to be agreed"
              : `${waiting.length} objectives are waiting to be agreed`}
          </span>
          <Link href="/performance/approvals" className={NOTICE_LINK}>
            See what is waiting
          </Link>
        </NoticeLine>
      )}
      {unsent.length > 0 && (
        <NoticeLine tone="warning">
          {unsent.length === 1
            ? "1 objective has not been sent for approval yet"
            : `${unsent.length} objectives have not been sent for approval yet`}
        </NoticeLine>
      )}

      <Card>
        <CardHeader
          title="The cascade"
          description="Company KPI at the top. Everything below ladders up to it."
        />
        {kpis.goals.length > 0 && !kpis.loading && (
          <CardBody className="pb-0">
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchLabel="Search objectives by title or detail"
              searchPlaceholder="Search objectives…"
              applied={applied}
              {...(narrowing || order !== ""
                ? { onClearAll: clearFilters }
                : {})}
              count={narrowing ? matching.length : undefined}
              noun={["objective", "objectives"]}
              sort={
                <Select
                  aria-label="Order the list"
                  value={order}
                  onChange={(event) =>
                    setOrder(event.target.value as Order | "")
                  }
                >
                  <option value="">The cascade&rsquo;s own order</option>
                  {ORDERS.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              }
            >
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
                {(
                  ["ON_TRACK", "AT_RISK", "OFF_TRACK", "DONE"] as GoalStatus[]
                ).map((key) => (
                  <option key={key} value={key}>
                    {GOAL_STATUS_LABEL[key]}
                  </option>
                ))}
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
            </FilterBar>
            {(narrowing || order !== "") && (
              /* Two separate facts, each said only when it is true.
                 -------------------------------------------------------------
                 The figures above are the company's and do not move with a
                 filter: a reader who takes "24 being tracked" as the size of
                 the list below has been misled by a number that was never
                 about the list. And a date order flattens the cascade, which
                 is a change to *what* they are looking at rather than to how
                 much of it — so it is said whether or not anything is
                 filtered. */
              <p className="mt-3 text-meta text-muted">
                {narrowing &&
                  `Showing ${String(matching.length)} of ${String(kpis.goals.length)}. The figures above are for everything, not for what is filtered here.`}
                {narrowing && order !== "" && " "}
                {order !== "" &&
                  "Ordered by date, so the ladder is flattened — nothing is nested while this is on."}
              </p>
            )}
          </CardBody>
        )}
        {kpis.loading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading KPIs
          </CardBody>
        ) : narrowing && matching.length === 0 ? (
          /* Distinct from "No KPIs yet". Nothing matching a search is not a
             company with no objectives, and offering "New KPI" to somebody who
             mistyped a name would answer a question they did not ask. */
          <EmptyState
            icon={<Target aria-hidden="true" />}
            title="Nothing matches that"
            description={`${String(kpis.goals.length)} objectives are here, and none of them fits what you have narrowed to.`}
            action={
              <Button variant="ghost" onClick={clearFilters}>
                Clear the filters
              </Button>
            }
          />
        ) : kpis.cascade.length === 0 ? (
          <EmptyState
            icon={<Target aria-hidden="true" />}
            title="No KPIs yet"
            description="Start with one company KPI, then hang each team's under it."
            action={
              mutations.editable ? (
                <Button variant="accent" onClick={() => setCreating({})}>
                  New KPI
                </Button>
              ) : undefined
            }
          />
        ) : (
          <CardBody className="flex flex-col gap-3">
            {/* Roots pair up too, on the same rule the branches use.
                ------------------------------------------------------------
                The grid was originally only applied to a node's *children*,
                which quietly did nothing for the commonest shape there is: a
                company whose objectives are a flat list rather than a
                cascade. Read against a real company with nine objectives and
                no nesting at all, every card was at depth 0, no node had
                children, and the grid never rendered — nine full-width cards
                in one column, which is the exact scroll this change set out
                to remove.

                So the split is applied here as well: a root with nothing
                under it is a leaf like any other and can sit beside its
                peers, while a root that heads a cascade stays full width so
                the things indented beneath it read as beneath it. */}
            {rootLeaves.length > 0 && (
              <div className="grid gap-3 lg:grid-cols-2 min-[1600px]:grid-cols-3">
                {rootLeaves.map((node) => (
                  <GoalCard
                    key={node.id}
                    goal={node}
                    depth={node.depth}
                    editable={mutations.editable}
                    actingId={actingId}
                    onAddMeasure={setAddingTo}
                    onAddChild={(parentId) => setCreating({ parentId })}
                    onAssign={setAssigning}
                    onComplete={setCompleting}
                    onStop={setStopping}
                    onShare={(goal) =>
                      void run(
                        () => mutations.shareGoal(goal.id),
                        `"${goal.title}" shared`,
                      )
                    }
                    onSubmit={setSending}
                    onReopen={setReopening}
                    onRecord={async (measureId, value, note) => {
                      await mutations.recordProgress(measureId, value, note);
                      if (kpis.source === "api") kpis.reload();
                    }}
                  />
                ))}
              </div>
            )}

            {rootBranches.map((node) => (
              <GoalBranch
                key={node.id}
                node={node}
                editable={mutations.editable}
                actingId={actingId}
                onAddMeasure={setAddingTo}
                onAddChild={(parentId) => setCreating({ parentId })}
                onAssign={setAssigning}
                onComplete={setCompleting}
                onStop={setStopping}
                onShare={(goal) =>
                  void run(
                    () => mutations.shareGoal(goal.id),
                    `"${goal.title}" shared`,
                  )
                }
                onSubmit={setSending}
                onReopen={setReopening}
                onRecord={async (measureId, value, note) => {
                  await mutations.recordProgress(measureId, value, note);
                  if (kpis.source === "api") kpis.reload();
                }}
              />
            ))}
          </CardBody>
        )}
      </Card>

      {creating && (
        <NewKpiDialog
          parentId={creating.parentId}
          parentTitle={
            creating.parentId
              ? kpis.goals.find((goal) => goal.id === creating.parentId)?.title
              : undefined
          }
          onClose={() => setCreating(null)}
          onCreate={async (body) => {
            const ok = await run(() => mutations.createGoal(body), "KPI added");
            if (ok) setCreating(null);
          }}
        />
      )}

      {assigning && (
        <AssignKpiDialog
          parent={{
            id: assigning.id,
            title: assigning.title,
            departmentId: assigning.departmentId,
            dueQuarter: assigning.dueQuarter,
          }}
          onClose={() => setAssigning(null)}
          onAssign={async (parentId, body) => {
            const result = await mutations.assignObjective(parentId, body);
            /* The count, not the intent. Somebody who picked eight and saw six
               appear is owed the two names rather than a tick — and "already
               had it" is a perfectly good outcome, so it is not an error. */
            toast.push({
              title:
                result.created.length === 1
                  ? "1 KPI assigned"
                  : `${result.created.length} KPIs assigned`,
              tone: "success",
              ...(result.alreadyHad.length > 0
                ? {
                    detail: `${result.alreadyHad
                      .map((one) => one.name)
                      .join(", ")} already had it.`,
                  }
                : {}),
            });
            kpis.reload();
            setAssigning(null);
            return result;
          }}
        />
      )}

      {addingTo && (
        <AddMeasureDialog
          goalTitle={addingTo.title}
          onClose={() => setAddingTo(null)}
          onAdd={async (body) => {
            const ok = await run(
              () => mutations.addKeyResult(addingTo.id, body),
              "Measure added",
            );
            if (ok) setAddingTo(null);
          }}
        />
      )}

      {stopping && (
        <StopKpiDialog
          goalTitle={stopping.title}
          onClose={() => setStopping(null)}
          onStop={async (reason) => {
            const ok = await run(
              () => mutations.cancelGoal(stopping.id, reason),
              `"${stopping.title}" stopped`,
            );
            if (ok) setStopping(null);
          }}
        />
      )}

      {reopening && (
        <ApprovalReasonDialog
          act="revise"
          goalTitle={reopening.title}
          onClose={() => setReopening(null)}
          onConfirm={async (reason) => {
            const ok = await run(
              () => objectives.revise(reopening.id, reason),
              `"${reopening.title}" reopened: it has to be agreed again`,
            );
            if (ok) setReopening(null);
          }}
        />
      )}

      <ConfirmDialog
        open={sending !== null}
        onClose={() => setSending(null)}
        title={`Send "${sending?.title ?? ""}" to be agreed?`}
        confirmLabel="Send it"
        tone="primary"
        onConfirm={async () => {
          if (!sending) return;
          const ok = await run(
            () => objectives.submit(sending.id),
            `"${sending.title}" sent to be agreed`,
          );
          if (ok) setSending(null);
        }}
        body={
          /* What is worth confirming is not the sending — that can be sent
             back. It is what agreement does, because the next press is
             somebody else's and there is no dialog in front of that one: the
             target freezes and a measure can no longer be added at all.
             Anybody who still means to add one has to know before this click
             rather than after theirs. */
          <>
            <p>
              {sending?.ownerName
                ? `It goes to whoever agrees ${sending.ownerName}'s objectives — their manager, or somebody who can edit records. Nobody agrees their own.`
                : "It goes to somebody who can agree it. Nobody agrees their own."}
            </p>
            <p className="mt-2">
              Once it is agreed the target is fixed: the title, the period and
              every measure&rsquo;s target stop moving, and no new measure can
              be added. Progress still moves. Changing what was asked for after
              that takes a recorded revision.
            </p>
            {sending !== null && sending.keyResults.length === 0 && (
              <p className="mt-2 text-warning-text">
                It has no measure on it, so it will be scored on a figure
                somebody states by hand. Add one first if it should be measured.
              </p>
            )}
            {sending !== null && sending.reviewCycleId === null && (
              <p className="mt-2 text-warning-text">
                It is not in an appraisal period, so agreeing it counts towards
                nobody&rsquo;s mark — and the period is one of the fields that
                freezes, so it cannot be added afterwards.
              </p>
            )}
          </>
        }
      />

      <ConfirmDialog
        open={completing !== null}
        onClose={() => setCompleting(null)}
        title={`Mark "${completing?.title ?? ""}" done?`}
        confirmLabel="Mark done"
        tone="primary"
        onConfirm={async () => {
          if (!completing) return;
          const ok = await run(
            () => mutations.completeGoal(completing.id),
            `"${completing.title}" marked done`,
          );
          if (ok) setCompleting(null);
        }}
        body={
          completing && completing.keyResults.some((measure) => !measure.met)
            ? `${completing.keyResults.filter((m) => !m.met).length} of its measures are short of target. Done is your call, and the numbers stay as they are.`
            : "Progress goes to 100% and it drops out of the tracked list."
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** One rung of the ladder, and everything beneath it. */
function GoalBranch({
  node,
  editable,
  actingId,
  onAddMeasure,
  onAddChild,
  onAssign,
  onComplete,
  onStop,
  onShare,
  onSubmit,
  onReopen,
  onRecord,
}: {
  node: GoalNode;
  editable: boolean;
  /** Signed-in person's own employee id — decides who may log a task. */
  actingId: string | null;
  onAddMeasure: (goal: ApiGoal) => void;
  onAddChild: (parentId: string) => void;
  onAssign: (goal: ApiGoal) => void;
  onComplete: (goal: ApiGoal) => void;
  onStop: (goal: ApiGoal) => void;
  onShare: (goal: ApiGoal) => void;
  onSubmit: (goal: ApiGoal) => void;
  onReopen: (goal: ApiGoal) => void;
  onRecord: (measureId: string, value: string, note?: string) => Promise<void>;
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
        onAddMeasure={onAddMeasure}
        onAddChild={onAddChild}
        onAssign={onAssign}
        onComplete={onComplete}
        onStop={onStop}
        onShare={onShare}
        onSubmit={onSubmit}
        onReopen={onReopen}
        onRecord={onRecord}
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
              onAddMeasure={onAddMeasure}
              onAddChild={onAddChild}
              onAssign={onAssign}
              onComplete={onComplete}
              onStop={onStop}
              onShare={onShare}
              onSubmit={onSubmit}
              onReopen={onReopen}
              onRecord={onRecord}
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
          onAddMeasure={onAddMeasure}
          onAddChild={onAddChild}
          onAssign={onAssign}
          onComplete={onComplete}
          onStop={onStop}
          onShare={onShare}
          onSubmit={onSubmit}
          onReopen={onReopen}
          onRecord={onRecord}
        />
      ))}
    </div>
  );
}

/** Which rung this is. Derived, so it cannot disagree with the data. */
/**
 * Which rung of the ladder this is, in words.
 *
 * From the API's own `level` rather than guessed. It used to read
 * `childCount > 0 ? "Team KPI"`, which labelled a **personal** KPI that
 * happened to have children as the team's — a guess that was wrong exactly
 * where the cascade matters. A department objective names its department,
 * because "Department objective" without saying which one is half a fact.
 */
function rungLabel(goal: ApiGoal): string {
  if (goal.level === "company") return "Company KPI";
  if (goal.level === "department") {
    return goal.departmentName
      ? `${goal.departmentName} objective`
      : "Department objective";
  }
  return "Personal KPI";
}

function GoalCard({
  goal,
  depth,
  editable,
  actingId,
  onAddMeasure,
  onAddChild,
  onAssign,
  onComplete,
  onStop,
  onShare,
  onSubmit,
  onReopen,
  onRecord,
}: {
  goal: ApiGoal;
  depth: number;
  editable: boolean;
  /** Signed-in person's own employee id — decides who may log a task. */
  actingId: string | null;
  onAddMeasure: (goal: ApiGoal) => void;
  onAddChild: (parentId: string) => void;
  onAssign: (goal: ApiGoal) => void;
  onComplete: (goal: ApiGoal) => void;
  onStop: (goal: ApiGoal) => void;
  onShare: (goal: ApiGoal) => void;
  onSubmit: (goal: ApiGoal) => void;
  onReopen: (goal: ApiGoal) => void;
  onRecord: (measureId: string, value: string, note?: string) => Promise<void>;
}) {
  const progress = goal.measuredProgress ?? goal.progress;
  const done = goal.status === "DONE";
  const canShare = goal.dueQuarter !== null && goal.keyResults.length > 0;
  const rung = rungLabel(goal);
  /* Only the goal's own owner may log a task against it — the API's own
     rule (`submitTask` throws for anybody else) — and only once it is
     agreed, matching the objective/delivery scoring it feeds. */
  const canLogTasks =
    !done && goal.approval === "AGREED" && actingId === goal.ownerId;
  /* Nothing to agree against: the API refuses to send an objective that belongs
     to no period, because one agreed for no period cannot be agreed before it. */
  const noPeriod = goal.reviewCycleId === null && goal.dueQuarter === null;

  /* The detail is a modal, and this is the card's only piece of state.
     Everything the modal renders comes from the same `goal` the card has, so
     opening one costs no request and cannot show a different reading of the
     objective from the one on the card behind it. */
  const [open, setOpen] = useState(false);

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
          className="flex w-full flex-col gap-2.5 rounded-lg p-3.5 text-left transition-colors hover:border-accent-line hover:bg-sunken/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        >
          <div className="flex w-full items-start justify-between gap-3">
            <div className="flex min-w-0 gap-2.5">
              {depth > 0 && (
                <CornerDownRight
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-faint"
                />
              )}
              <p className="min-w-0 text-body-sm font-medium text-ink">
                {goal.title}
              </p>
            </div>
            <span className="tabular shrink-0 text-body-sm font-medium text-ink">
              {progress}%
            </span>
          </div>

          <ProgressMeter
            value={progress}
            size="sm"
            showValue={false}
            tone={
              done
                ? "ink"
                : goal.status === "OFF_TRACK"
                  ? "danger"
                  : goal.status === "AT_RISK"
                    ? "warning"
                    : "accent"
            }
          />

          <div className="flex w-full flex-wrap items-center justify-between gap-2 text-meta text-muted">
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
            <span className="flex shrink-0 flex-wrap items-center gap-1.5">
              <Badge tone={APPROVAL_TONE[goal.approval]} size="sm" dot>
                {goal.approvalLabel}
              </Badge>
              <Badge tone={GOAL_STATUS_TONE[goal.status]} size="sm" dot>
                {GOAL_STATUS_LABEL[goal.status]}
              </Badge>
            </span>
          </div>
        </button>

        {goal.approvalNote && (
          <p className="mx-3.5 mb-3.5 border-l-2 border-line-strong pl-3 text-body-sm leading-relaxed text-body">
            {goal.approvalNote}
          </p>
        )}
      </div>

      <GoalDetailModal
        goal={goal}
        open={open}
        onClose={() => setOpen(false)}
        rung={rung}
        progress={progress}
        done={done}
        canShare={canShare}
        canLogTasks={canLogTasks}
        noPeriod={noPeriod}
        editable={editable}
        onAddMeasure={onAddMeasure}
        onAddChild={onAddChild}
        onAssign={onAssign}
        onComplete={onComplete}
        onStop={onStop}
        onShare={onShare}
        onSubmit={onSubmit}
        onReopen={onReopen}
        onRecord={onRecord}
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
  canLogTasks,
  noPeriod,
  editable,
  onAddMeasure,
  onAddChild,
  onAssign,
  onComplete,
  onStop,
  onShare,
  onSubmit,
  onReopen,
  onRecord,
}: {
  goal: ApiGoal;
  open: boolean;
  onClose: () => void;
  rung: string;
  progress: number;
  done: boolean;
  canShare: boolean;
  canLogTasks: boolean;
  noPeriod: boolean;
  editable: boolean;
  onAddMeasure: (goal: ApiGoal) => void;
  onAddChild: (parentId: string) => void;
  onAssign: (goal: ApiGoal) => void;
  onComplete: (goal: ApiGoal) => void;
  onStop: (goal: ApiGoal) => void;
  onShare: (goal: ApiGoal) => void;
  onSubmit: (goal: ApiGoal) => void;
  onReopen: (goal: ApiGoal) => void;
  onRecord: (measureId: string, value: string, note?: string) => Promise<void>;
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
            {goal.approvalLabel}
          </Badge>
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
                ? "Target reopened once"
                : `Target reopened ${goal.revisionCount} times`}
            </span>
          )}
          {goal.parentTitle && <span>Under {goal.parentTitle}</span>}
        </div>

        <ProgressMeter
          value={progress}
          showValue
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
          label={
            goal.keyResults.length === 0
              ? "Progress, entered by hand"
              : goal.keyResults.length === 1
                ? "Progress, from 1 measure"
                : `Progress, from ${goal.keyResults.length} measures`
          }
        />

        {goal.keyResults.length > 0 ? (
          <ul className="flex flex-col gap-3 border-t border-line pt-4">
            {goal.keyResults.map((measure) => (
              <MeasureRow
                key={measure.id}
                measure={measure}
                goalId={goal.id}
                editable={!done}
                onRecord={onRecord}
              />
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-body">
            No measure yet, so nothing tracks itself.
          </p>
        )}

        {canLogTasks && (
          <TaskLogPanel goalId={goal.id} keyResults={goal.keyResults} />
        )}

        {/* What the freeze actually costs, said before anything is refused —
            and now directly above the buttons it explains the absence of. The
            target is frozen and progress is not, and the two halves are easy
            to confuse into "this KPI is finished". */}
        {goal.targetFrozen && (
          <p className="border-t border-line pt-4 text-body-sm text-muted">
            Agreed, so the target is fixed: the title, the period and every
            measure&apos;s target stay as they are, and no measure can be added
            because that would change what delivering this means. The numbers
            still move.
          </p>
        )}

        {noPeriod && goal.approval !== "AGREED" && (
          <p className="text-body-sm text-body">
            Give this a quarter before it can be sent to be agreed. An objective
            agreed for no period cannot be agreed before it.
          </p>
        )}

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {/* The lifecycle moves need no permission — the API checks the
              reporting line — so they are offered whatever `editable` says
              about writing goals. Sending your own objective to be agreed is a
              thing you do to your own work. */}
          {mayBeSubmitted(goal) && (
            <Button
              variant="accent"
              size="sm"
              onClick={act(() => onSubmit(goal))}
            >
              {goal.approval === "NEEDS_REVISION"
                ? "Send it again"
                : "Send to be agreed"}
            </Button>
          )}
          {goal.approval === "AGREED" && !done && (
            <Button size="sm" onClick={act(() => onReopen(goal))}>
              Reopen the target
            </Button>
          )}

          {editable && (
            <>
              {/* Refused by the API on an agreed objective, so it is not
                  offered. The sentence above says why rather than leaving a
                  gap. */}
              {!goal.targetFrozen && (
                <Button size="sm" onClick={act(() => onAddMeasure(goal))}>
                  <Plus aria-hidden="true" className="size-4" />
                  Add a measure
                </Button>
              )}
              <Button size="sm" onClick={act(() => onAddChild(goal.id))}>
                Add a KPI under this
              </Button>
              {/* Only on a shared objective. Somebody's personal KPI is not a
                  thing to give a team, and the API refuses it — so the button
                  is absent rather than offering a refusal. */}
              {goal.ownerId === null && (
                <Button size="sm" onClick={act(() => onAssign(goal))}>
                  Give a KPI to people
                </Button>
              )}
              {canShare && (
                <Button size="sm" onClick={act(() => onShare(goal))}>
                  Tell the people affected
                </Button>
              )}
              {!done && (
                <>
                  <Button size="sm" onClick={act(() => onComplete(goal))}>
                    Mark done
                  </Button>
                  <Button size="sm" onClick={act(() => onStop(goal))}>
                    Stop this KPI
                  </Button>
                </>
              )}
            </>
          )}
        </div>
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
function MeasureRow({
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

  const value = draft ?? measure.currentValue;
  const changed = draft !== null && draft.trim() !== measure.currentValue;

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
          {measure.met && (
            <Badge tone="accent" size="sm" icon={<Check aria-hidden="true" />}>
              At target
            </Badge>
          )}
        </span>
      </div>

      <ProgressMeter
        value={measure.percent}
        showValue
        size="sm"
        tone={measure.met ? "ink" : "accent"}
      />

      <p className="tabular text-body-sm text-body">
        Now {formatMeasure(measure.currentValue, measure.unit)} · target{" "}
        {formatMeasure(measure.targetValue, measure.unit)} · started at{" "}
        {formatMeasure(measure.startValue, measure.unit)}
      </p>

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={`Latest number for ${measure.label}`}
            inputMode="decimal"
            className="h-8 w-36"
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
