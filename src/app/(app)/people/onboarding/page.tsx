import type { Metadata } from "next";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ProgressMeter,
  Stat,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { employeeById } from "@/lib/mock/people";
import { ONBOARDING } from "@/lib/mock/workflows";
import { fullName, missingForPayroll } from "@/lib/types";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "New starters and what is still outstanding for each.",
};

const OWNER: Record<string, { label: string; tone: string }> = {
  employee: { label: "Employee", tone: "bg-info-soft text-info-text" },
  hr: { label: "HR", tone: "bg-accent-soft text-accent-text" },
  manager: { label: "Manager", tone: "bg-warning-soft text-warning-text" },
  it: { label: "IT", tone: "bg-sunken text-muted" },
};

export default function OnboardingPage() {
  const total = ONBOARDING.reduce((s, o) => s + o.tasks.length, 0);
  const done = ONBOARDING.reduce(
    (s, o) => s + o.tasks.filter((t) => t.done).length,
    0,
  );
  /* A starter who is not payroll-ready is the one that actually costs money —
     they miss the run and get paid late. */
  const blocked = ONBOARDING.filter((o) => {
    const e = employeeById(o.employeeId);
    return e ? missingForPayroll(e).length > 0 : false;
  });

  return (
    <>
      <PageHeader
        title="Onboarding"
        description="New starters and what is still outstanding for each."
        action={
          <Button variant="accent" size="sm">
            <Plus aria-hidden="true" className="size-4" />
            Start onboarding
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="In onboarding" value={String(ONBOARDING.length)} />
          <Stat
            label="Tasks complete"
            value={`${done} of ${total}`}
            hint={`${Math.round((done / total) * 100)}% done`}
          />
          <Stat
            label="Not payroll-ready"
            value={String(blocked.length)}
            trend={
              blocked.length > 0
                ? { direction: "down", label: "Will miss the run" }
                : undefined
            }
          />
        </div>

        {blocked.length > 0 && (
          <Callout tone="danger" title={`${blocked.length} starters cannot be paid yet`}>
            Their records are missing details payroll needs. If these are not
            completed before the run closes, they will not be paid this month.
          </Callout>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          {ONBOARDING.map((o) => {
            const e = employeeById(o.employeeId);
            if (!e) return null;
            const complete = o.tasks.filter((t) => t.done).length;
            const gaps = missingForPayroll(e);

            return (
              <Card key={o.employeeId}>
                <CardHeader
                  title={
                    <Link
                      href={`/people/${e.id}`}
                      className="hover:text-accent-text hover:underline underline-offset-4"
                    >
                      {fullName(e)}
                    </Link>
                  }
                  description={`${e.jobTitle} · started ${o.startDate}`}
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
                    <Avatar name={fullName(e)} size="md" tone="accent" />
                    <div className="min-w-0 flex-1">
                      <ProgressMeter
                        value={complete}
                        max={o.tasks.length}
                        label={`${complete} of ${o.tasks.length} tasks`}
                        size="sm"
                        tone={complete === o.tasks.length ? "success" : "accent"}
                      />
                    </div>
                  </div>

                  <ul className="flex flex-col gap-1.5">
                    {o.tasks.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center gap-2.5 rounded-md border border-line px-2.5 py-2"
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-full",
                            t.done
                              ? "bg-success text-ink"
                              : "border border-line-strong",
                          )}
                        >
                          {t.done && (
                            <Check
                              aria-hidden="true"
                              className="size-2.5"
                              strokeWidth={3}
                            />
                          )}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-[0.875rem]",
                            t.done ? "text-muted line-through" : "text-ink",
                          )}
                        >
                          {t.label}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[0.75rem] font-medium",
                            OWNER[t.owner].tone,
                          )}
                        >
                          {OWNER[t.owner].label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
