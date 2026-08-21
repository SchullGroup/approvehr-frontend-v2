"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  Callout,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  useEmployeeLeaveBalances,
  useLeaveRequests,
} from "@/lib/store/leave-api";
import {
  useEmployee,
  useEmployeeDirectory,
  useEmployeeMutations,
  type EmployeePatch,
} from "@/lib/store/employees-api";
import { fullName } from "@/lib/types";
import { EmployeeRecord } from "./record";

/**
 * One person's record, from whichever source is answering.
 *
 * ## Why the record is fetched on its own
 *
 * `GET /employees/:id` is a different read from the directory list, and
 * deliberately so: listing your colleagues needs no permission, but this
 * endpoint returns pay, bank details and a pension PIN, so it needs
 * `VIEW_SALARIES` or for the record to be your own. Picking the person out of
 * the directory instead would appear to work and quietly show a record with
 * half of itself missing.
 *
 * The directory *is* still read, once, for two things the detail response cannot
 * give: the manager's job title, and who reports to this person. Connected that
 * is the first 200 employees, the same slice the directory screen works from.
 */
export function EmployeeRecordPage({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const record = useEmployee(id);
  const mutations = useEmployeeMutations();
  const directory = useEmployeeDirectory({ pageSize: 200 });
  /* Both leave reads are scoped to this person and go through the leave store,
     which picks its own source. `GET /leave/balances/:id` and
     `GET /leave/requests?employeeId=` need `VIEW_SALARIES` or the record to be
     your own — the same rule as the record read above, so if this page opened
     at all these will answer. */
  const leave = useLeaveRequests({ employeeId: id });
  const balances = useEmployeeLeaveBalances(id);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const employee = record.employee;

  const report = (title: string, error: unknown) =>
    toast.push({
      title,
      tone: "danger",
      detail:
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
    });

  if (record.loading) {
    return (
      <PageBody className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
        <span className="sr-only">Loading this record</span>
      </PageBody>
    );
  }

  if (!employee) {
    /* Four different things went wrong and they need four different sentences.
       "You cannot see this" is not "this does not exist", and neither of them is
       "that link came from the demo". */
    const failure = record.forbidden
      ? {
          title: "You cannot open this record",
          detail:
            "A full record carries pay and bank details, so it opens for the person themselves or for somebody who can see salaries. Ask whoever manages access if you need it.",
        }
      : record.demoId
        ? {
            title: "That link is from the demo",
            detail:
              "You are signed in to the real system, and this address belongs to a demo record. Find the person in the directory instead.",
          }
        : record.error && !record.notFound
          ? { title: "Could not load this record", detail: record.error.message }
          : {
              title: "No such employee",
              detail: record.connected
                ? "This record does not exist, or it belongs to another company."
                : "This record does not exist, or it was created in another browser — demo data is not shared between devices.",
            };

    return (
      <PageBody>
        <Card>
          <EmptyState
            title={failure.title}
            description={failure.detail}
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

  const name = fullName(employee);
  const archived = record.archived;
  const manager = employee.managerId
    ? (directory.employees.find((e) => e.id === employee.managerId) ?? null)
    : null;
  const reports = directory.employees.filter((e) => e.managerId === employee.id);

  /* Rethrows on purpose. The editable sections put the API's field-level
     messages on the inputs they belong to, and swallowing here would leave
     somebody looking at a form that says nothing and saved nothing. */
  const save = async (patch: EmployeePatch) => {
    await mutations.update(employee.id, patch);
    record.reload();
  };

  const archive = async () => {
    setBusy(true);
    try {
      await mutations.archive(employee.id);
      setConfirming(false);
      toast.push({
        title: `${name} archived`,
        tone: "info",
        detail: "Removed from the directory and the next payroll run.",
      });
      router.push("/people");
    } catch (error) {
      /* The API refuses while they are on an open run, and says which one.
         That message is the useful part, so it goes straight through. */
      report(`${name} was not archived`, error);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      await mutations.restore(employee.id);
      record.reload();
      toast.push({
        title: `${name} restored`,
        tone: "success",
        detail: "They are back in the directory and the payroll run.",
      });
    } catch (error) {
      report(`${name} was not restored`, error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/people", label: "Directory" },
          { href: `/people/${employee.id}`, label: name },
        ]}
        title={name}
        meta={
          <>
            <Badge tone="neutral" size="sm">
              {employee.employeeNo}
            </Badge>
            {/* Which source this record came from, stated rather than implied. */}
            <Badge tone={record.connected ? "success" : "warning"} size="sm" dot>
              {record.connected
                ? "Live from the API"
                : "Demo data, this browser only"}
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
              loading={busy}
              onClick={() => void restore()}
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

        {directory.error && (
          <Card>
            <CardBody>
              <p className="text-body-sm text-body">
                {directory.error.message} Their manager and direct reports may be
                missing below.
              </p>
            </CardBody>
          </Card>
        )}

        <EmployeeRecord
          employee={employee}
          missing={record.missing}
          connected={record.connected}
          manager={manager}
          managerName={record.managerName}
          reports={reports}
          /* Live in both modes. Connected these are the leave module's own
             figures, so a decision made in the approvals inbox has already
             moved them; offline they come from the same local store the leave
             screen writes to. Either way there is one place the arithmetic
             happens. */
          balances={balances.balances}
          leaveRequests={leave.requests}
          leaveLoading={leave.loading || balances.loading}
          onSave={save}
        />
      </PageBody>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void archive()}
        loading={busy}
        title={`Archive ${name}?`}
        confirmLabel="Archive record"
        tone="danger"
        body={
          <div className="flex flex-col gap-3 text-body-sm text-body">
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
