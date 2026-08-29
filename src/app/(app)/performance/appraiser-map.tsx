"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Network, Plus, Trash2, Wand2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Stat,
  Switch,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import {
  APPRAISER_ROLES,
  APPRAISER_ROLE_HELP,
  APPRAISER_ROLE_LABEL,
  EXCEPTION_CODE_SUMMARY,
  FULL_WEIGHT_BP,
  evenWeights,
  groupExceptionsByCode,
  weightLabel,
  weightProblem,
  type ApiAppraiserEntry,
  type ApiAppraiserMapRow,
  type AppraiserRole,
} from "@/lib/api/performance";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import {
  useAppraiserMap,
  useAppraiserMutations,
  useAppraisals,
} from "@/lib/store/performance";

/**
 * Who appraises whom — the power-user surface, and only when it is asked for.
 *
 * ## This tab does not exist for most companies
 *
 * `multiAppraiser` is off by default and the setup wizard never asks about it. A
 * company with one manager per person sees no tab, no roles, no weights and
 * never the word "matrix" — their mapping is filled in for them when a cycle
 * starts (one line manager each, at 100%) and nothing here is needed to run an
 * appraisal. That is the default, and it is the whole reason this is a flag
 * rather than a feature.
 *
 * ## What it shows, and why it is shaped like a payroll run
 *
 * An employee with no appraiser in an open cycle is the performance module's
 * missing bank account: every screen looks finished and one person silently
 * finishes the period with no mark. The payroll run answers that shape with a
 * blockers list, so this does too — **exceptions first, by name, before the
 * table**, and the API decides the severity so the two cannot disagree.
 *
 * ## The weight rule lives on the server
 *
 * `setAppraisers` refuses a set that does not sum to exactly 100%. The dialog
 * checks the same thing with `weightProblem` so the refusal arrives while
 * somebody is still looking at the row — but it checks it **as well as**, never
 * instead of, and the words are the same words. HANDOVER's register is full of
 * client-side rules that were not real rules.
 */
