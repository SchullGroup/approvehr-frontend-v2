"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import {
  Badge,
  Card,
  Drawer,
  DrawerSection,
  EmptyState,
  LoadState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import type { ApiTeamMember } from "@/lib/api/team";
import { useMyTeam } from "@/lib/store/team";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDate } from "@/lib/time";

/**
 * My team (U22, SELF-6, HR-13).
 *
 * A line manager could not open a report's record, because a full record
 * carries pay and bank details, and had no page for the people they lead. This
 * is that page, from the pay-free GET /employees/team: who they are, how to
 * reach them, and their leave. Nothing about pay is asked for or shown.
 */
export function MyTeamScreen() {
  const team = useMyTeam();
  const [open, setOpen] = useState<ApiTeamMember | null>(null);

  if (!team.available) {
    return (
      <EmptyState
        plain
        icon={<Users aria-hidden="true" />}
        title="My team needs the server"
        description="Your team is read from the server, and there is none here."
      />
    );
  }

  return (
    <LoadState
      loading={team.loading}
      error={team.error}
      subject="your team"
      missingMeans="module"
      onRetry={team.reload}
      skeleton="list"
    >
      {team.data && team.data.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden="true" />}
          title="Nobody reports to you"
          description="The people who report to you, and anybody in a department you head, are listed here."
        />
      ) : (
        <Card>
          <TableWrap
            className="border-0"
            caption="The people you lead, with their department and leave"
          >
            <THead>
              <TH>Name</TH>
              <TH>Department</TH>
              <TH>Leave</TH>
            </THead>
            <TBody>
              {(team.data ?? []).map((person) => (
                <TR key={person.id}>
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => setOpen(person)}
                      className="text-body-sm font-medium text-accent-text underline-offset-4 hover:underline"
                    >
                      {person.name}
                    </button>
                    {person.jobTitle && (
                      <span className="block text-meta text-muted">
                        {person.jobTitle}
                      </span>
                    )}
                  </th>
                  <TD>{person.department?.name ?? "No department"}</TD>
                  <TD>
                    <LeaveSummary person={person} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </Card>
      )}
      <Drawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.name ?? ""}
        {...(open?.jobTitle ? { description: open.jobTitle } : {})}
      >
        {open && <MemberDetails person={open} />}
      </Drawer>
    </LoadState>
  );
}

function balanceLine(balance: ApiTeamMember["leaveBalances"][number]): string {
  return balance.entitled === undefined
    ? `${String(balance.remaining)} ${balance.leaveType} days left`
    : `${String(balance.remaining)} of ${String(balance.entitled)} ${balance.leaveType} days left`;
}

function LeaveSummary({ person }: { person: ApiTeamMember }) {
  const annual =
    person.leaveBalances.find((b) => /annual/i.test(b.leaveType)) ??
    person.leaveBalances[0];
  return (
    <span className="flex flex-col gap-1 text-body-sm">
      {person.onLeaveToday && (
        <Badge tone="neutral" size="sm">
          On leave today
        </Badge>
      )}
      {annual && <span className="text-muted">{balanceLine(annual)}</span>}
    </span>
  );
}

function MemberDetails({ person }: { person: ApiTeamMember }) {
  const timeZone = useOrgTimezone();
  const date = (iso: string | null) =>
    iso ? formatDate(iso.slice(0, 10), timeZone) : null;
  const rows: [string, string | null][] = [
    ["Staff number", person.employeeNo],
    ["Email", person.email],
    ["Phone", person.phone],
    ["Department", person.department?.name ?? null],
    ["Reports to", person.manager?.name ?? null],
    ["Location", person.workLocation?.name ?? null],
    ["Started", date(person.startDate)],
    ["Probation ends", date(person.probationEndsAt)],
    ["Leaving", date(person.endDate)],
  ];
  return (
    <div className="flex flex-col gap-5">
      <DrawerSection title="Details">
        <dl className="grid gap-2 text-body-sm">
          {rows
            .filter((row): row is [string, string] => row[1] !== null)
            .map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-muted">{label}</dt>
                <dd className="min-w-0 break-words text-right text-ink">
                  {value}
                </dd>
              </div>
            ))}
        </dl>
      </DrawerSection>
      <DrawerSection title="Leave">
        {person.onLeaveToday && (
          <p className="text-body-sm text-ink">On leave today.</p>
        )}
        {person.leaveBalances.length > 0 && (
          <ul className="flex flex-col gap-1 text-body-sm">
            {person.leaveBalances.map((balance) => (
              <li key={balance.leaveType}>{balanceLine(balance)}</li>
            ))}
          </ul>
        )}
        {person.upcomingLeave.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1 text-body-sm">
            {person.upcomingLeave.map((leave) => (
              <li key={`${leave.startDate}-${leave.endDate}`}>
                {leave.leaveType ? `${leave.leaveType}: ` : ""}
                {date(leave.startDate)} to {date(leave.endDate)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-body-sm text-muted">No leave coming up.</p>
        )}
      </DrawerSection>
    </div>
  );
}
