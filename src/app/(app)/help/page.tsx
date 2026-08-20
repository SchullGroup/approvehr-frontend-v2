import type { Metadata } from "next";
import { BookOpen, Plus } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  type BadgeTone,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { employeeById } from "@/lib/mock/people";
import { KB_ARTICLES, TICKETS } from "@/lib/mock/workflows";
import { fullName } from "@/lib/types";

export const metadata: Metadata = {
  title: "Help desk",
  description: "Every HR request in one queue, with response targets.",
};

const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  open: { tone: "warning", label: "Open" },
  in_progress: { tone: "info", label: "In progress" },
  waiting: { tone: "neutral", label: "Waiting on employee" },
  resolved: { tone: "success", label: "Resolved" },
};

export default function HelpPage() {
  const live = TICKETS.filter((t) => t.status !== "resolved");
  const breaching = live.filter((t) => t.hoursToTarget < 0);
  const unassigned = live.filter((t) => !t.assignedToId);

  return (
    <>
      <PageHeader
        title="Help desk"
        description="Every HR request in one queue, with a response target against each one."
        action={
          <Button variant="accent" size="sm">
            <Plus aria-hidden="true" className="size-4" />
            Raise a ticket
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Open tickets" value={String(live.length)} />
          <Stat
            label="Breaching target"
            value={String(breaching.length)}
            trend={
              breaching.length > 0
                ? { direction: "down", label: "Overdue" }
                : undefined
            }
          />
          <Stat label="Unassigned" value={String(unassigned.length)} />
          <Stat
            label="Deflected by articles"
            value="38%"
            hint="answered without a ticket"
          />
        </div>

        {breaching.length > 0 && (
          <Callout tone="danger" title={`${breaching.length} ticket past its response target`}>
            The employee is waiting longer than you promised. Reassign or answer
            before they have to chase.
          </Callout>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader
              title="Queue"
              description="Breaching first, then by time remaining."
            />
            <TableWrap className="rounded-none border-0">
              <THead>
                <TH>Ticket</TH>
                <TH>Category</TH>
                <TH>Raised by</TH>
                <TH>Assigned</TH>
                <TH align="right">Target</TH>
                <TH>Status</TH>
              </THead>
              <TBody>
                {[...TICKETS]
                  .sort((a, b) => a.hoursToTarget - b.hoursToTarget)
                  .map((t) => {
                    const raiser = employeeById(t.raisedById);
                    const owner = t.assignedToId
                      ? employeeById(t.assignedToId)
                      : null;
                    const breached = t.hoursToTarget < 0 && t.status !== "resolved";
                    return (
                      <TR
                        key={t.id}
                        interactive
                        className={breached ? "bg-danger-soft" : undefined}
                      >
                        <TDPrimary title={t.subject} subtitle={`${t.ref} · ${t.openedAt}`} />
                        <TD>
                          <Badge tone="neutral" size="sm">
                            {t.category}
                          </Badge>
                        </TD>
                        <TD>
                          {raiser && (
                            <span className="flex items-center gap-2">
                              <Avatar name={fullName(raiser)} size="xs" />
                              <span className="truncate">{fullName(raiser)}</span>
                            </span>
                          )}
                        </TD>
                        <TD>
                          {owner ? (
                            fullName(owner)
                          ) : (
                            <Badge tone="warning" size="sm">
                              Unassigned
                            </Badge>
                          )}
                        </TD>
                        <TD
                          align="right"
                          className={
                            breached
                              ? "tabular font-medium text-danger-text"
                              : "tabular text-muted"
                          }
                        >
                          {t.status === "resolved"
                            ? "—"
                            : breached
                              ? `${Math.abs(t.hoursToTarget)}h over`
                              : `${t.hoursToTarget}h left`}
                        </TD>
                        <TD>
                          <Badge tone={STATUS[t.status].tone} size="sm" dot>
                            {STATUS[t.status].label}
                          </Badge>
                        </TD>
                      </TR>
                    );
                  })}
              </TBody>
            </TableWrap>
          </Card>

          <Card>
            <CardHeader
              title="Knowledge base"
              description="Published from resolved tickets."
              action={
                <BookOpen aria-hidden="true" className="size-4 text-faint" />
              }
            />
            <CardBody className="flex flex-col gap-2">
              {KB_ARTICLES.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-md border border-line p-2.5 transition-colors hover:bg-canvas"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] text-ink">
                      {a.title}
                    </span>
                    <span className="block text-[0.75rem] text-muted">
                      {a.category}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-[0.75rem] text-muted">
                    {a.views}
                  </span>
                </div>
              ))}
              <Button variant="secondary" size="sm" className="mt-2">
                Write an article
              </Button>
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
