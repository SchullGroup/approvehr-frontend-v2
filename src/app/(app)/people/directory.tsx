"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Plus, RotateCcw, Search } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Button,
  Card,
  CardBody,
  EmptyState,
  Input,
  Money,
  SegmentedControl,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
  type BadgeTone,
  rowClick,
} from "@/components/ui";
import { useEmployeeDirectory, useEmployeeMutations } from "@/lib/store/employees-api";
import {
  fullName,
  missingForPayroll,
  type EmploymentStatus,
} from "@/lib/types";

const STATUS: Record<EmploymentStatus, { tone: BadgeTone; label: string }> = {
  active: { tone: "success", label: "Active" },
  onboarding: { tone: "info", label: "Onboarding" },
  probation: { tone: "warning", label: "Probation" },
  on_leave: { tone: "info", label: "On leave" },
  offboarding: { tone: "warning", label: "Offboarding" },
  inactive: { tone: "neutral", label: "Inactive" },
};

type View = "active" | "incomplete" | "archived";

/**
 * The directory reads through the store rather than the seed, so a starter
 * added a moment ago is here without a reload — and so is the payroll run,
 * which derives from the same list.
 */
export function Directory() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [view, setView] = useState<View>("active");
  const toast = useToast();
  const mutations = useEmployeeMutations();

  /* Debounced so a search is one request per pause, not one per keystroke.
     Only matters when connected; in demo mode the filter is local and free. */
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  /* One hook, either source. Server-side search and filtering when connected;
     the same behaviour against localStorage when not. */
  const { employees: rows, total, loading, connected, error, archivedIds, reload } =
    useEmployeeDirectory({
      pageSize: 200,
      ...(debounced ? { q: debounced } : {}),
      ...(view === "archived" ? { includeArchived: true } : {}),
      ...(view === "incomplete" ? { payrollBlocked: true } : {}),
    });

  /* `includeArchived` widens the set rather than replacing it, so the
     archived-only view filters down here. */
  const visible = useMemo(
    () => (view === "archived" ? rows.filter((e) => archivedIds.has(e.id)) : rows),
    [rows, view, archivedIds],
  );

  const payrollTotal = visible.reduce((s, e) => s + e.grossMonthly, 0);
  const incomplete = visible.filter(
    (e) => missingForPayroll(e).length > 0,
  ).length;
  const departments = new Set(visible.map((e) => e.department)).size;

  return (
    <div className="flex flex-col gap-6">
      {/* Which source the numbers came from, stated rather than implied. In demo
          mode they are this browser's copy; connected, they are the database. */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={connected ? "success" : "warning"} size="sm" dot>
          {connected ? "Live from the API" : "Demo data, this browser only"}
        </Badge>
        {loading && (
          <span className="text-meta text-muted">Loading…</span>
        )}
        {error && (
          <span className="text-meta text-danger-text">
            {error.message}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Employees" value={String(total)} />
        <Stat label="Departments" value={String(departments)} />
        <Stat
          label="Monthly gross"
          value={<Money amount={payrollTotal} compact />}
        />
        <Stat
          label="Records incomplete"
          value={String(incomplete)}
          trend={
            incomplete > 0
              ? { direction: "down", label: "Blocks payroll" }
              : undefined
          }
          hint="missing bank, PIN or TIN"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, role, department or ID"
            aria-label="Search the directory"
            className="pl-9"
          />
        </div>
        <SegmentedControl
          label="Filter directory"
          value={view}
          onChange={setView}
          options={[
            { value: "active", label: "All" },
            { value: "incomplete", label: "Incomplete" },
            { value: "archived", label: `Archived${archivedIds.size ? ` (${archivedIds.size})` : ""}` },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search aria-hidden="true" />}
            title={
              view === "archived"
                ? "Nobody archived"
                : query
                  ? "No matches"
                  : "Nothing here"
            }
            description={
              view === "archived"
                ? "Archived records stay resolvable so payroll history keeps working."
                : "Try a different search, or add someone."
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
        <TableWrap caption="Employee directory with role, department, salary and status">
          <THead>
            <TH>Employee</TH>
            <TH>Department</TH>
            <TH>Location</TH>
            <TH align="right">Gross monthly</TH>
            <TH>Status</TH>
            {view === "archived" && <TH align="right">Actions</TH>}
          </THead>
          <TBody>
            {visible.map((e) => {
              const gaps = missingForPayroll(e);
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
                  <TD>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={STATUS[e.status].tone} size="sm" dot>
                        {STATUS[e.status].label}
                      </Badge>
                      {gaps.length > 0 && (
                        <span title={gaps.join(", ")}>
                          <Badge tone="danger" size="sm">
                            {gaps.length} missing
                          </Badge>
                        </span>
                      )}
                    </div>
                  </TD>
                  {view === "archived" && (
                    <TD align="right">
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
                    </TD>
                  )}
                </TR>
              );
            })}
          </TBody>
        </TableWrap>
      )}

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm">
            <Download aria-hidden="true" className="size-3.5" />
            Export directory
          </Button>
          <p className="text-meta text-muted">
            Archived records are hidden from the directory and the payroll run,
            but stay resolvable so past payslips keep working.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
