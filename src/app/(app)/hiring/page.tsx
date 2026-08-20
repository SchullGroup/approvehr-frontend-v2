import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Plus, TriangleAlert } from "lucide-react";
import {
  Badge,
  BarChart,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Money,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  INTERVIEWS,
  REQUISITIONS,
  daysInStage,
  pipelineCards,
  stageCounts,
} from "@/lib/mock/hiring";
import { employeeById } from "@/lib/mock/people";
import { STAGES, fullName } from "@/lib/types";

export const metadata: Metadata = {
  title: "Hiring",
  description: "Every open role and where its candidates stand.",
};

const STATUS_TONE = {
  draft: "neutral",
  pending_approval: "warning",
  open: "success",
  on_hold: "warning",
  closed: "neutral",
} as const;

const STATUS_LABEL = {
  draft: "Draft",
  pending_approval: "Pending approval",
  open: "Open",
  on_hold: "On hold",
  closed: "Closed",
} as const;

export default function HiringPage() {
  const counts = stageCounts();
  const allCards = pipelineCards();
  const inPlay = allCards.filter((c) => c.outcome === "in_progress");
  const openRoles = REQUISITIONS.filter((r) => r.status === "open");
  const upcoming = INTERVIEWS.filter((i) => i.status === "scheduled");

  /* Anyone sitting in one stage for a week or more. This is the number a
     hiring lead actually acts on, so it gets a tile of its own. */
  const stalled = inPlay.filter((c) => daysInStage(c) >= 7);

  const offersOut = allCards.filter(
    (c) => c.offer && ["sent", "pending_approval"].includes(c.offer.status),
  );

  return (
    <>
      <PageHeader
        title="Hiring"
        description="Every open role and where its candidates stand."
        action={
          <ButtonLink href="/hiring/requisitions/new" variant="accent" size="sm">
            <Plus aria-hidden="true" className="size-4" />
            New requisition
          </ButtonLink>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {/* Numbers */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Open roles"
            value={String(openRoles.length)}
            hint={`${REQUISITIONS.length - openRoles.length} not yet open`}
          />
          <Stat
            label="Candidates in play"
            value={String(inPlay.length)}
            trend={{ direction: "up", label: "+7" }}
            hint="this week"
          />
          <Stat
            label="Interviews scheduled"
            value={String(upcoming.length)}
            icon={<CalendarClock aria-hidden="true" />}
          />
          <Stat
            label="Stalled 7+ days"
            value={String(stalled.length)}
            icon={<TriangleAlert aria-hidden="true" />}
            trend={
              stalled.length > 0
                ? { direction: "down", label: "Needs attention" }
                : undefined
            }
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          {/* Roles */}
          <Card>
            <CardHeader
              title="Open requisitions"
              description="Ordered by how long they have been open."
            />
            <TableWrap className="rounded-none border-0">
              <THead>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH align="right">In play</TH>
                <TH align="right">Band</TH>
                <TH>Hiring manager</TH>
              </THead>
              <TBody>
                {REQUISITIONS.map((r) => {
                  const roleCards = allCards.filter(
                    (c) => c.requisitionId === r.id && c.outcome === "in_progress",
                  );
                  const hm = employeeById(r.hiringManagerId);
                  return (
                    <TR key={r.id} interactive>
                      <TDPrimary
                        title={
                          <Link
                            href={`/hiring/requisitions/${r.id}`}
                            className="hover:text-accent-text hover:underline underline-offset-4"
                          >
                            {r.title}
                          </Link>
                        }
                        subtitle={`${r.reference} · ${r.department} · ${r.location}`}
                      />
                      <TD>
                        <Badge tone={STATUS_TONE[r.status]} size="sm" dot>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                      </TD>
                      <TD align="right" className="tabular font-medium text-ink">
                        {roleCards.length}
                      </TD>
                      <TD align="right" className="tabular whitespace-nowrap">
                        <Money amount={r.salaryMin} compact /> –{" "}
                        <Money amount={r.salaryMax} compact />
                      </TD>
                      <TD>{hm ? fullName(hm) : "—"}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
          </Card>

          <div className="flex flex-col gap-5">
            {/* Funnel */}
            <Card>
              <CardHeader
                title="Where candidates are"
                description="Live count per stage, all roles."
              />
              <CardBody>
                {/* Current occupancy, not conversion — people sit in stages in
                    any distribution, so this is a bar chart rather than a
                    funnel. Conversion reporting gets its own view later. */}
                <BarChart
                  colorBy="series"
                  caption="Candidates currently in each pipeline stage across all open roles"
                  points={STAGES.map((s) => ({
                    label: s.label,
                    value: counts[s.id],
                  }))}
                />
              </CardBody>
            </Card>

            {/* Offers */}
            <Card>
              <CardHeader title="Offers out" />
              <CardBody className="flex flex-col gap-3">
                {offersOut.length === 0 && (
                  <p className="text-[0.875rem] text-muted">
                    No offers pending.
                  </p>
                )}
                {offersOut.map((c) => (
                  <Link
                    key={c.id}
                    href={`/hiring/requisitions/${c.requisitionId}`}
                    className="flex items-center gap-3 rounded-md border border-line p-2.5 transition-colors hover:bg-canvas"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.875rem] font-medium text-ink">
                        {fullName(c.candidate)}
                      </p>
                      <p className="truncate text-[0.75rem] text-muted">
                        {c.requisition.title}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-[0.875rem] font-medium text-ink">
                        <Money amount={c.offer!.grossMonthly} compact />
                      </p>
                      <Badge
                        tone={c.offer!.status === "sent" ? "info" : "warning"}
                        size="sm"
                      >
                        {c.offer!.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
