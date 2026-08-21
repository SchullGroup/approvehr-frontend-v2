"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  ProgressMeter,
  Skeleton,
  Stat,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import {
  useEmployeeDirectory,
  useEmployeeMutations,
} from "@/lib/store/employees-api";
import {
  ONBOARDING_STEPS,
  useOnboardingChecklist,
  type ResolvedStep,
} from "@/lib/store/onboarding";
import { shortDate } from "@/lib/today";
import { fullName, missingForPayroll, type Employee } from "@/lib/types";

const OWNER: Record<string, { label: string; tone: string }> = {
  employee: { label: "Employee", tone: "bg-info-soft text-info-text" },
  hr: { label: "HR", tone: "bg-accent-soft text-accent-text" },
  manager: { label: "Manager", tone: "bg-warning-soft text-warning-text" },
  it: { label: "IT", tone: "bg-sunken text-muted" },
};

/**
 * New starters.
 *
 * ## Who counts as onboarding
 *
 * Whoever the record says: `status = ONBOARDING`. That is a server-side filter
 * when connected — `GET /employees?status=ONBOARDING` — and the same filter over
 * the local directory offline, so the screen does not care which it got. It is
 * also why somebody disappears from here the moment their status moves to
 * Active: this is a list of people mid-arrival, not a list of recent hires.
 *
 * ## The checklist is half live and half local, and it says which
 *
 * Steps that the employment record can answer — bank account, pension PIN, TIN —
 * are read off the record and cannot be ticked by hand. The rest are somebody
 * doing something off-screen, and there is no onboarding endpoint yet, so those
 * ticks live in this browser. See `lib/store/onboarding.ts`.
 *
 * The API has no onboarding module — `approvehr-api/src/modules/` has one for
 * offboarding and none for arriving — so a checklist stored server-side is not
 * available to invent here. What *is* real in both modes is the record itself,
 * which is why the one action on this screen writes to it.
 *
 * ## Finishing is a button, not a sentence telling you where to go
 *
 * Onboarding ends when somebody's status moves to Active, and that used to be
 * described in the empty state and left for the reader to go and do on the
 * record page. It is one field on a record this screen is already holding, so
 * it is done here. It writes through `useEmployeeMutations`, which means the API
 * when connected and localStorage when not — the same path the record page uses,
 * never a second one.
 */
