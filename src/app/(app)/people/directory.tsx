"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sourceNote } from "@/lib/demo";
import { downloadCsv, toCsv, type CsvRow } from "@/lib/csv";
import {
  Banknote,
  Building2,
  Download,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import {
  Badge,
  ButtonLink,
  Button,
  BarChart,
  Card,
  CardHeader,
  CardBody,
  EmptyState,
  Field,
  FilterBar,
  Money,
  Pagination,
  Select,
  SegmentedControl,
  SortableTH,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
  type AppliedFilter,
  type BadgeTone,
  rowClick,
} from "@/components/ui";
import {
  useDirectorySummary,
  useEmployeeDirectory,
  useEmployeeMutations,
} from "@/lib/store/employees-api";
import { naira } from "@/lib/api/payroll";
import { useDepartments } from "@/lib/store/departments";
import { useWorkLocations } from "@/lib/store/work-locations";
import { useListQuery } from "@/lib/use-list-query";
import {
  fullName,
  missingForPayroll,
  payrollFieldsForDisplay,
  payrollGapsFor,
  type Employee,
  type EmploymentStatus,
  type PayrollGap,
} from "@/lib/types";
import { MissingDetailsDialog } from "@/components/people/missing-details-dialog";

const STATUS: Record<EmploymentStatus, { tone: BadgeTone; label: string }> = {
  active: { tone: "success", label: "Active" },
  onboarding: { tone: "info", label: "Onboarding" },
  probation: { tone: "warning", label: "Probation" },
  on_leave: { tone: "info", label: "On leave" },
  offboarding: { tone: "warning", label: "Offboarding" },
  inactive: { tone: "neutral", label: "Inactive" },
};

/** The API's `EmploymentStatus`, upper case, as the query expects it. */
const STATUS_OPTIONS = [
  ["ACTIVE", "Active"],
  ["ONBOARDING", "Onboarding"],
  ["PROBATION", "Probation"],
  ["ON_LEAVE", "On leave"],
  ["OFFBOARDING", "Offboarding"],
  ["INACTIVE", "Inactive"],
] as const;

type View = "active" | "incomplete" | "archived";

type Filters = {
  departmentId: string;
  workLocationId: string;
  status: string;
};

/**
 * The staff directory.
 *
 * ## Every number on this screen is the server's, under this filter
 *
 * This is the screen the whole filtering change was for, so it is worth being
 * blunt about what it used to do. It fetched `pageSize: 200`, rendered all of
 * them, and computed its four header figures from the array it held:
 * `visible.reduce(...)` for monthly gross, `visible.filter(...).length` for
 * incomplete records, `new Set(visible.map(...)).size` for departments. For a
 * company of thirty that is correct by accident. For a company of two thousand
 * it is a **board-pack figure describing the first two hundred people
 * alphabetically** — and there was nothing on screen to say so.
 *
 * `useDirectorySummary` asks the API the same question the table asks, so the
 * counts and the rows cannot disagree. Where the answer has not arrived the card
 * shows nothing rather than a zero: "0 employees" and "we have not been told
 * yet" are different claims, and a reader has no way to tell them apart.
 *
 * ## Four filters, chosen for this table
 *
 * Department, location, employment status, and **completeness** — the last being
 * the one a payroll clerk actually needs, because "the eleven people who cannot
 * be paid" is not a stored column, it is the absence of three. Completeness sits
 * on the view switcher rather than in the panel because it is a *mode* of
 * reading the directory rather than a narrowing of it, and it carries a count.
 *
 * Location filtering is unavailable offline and says so: a demo `Employee` holds
 * a city string, not a work-location id, so a filter on it would silently match
 * nobody. Naming that is better than a select that returns an empty table.
 */
export function Directory({
  initialQuery,
}: {
  /** From `?q=` — what the header search's "see all results" link arrives
   *  with. */
  initialQuery?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const mutations = useEmployeeMutations();

  const list = useListQuery<Filters>({
    filters: { departmentId: "", workLocationId: "", status: "" },
    /* `lastName`, matching the column header that offers the sort — not the
       API's own default of `firstName`. A header whose arrow says "unsorted"
       over a list that is sorted by it is a small lie that costs a click to
       discover. */
    sort: "lastName",
    pageSize: 25,
    ...(initialQuery ? { search: initialQuery } : {}),
  });

  /* The view switcher is separate from `list.filters` because it maps onto three
     different query parameters rather than one, and because it must not be a
     removable chip — "All" is not a filter somebody clears.

     It still has to return to page one. Somebody on page 7 of two thousand who
     switches to "Archived" is asking for a list of four, and `page=7` of that is
     an empty table under a count of four. Same rule as every filter in
     `useListQuery`; this one just lives outside it. */
  const [view, setViewRaw] = useState<View>("active");
  const setView = (next: View) => {
    setViewRaw(next);
    list.setPage(1);
  };

  /** Id of the row whose "fill in missing details" dialog is open. */
  const [filling, setFilling] = useState<string | null>(null);

  const scope = useMemo(
    () => ({
      ...(view === "archived" ? { archivedOnly: true, includeArchived: true } : {}),
      ...(view === "incomplete" ? { payrollBlocked: true } : {}),
    }),
    [view],
  );

  const params = useMemo(
    () => ({
      ...list.params,
      ...scope,
      /* Empty strings are "no filter". Dropped rather than sent, because the API
         validates a uuid and would refuse `departmentId=`. */
      ...(list.filters.departmentId
        ? { departmentId: list.filters.departmentId }
        : { departmentId: undefined }),
      ...(list.filters.workLocationId
        ? { workLocationId: list.filters.workLocationId }
        : { workLocationId: undefined }),
      ...(list.filters.status ? { status: list.filters.status } : { status: undefined }),
    }),
    [list.params, list.filters, scope],
  );

  const { employees: rows, loading, connected, error, reload } =
    useEmployeeDirectory(params);
  const summary = useDirectorySummary(params);

  /**
   * Headcount by status, in the order `STATUS` declares.
   *
   * Declaration order, not count order: these are stages somebody moves
   * through — onboarding, probation, active, offboarding — and sorting by size
   * would shuffle a progression into a ranking. Statuses nobody is in are
   * dropped rather than drawn as empty rows.
   */
  const statusPoints = useMemo(() => {
    const counts = summary.byStatus;
    if (!counts) return [];
    return (Object.keys(STATUS) as EmploymentStatus[])
      .map((key) => ({
        label: STATUS[key].label,
        value: counts[key.toUpperCase()] ?? counts[key] ?? 0,
      }))
      .filter((point) => point.value > 0);
  }, [summary.byStatus]);

  const departments = useDepartments();
  const locations = useWorkLocations();

  const nameOf = (
    options: { id: string; name: string }[],
    id: string,
  ): string => options.find((o) => o.id === id)?.name ?? "Selected";

  const applied: AppliedFilter[] = [
    ...(list.filters.departmentId
      ? [
          {
            label: "Department",
            value: nameOf(departments.flat, list.filters.departmentId),
            onClear: () => list.setFilter("departmentId", ""),
          },
        ]
      : []),
    ...(list.filters.workLocationId
      ? [
          {
            label: "Location",
            value: nameOf(locations.locations, list.filters.workLocationId),
            onClear: () => list.setFilter("workLocationId", ""),
          },
        ]
      : []),
    ...(list.filters.status
      ? [
          {
            label: "Status",
            value:
              STATUS_OPTIONS.find(([value]) => value === list.filters.status)?.[1] ??
              list.filters.status,
            onClear: () => list.setFilter("status", ""),
          },
        ]
      : []),
    ...(list.params.q
      ? [
          {
            label: "Search",
            value: list.params.q,
            onClear: () => list.setSearch(""),
          },
        ]
      : []),
  ];

  /*
   * A CSV of what is actually on screen — this page, under whatever filters
   * and sort are applied above — not a second server request for the whole
   * filtered set. That mirrors the rest of this screen's own argument: the
   * four header figures come from the API under the caller's filter rather
   * than from a large unbounded fetch, and an export button should not
   * quietly reintroduce the thing that change was for. The button and the
   * sentence beside it say "shown below" rather than "directory" for the
   * same reason — the honest scope, stated rather than implied.
   */
  const exportRows = () => {
    const headers = [
      "Staff number",
      "First name",
      "Last name",
      "Job title",
      "Department",
      "Location",
      "Gross monthly (NGN)",
      "Started",
      "Status",
      "Missing for payroll",
    ];
    const csvRows: CsvRow[] = rows.map((e) => ({
      "Staff number": e.employeeNo,
      "First name": e.firstName,
      "Last name": e.lastName,
      "Job title": e.jobTitle,
      Department: e.department,
      Location: e.location,
      "Gross monthly (NGN)":
        e.grossMonthly === null ? "" : e.grossMonthly.toFixed(2),
      Started: e.startDate,
      Status: STATUS[e.status].label,
      "Missing for payroll": missingForPayroll({
        ...e,
        ...payrollFieldsForDisplay(e),
      }).join("; "),
    }));
    downloadCsv(
      `employee-directory-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(headers, csvRows),
    );
    toast.push({
      title: `Exported ${rows.length} ${rows.length === 1 ? "row" : "rows"}`,
      tone: "success",
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Which source the numbers came from, stated rather than implied. */}
      <div className="flex flex-wrap items-center gap-2">
        {sourceNote(connected) && (
          <Badge tone="warning" size="sm" dot>
            {sourceNote(connected)}
          </Badge>
        )}
        {loading && <span className="text-meta text-muted">Loading…</span>}
        {error && (
          <span className="text-meta text-danger-text">{error.message}</span>
        )}
      </div>

      {/* ---- Where people stand ----------------------------------------
          `byStatus` has been on every directory response since the endpoint
          existed and no screen read it — the eight statuses were visible one
          badge at a time, down a table, so "how many are still on probation"
          meant counting rows.

          It follows the filter, like every tile beside it, so filtering to one
          department narrows this too. Absent while the server has not answered:
          an empty chart under a real headcount would read as nobody having a
          status at all. */}
      {statusPoints.length > 1 && (
        <Card>
          <CardHeader
            title="Where people stand"
            description={
              applied.length > 0 || view !== "active"
                ? "Across what is filtered below."
                : undefined
            }
          />
          <CardBody>
            <BarChart
              colorBy="series"
              format={(n) => String(n)}
              caption="Headcount by employment status"
              points={statusPoints}
            />
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Employees"
          value={count(summary.total)}
          icon={<Users aria-hidden="true" />}
          {...(applied.length > 0 || view !== "active"
            ? { hint: "matching what is filtered below" }
            : {})}
        />
        <Stat
          label="Departments"
          value={count(summary.departments)}
          icon={<Building2 aria-hidden="true" />}
        />
        <Stat
          label="Monthly gross"
          /* `size="xl"` (text-h3), matching the plain strings the three cards
             beside it pass, which inherit Stat's own text-h3. `className` cannot
             do this — Money puts it on the outer span while the size class sits
             on the inner one, so the inner wins. */
          /* The API sums this in the database, in integer kobo. `naira` is the
             one conversion on the way to a screen — never a float multiply, and
             never a sum of naira. */
          value={
            summary.grossMonthlyKobo === undefined ? (
              "—"
            ) : (
              <Money amount={naira(summary.grossMonthlyKobo)} compact size="xl" />
            )
          }
          icon={<Banknote aria-hidden="true" />}
        />
        {/* Wrapped rather than given an `href` prop — `Stat` has none, and no
            other clickable-stat pattern exists yet in this app to follow. */}
        <Link
          href="/people/incomplete"
          className="block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        >
          <Stat
            label="Records incomplete"
            value={count(summary.incomplete)}
            icon={<ShieldAlert aria-hidden="true" />}
            className="h-full transition-colors hover:border-accent-line"
            {...(summary.incomplete !== undefined && summary.incomplete > 0
              ? { trend: { direction: "down" as const, label: "Worth checking before payroll" } }
              : {})}
            /* Only a missing bank account actually blocks a payslip — a missing
               PIN only leaves the remittance schedule incomplete, and a missing
               TIN does not affect the run at all. This count is every field that
               is unfilled, not every record that will miss pay. */
            hint="missing bank, PIN or TIN — only a missing bank account blocks pay"
          />
        </Link>
      </div>

      <FilterBar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search name, role or staff number"
        searchLabel="Search the directory"
        applied={applied}
        onClearAll={list.clearFilters}
        count={summary.total}
        noun={["employee", "employees"]}
        actions={
          <SegmentedControl
            label="Which records"
            value={view}
            onChange={setView}
            options={[
              { value: "active", label: "All" },
              {
                value: "incomplete",
                label: label("Incomplete", summary.blockedEverywhere),
              },
              { value: "archived", label: label("Archived", summary.archived) },
            ]}
          />
        }
      >
        <Field label="Department">
          <Select
            value={list.filters.departmentId}
            onChange={(event) => list.setFilter("departmentId", event.target.value)}
          >
            <option value="">Every department</option>
            {departments.flat.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </Field>

        {/* The offline case used to carry a sentence explaining that a demo
            record holds a city rather than an office. The select is already
            disabled, which says "not now" without explaining the demo's
            internals to somebody who did not ask. */}
        <Field label="Location">
          <Select
            value={list.filters.workLocationId}
            disabled={!connected}
            onChange={(event) =>
              list.setFilter("workLocationId", event.target.value)
            }
          >
            <option value="">Every location</option>
            {locations.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Employment status">
          <Select
            value={list.filters.status}
            onChange={(event) => list.setFilter("status", event.target.value)}
          >
            <option value="">Any status</option>
            {STATUS_OPTIONS.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      {rows.length === 0 && !loading ? (
        <Card>
          <EmptyState
            icon={<Search aria-hidden="true" />}
            title={
              view === "archived"
                ? "Nobody archived"
                : applied.length > 0
                  ? "No matches"
                  : "Nothing here"
            }
            description={
              view === "archived"
                ? "Archived records stay resolvable so payroll history keeps working."
                : applied.length > 0
                  ? "Clear a filter, or search for something else."
                  : "Add somebody to get started."
            }
            action={
              view !== "archived" ? (
                <ButtonLink href="/people/new" variant="accent" size="sm">
                  <Plus aria-hidden="true" className="size-4" />
                  Add employee
                </ButtonLink>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="rounded-lg border border-line bg-surface">
          <TableWrap
            className="rounded-b-none border-0"
            caption="Employee directory with role, department, salary and status"
          >
            <THead>
              <SortableTH
                column="lastName"
                active={list.sort}
                order={list.order}
                onSort={list.toggleSort}
              >
                Employee
              </SortableTH>
              <TH>Department</TH>
              <TH>Location</TH>
              <SortableTH
                column="grossMonthly"
                active={list.sort}
                order={list.order}
                onSort={list.toggleSort}
                align="right"
                startDescending
              >
                Gross monthly
              </SortableTH>
              <SortableTH
                column="startDate"
                active={list.sort}
                order={list.order}
                onSort={list.toggleSort}
                startDescending
              >
                Started
              </SortableTH>
              <TH>Status</TH>
              <TH align="right">Actions</TH>
            </THead>
            <TBody>
              {rows.map((e) => {
                const gaps = payrollGapsFor(payrollFieldsForDisplay(e));
                const blocking = gaps.filter((g) => g.blocking);
                return (
                  <TR
                    key={e.id}
                    interactive
                    onClick={rowClick(() => router.push(`/people/${e.id}`))}
                  >
                    <TDPrimary
                      title={
                        <Link
                          href={`/people/${e.id}`}
                          className="hover:text-accent-text hover:underline underline-offset-4"
                        >
                          {fullName(e)}
                        </Link>
                      }
                      subtitle={`${e.jobTitle} · ${e.employeeNo}`}
                    />
                    <TD>{e.department}</TD>
                    <TD>{e.location}</TD>
                    <TD align="right" className="tabular font-medium text-ink">
                      <Money amount={e.grossMonthly} />
                    </TD>
                    <TD className="tabular text-muted">{e.startDate}</TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={STATUS[e.status].tone} size="sm" dot>
                          {STATUS[e.status].label}
                        </Badge>
                        {gaps.length > 0 && (
                          /* Red only when something here actually blocks a
                             payslip (a missing bank account). A pension PIN or
                             TIN alone is worth fixing, not worth the same
                             colour as "will not be paid". */
                          <span
                            title={gaps
                              .map((g) => `${g.label}: ${g.consequence}`)
                              .join(" ")}
                          >
                            <Badge tone={blocking.length > 0 ? "danger" : "warning"} size="sm">
                              {gaps.length} missing
                            </Badge>
                          </span>
                        )}
                      </div>
                    </TD>
                    <TD align="right">
                      {view === "archived" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            void (async () => {
                              try {
                                await mutations.restore(e.id);
                                reload();
                                toast.push({
                                  title: `${fullName(e)} restored`,
                                  tone: "success",
                                });
                              } catch (error) {
                                toast.push({
                                  title: "Could not restore that record",
                                  tone: "danger",
                                  detail:
                                    error instanceof Error
                                      ? error.message
                                      : undefined,
                                });
                              }
                            })();
                          }}
                        >
                          <RotateCcw aria-hidden="true" className="size-3.5" />
                          Restore
                        </Button>
                      ) : (
                        <RowActions
                          employee={e}
                          gaps={gaps}
                          onFillMissing={() => setFilling(e.id)}
                        />
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>

          {filling && (
            <MissingDetailsDialog
              employee={rows.find((e) => e.id === filling)!}
              gaps={payrollGapsFor(
                payrollFieldsForDisplay(rows.find((e) => e.id === filling)!),
              )}
              onClose={() => setFilling(null)}
              onSaved={() => {
                setFilling(null);
                reload();
              }}
            />
          )}

          <Pagination
            page={list.page}
            pageSize={list.pageSize}
            total={summary.total}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
            noun={["employee", "employees"]}
            loading={loading}
          />
        </div>
      )}

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={rows.length === 0}
            onClick={exportRows}
          >
            <Download aria-hidden="true" className="size-3.5" />
            Export directory
          </Button>
          <p className="text-meta text-muted">
            Exports the {rows.length} {rows.length === 1 ? "row" : "rows"}{" "}
            shown below — this page, under whatever is filtered above, not the
            whole company. Archived records are hidden from the directory and
            the payroll run, but stay resolvable so past payslips keep
            working.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * A count, or a dash while it is unknown.
 *
 * The dash is the whole point. Every one of these four figures used to be
 * computed from the rows in hand, so it was always *a* number — and a number
 * that says "0 employees" while a request is in flight is a claim the reader has
 * no reason to doubt. Absent renders as absent.
 */
const count = (value: number | undefined): string =>
  value === undefined ? "—" : value.toLocaleString("en-NG");

/** A switcher option, with its count only once the count is known. */
const label = (text: string, value: number | undefined): string =>
  value === undefined || value === 0 ? text : `${text} (${value})`;

/**
 * The row's overflow menu. Renders nothing when there is nothing to put in
 * it — same rule as `attendance-screen.tsx`'s own `RowActions`, which this
 * copies rather than reinvents: a menu button that opens onto an empty list
 * is worse than no button.
 *
 * One item today. The next row action this table grows belongs here too,
 * rather than as a second button beside it — that is the whole reason this
 * is a menu and not a ghost button with the pension-PIN gap's name on it.
 */
function RowActions({
  employee,
  gaps,
  onFillMissing,
}: {
  employee: Employee;
  gaps: PayrollGap[];
  onFillMissing: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (gaps.length === 0) return null;

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Actions for ${fullName(employee)}`}
        className="rounded-md p-1.5 hover:bg-canvas"
      >
        <MoreHorizontal aria-hidden="true" className="size-4 text-muted" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="animate-scale-in absolute right-0 z-50 mt-1.5 w-56 rounded-lg border border-line bg-surface p-1.5 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onFillMissing();
              }}
              className="block w-full rounded-md px-2.5 py-2 text-left text-body-sm text-body hover:bg-canvas hover:text-ink"
            >
              Fill in missing details
              <span className="block text-meta text-muted">
                {gaps.map((g) => g.label).join(", ")}
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

