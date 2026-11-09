"use client";

import { useState } from "react";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Gauge,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  LoadState,
  Pagination,
  Stat,
  StatGrid,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  TextLink,
} from "@/components/ui";
import { StatTile, WellnessArt } from "@/components/wellness";
import { weekStart } from "@/lib/api/shifts";
import {
  gradedCount,
  rateText,
  type ApiDeliveryCounts,
  type ApiDeliveryMeta,
  type ApiDeliveryRow,
} from "@/lib/api/delivery-report";
import { TASK_GRADE_LABEL } from "@/lib/performance/task-grade";
import { addDays } from "@/lib/projects/dates";
import {
  DELIVERY_PAGE_SIZE,
  useDeliveryReport,
} from "@/lib/store/delivery-report";
import { useToday } from "@/lib/use-today";
import { weekLabel } from "@/lib/wellness/format";

/**
 * The weekly delivery report: what was logged against objectives in a week, and
 * how it was graded.
 *
 * ## Logged and graded are two facts, and the screen keeps them apart
 *
 * A task somebody logged and nobody has looked at yet is a reviewer's backlog,
 * not the person's shortfall. An earlier headline in this product blamed staff
 * for exactly that, so here "logged" and "graded" are separate figures, the
 * ungraded count is worded as waiting for review, and the rate is said to be over
 * what has been graded. With nothing graded there is no rate and the screen says
 * "Nothing graded yet": it never prints 0%, which would be a verdict nobody gave.
 * The four outcomes appear only once something has been graded, for the same
 * reason: a row of four noughts reads as four judgements.
 *
 * ## Nobody is ranked
 *
 * People are listed by name, in the order the API sends them, and the table has
 * no sortable column. There is no best, no worst and nothing built from grades
 * that could be read as a leaderboard. A rate sits beside a name as a fact about
 * that person's week and nothing more.
 *
 * ## Who is shown is the API's decision
 *
 * Everybody sees "Your week". The team section is drawn only when the API sent a
 * `scope`, never from a permission held: it is the API that went by the reporting
 * line and the department head, and a screen guessing from a permission could
 * draw a team that was not sent or hide one that was.
 *
 * ## "Logged nothing" is said for a team, never for the company
 *
 * The API counts the people in scope who logged nothing. For a manager's team
 * that is a fact about a handful of people they lead. For everyone it is every
 * current employee with nothing logged, which includes everybody who has no
 * objectives to log against, so it reads as blame it cannot support. It is drawn
 * only when the scope is `REPORTS`; the figure is still the API's, and still
 * there, it is just not shown.
 *
 * ## An empty week is a week
 *
 * No tasks logged is an answer, and the API says so with an empty report, not an
 * error. A week that has not been opened has nothing in it, and asking does not
 * open it.
 */

const OUTCOMES = [
  ["completed", "COMPLETED"],
  ["partial", "PARTIALLY_COMPLETED"],
  ["notCompleted", "NOT_COMPLETED"],
  ["rejected", "REJECTED"],
] as const;

const plural = (n: number, one: string, many: string) =>
  `${String(n)} ${n === 1 ? one : many}`;

export function DeliveryScreen() {
  const today = useToday();
  const thisMonday = weekStart(today);
  /* A Monday somebody stepped to, or null for "this week", which follows the
     clock: a screen left open over midnight on Sunday moves with it. */
  const [picked, setPicked] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const monday = picked ?? thisMonday;
  const isThisWeek = monday === thisMonday;

  const report = useDeliveryReport(monday, page);
  const meta = report.data?.meta;

  const go = (next: string) => {
    setPicked(next);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-6">
      <WeekBar
        monday={monday}
        isThisWeek={isThisWeek}
        closed={meta && meta.week.start === monday ? meta.week.closed : null}
        onPrevious={() => go(addDays(monday, -7))}
        onNext={() => go(addDays(monday, 7))}
        onThisWeek={() => go(thisMonday)}
      />

      <LoadState
        loading={report.loading}
        error={report.error}
        onRetry={report.reload}
        hasData={report.data !== null}
        subject="the weekly delivery report"
        skeleton="list"
      >
        {report.data && meta && (
          <>
            <YourWeek me={meta.me} closed={meta.week.closed} />
            {meta.scope !== null && (
              <Team
                meta={meta}
                scope={meta.scope}
                rows={report.data.data}
                total={report.data.meta.total}
                page={page}
                onPage={setPage}
                busy={report.loading}
              />
            )}
          </>
        )}
      </LoadState>
    </div>
  );
}

/* ----------------------------------------------------------------- the week */