export function OnboardingScreen() {
  const { employees, loading, connected, error, reload } = useEmployeeDirectory({
    status: "ONBOARDING",
    pageSize: 100,
  });
  const checklist = useOnboardingChecklist();
  const mutations = useEmployeeMutations();
  const canEdit = useCan("EDIT_RECORDS");
  const toast = useToast();
  /** The id being moved, so only that card's button spins. */
  const [finishing, setFinishing] = useState<string | null>(null);

  const finish = async (employee: Employee) => {
    const name = fullName(employee);
    setFinishing(employee.id);
    try {
      await mutations.update(employee.id, { status: "active" });
      /* Connected this refetches the filtered list, so they drop off it. In
         demo mode the local store is the subscription behind `employees` and
         has already re-rendered. */
      reload();
      toast.push({
        title: `${name} is now active`,
        tone: "success",
        detail:
          missingForPayroll(employee).length > 0
            ? "Their record is still missing what payroll needs, so the next run will leave them out."
            : "They are off this list and in the next payroll run.",
      });
    } catch (err) {
      toast.push({
        title: `${name} was not moved`,
        tone: "danger",
        detail:
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setFinishing(null);
    }
  };

  const stepCount = employees.length * ONBOARDING_STEPS.length;
  const stepsDone = employees.reduce(
    (sum, e) => sum + checklist.stepsFor(e).filter((s) => s.done).length,
    0,
  );
  /* A starter who is not payroll-ready is the one that actually costs money —
     they miss the run and get paid late. */
  const blocked = employees.filter((e) => missingForPayroll(e).length > 0);

  return (
    <>
      <PageHeader
        title="Onboarding"
        description="New starters and what is still outstanding for each."
        action={
          <ButtonLink href="/people/new" variant="accent" size="sm">
            <Plus aria-hidden="true" className="size-4" />
            Add a starter
          </ButtonLink>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={connected ? "success" : "warning"} size="sm" dot>
            {connected ? "Live from the API" : "Demo data, this browser only"}
          </Badge>
          <Badge tone="neutral" size="sm">
            Ticks you make here are saved in this browser
          </Badge>
          {loading && <span className="text-[0.75rem] text-muted">Loading…</span>}
          {error && (
            <span className="text-[0.75rem] text-danger-text">
              {error.message}
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="In onboarding" value={String(employees.length)} />
          <Stat
            label="Steps complete"
            value={stepCount === 0 ? "—" : `${stepsDone} of ${stepCount}`}
            {...(stepCount === 0
              ? {}
              : {
                  hint: `${Math.round((stepsDone / stepCount) * 100)}% done`,
                })}
          />
          <Stat
            label="Cannot be paid yet"
            value={String(blocked.length)}
            hint="missing bank, PIN or TIN"
            {...(blocked.length > 0
              ? { trend: { direction: "down" as const, label: "Will miss the run" } }
              : {})}
          />
        </div>

        {loading && employees.length === 0 ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
            <span className="sr-only">Loading new starters</span>
          </div>
        ) : employees.length === 0 ? (
          <Card>
            <EmptyState
              title="Nobody is onboarding right now"
              description="Somebody appears here while their status is Onboarding, and drops off it the moment you finish them."
              action={
                <ButtonLink href="/people/new" variant="accent" size="sm">
                  Add a starter
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {employees.map((employee) => (
              <StarterCard
                key={employee.id}
                employee={employee}
                steps={checklist.stepsFor(employee)}
                onToggle={(stepId) => checklist.toggle(employee.id, stepId)}
                canFinish={canEdit}
                finishing={finishing === employee.id}
                onFinish={() => void finish(employee)}
              />
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function StarterCard({
  employee,
  steps,
  onToggle,
  canFinish,
  finishing,
  onFinish,
}: {
  employee: Employee;
  steps: ResolvedStep[];
  onToggle: (stepId: string) => void;
  /** `EDIT_RECORDS`. Without it there is no finish button, rather than a dead one. */
  canFinish: boolean;
  finishing: boolean;
  onFinish: () => void;
}) {
  const name = fullName(employee);
  const gaps = missingForPayroll(employee);
  const complete = steps.filter((s) => s.done).length;
  const outstanding = steps.length - complete;

  return (
    <Card>
      <CardHeader
        title={
          <Link
            href={`/people/${employee.id}`}
            className="hover:text-accent-text hover:underline underline-offset-4"
          >
            {name}
          </Link>
        }
        description={`${employee.jobTitle} · started ${employee.startDate}`}
        action={
          gaps.length > 0 ? (
            <Badge tone="danger" size="sm" dot>
              {gaps.length} blocking
            </Badge>
          ) : (
            <Badge tone="success" size="sm" dot>
              Payroll ready
            </Badge>
          )
        }
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={name} size="md" tone="accent" />
          <div className="min-w-0 flex-1">
            <ProgressMeter
              value={complete}
              max={steps.length}
              label={`${complete} of ${steps.length} steps`}
              size="sm"
              tone={complete === steps.length ? "success" : "accent"}
            />
          </div>
        </div>

        <ul className="flex flex-col gap-1.5">
          {steps.map((resolved) => (
            <StepRow
              key={resolved.step.id}
              resolved={resolved}
              employeeId={employee.id}
              onToggle={() => onToggle(resolved.step.id)}
            />
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          {gaps.length > 0 && (
            <ButtonLink
              href={`/people/${employee.id}`}
              variant="secondary"
              size="sm"
              block
            >
              Complete their record
            </ButtonLink>
          )}

          {/* Available with steps still outstanding on purpose. Somebody can
              be settled in the job before their pension PIN has arrived, and
              refusing to finish them would be this screen inventing a rule the
              payroll run does not have — the run blocks on the record, not on
              a tick. The toast says what is still missing instead. */}
          {canFinish && (
            <Button
              variant={outstanding === 0 ? "approve" : "secondary"}
              size="sm"
              block
              loading={finishing}
              onClick={onFinish}
            >
              {!finishing && <Check aria-hidden="true" className="size-3.5" />}
              Finish onboarding
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * One step.
 *
 * A derived step gets a marker rather than a checkbox, because there is nothing
 * to click: the answer is the record's, and the way to change it is to change
 * the record. That is what the link is for when it is outstanding.
 */
function StepRow({
  resolved,
  employeeId,
  onToggle,
}: {
  resolved: ResolvedStep;
  employeeId: string;
  onToggle: () => void;
}) {
  const { step, done, derived, due, overdue } = resolved;

  return (
    <li
      className={cn(
        "flex items-center gap-2.5 rounded-md border px-2.5 py-2",
        overdue ? "border-danger-line" : "border-line",
      )}
    >
      {derived ? (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-full",
              done ? "bg-success text-ink" : "border border-line-strong",
            )}
          >
            {done && <Check aria-hidden="true" className="size-2.5" strokeWidth={3} />}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[0.875rem]",
              done ? "text-muted line-through" : "text-ink",
            )}
          >
            {done ? (
              step.label
            ) : (
              <Link
                href={`/people/${employeeId}`}
                className="hover:text-accent-text hover:underline underline-offset-4"
              >
                {step.label}
              </Link>
            )}
            <span className="sr-only">
              {done ? " — done, from their record" : " — outstanding on their record"}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-sunken px-1.5 py-0.5 text-[0.75rem] font-medium text-muted">
            Their record
          </span>
        </>
      ) : (
        <>
          <Checkbox
            className="min-w-0 flex-1"
            checked={done}
            onChange={onToggle}
            label={
              <span
                className={cn(
                  "block truncate text-[0.875rem]",
                  done ? "text-muted line-through" : "text-ink",
                )}
              >
                {step.label}
              </span>
            }
          />
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[0.75rem] font-medium",
              OWNER[step.owner]?.tone ?? "bg-sunken text-muted",
            )}
          >
            {OWNER[step.owner]?.label ?? step.owner}
          </span>
        </>
      )}
      <span
        className={cn(
          "shrink-0 text-[0.75rem] tabular",
          overdue ? "font-medium text-danger-text" : "text-faint",
        )}
      >
        {shortDate(due)}
      </span>
    </li>
  );
}
