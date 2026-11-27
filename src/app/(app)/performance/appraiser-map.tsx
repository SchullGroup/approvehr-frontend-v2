"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Network, Plus, Settings2, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Button,
  Callout,
  EmptyState,
  Field,
  Input,
  Modal,
  Illustration,
  Select,
  useToast,
  IconButton,
  TableWrap,
  THead,
  TH,
  TBody,
  TR,
  TD,
  TDPrimary,
  LoadState,
} from "@/components/ui";
import { NoticeLine } from "@/components/portal/notice-line";
import { DepartmentCard } from "@/components/ui/department-card";
import { ApiError } from "@/lib/api/client";
import {
  draftDefaultOf,
  standingRows,
  hrFallbackLine,
  type DefaultAppraiser,
} from "@/lib/performance/appraiser-default";
import { useDepartments } from "@/lib/store/departments";
import {
  APPRAISER_ROLES,
  APPRAISER_ROLE_HELP,
  APPRAISER_ROLE_LABEL,
  FULL_WEIGHT_BP,
  evenWeights,
  weightLabel,
  weightProblem,
  type ApiAppraiserEntry,
  type ApiAppraiserMapRow,
  type AppraiserRole,
} from "@/lib/api/performance";
import { SharedProjectOptions } from "@/components/performance/shared-project-options";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useFeatureSettings } from "@/lib/store/features";
import type { SharedColleague } from "@/lib/api/shared-projects";
import { useSharedProjects } from "@/lib/store/shared-projects";
import { useHeldWhileOpen } from "@/lib/use-held-while-open";
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

  /* "All appraisal periods" is the default (owner, 24 Nov 2026): who appraises
     whom is the company's standing arrangement, and one period is an override
     view. A period's own page links here with `?period=`, so it opens on that
     one. */
  const [chosen, setChosen] = useState<string>(
    useSearchParams()?.get("period") ?? "",
  );
  /** `undefined` is the department cards; a name opens that department. */
  const [dept, setDept] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState<ApiAppraiserMapRow | null>(null);

  /* Fetched once for the whole table rather than once per row — a period of two
     hundred people would otherwise open two hundred identical requests. The
     dialog fetches its own copy because it is also opened from the period
     screen, where this tab is not mounted. */
  const { employees, people: lookups } = useEmployeeDirectory({
    pageSize: 200,
  });
  const { flat: departmentList } = useDepartments();
  /* Whether the people who shared a project with somebody are listed first in their row's list.
     Read once here for the whole table; each row asks the server only when somebody opens it. */
  const { workInAnswers } = useFeatureSettings();
  const people = useMemo(
    () =>
      employees.map((person) => ({
        id: person.id,
        name: `${person.firstName} ${person.lastName}`,
        jobTitle: person.jobTitle,
      })),
    [employees],
  );

  const cycle = cycles.find((one) => one.id === chosen) ?? null;
  const cycleId = cycle?.id ?? null;

  const { map, loading, error, editable, refusal, reload } = useAppraiserMap(
    cycleId,
    {},
  );

  /* Each department's head, by id and by name: the API's second choice when
     nobody is recorded as somebody's manager. */
  const parents = new Map(
    departmentList.map((one) => [one.id, one.parentId ?? null] as const),
  );
  const heads = (() => {
    const names = new Map(lookups.map((one) => [one.id, one.fullName]));
    return new Map(
      departmentList.map((one) => [
        one.id,
        one.headId
          ? { id: one.headId, name: names.get(one.headId) ?? "Their head" }
          : null,
      ]),
    );
  })();

  /* The standing view: everybody employed with the appraiser the reporting
     line gives them, worked out with the API's own rule. */
  const standing =
    cycleId !== null
      ? []
      : standingRows(
          lookups.map((one) => ({
            id: one.id,
            fullName: one.fullName,
            jobTitle: one.jobTitle,
            department: one.department,
            managerId: one.managerId ?? null,
            departmentId: one.departmentId ?? null,
          })),
          departmentList.map((one) => ({
            id: one.id,
            headId: one.headId,
            parentId: one.parentId ?? null,
          })),
        );

  /* On a period that has not started, somebody nobody is mapped to yet gets
     the reporting line when it starts, so that is what the row says. */
  const fallbackOf = (row: ApiAppraiserMapRow) =>
    draftDefaultOf(row, cycle?.stage, heads, parents);
  /* People HR appraises because nothing above them is recorded: a calm
     to-do with one fix, never an error. Nothing is said about a period that
     is over. */
  const published = cycle?.stage === "PUBLISHED";
  /* "Rating" is what the appraisers' marks come to, and there are none before a
     period starts: a column that is empty for every row of a draft says
     nothing and takes room from the name. */
  const showRating = cycle !== null && cycle.stage !== "DRAFT";
  const hrCount = published
    ? 0
    : cycleId === null
      ? standing.filter((row) => row.appraiser.source === "hr").length
      : (map?.rows ?? []).filter(
          (row) =>
            row.appraisers.length === 0 &&
            (fallbackOf(row)?.source ?? "hr") === "hr",
        ).length;
  if (!editable) {
    return (
      <Callout tone="warning" title="This needs a connection to the server">
        {refusal}
      </Callout>
    );
  }

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
      detail: `In ${cycle?.name ?? "this period"}, as the only appraiser. Change it any time.`,
    });
    reload();
  };

  const noLine = hrFallbackLine(hrCount);

  /* Departments first. A list of sixty-eight people is a wall; a card for each
     department opens that department's people, laid out as the appraiser and the
     people under them. */
  const nameOfDept = (name: string | null | undefined) =>
    name ?? "No department";
  const cards = (() => {
    const by = new Map<string | null, string[]>();
    if (cycleId === null) {
      for (const row of standing) {
        const key = row.department ?? null;
        by.set(key, [...(by.get(key) ?? []), row.employeeName]);
      }
    } else {
      for (const row of map?.rows ?? []) {
        const key = row.departmentName ?? null;
        by.set(key, [...(by.get(key) ?? []), row.employeeName]);
      }
    }
    return [...by.entries()]
      .map(([key, people]) => ({ key, people }))
      .sort((x, y) => nameOfDept(x.key).localeCompare(nameOfDept(y.key)));
  })();

  /* Inside a department: one block for each appraiser, their people beneath. */
  type Block = {
    key: string;
    name: string | null;
    rows: ApiAppraiserMapRow[];
    standingRows: typeof standing;
  };
  const blocks: Block[] = (() => {
    if (dept === undefined) return [];
    const by = new Map<string, Block>();
    const add = (key: string, name: string | null) => {
      const found = by.get(key);
      if (found) return found;
      const fresh: Block = { key, name, rows: [], standingRows: [] };
      by.set(key, fresh);
      return fresh;
    };
    if (cycleId === null) {
      for (const row of standing) {
        if ((row.department ?? null) !== dept) continue;
        const who = row.appraiser;
        const hr = who.source === "hr" || who.source === "none";
        add(
          hr ? "hr" : (who.id ?? who.name ?? "x"),
          hr ? null : who.name,
        ).standingRows.push(row);
      }
    } else {
      for (const row of map?.rows ?? []) {
        if ((row.departmentName ?? null) !== dept) continue;
        const first = row.appraisers[0];
        const fallback = fallbackOf(row);
        const name = first?.appraiserName ?? fallback?.name ?? null;
        add(first?.appraiserId ?? fallback?.id ?? "hr", name).rows.push(row);
      }
    }
    return [...by.values()].sort((x, y) =>
      (x.name ?? "~").localeCompare(y.name ?? "~"),
    );
  })();

  return (
    <div className="flex flex-col gap-6">
      {/* The one thing still worth saying out loud: people the reporting line
          gives nobody. A line, not a card. */}
      {noLine !== null && (
        <NoticeLine tone="muted">
          <span>{noLine}</span>
          <Link
            href="/people/departments"
            className="font-medium text-accent-text underline-offset-2 hover:underline"
          >
            Set a department head
          </Link>
        </NoticeLine>
      )}

      {dept === undefined ? (
        cyclesLoading && lookups.length === 0 ? (
          <LoadState
            loading
            error={null}
            subject="the staff list"
            skeleton="table"
          >
            {null}
          </LoadState>
        ) : cards.length === 0 ? (
          <EmptyState
            art={<Illustration name="hand-on-hip" />}
            icon={<Network aria-hidden="true" />}
            title="Nobody on the staff list"
            description="Add people first."
          />
        ) : (
          <ul className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <li key={card.key ?? "none"} className="min-w-0">
                <DepartmentCard
                  name={nameOfDept(card.key)}
                  onClick={() => setDept(card.key)}
                  line={`${String(card.people.length)} ${card.people.length === 1 ? "person" : "people"}`}
                  members={card.people}
                />
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col items-start gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2"
                onClick={() => setDept(undefined)}
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                All departments
              </Button>
              <h2 className="text-h4 font-semibold text-ink">
                {nameOfDept(dept)}
              </h2>
              <p className="text-meta text-muted">
                {cycle
                  ? `Appraisers in ${cycle.name}`
                  : "Who appraises them unless a period says otherwise"}
              </p>
            </div>
            {/* As wide as the longest period name, so a name is not cut off. */}
            <Field
              label="Appraisal period"
              className="w-auto min-w-64 max-w-full"
            >
              <Select
                value={cycleId ?? ""}
                onChange={(event) => setChosen(event.target.value)}
              >
                <option value="">All appraisal periods</option>
                {cycles.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}, {one.stageLabel}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <LoadState
            loading={cycleId !== null && loading}
            error={cycleId !== null ? error : null}
            subject="the appraiser mapping"
            onRetry={reload}
            hasData={blocks.length > 0}
            skeleton="table"
          >
            {blocks.length === 0 ? (
              <EmptyState
                compact
                icon={<Network aria-hidden="true" />}
                title="Nobody here"
              />
            ) : (
              blocks.map((block) => {
                const count = block.rows.length + block.standingRows.length;
                return (
                  <section key={block.key} className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={block.name ?? "HR"} size="md" />
                      <div className="min-w-0">
                        <p className="text-body-md font-semibold text-ink">
                          {block.name ?? "HR"}
                        </p>
                        <p className="text-meta text-muted">
                          Appraises {count} {count === 1 ? "person" : "people"}
                        </p>
                      </div>
                    </div>
                    <TableWrap>
                      <THead>
                        <TH>Person</TH>
                        {cycleId !== null ? (
                          <>
                            <TH>Appraiser</TH>
                            {showRating && (
                              <TH
                                align="right"
                                className="hidden sm:table-cell"
                              >
                                Rating
                              </TH>
                            )}
                            <TH align="right">
                              <span className="sr-only">Split</span>
                            </TH>
                          </>
                        ) : (
                          <TH>Appraises as</TH>
                        )}
                      </THead>
                      <TBody>
                        {cycleId === null
                          ? block.standingRows.map((row) => (
                              <TR key={row.employeeId}>
                                <TDPrimary
                                  avatar={row.employeeName}
                                  title={row.employeeName}
                                  subtitle={row.jobTitle}
                                />
                                <TD className="text-body">
                                  {row.appraiser.source === "manager"
                                    ? "Line manager"
                                    : row.appraiser.source === "hr" ||
                                        row.appraiser.source === "none"
                                      ? "HR"
                                      : "Head of department"}
                                </TD>
                              </TR>
                            ))
                          : block.rows.map((row) => (
                              <PersonTableRow
                                key={row.employeeId}
                                row={row}
                                people={people}
                                fallback={fallbackOf(row)}
                                readOnly={published}
                                showRating={showRating}
                                suggest={workInAnswers === true}
                                onEdit={() => setEditing(row)}
                                onQuickAssign={(appraiserId) =>
                                  quickAssign(row, appraiserId)
                                }
                              />
                            ))}
                      </TBody>
                    </TableWrap>
                  </section>
                );
              })
            )}
          </LoadState>
        </div>
      )}

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
 * How long the pointer rests on a row's list before it is asked about. Long enough that sweeping down a
 * column of two hundred rows asks for none of them, short enough that the answer is usually there by
 * the time somebody has reached for the list.
 */
const SUGGEST_DWELL_MS = 250;

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
function PersonTableRow({
  row,
  people,
  fallback = null,
  readOnly = false,
  showRating = false,
  suggest,
  onEdit,
  onQuickAssign,
}: {
  row: ApiAppraiserMapRow;
  people: { id: string; name: string; jobTitle: string }[];
  /**
   * On a period that has not started, who its start will give this person when
   * nobody is set here: the reporting line. Null once it has started.
   */
  fallback?: DefaultAppraiser | null;
  /** A published period: who appraised, as recorded, and nothing to change. */
  readOnly?: boolean;
  /** The period has started, so there is a rating to show. */
  showRating?: boolean;
  /** The company lists the people who shared a project with this person first. */
  suggest: boolean;
  onEdit: () => void;
  onQuickAssign: (appraiserId: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /* Asked for the first time somebody reaches for this row's list (focus, a press, a key) or rests the
     pointer on it, not for every row of a table of two hundred when it is drawn, and not for every row
     a pointer crosses on its way down the column. */
  const [touched, setTouched] = useState(false);
  const dwell = useRef<number | null>(null);
  const stopDwelling = () => {
    if (dwell.current !== null) window.clearTimeout(dwell.current);
    dwell.current = null;
  };
  useEffect(() => stopDwelling, []);
  const shared = useSharedProjects(row.employeeId, suggest && touched);
  /* The list somebody has opened is never rearranged under them: what arrives while it is open is
     applied the next time. See `useHeldWhileOpen`. */
  const colleagues = useHeldWhileOpen(shared.colleagues);
  const reach = (press: boolean) => {
    stopDwelling();
    setTouched(true);
    if (press) colleagues.press();
    else colleagues.hold();
  };
  const several = row.appraisers.length > 1;
  const current = row.appraisers[0] ?? null;
  const options = people.filter((person) => person.id !== row.employeeId);
  /* Somebody who has since left is still the current appraiser until changed,
     so the dropdown has to be able to show them. */
  const missing =
    current && !options.some((person) => person.id === current.appraiserId);

  return (
    <TR>
      <TDPrimary
        avatar={row.employeeName}
        title={row.employeeName}
        subtitle={[row.jobTitle, row.departmentName]
          .filter(Boolean)
          .join(" · ")}
      />
      <TD>
        {readOnly ? (
          <span
            className={
              row.appraisers.length > 0
                ? "text-body-sm text-ink"
                : "text-body-sm text-muted"
            }
          >
            {row.appraisers.length > 0
              ? row.appraisers
                  .map((one) =>
                    row.appraisers.length > 1
                      ? `${one.appraiserName} ${weightLabel(one.weightBp)}`
                      : one.appraiserName,
                  )
                  .join(", ")
              : "Not recorded"}
          </span>
        ) : several ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink">
            {row.appraisers
              .map((one) => `${one.appraiserName} ${weightLabel(one.weightBp)}`)
              .join(", ")}
          </span>
        ) : (
          <div
            className="w-36 max-w-full sm:w-64"
            onPointerEnter={() => {
              if (touched || dwell.current !== null) return;
              dwell.current = window.setTimeout(() => {
                dwell.current = null;
                setTouched(true);
              }, SUGGEST_DWELL_MS);
            }}
            onPointerLeave={stopDwelling}
          >
            <Select
              aria-label={`Appraiser for ${row.employeeName}`}
              disabled={saving}
              value={current?.appraiserId ?? ""}
              onFocus={() => reach(false)}
              onMouseDown={() => reach(true)}
              onKeyDown={() => reach(false)}
              onBlur={colleagues.release}
              onChange={(event) => {
                const appraiserId = event.target.value;
                colleagues.release();
                if (!appraiserId || appraiserId === current?.appraiserId)
                  return;
                setSaving(true);
                setFailed(null);
                void onQuickAssign(appraiserId)
                  .catch((error: unknown) => {
                    setFailed(
                      error instanceof ApiError
                        ? error.message
                        : "That did not save. Try again.",
                    );
                  })
                  .finally(() => setSaving(false));
              }}
            >
              {/* Shows the default while nothing is chosen, and is not in the
                  list when it is opened: the person it names is in the list
                  already, and the same name twice read as two different people. */}
              {current === null && (
                <option value="" hidden disabled>
                  {saving
                    ? "Saving…"
                    : fallback && fallback.source === "hr"
                      ? "HR"
                      : (fallback?.name ?? "Their manager")}
                </option>
              )}
              {missing && current && (
                <option value={current.appraiserId}>
                  {current.appraiserName}
                </option>
              )}
              <SharedProjectOptions
                people={options}
                colleagues={colleagues.shown}
                text={(person) => person.name}
              />
            </Select>
            {/* A name that is the reporting line's, not a choice anybody made,
                says so: it is what the start will give them. */}
            {current === null && fallback && !saving && (
              <p className="mt-1 text-meta text-muted">
                {fallback.source === "hr"
                  ? "No manager or department head recorded"
                  : "From the reporting line"}
              </p>
            )}
            {current?.source === "HR_FALLBACK" && !saving && (
              <p className="mt-1 text-meta text-muted">
                HR (no manager recorded)
              </p>
            )}
            {failed !== null && (
              <p className="mt-1 text-meta text-danger-text">{failed}</p>
            )}
          </div>
        )}
      </TD>
      {showRating && (
        <TD align="right" className="tabular hidden sm:table-cell">
          {row.weightedRating ?? ""}
        </TD>
      )}
      <TD align="right">
        {!readOnly && (
          <IconButton
            label={`Set several appraisers for ${row.employeeName} and their shares`}
            variant="ghost"
            onClick={onEdit}
          >
            <Settings2 aria-hidden="true" className="size-4" />
          </IconButton>
        )}
      </TD>
    </TR>
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
  /* The people who shared a project with the person, listed first, where the company asked for it. */
  const { workInAnswers } = useFeatureSettings();
  const shared = useSharedProjects(row.employeeId, workInAnswers === true);

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
    ? "The same person is listed twice. Each appraiser should appear once, with one role."
    : lineManagers > 1
      ? "Only one person can be the line manager. Make the others functional managers or project leads."
      : missingSubmitted.length > 0
        ? `${row.appraisers
            .filter((one) => missingSubmitted.includes(one.appraiserId))
            .map((one) => one.appraiserName)
            .join(
              ", ",
            )} already sent their review. Change their weight instead of taking them off.`
        : entries.some((entry) => entry.weightBp < 1)
          ? "An appraiser needs some weight. Remove them instead."
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
      description="Everybody who has a say, and how much each one's overall rating weighs against the others'. The shares have to make 100%."
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className={cn(
              "tabular text-body-sm",
              localProblem ? "text-warning-text" : "text-muted",
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
          <p role="status" className="text-body-sm text-danger-text">
            {failed}
          </p>
        )}

        {localProblem && !failed && (
          <p role="status" className="text-body-sm text-muted">
            {localProblem}
          </p>
        )}

        {rows.length === 0 && (
          <Callout tone="warning" title="Nobody would appraise them">
            You can save with an empty list. It is how you undo a mapping. They
            will finish the period with no rating, and the period will name
            them.
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
                  <AppraiserSelect
                    value={draft.appraiserId}
                    onChange={(value) => setRow(index, { appraiserId: value })}
                    candidates={candidates}
                    colleagues={shared.colleagues}
                  />
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

/**
 * One appraiser's list in the dialog that shares the mark. The answer about who shared a project
 * arrives when the dialog opens and can land while somebody already has this list open, so it is held
 * while it is open: see `useHeldWhileOpen`.
 */
function AppraiserSelect({
  value,
  onChange,
  candidates,
  colleagues,
}: {
  value: string;
  onChange: (value: string) => void;
  candidates: { id: string; name: string; jobTitle: string }[];
  colleagues: SharedColleague[] | null;
}) {
  const held = useHeldWhileOpen(colleagues);
  return (
    <Select
      value={value}
      onFocus={held.hold}
      onMouseDown={held.press}
      onKeyDown={held.hold}
      onBlur={held.release}
      onChange={(event) => {
        held.release();
        onChange(event.target.value);
      }}
    >
      <option value="">Choose somebody</option>
      <SharedProjectOptions
        people={candidates}
        colleagues={held.shown}
        text={(person) => `${person.name} — ${person.jobTitle}`}
      />
    </Select>
  );
}
