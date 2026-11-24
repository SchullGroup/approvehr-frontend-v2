"use client";

import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import {
  Badge,
  Card,
  EmptyState,
  LoadState,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import type { ApiQuerySummary } from "@/lib/api/queries";
import { useMyDrafts } from "@/lib/store/queries";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateTime } from "@/lib/time";

/**
 * A line manager's own drafts, and nothing else.
 *
 * ## What a manager can do with a query
 *
 * Write the letter about somebody who reports to them. They cannot issue it, extend it, decide it,
 * withdraw it, attach a file or cite a record, and they never see an issued query: the moment HR
 * issues or withdraws a draft it leaves this list, and the server answers a manager who opens it
 * with the answer a record that does not exist gets. So this list is `GET /queries/my-drafts` and
 * is the only thing a manager has here: no register, no counts, no search across the company.
 *
 * ## A 403 is an answer
 *
 * `403` means the caller cannot draft (they were not given the permission, or the company has not
 * switched manager drafting on), and its message is the server's own sentence. It is shown as it
 * came and is not a failure to load.
 */
export function MyDrafts() {
  const drafts = useMyDrafts(true);
  const timeZone = useOrgTimezone();

  if (drafts.error?.status === 403) {
    return (
      <EmptyState
        icon={<MessageSquareText aria-hidden="true" className="size-5" />}
        title="You cannot draft queries here"
        description={drafts.error.message}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-body-sm text-body">
        You write the letter and HR reviews and issues it. A draft stays here
        until HR issues or withdraws it. You see only your own drafts about
        people who report to you, and never a query once it has been issued.
      </p>
      <Card>
        <LoadState
          loading={drafts.loading}
          error={drafts.error}
          subject="your drafts"
          onRetry={drafts.reload}
          hasData={drafts.data !== null}
          skeleton="list"
        >
          {drafts.data && drafts.data.rows.length === 0 ? (
            <EmptyState
              icon={<MessageSquareText aria-hidden="true" className="size-5" />}
              title="You have no drafts"
              description="Start one about somebody who reports to you. HR reviews it and issues it."
            />
          ) : (
            drafts.data && (
              <TableWrap caption="Your drafts">
                <THead>
                  <TH>Person</TH>
                  <TH>Draft</TH>
                  <TH>Last changed</TH>
                </THead>
                <TBody>
                  {drafts.data.rows.map((row) => (
                    <DraftRow key={row.id} row={row} timeZone={timeZone} />
                  ))}
                </TBody>
              </TableWrap>
            )
          )}
        </LoadState>
      </Card>
    </div>
  );
}

function DraftRow({
  row,
  timeZone,
}: {
  row: ApiQuerySummary;
  timeZone: string;
}) {
  return (
    <TR>
      <TDPrimary
        title={
          <Link href={`/people/queries/${row.id}`} className="hover:underline">
            {row.subject.name}
          </Link>
        }
        subtitle={row.subject.employeeNo}
      />
      <TD>
        <span className="block text-body-sm text-ink">{row.subjectLine}</span>
        <Badge tone="neutral" size="sm">
          Draft
        </Badge>
      </TD>
      <TD>
        <span className="text-body-sm text-muted">
          {row.updatedAt ? formatDateTime(row.updatedAt, timeZone) : "-"}
        </span>
      </TD>
    </TR>
  );
}
