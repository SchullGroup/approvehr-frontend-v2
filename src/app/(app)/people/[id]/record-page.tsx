"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Callout,
  ConfirmDialog,
  EmptyState,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { documentsFor } from "@/lib/mock/people";
import { useLeaveStore } from "@/lib/store/leave";
import { useLeaveBalances } from "@/lib/store/leave-balances";
import { useEmployeeStore } from "@/lib/store/employees";
import { fullName } from "@/lib/types";
import { EmployeeRecord } from "./record";

/**
 * Resolves the record client-side so employees created in this browser open
 * like any other. The seed still prerenders, so shared links to real records
 * are server-rendered as before.
 */
export function EmployeeRecordPage({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { get, directory, archive, restore, isArchived } = useEmployeeStore();
  const leave = useLeaveStore();
  const balances = useLeaveBalances();
  const [confirming, setConfirming] = useState(false);

  const employee = get(id);

  if (!employee) {
    return (
      <PageBody>
        <Card>
          <EmptyState
            title="No such employee"
            description="This record does not exist, or it was created in another browser — local changes are not shared between devices."
            action={
              <ButtonLink href="/people" variant="accent" size="sm">
                Back to directory
              </ButtonLink>
            }
          />
        </Card>
      </PageBody>
    );
  }

  const archived = isArchived(employee.id);
  const manager = employee.managerId ? (get(employee.managerId) ?? null) : null;
  /* Reports come from the live directory so a newly added hire appears under
     their manager immediately. */
  const reports = directory.filter((e) => e.managerId === employee.id);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/people", label: "Directory" },
          { href: `/people/${employee.id}`, label: fullName(employee) },
        ]}
        title={fullName(employee)}
        meta={
          <>
            <Badge tone="neutral" size="sm">
              {employee.employeeNo}
            </Badge>
            {archived && (
              <Badge tone="danger" size="sm" dot>
                Archived
              </Badge>
            )}
          </>
        }
        description={`${employee.jobTitle} · ${employee.department} · ${employee.location}`}
        action={
          archived ? (
            <Button
              variant="approve"
              size="sm"
              onClick={() => {
                restore(employee.id);
                toast.push({
                  title: `${fullName(employee)} restored`,
                  tone: "success",
                  detail: "They are back in the directory and the payroll run.",
                });
              }}
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Restore
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirming(true)}
            >
              <Archive aria-hidden="true" className="size-3.5" />
              Archive
            </Button>
          )
        }
      />

      <PageBody className="flex flex-col gap-5">
        {archived && (
          <Callout tone="danger" title="This record is archived">
            They are excluded from the directory and from payroll runs. Past
            payslips and approvals still resolve, so nothing in the history
            breaks.
          </Callout>
        )}

        <EmployeeRecord
          employee={employee}
          manager={manager}
          reports={reports}
          /* Derived from live requests, so a leave decision made in the
             approvals inbox has already moved this figure. */
          balances={balances.forEmployee(employee.id)}
          leaveRequests={leave.forEmployee(employee.id)}
          documents={documentsFor(employee.id)}
        />
      </PageBody>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          archive(employee.id);
          setConfirming(false);
          toast.push({
            title: `${fullName(employee)} archived`,
            tone: "info",
            detail: "Removed from the directory and the next payroll run.",
          });
          router.push("/people");
        }}
        title={`Archive ${fullName(employee)}?`}
        confirmLabel="Archive record"
        tone="danger"
        body={
          <div className="flex flex-col gap-3 text-sm text-body">
            <p>
              They drop out of the directory and will not be included in the
              next payroll run.
            </p>
            <p>
              Nothing is deleted. An employment record is a legal document, and
              past payslips have to keep pointing at something — you can
              restore them at any time.
            </p>
          </div>
        }
      />
    </>
  );
}