function WeekBar({
  monday,
  isThisWeek,
  closed,
  onPrevious,
  onNext,
  onThisWeek,
}: {
  monday: string;
  isThisWeek: boolean;
  /** Whether the week has ended, once the API has said. Unknown while loading. */
  closed: boolean | null;
  onPrevious: () => void;
  onNext: () => void;
  onThisWeek: () => void;
}) {
  const sunday = addDays(monday, 6);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          variant="secondary"
          label="Previous week"
          onClick={onPrevious}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </IconButton>
        <p
          aria-live="polite"
          className="min-w-0 px-1 text-body-md font-semibold text-ink tabular"
        >
          <span className="sr-only">Week of </span>
          {weekLabel(monday, sunday)}
        </p>
        <IconButton
          variant="secondary"
          label="Next week"
          disabled={isThisWeek}
          onClick={onNext}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </IconButton>
        {!isThisWeek && (
          <Button variant="ghost" onClick={onThisWeek}>
            This week
          </Button>
        )}
        {closed !== null && (
          <Badge tone="neutral" size="sm">
            {closed ? "Ended" : "In progress"}
          </Badge>
        )}
      </div>
      <p className="max-w-2xl text-body-sm text-muted">
        Logged is what was submitted. Graded is what a reviewer has looked at. A
        task still waiting for review is not counted against anybody.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- your week */

function YourWeek({
  me,
  closed,
}: {
  me: ApiDeliveryCounts | null;
  closed: boolean;
}) {
  return (
    <section aria-labelledby="delivery-yours" className="flex flex-col gap-3">
      <h2 id="delivery-yours" className="text-body-md font-semibold text-ink">
        Your week
      </h2>
      {me === null ? (
        <Card>
          <EmptyState
            compact
            className="py-6"
            art={<WellnessArt name="apple" mood="sleepy" size={80} />}
            title="No week of your own to show"
            description="This sign-in is not linked to a staff record, so there are no tasks of yours to count."
          />
        </Card>
      ) : me.logged === 0 ? (
        <Card>
          <EmptyState
            compact
            className="py-6"
            art={<WellnessArt name="apple" mood="sleepy" size={80} />}
            title="Nothing logged this week"
            description={
              closed
                ? "No tasks were logged for this week."
                : "Tasks you log against your objectives show up here, with how they were graded."
            }
          />
        </Card>
      ) : (
        <Figures counts={me} audience="you" />
      )}
    </section>
  );
}

/**
 * Logged, graded and the rate, as three figures, and the four outcomes beneath
 * them once there is anything graded.
 */
function Figures({
  counts,
  audience,
}: {
  counts: ApiDeliveryCounts;
  audience: "you";
}) {
  const graded = gradedCount(counts);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          tone="peri"
          icon={<ClipboardList />}
          label="Logged"
          value={counts.logged}
          {...(counts.ungraded > 0
            ? { hint: `${String(counts.ungraded)} waiting for review` }
            : { hint: "All of them reviewed" })}
        />
        <StatTile
          tone="green"
          icon={<CheckCheck />}
          label="Graded"
          value={graded}
          {...(graded === 0 ? { hint: "Nothing reviewed yet" } : {})}
        />
        <StatTile
          tone="pink"
          icon={<Gauge />}
          label="Delivery rate"
          value={
            counts.rate === null ? (
              <span className="text-body-md font-medium text-muted">
                {rateText(null)}
              </span>
            ) : (
              rateText(counts.rate)
            )
          }
          {...(counts.rate === null
            ? audience === "you"
              ? { hint: "It appears once a reviewer has graded something." }
              : {}
            : {
                hint: `Over the ${String(graded)} graded. Done counts as one, partly done as half.`,
              })}
        />
      </div>
      {graded > 0 && <Outcomes counts={counts} />}
    </div>
  );
}