export function AppraiserMapTab() {
  /* The cycle list is fetched here rather than passed down from the screen, so
     opening `/performance` on the KPI tab does not request it. */
  const { cycles, loading: cyclesLoading } = useAppraisals();
  const mutations = useAppraiserMutations();
  const toast = useToast();

  /**
   * The cycle that is actually running, else the newest.
   *
   * Not the first in the list: a published cycle is history and a draft has
   * nothing wrong with it yet, so the one somebody opened this to look at is the
   * one people are currently being marked in.
   */
  const suggested =
    cycles.find(
      (cycle) => cycle.stage !== "PUBLISHED" && cycle.stage !== "DRAFT",
    ) ?? cycles[0];

  const [chosen, setChosen] = useState<string | null>(null);
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [editing, setEditing] = useState<ApiAppraiserMapRow | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  /* Fetched once for the whole table rather than once per row — a period of two
     hundred people would otherwise open two hundred identical requests. The
     dialog fetches its own copy because it is also opened from the period
     screen, where this tab is not mounted. */
  const { employees } = useEmployeeDirectory({ pageSize: 200 });
  const people = useMemo(
    () =>
      employees.map((person) => ({
        id: person.id,
        name: `${person.firstName} ${person.lastName}`,
        jobTitle: person.jobTitle,
      })),
    [employees],
  );

  const cycleId =
    chosen && cycles.some((cycle) => cycle.id === chosen)
      ? chosen
      : (suggested?.id ?? null);

  const { map, loading, error, editable, refusal, reload } = useAppraiserMap(
    cycleId,
    {
      exceptionsOnly,
    },
  );

  if (!editable) {
    return (
      <Callout tone="warning" title="The mapping needs the API">
        {refusal}
      </Callout>
    );
  }

  if (cyclesLoading && cycles.length === 0) {
    return (
      <p className="flex items-center gap-2 text-body-sm text-muted">
        <Spinner size="sm" />
        Reading the appraisal periods
      </p>
    );
  }

  if (cycles.length === 0) {
    return (
      <EmptyState
        icon={<Network aria-hidden="true" />}
        title="No appraisal periods yet"
        description="A mapping belongs to one appraisal period: who was best placed to judge somebody last half is not who is best placed this half. Start a period first."
      />
    );
  }

  const blockers =
    map?.rows.flatMap((row) =>
      row.exceptions
        .filter((issue) => issue.severity === "BLOCKER")
        .map((issue) => ({ key: `${row.employeeId}-${issue.code}`, ...issue })),
    ) ?? [];
  const warnings =
    map?.rows.flatMap((row) =>
      row.exceptions
        .filter((issue) => issue.severity === "WARNING")
        .map((issue) => ({ key: `${row.employeeId}-${issue.code}`, ...issue })),
    ) ?? [];

  /**
   * One appraiser, at 100%, saved from the row.
   *
   * The same `PUT` the dialog sends — a set of one at the full weight — so the
   * server rule that a set makes exactly 100% is satisfied by construction
   * rather than waived. Errors are thrown rather than swallowed: the row shows
   * the API's own sentence under itself, because a pick that silently did
   * nothing is the failure this whole change is about.
   */
  const quickAssign = async (row: ApiAppraiserMapRow, appraiserId: string) => {
    if (!cycleId) return;
    await mutations.setAppraisers(cycleId, row.employeeId, [
      { appraiserId, role: "LINE_MANAGER", weightBp: FULL_WEIGHT_BP },
    ]);
    toast.push({
      title: `${people.find((one) => one.id === appraiserId)?.name ?? "They"} now appraises ${row.employeeName}`,
      tone: "success",
      detail: "As their line manager, for the whole mark. Change it any time.",
    });
    reload();
  };

  const autoAssign = async () => {
    if (!cycleId) return;
    setAutoBusy(true);
    try {
      const result = await mutations.autoAssign(cycleId);
      toast.push({
        title:
          result.created === 0
            ? "Everybody already has an appraiser"
            : result.created === 1
              ? "1 person given their line manager"
              : `${result.created} people given their line manager`,
        tone: "success",
        /* Named, not counted. These are the people who would otherwise finish
           the period with no mark at all. */
        ...(result.withoutManager.length > 0
          ? {
              detail: `Still nobody appraising: ${result.withoutManager.join(", ")}. They have no manager either — assign somebody by hand.`,
            }
          : {}),
      });
      reload();
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
      setAutoBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Appraisal period" className="min-w-[16rem]">
          <Select
            value={cycleId ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              setChosen(value);
            }}
          >
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name} — {cycle.stageLabel}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Switch
            label="Only what is wrong"
            checked={exceptionsOnly}
            onChange={(event) => setExceptionsOnly(event.target.checked)}
          />
          <Button
            variant="secondary"
            size="sm"
            loading={autoBusy}
            disabled={autoBusy}
            onClick={() => void autoAssign()}
          >
            <Wand2 aria-hidden="true" className="size-4" />
            Fill in the obvious
          </Button>
        </div>
      </div>

      <LoadFailure subject="the appraiser mapping" error={error}  onRetry={reload}/>

      {map && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="People in the period"
            value={String(map.counts.people)}
          />
          <Stat
            label="One manager, 100%"
            value={String(map.counts.simple)}
            hint="nobody had to configure these"
          />
          <Stat
            label="Several appraisers"
            value={String(map.counts.multiAppraiser)}
            hint="with roles and weights"
          />
          <Stat
            label="Nobody appraising"
            value={String(map.counts.unassigned)}
            trend={
              map.counts.unassigned > 0
                ? { direction: "down", label: "Would get no mark" }
                : undefined
            }
          />
        </div>
      )}

      {/* Exceptions first, before the table, in the shape the payroll run uses.
          A blocker buried in row 40 of a table is a blocker nobody read. */}
      {(blockers.length > 0 || warnings.length > 0) && (
        <Card>
          <CardHeader
            title={
              blockers.length > 0
                ? blockers.length === 1
                  ? "1 thing will produce a mark nobody can defend"
                  : `${blockers.length} things will produce marks nobody can defend`
                : "Worth a look"
            }
            description={
              map?.started
                ? "This period is running, so these are live."
                : "Nothing has started yet, so none of this is final."
            }
          />
          <CardBody className="flex flex-col gap-2">
            {groupExceptionsByCode([...blockers, ...warnings]).map((group) => {
              const tone =
                group.severity === "BLOCKER"
                  ? "border-danger-line bg-danger-soft text-ink"
                  : "border-warning-line bg-warning-soft text-ink";
              const icon =
                group.severity === "BLOCKER"
                  ? "text-danger-text"
                  : "text-warning-text";

              /* One person, one problem — the full sentence, exactly as
                 before. A single line is not a wall of anything, and naming
                 them by name here is more useful than a count of one. */
              if (group.items.length === 1) {
                const issue = group.items[0]!;
                return (
                  <p
                    key={issue.key}
                    className={cn(
                      "flex gap-2.5 rounded-md border px-3.5 py-2.5 text-body-sm",
                      tone,
                    )}
                  >
                    <AlertTriangle
                      aria-hidden="true"
                      className={cn("mt-0.5 size-4 shrink-0", icon)}
                    />
                    <span>
                      <span className="sr-only">
                        {group.severity === "BLOCKER"
                          ? "Blocker: "
                          : "Warning: "}
                      </span>
                      {issue.message}
                    </span>
                  </p>
                );
              }

              /* Several people, the same problem — one line naming the count
                 rather than the same templated sentence repeated per name.
                 "Review and fix" is the filter already on this screen: the
                 table right below is where fixing one of them actually
                 happens, so there is nothing new to build here. */
              return (
                <div
                  key={group.code}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-body-sm",
                    tone,
                  )}
                >
                  <span className="flex gap-2.5">
                    <AlertTriangle
                      aria-hidden="true"
                      className={cn("mt-0.5 size-4 shrink-0", icon)}
                    />
                    <span>
                      <span className="sr-only">
                        {group.severity === "BLOCKER"
                          ? "Blocker: "
                          : "Warning: "}
                      </span>
                      {EXCEPTION_CODE_SUMMARY[
                        group.code as keyof typeof EXCEPTION_CODE_SUMMARY
                      ](group.items.length)}
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setExceptionsOnly(true)}
                  >
                    Review and fix
                  </Button>
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Who appraises whom"
          description="One line manager at 100% is the ordinary answer. Change it for the people a project lead or another department's manager actually judges."
        />
        {loading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Reading the mapping
          </CardBody>
        ) : !map || map.rows.length === 0 ? (
          <EmptyState
            compact
            icon={<Network aria-hidden="true" />}
            title={
              exceptionsOnly ? "Nothing is wrong" : "Nobody in this period"
            }
            description={
              exceptionsOnly
                ? "Everybody has an appraiser and every set of weights makes 100%."
                : "A period covers everybody who is still employed. Add people first."
            }
          />
        ) : (
          <CardBody className="flex flex-col gap-2">
            {map.rows.map((row) => (
              <PersonRow
                key={row.employeeId}
                row={row}
                people={people}
                onEdit={() => setEditing(row)}
                onQuickAssign={(appraiserId) => quickAssign(row, appraiserId)}
              />
            ))}
          </CardBody>
        )}
      </Card>

      {editing && cycleId && (
        <AppraisersDialog
          cycleId={cycleId}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One person, their appraisers, and what is wrong.
 *
 * The weighted mark is rendered beside **how much of the weight has answered**,
 * never on its own. A 3.4 that is 40% in and a 3.4 that is complete are
 * different claims, and only one of them is a mark.
 */
/**
 * One person, and — where nobody is appraising them — the whole fix in place.
 *
 * ## Why the assignment is on the row and not behind the dialog
 *
 * It used to take five interactions and two stacked modals to say the ordinary
 * thing: "this person's appraiser is that person". Review and fix, then Assign,
 * then Add an appraiser, then choose, then Save the mapping — with the second
 * modal opening on top of the first, which is its own problem.
 *
 * Four of those five exist to serve the case the dialog was built for: several
 * appraisers, each with a role and a share of the mark. That case is real and
 * the dialog stays for it. It is not the common case. **One line manager at
 * 100% is**, and the API models it as exactly that — a set of one at 10000
 * basis points — so nothing has to be relaxed to offer it in a single step.
 *
 * So the row picks a person and saves. Roles, shares and second appraisers are
 * still one click away, and the wording says so rather than hiding it.
 *
 * ## Saving on the pick, with no confirm step
 *
 * Deliberate. A confirm would put the click back that this is removing, and the
 * act is reversible in the place it was made: the row turns into "Change", the
 * dialog opens on what was just saved, and an empty set is a legitimate save
 * that undoes it. Nothing here is one-way, and the API refuses the two things
 * that would matter — appraising yourself, and dropping somebody who has
 * already sent a review.
 */
function PersonRow({
  row,
  people,
  onEdit,
  onQuickAssign,
}: {
  row: ApiAppraiserMapRow;
  /** Fetched once by the tab, not once per row. */
  people: { id: string; name: string; jobTitle: string }[];
  onEdit: () => void;
  onQuickAssign: (appraiserId: string) => Promise<void>;
}) {
  const [assigning, setAssigning] = useState(false);
  const [quickFailed, setQuickFailed] = useState<string | null>(null);
  const worst = row.exceptions.some((issue) => issue.severity === "BLOCKER")
    ? "BLOCKER"
    : row.exceptions.length > 0
      ? "WARNING"
      : null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border p-3",
        worst === "BLOCKER"
          ? "border-danger-line bg-danger-soft"
          : worst === "WARNING"
            ? "border-warning-line"
            : "border-line",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-ink">{row.employeeName}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-meta text-muted">
          <span>{row.jobTitle}</span>
          {row.departmentName && <span>{row.departmentName}</span>}
        </p>

        {row.appraisers.length === 0 ? (
          <p className="mt-2 text-body-sm text-ink">
            Nobody.
            {row.lineManagerName
              ? ` Their line manager is ${row.lineManagerName}.`
              : " They have no line manager either."}
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {row.appraisers.map((one) => (
              <li
                key={one.assignmentId}
                className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5"
              >
                {/* Submitted or not is a shape as well as a colour: a filled dot
                    for in, a ring for outstanding. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    one.submitted
                      ? "bg-success-strong"
                      : "border border-line-strong bg-transparent",
                  )}
                />
                <span className="text-meta text-ink">
                  {one.appraiserName}
                  <span className="text-muted">
                    {" · "}
                    {one.roleLabel}
                    {" · "}
                    {weightLabel(one.weightBp)}
                  </span>
                </span>
                <span className="sr-only">
                  {one.submitted ? "review sent" : "review outstanding"}
                </span>
                {one.unavailable && (
                  <Badge tone="danger" size="sm">
                    Has left
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className="text-meta text-faint">Mark</p>
        <p className="tabular text-body font-medium text-ink">
          {row.weightedRating === null ? "—" : row.weightedRating}
        </p>
        <p className="text-meta text-muted">
          {row.weightedRating === null
            ? "nothing in yet"
            : `${weightLabel(row.submittedWeightBp)} in`}
        </p>
      </div>

      {row.appraisers.length > 0 ? (
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Change
        </Button>
      ) : (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {/* The subject is filtered out here rather than left for the API to
                refuse: appraising yourself is not an option worth offering. */}
            <Select
              aria-label={`Appraiser for ${row.employeeName}`}
              className="min-w-[13rem]"
              disabled={assigning}
              value=""
              onChange={(event) => {
                const appraiserId = event.target.value;
                if (!appraiserId) return;
                setAssigning(true);
                setQuickFailed(null);
                void onQuickAssign(appraiserId)
                  .catch((error: unknown) => {
                    setQuickFailed(
                      error instanceof ApiError
                        ? error.message
                        : "That did not save. Try again.",
                    );
                  })
                  .finally(() => {
                    setAssigning(false);
                  });
              }}
            >
              <option value="">
                {assigning ? "Saving…" : "Assign an appraiser"}
              </option>
              {people
                .filter((person) => person.id !== row.employeeId)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} — {person.jobTitle}
                  </option>
                ))}
            </Select>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              More options
            </Button>
          </div>
          {quickFailed !== null && (
            <p className="text-meta text-danger-text">{quickFailed}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

type DraftRow = {
  appraiserId: string;
  role: AppraiserRole;
  /** Percent as typed. Converted to whole basis points on save, once. */
  weightPct: string;
  note: string;
};

const bpOf = (pct: string): number => Math.round(Number(pct || "0") * 100);

/**
 * The whole set for one person, replaced.
 *
 * ## Why the dialog sends the set and not one appraiser
 *
 * Because "the weights make 100%" is only checkable against a set. An endpoint
 * that added one appraiser at a time would leave the first of three sitting at
 * 34%, so either the rule is checked at some later moment nothing can see, or it
 * is not a rule. The API takes a `PUT` of the whole set for exactly that reason,
 * and this dialog is shaped to match it rather than the other way round.
 *
 * ## Adding a row re-splits the weights
 *
 * `evenWeights` splits in whole basis points that sum to exactly 10000 — three
 * ways is 33.34/33.33/33.33, not three 33.33s that make 99.99. Somebody who
 * wants an uneven split types over it; somebody who just wants three appraisers
 * never has to think about the arithmetic. This is the entire reason weights are
 * integer basis points rather than percentages.
 */
export function AppraisersDialog({
  cycleId,
  row,
  onClose,
  onSaved,
}: {
  cycleId: string;
  row: ApiAppraiserMapRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { employees } = useEmployeeDirectory({ pageSize: 200 });
  const { setAppraisers } = useAppraiserMutations();

  const [rows, setRows] = useState<DraftRow[]>(() =>
    row.appraisers.length > 0
      ? row.appraisers.map((one) => ({
          appraiserId: one.appraiserId,
          role: one.role,
          weightPct: String(one.weightBp / 100),
          note: one.note ?? "",
        }))
        : /* The obvious starting point: their line manager, all of it. Not an
             empty row — the ordinary answer should need no typing.

             With no line manager it is still one row rather than none, and that
             is a click removed: opening on an empty list meant pressing "Add an
             appraiser" before there was anything to choose from, on a dialog
             whose entire purpose is to choose one. An untouched blank row is
             filtered out of `entries`, so "nobody assigned" still reads as
             nobody assigned and saving an empty set still undoes a mapping. */
          [
            {
              appraiserId: row.lineManagerId ?? "",
              role: "LINE_MANAGER" as AppraiserRole,
              weightPct: "100",
              note: "",
            },
          ],
  );
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Everybody but the subject: the API refuses a self-appraisal outright. */
  const candidates = useMemo(
    () =>
      employees
        .filter((person) => person.id !== row.employeeId)
        .map((person) => ({
          id: person.id,
          name: `${person.firstName} ${person.lastName}`,
          jobTitle: person.jobTitle,
        })),
    [employees, row.employeeId],
  );

  /* Somebody who has already sent their review cannot be dropped — the API
     refuses it, because a submitted mark counting for nothing with no record of
     why is worse than a stale mapping. Their row is shown, and locked. */
  const submittedIds = new Set(
    row.appraisers.filter((one) => one.submitted).map((one) => one.appraiserId),
  );

  const entries: ApiAppraiserEntry[] = rows
    .filter((draft) => draft.appraiserId !== "")
    .map((draft) => ({
      appraiserId: draft.appraiserId,
      role: draft.role,
      weightBp: bpOf(draft.weightPct),
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    }));

  const weightIssue = weightProblem(entries);
  const duplicated =
    new Set(entries.map((entry) => entry.appraiserId)).size !== entries.length;
  const lineManagers = entries.filter(
    (entry) => entry.role === "LINE_MANAGER",
  ).length;
  const missingSubmitted = [...submittedIds].filter(
    (id) => !entries.some((entry) => entry.appraiserId === id),
  );

  /* Every one of these is the API's rule, checked here so it lands while the row
     is still on screen. The server is where each of them is real. */
  const localProblem = duplicated
    ? "The same person is listed twice. One appraiser, one row, one role."
    : lineManagers > 1
      ? "Only one person can be the line manager. Make the others functional managers or project leads."
      : missingSubmitted.length > 0
        ? `${row.appraisers
            .filter((one) => missingSubmitted.includes(one.appraiserId))
            .map((one) => one.appraiserName)
            .join(
              ", ",
            )} already sent their review. Change their weight rather than taking them off.`
        : entries.some((entry) => entry.weightBp < 1)
          ? "An appraiser with no weight is not an appraiser. Remove the row instead."
          : weightIssue;

  const setRow = (index: number, patch: Partial<DraftRow>) =>
    setRows((current) =>
      current.map((draft, at) =>
        at === index ? { ...draft, ...patch } : draft,
      ),
    );

  const addRow = () =>
    setRows((current) => {
      const next = [
        ...current,
        {
          appraiserId: "",
          role: "FUNCTIONAL_MANAGER" as AppraiserRole,
          weightPct: "0",
          note: "",
        },
      ];
      const split = evenWeights(next.length);
      return next.map((draft, at) => ({
        ...draft,
        weightPct: String((split[at] ?? 0) / 100),
      }));
    });

  const removeRow = (index: number) =>
    setRows((current) => {
      const next = current.filter((_, at) => at !== index);
      if (next.length === 0) return next;
      const split = evenWeights(next.length);
      return next.map((draft, at) => ({
        ...draft,
        weightPct: String((split[at] ?? 0) / 100),
      }));
    });

  const splitEvenly = () =>
    setRows((current) => {
      const split = evenWeights(current.length);
      return current.map((draft, at) => ({
        ...draft,
        weightPct: String((split[at] ?? 0) / 100),
      }));
    });

  const save = () => {
    setFailed(null);
    setBusy(true);
    void (async () => {
      try {
        await setAppraisers(cycleId, row.employeeId, entries);
        onSaved();
      } catch (caught) {
        setFailed(
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
        );
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Who appraises ${row.employeeName}`}
      description="Everybody who has a say, and how much of the mark each one carries. The shares have to make 100%."
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className={cn(
              "tabular text-body-sm",
              localProblem ? "text-danger-text" : "text-muted",
            )}
          >
            {entries.length === 0
              ? "Nobody assigned"
              : `${weightLabel(entries.reduce((sum, entry) => sum + entry.weightBp, 0))} of ${weightLabel(FULL_WEIGHT_BP)}`}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              loading={busy}
              disabled={busy || localProblem !== null}
              onClick={save}
            >
              Save the mapping
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {failed && (
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
          >
            {failed}
          </p>
        )}

        {localProblem && !failed && (
          <p
            role="status"
            className="rounded-md border border-warning-line bg-warning-soft px-3.5 py-2.5 text-body-sm text-ink"
          >
            {localProblem}
          </p>
        )}

        {rows.length === 0 && (
          <Callout tone="warning" title="Nobody would appraise them">
            Saving with an empty list is allowed and it is a real state — it is
            how you undo a mapping. They will finish the period with no mark,
            and the period will say so by name.
          </Callout>
        )}

        {rows.map((draft, index) => {
          const locked = submittedIds.has(draft.appraiserId);
          return (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-md border border-line p-3"
            >
              <div className="grid gap-3 sm:grid-cols-[2fr_1.4fr_5.5rem]">
                <Field label="Appraiser" required>
                  <Select
                    value={draft.appraiserId}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRow(index, { appraiserId: value });
                    }}
                  >
                    <option value="">Choose somebody</option>
                    {candidates.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} — {person.jobTitle}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="As their" help={APPRAISER_ROLE_HELP[draft.role]}>
                  <Select
                    value={draft.role}
                    onChange={(event) => {
                      const value = event.target.value as AppraiserRole;
                      setRow(index, { role: value });
                    }}
                  >
                    {APPRAISER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {APPRAISER_ROLE_LABEL[role]}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Share %" required>
                  <Input
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={draft.weightPct}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRow(index, { weightPct: value });
                    }}
                  />
                </Field>
              </div>

              {/* The "Why" note has no input any more. The role and the share
                  are what the mapping is for, and a free-text box under every
                  row made a two-field decision look like a three-field form.

                  `note` stays on the draft and is still sent (see `toPayload`)
                  so that editing a mapping does not silently wipe a note set
                  before this field went — removing a control is not a reason to
                  destroy the data behind it. Nothing writes a new one. */}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={locked}
                  onClick={() => removeRow(index)}
                  aria-label="Remove this appraiser"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Remove
                </Button>
              </div>

              {locked && (
                <p className="text-meta text-muted">
                  They have already sent this review. Their weight can change;
                  they cannot be taken off.
                </p>
              )}
            </div>
          );
        })}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={addRow}>
            <Plus aria-hidden="true" className="size-4" />
            Add an appraiser
          </Button>
          {rows.length > 1 && (
            <Button variant="ghost" size="sm" onClick={splitEvenly}>
              Split evenly
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
