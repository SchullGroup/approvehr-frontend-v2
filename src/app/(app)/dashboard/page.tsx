import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, TriangleAlert } from "lucide-react";
import {
  AreaChart,
  Avatar,
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Money,
  Stat,
} from "@/components/ui";
import { PageBody } from "@/components/portal/shell";
import { DashboardHeader } from "./header";
import { INTERVIEWS, daysInStage, pipelineCards } from "@/lib/mock/hiring";
import { employeeById } from "@/lib/mock/people";
import { fullName } from "@/lib/types";
import { StagePill } from "@/components/hiring/stage-pill";

export const metadata: Metadata = { title: "Home" };

export default function DashboardPage() {
  const cards = pipelineCards();
  const inPlay = cards.filter((c) => c.outcome === "in_progress");
  const stalled = inPlay.filter((c) => daysInStage(c) >= 7);
  const upcoming = INTERVIEWS.filter((i) => i.status === "scheduled")
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    .slice(0, 3);

  const headcount = [
    { label: "Feb", value: 182 },
    { label: "Mar", value: 191 },
    { label: "Apr", value: 205 },
    { label: "May", value: 213 },
    { label: "Jun", value: 228 },
    { label: "Jul", value: 241 },
    { label: "Aug", value: 264 },
  ];

  return (
    <>
      <DashboardHeader description="Here is what needs you today." />

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Headcount" value="264" trend={{ direction: "up", label: "+23" }} hint="this month" />
          <Stat
            label="August payroll"
            value={<Money amount={93_000_000} compact />}
            trend={{ direction: "up", label: "+4.1%" }}
            hint="vs July"
          />
          <Stat label="Candidates in play" value={String(inPlay.length)} />
          <Stat
            label="Stalled 7+ days"
            value={String(stalled.length)}
            icon={<TriangleAlert aria-hidden="true" />}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader
              title="Headcount"
              description="Rolling seven months"
              action={
                <Badge tone="success" size="sm" dot>
                  +45% YTD
                </Badge>
              }
            />
            <CardBody>
              <AreaChart
                points={headcount}
                caption="Headcount by month, February to August"
              />
            </CardBody>
          </Card>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader
                title="Needs attention"
                description="Candidates sitting too long in one stage."
              />
              <CardBody className="flex flex-col gap-2.5">
                {stalled.length === 0 && (
                  <p className="text-[0.875rem] text-muted">
                    Nothing is stalled. Good week.
                  </p>
                )}
                {stalled.slice(0, 4).map((c) => (
                  <Link
                    key={c.id}
                    href={`/hiring/requisitions/${c.requisitionId}`}
                    className="flex items-center gap-2.5 rounded-md border border-line p-2.5 transition-colors hover:bg-canvas"
                  >
                    <Avatar name={fullName(c.candidate)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.875rem] font-medium text-ink">
                        {fullName(c.candidate)}
                      </p>
                      <p className="truncate text-[0.75rem] text-muted">
                        {c.requisition.title}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StagePill stage={c.stage} />
                      <p className="tabular mt-1 text-[0.75rem] text-warning-text">
                        {daysInStage(c)} days
                      </p>
                    </div>
                  </Link>
                ))}
                <ButtonLink href="/hiring" variant="ghost" size="sm" className="self-start">
                  Open pipeline
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </ButtonLink>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Next interviews" />
              <CardBody className="flex flex-col gap-2.5">
                {upcoming.map((iv) => {
                  const card = cards.find((c) => c.id === iv.applicationId);
                  if (!card) return null;
                  const when = new Date(iv.scheduledFor);
                  return (
                    <div
                      key={iv.id}
                      className="flex items-center gap-2.5 rounded-md border border-line p-2.5"
                    >
                      <CalendarClock
                        aria-hidden="true"
                        className="size-4 shrink-0 text-faint"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.875rem] font-medium text-ink">
                          {fullName(card.candidate)}
                        </p>
                        <p className="tabular truncate text-[0.75rem] text-muted">
                          {when.toLocaleDateString("en-NG", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          ·{" "}
                          {when.toLocaleTimeString("en-NG", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <span className="shrink-0 text-[0.75rem] text-muted">
                        {iv.interviewerIds
                          .map((id) => employeeById(id)?.firstName ?? "?")
                          .join(", ")}
                      </span>
                    </div>
                  );
                })}
                <ButtonLink
                  href="/hiring/interviews"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                >
                  All interviews
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </ButtonLink>
              </CardBody>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
