import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Target } from "lucide-react";
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
  type BadgeTone,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { employeeById } from "@/lib/mock/people";
import { COMPANY_GOAL, GOALS, REVIEW_CYCLE } from "@/lib/mock/workflows";
import { fullName } from "@/lib/types";

export const metadata: Metadata = {
  title: "Performance",
  description: "Goals, review cycles and what is actually on track.",
};

const GOAL_STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  on_track: { tone: "success", label: "On track" },
  at_risk: { tone: "warning", label: "At risk" },
  off_track: { tone: "danger", label: "Off track" },
  done: { tone: "neutral", label: "Complete" },
};

const STAGE_LABEL: Record<string, string> = {
  self: "Self review",
  manager: "Manager review",
  calibration: "Calibration",
  published: "Published",
};

export default function PerformancePage() {
  const active = GOALS.filter((g) => g.status !== "done");
  const atRisk = GOALS.filter(
    (g) => g.status === "at_risk" || g.status === "off_track",
  );
  const avgProgress = Math.round(
    active.reduce((s, g) => s + g.progress, 0) / (active.length || 1),
  );
  const outstanding = REVIEW_CYCLE.participants - REVIEW_CYCLE.submitted;

  return (
    <>
      <PageHeader
        title="Performance"
        description="Goals, review cycles, and what is actually on track."
        action={
          <Button variant="accent" size="sm">
            <Plus aria-hidden="true" className="size-4" />
            New goal
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Active goals" value={String(active.length)} />
          <Stat
            label="Average progress"
            value={`${avgProgress}%`}
            trend={{ direction: "up", label: "+12%" }}
            hint="this quarter"
          />
          <Stat
            label="At risk"
            value={String(atRisk.length)}
            trend={atRisk.length > 0 ? { direction: "down", label: "Needs a plan" } : undefined}
          />
          <Stat
            label="Reviews outstanding"
            value={`${outstanding} of ${REVIEW_CYCLE.participants}`}
            hint={`due ${REVIEW_CYCLE.dueDate}`}
          />
        </div>

        {outstanding > 0 && (
          <Callout tone="warning" title={`${outstanding} managers have not submitted`}>
            {REVIEW_CYCLE.name} moves to calibration on {REVIEW_CYCLE.dueDate}.
            Calibration cannot start until every review is in, so the cycle
            slips for everyone if these do not land.
          </Callout>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader
              title="Goals"
              description="Everything traces up to the company goal."
            />
            <CardBody className="flex flex-col gap-4">
              <div className="rounded-lg bg-ink px-4 py-3">
                <p className="text-[0.75rem] uppercase tracking-wide text-white/45">
                  Company goal
                </p>
                <p className="mt-0.5 text-[0.9375rem] font-medium text-white">
                  {COMPANY_GOAL}
                </p>
              </div>

              <div className="ml-3 flex flex-col gap-3 border-l border-line pl-5">
                {GOALS.map((g) => {
                  const owner = employeeById(g.ownerId);
                  const st = GOAL_STATUS[g.status];
                  return (
                    <div
                      key={g.id}
                      className="group rounded-lg border border-line p-3.5 transition-shadow duration-200 hover:shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[0.875rem] font-medium text-ink">
                            {g.title}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.75rem] text-muted">
                            {owner && (
                              <span className="flex items-center gap-1.5">
                                <Avatar name={fullName(owner)} size="xs" />
                                {fullName(owner)}
                              </span>
                            )}
                            <span>{g.dueQuarter}</span>
                          </div>
                        </div>
                        <Badge tone={st.tone} size="sm" dot>
                          {st.label}
                        </Badge>
                      </div>
                      <div className="mt-3">
                        <ProgressMeter
                          value={g.progress}
                          showValue
                          size="sm"
                          tone={
                            g.status === "off_track"
                              ? "danger"
                              : g.status === "at_risk"
                                ? "warning"
                                : g.status === "done"
                                  ? "success"
                                  : "accent"
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader title={REVIEW_CYCLE.name} />
              <CardBody className="flex flex-col gap-3">
                {(["self", "manager", "calibration", "published"] as const).map(
                  (stage, i) => {
                    const order = ["self", "manager", "calibration", "published"];
                    const current = order.indexOf(REVIEW_CYCLE.stage);
                    const state =
                      i < current ? "done" : i === current ? "current" : "todo";
                    return (
                      <div key={stage} className="flex items-center gap-3">
                        <span
                          className={
                            state === "done"
                              ? "flex size-5 items-center justify-center rounded-full bg-success text-[0.75rem] text-ink"
                              : state === "current"
                                ? "flex size-5 items-center justify-center rounded-full bg-accent text-[0.75rem] font-semibold text-white"
                                : "flex size-5 items-center justify-center rounded-full border border-line-strong text-[0.75rem] text-muted"
                          }
                        >
                          {state === "done" ? "✓" : i + 1}
                        </span>
                        <span
                          className={
                            state === "current"
                              ? "flex-1 text-[0.875rem] font-medium text-ink"
                              : "flex-1 text-[0.875rem] text-muted"
                          }
                        >
                          {STAGE_LABEL[stage]}
                        </span>
                        {state === "current" && (
                          <span className="tabular text-[0.75rem] text-muted">
                            {REVIEW_CYCLE.submitted}/{REVIEW_CYCLE.participants}
                          </span>
                        )}
                      </div>
                    );
                  },
                )}
                <Button variant="secondary" size="sm" className="mt-2">
                  Send reminders
                </Button>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Needs a conversation"
                description="Goals off track for more than a quarter."
              />
              <CardBody className="flex flex-col gap-2.5">
                {atRisk.map((g) => {
                  const owner = employeeById(g.ownerId);
                  return (
                    <Link
                      key={g.id}
                      href={owner ? `/people/${owner.id}` : "/performance"}
                      className="flex items-start gap-2.5 rounded-md border border-line p-2.5 transition-colors hover:bg-canvas"
                    >
                      <Target
                        aria-hidden="true"
                        className="mt-0.5 size-3.5 shrink-0 text-faint"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.875rem] font-medium text-ink">
                          {g.title}
                        </span>
                        <span className="block truncate text-[0.75rem] text-muted">
                          {owner ? fullName(owner) : "Unassigned"} · {g.progress}%
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </CardBody>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
