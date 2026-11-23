"use client";

import { useState } from "react";
import { UserRoundPlus } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  LoadState,
  ProgressMeter,
  Stat,
  StatGrid,
  TextLink,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  onboardingApi,
  type ApiOnboardingRow,
  type ApiOnboardingTask,
} from "@/lib/api/onboarding";
import { useCan } from "@/lib/permissions";
import { useFetched } from "@/lib/use-fetched";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import { formatDate, todayIn } from "@/lib/time";

/* Module-level, so `useFetched` sees the same loader on every render. */
const loadOpen = (signal: AbortSignal) =>
  onboardingApi.list({ state: "open", pageSize: 100 }, signal);

/**
 * Onboarding from the server's own checklists (U16, HR-2, HR-19).
 *
 * The page listed people whose status was Onboarding, and the add form saves
 * people as Active, so new starters never appeared, Home counted five where the
 * page showed two, and the ticks lived in one browser. The server opens a
 * checklist for every new starter whatever their status, so this lists the
 * open ones (`GET /onboarding?state=open`), ticks through the API, and closes
 * a checklist through the API, which says in its own words what is in the way.
 */
export function ServerOnboarding() {
  const { isConnected } = useSession();
  const read = useFetched("onboarding-open", isConnected, loadOpen);
  const rows = read.data?.data ?? [];
  const total = rows.reduce((sum, row) => sum + row.progress.total, 0);
  const done = rows.reduce((sum, row) => sum + row.progress.done, 0);

  return (
    <LoadState
      loading={read.loading}
      error={read.error}
      subject="the onboarding checklists"
      onRetry={read.reload}
      skeleton="page"
      hasData={rows.length > 0}
    >
      <div className="flex flex-col gap-6">
        <StatGrid columns={2}>
          <Stat label="In onboarding" value={String(rows.length)} />
          <Stat
            label="Steps complete"
            value={total === 0 ? "None yet" : `${done} of ${total}`}
          />
        </StatGrid>
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<UserRoundPlus aria-hidden="true" />}
              title="Nobody is onboarding right now"
              description="A checklist opens for everybody who starts, and leaves this list when it is finished."
            />
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {rows.map((row) => (
              <ChecklistCard key={row.id} row={row} onChanged={read.reload} />
            ))}
          </div>
        )}
      </div>
    </LoadState>
  );
}

function ChecklistCard({
  row,
  onChanged,
}: {
  row: ApiOnboardingRow;
  onChanged: () => void;
}) {
  const canEdit = useCan("EDIT_RECORDS");
  const timeZone = useOrgTimezone();
  const toast = useToast();
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function toggle(task: ApiOnboardingTask, completed: boolean) {
    setBusyTask(task.id);
    try {
      await onboardingApi.updateTask(task.id, { completed });
      onChanged();
    } catch (caught) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusyTask(null);
    }
  }

  async function finish() {
    setFinishing(true);
    setRefusal(null);
    try {
      await onboardingApi.complete(row.id);
      toast.push({
        title: `${row.employee.name} has finished onboarding`,
        tone: "success",
      });
      onChanged();
    } catch (caught) {
      setRefusal(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setFinishing(false);
    }
  }

  const { employee, progress } = row;
  return (
    <Card>
      <CardHeader
        title={
          <TextLink href={`/people/${employee.id}`}>{employee.name}</TextLink>
        }
        description={[
          employee.jobTitle,
          employee.departmentName,
          `${employee.startDate.slice(0, 10) > todayIn(timeZone) ? "starts" : "started"} ${formatDate(employee.startDate.slice(0, 10), timeZone)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <CardBody className="flex flex-col gap-4">
        <ProgressMeter
          value={progress.done}
          max={progress.total}
          label={`${progress.done} of ${progress.total} done`}
          size="sm"
          tone={progress.done === progress.total ? "success" : "accent"}
        />
        <ul className="flex flex-col gap-2">
          {[...row.tasks]
            .sort((a, b) => a.order - b.order)
            .map((task) => (
              <li key={task.id}>
                <Checkbox
                  checked={task.completed}
                  disabled={task.derived || !canEdit || busyTask === task.id}
                  onChange={(event) => void toggle(task, event.target.checked)}
                  label={task.label}
                  {...(task.derived
                    ? { description: "Read from their record." }
                    : {})}
                />
              </li>
            ))}
        </ul>
        {refusal && (
          <p className="text-body-sm text-danger-text" role="alert">
            {refusal}
          </p>
        )}
        {canEdit && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              loading={finishing}
              onClick={() => void finish()}
            >
              Finish onboarding
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
