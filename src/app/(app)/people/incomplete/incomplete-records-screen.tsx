"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { sourceNote } from "@/lib/demo";
import {
  Badge,
  Callout,
  Card,
  EmptyState,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import {
  fullName,
  payrollFieldsForDisplay,
  payrollGapsFor,
  type Employee,
  type PayrollGap,
} from "@/lib/types";

type Row = { employee: Employee; blocking: PayrollGap[]; advisory: PayrollGap[] };

/**
 * Every employee with a payroll-data gap, one row each, blocking gaps first.
 *
 * `payrollGapsFor` is the one function that decides what counts as a gap — see
 * `directory.tsx`, which computes the same thing per row for its "N missing"
 * badge. This screen is that same computation across the whole company,
 * exploded into individually clickable fields instead of a single count, so a
 * click lands on the exact record, tab and field rather than leaving the
 * reader to find it by hand.
 */
export function IncompleteRecordsScreen() {
  const { employees, loading, connected } = useEmployeeDirectory({
    pageSize: 200,
  });

  const rows: Row[] = employees
    .map((employee) => {
      const gaps = payrollGapsFor(payrollFieldsForDisplay(employee));
      return {
        employee,
        blocking: gaps.filter((g) => g.blocking),
        advisory: gaps.filter((g) => !g.blocking),
      };
    })
    .filter((row) => row.blocking.length + row.advisory.length > 0)
    .sort((a, b) => {
      if (a.blocking.length !== b.blocking.length) {
        return b.blocking.length - a.blocking.length;
      }
      return a.employee.lastName.localeCompare(b.employee.lastName);
    });

  const blockingRows = rows.filter((r) => r.blocking.length > 0);
  /* Every blocking gap today is a missing bank account, and `payrollGapsFor`
     words its consequence the same way for all of them — reused verbatim
     rather than a second sentence saying the same thing. */
  const blockingConsequence = blockingRows[0]?.blocking[0]?.consequence;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {sourceNote(connected) && (
          <Badge tone="warning" size="sm" dot>
            {sourceNote(connected)}
          </Badge>
        )}
        {loading && <span className="text-meta text-muted">Loading…</span>}
      </div>

      {rows.length === 0 && !loading ? (
        <Card>
          <EmptyState
            icon={<ShieldAlert aria-hidden="true" />}
            title="Nothing missing"
            description="Every record has a bank account, pension PIN and TIN on file."
          />
        </Card>
      ) : (
        <>
          {blockingRows.length > 0 && (
            <Callout
              tone="danger"
              icon={<ShieldAlert aria-hidden="true" />}
              title={`${blockingRows.length} ${blockingRows.length === 1 ? "person" : "people"} cannot be paid until this is fixed`}
            >
              {blockingConsequence}
            </Callout>
          )}

          <div className="rounded-lg border border-line bg-surface">
            <TableWrap
              className="rounded-b-none border-0"
              caption="Employees missing a bank account, pension PIN or tax identification number"
            >
              <THead>
                <TH>Employee</TH>
                <TH>Missing</TH>
              </THead>
              <TBody>
                {rows.map(({ employee, blocking, advisory }) => (
                  <TR key={employee.id}>
                    <TDPrimary
                      title={
                        <Link
                          href={`/people/${employee.id}`}
                          className="hover:text-accent-text hover:underline underline-offset-4"
                        >
                          {fullName(employee)}
                        </Link>
                      }
                      subtitle={`${employee.jobTitle} · ${employee.employeeNo}`}
                    />
                    <TD>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {blocking.map((gap) => (
                          <Link
                            key={gap.field}
                            href={`/people/${employee.id}?tab=pay&field=${gap.field}`}
                            title={gap.consequence}
                            className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                          >
                            <Badge tone="danger" size="sm">
                              {gap.label}
                            </Badge>
                          </Link>
                        ))}
                        {advisory.map((gap) => (
                          <Link
                            key={gap.field}
                            href={`/people/${employee.id}?tab=pay&field=${gap.field}`}
                            title={gap.consequence}
                            className="text-meta text-muted underline decoration-dotted underline-offset-2 hover:text-accent-text hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                          >
                            {gap.label}
                          </Link>
                        ))}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </div>
        </>
      )}
    </div>
  );
}