function Outcomes({ counts }: { counts: ApiDeliveryCounts }) {
  return (
    <ul
      aria-label="How the graded tasks came out"
      className="flex flex-wrap gap-2"
    >
      {OUTCOMES.map(([field, grade]) => (
        <li key={field}>
          <Badge tone="neutral">
            {TASK_GRADE_LABEL[grade]} {counts[field]}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------- team */

function Team({
  meta,
  scope,
  rows,
  total,
  page,
  onPage,
  busy,
}: {
  meta: ApiDeliveryMeta;
  scope: "ALL" | "REPORTS";
  rows: ApiDeliveryRow[];
  total: number;
  page: number;
  onPage: (page: number) => void;
  busy: boolean;
}) {
  const summary = meta.summary;
  const waiting = summary ? summary.logged - summary.graded : 0;
  /* Only for somebody's own team. Company-wide it is every current employee
     who logged nothing, including everybody who has no objectives, and set
     under a table of names it reads as a list of who did not do their work. */
  const silent = scope === "REPORTS" ? meta.silent : null;
  return (
    <section aria-labelledby="delivery-team" className="flex flex-col gap-3">
      <div>
        <h2 id="delivery-team" className="text-body-md font-semibold text-ink">
          {scope === "ALL" ? "Everyone" : "Your team"}
        </h2>
        <p className="mt-1 max-w-2xl text-body-sm text-muted">
          {scope === "ALL"
            ? "Everyone at the company who logged tasks this week, by name."
            : "The people who report to you, or sit in a department you head, who logged tasks this week, by name."}
        </p>
      </div>

      {summary && (
        <StatGrid columns={4}>
          <Stat label="People who logged" value={summary.people} />
          <Stat
            label="Tasks logged"
            value={summary.logged}
            hint={
              waiting > 0 ? `${String(waiting)} waiting for review` : undefined
            }
          />
          <Stat label="Tasks graded" value={summary.graded} />
          <Stat
            label="Delivery rate"
            value={
              summary.rate === null ? (
                <span className="text-body-md font-medium text-muted">
                  {rateText(null)}
                </span>
              ) : (
                rateText(summary.rate)
              )
            }
            hint="Over what is graded"
          />
        </StatGrid>
      )}

      {waiting > 0 && (
        <p className="text-body-sm text-muted">
          {plural(waiting, "task is", "tasks are")} waiting to be graded.{" "}
          <TextLink href="/performance/review-tasks">Review tasks</TextLink>
        </p>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon={<Users aria-hidden="true" />}
            title="Nobody logged tasks this week"
            description={
              silent
                ? `${plural(silent, "person has", "people have")} not logged any yet.`
                : "There is nothing to show for this week."
            }
          />
        </Card>
      ) : (
        <>
          <div
            aria-busy={busy}
            className={
              busy
                ? "rounded-lg border border-line bg-surface opacity-60 transition-opacity"
                : "rounded-lg border border-line bg-surface transition-opacity"
            }
          >
            <div className="hidden sm:block">
              <PeopleTable rows={rows} />
            </div>
            <PeopleCards rows={rows} />
            <Pagination
              page={page}
              pageSize={DELIVERY_PAGE_SIZE}
              total={total}
              onPageChange={onPage}
              noun={["person", "people"]}
              loading={busy}
            />
          </div>
          {silent ? (
            <p className="text-body-sm text-muted">
              {plural(silent, "other person", "other people")} logged nothing
              this week.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/** A count for an outcome, or an absence when nothing of theirs is graded. */
function Outcome({
  row,
  field,
}: {
  row: ApiDeliveryRow;
  field: (typeof OUTCOMES)[number][0];
}) {
  if (gradedCount(row) === 0) {
    return (
      <>
        <span aria-hidden="true" className="text-faint">
          –
        </span>
        <span className="sr-only">Not graded</span>
      </>
    );
  }
  return <>{row[field]}</>;
}

function RateText({ rate }: { rate: number | null }) {
  return rate === null ? (
    <span className="text-muted">{rateText(null)}</span>
  ) : (
    <span className="font-medium text-ink">{rateText(rate)}</span>
  );
}

/**
 * In the order the API sends: by name. There is no sort control and the rows are
 * not re-ordered here.
 */
function PeopleTable({ rows }: { rows: ApiDeliveryRow[] }) {
  return (
    <TableWrap
      className="rounded-b-none border-0"
      caption="Tasks logged and graded this week, by person"
    >
      <THead>
        <TH>Person</TH>
        <TH align="right">Logged</TH>
        {OUTCOMES.map(([field, grade]) => (
          <TH key={field} align="right">
            {TASK_GRADE_LABEL[grade]}
          </TH>
        ))}
        <TH align="right">Not graded yet</TH>
        <TH align="right">Delivery rate</TH>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.employeeId}>
            <TD className="font-medium text-ink">{row.name}</TD>
            <TD align="right">{row.logged}</TD>
            {OUTCOMES.map(([field]) => (
              <TD key={field} align="right">
                <Outcome row={row} field={field} />
              </TD>
            ))}
            <TD align="right">{row.ungraded}</TD>
            <TD align="right">
              <RateText rate={row.rate} />
            </TD>
          </TR>
        ))}
      </TBody>
    </TableWrap>
  );
}

/** The same rows as cards below the `sm` breakpoint. Two columns, so 320px holds them. */
function PeopleCards({ rows }: { rows: ApiDeliveryRow[] }) {
  return (
    <ul className="divide-y divide-line sm:hidden">
      {rows.map((row) => (
        <li key={row.employeeId} className="flex flex-col gap-3 p-4">
          <p className="min-w-0 break-words font-medium text-ink">{row.name}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm">
            <Pair label="Logged" value={row.logged} />
            <Pair label="Not graded yet" value={row.ungraded} />
          </dl>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-body-sm">
            {OUTCOMES.map(([field, grade]) => (
              <Pair
                key={field}
                label={TASK_GRADE_LABEL[grade]}
                value={<Outcome row={row} field={field} />}
              />
            ))}
            <div className="col-span-2">
              <Pair
                label="Delivery rate"
                value={<RateText rate={row.rate} />}
              />
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function Pair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="tabular text-ink">{value}</dd>
    </div>
  );
}
