"use client";

import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/api/queries";
import { useCan } from "@/lib/permissions";
import {
  useMyQueries,
  useQueriesSwitch,
  useQueryRegister,
} from "@/lib/store/queries";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateTime } from "@/lib/time";

/**
 * "Letters from HR": the person's own way in, on their own profile.
 *
 * ## Neutral on purpose
 *
 * The notification they followed said only that a letter was waiting, and so does this. It shows a
 * reference, where the letter stands and the reply-by time, and **never a subject line**: the
 * profile is a page other people stand behind, and the subject of a letter about somebody's conduct
 * is not for it. The letter itself, with everything in it, is one press away on its own page.
 *
 * ## Drawn only when there is something to say
 *
 * Nothing at all unless the company has queries switched on, the person has at least one issued
 * to them, and the read worked. A failed read draws nothing rather than an error on a profile
 * page: there is no claim to correct, and the notification and the link in it still work. "You
 * have no letters" is never said, because it is not worth saying to everybody else.
 *
 * ## "Waiting" is the server's count
 *
 * `meta.waiting` is how many wait for the person's reply. A server that does not send it makes no
 * claim, and the list is shown without a number.
 */
export function LettersFromHr() {
  const queries = useQueriesSwitch();
  const mine = useMyQueries(queries.on);
  const timeZone = useOrgTimezone();

  const rows = mine.data?.rows ?? [];
  if (!queries.on || rows.length === 0) return null;
  const waiting = mine.data?.waiting ?? null;

  return (
    <Card>
      <CardHeader
        title="Letters from HR"
        description={
          waiting !== null && waiting > 0
            ? waiting === 1
              ? "One is waiting for your reply."
              : `${waiting} are waiting for your reply.`
            : undefined
        }
      />
      <CardBody>
        <ul className="flex flex-col divide-y divide-line">
          {rows.slice(0, 5).map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span className="min-w-0 text-body-sm text-ink">
                {row.reference ? `Letter ${row.reference}` : "A letter"}
                <span className="block text-meta text-muted">
                  {STATUS_LABEL[row.status]}
                  {row.status === "ISSUED" && row.replyBy
                    ? `, reply by ${formatDateTime(row.replyBy, timeZone)}`
                    : ""}
                </span>
              </span>
              <Link
                href={`/people/queries/${row.id}`}
                className="text-body-sm font-medium text-accent-text underline underline-offset-2 hover:no-underline"
              >
                Open it
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/**
 * On a person's record, for the people who work queries: how many there are about them, and the
 * way to the register filtered to them.
 *
 * Nothing unless the holder works queries, the company has them on and there is at least one. The
 * register never lists the caller's own queries, so this shows nothing on a record that is your
 * own. No subject line, no outcome and **no number**: only that there are some, which is as much
 * as a record page should carry about a letter. A count is a figure somebody can compare, rank or
 * work back to a person, and a record page has no use for one.
 */
export function QueriesAboutPerson({ employeeId }: { employeeId: string }) {
  const canIssue = useCan("ISSUE_QUERIES");
  const canDecide = useCan("DECIDE_QUERIES");
  const queries = useQueriesSwitch();
  const register = useQueryRegister(
    { subjectId: employeeId, includeArchived: true, pageSize: 1 },
    (canIssue || canDecide) && queries.on,
  );

  const total = register.data?.meta.total ?? 0;
  if (!(canIssue || canDecide) || !queries.on || total === 0) return null;

  return (
    <div className="border-t border-line px-5 py-3">
      <p className="text-meta font-medium text-muted">Queries</p>
      <Link
        href={`/people/queries?subject=${employeeId}`}
        className="text-body-sm text-accent-text underline underline-offset-2 hover:no-underline"
      >
        See the queries about them
      </Link>
    </div>
  );
}
