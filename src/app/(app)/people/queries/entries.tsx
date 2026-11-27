"use client";

import Link from "next/link";
import { Card, CardBody, CardHeader, TextLink } from "@/components/ui";
import { STATUS_LABEL, type ApiQuerySummary } from "@/lib/api/queries";
import { useCan } from "@/lib/permissions";
import {
  useMyQueries,
  useQueriesSwitch,
  useQueryRegister,
} from "@/lib/store/queries";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateTime } from "@/lib/time";

/**
 * What the heading of a person's own letters says about how many wait for a reply.
 *
 * `waiting` is the server's count, and `null` is a server that did not send one: no claim is made
 * and the list is shown without a number. Nothing is said when none is waiting, because a list of
 * answered letters needs no reminder.
 */
export function waitingLine(waiting: number | null): string | undefined {
  if (waiting === null || waiting <= 0) return undefined;
  return waiting === 1
    ? "One is waiting for your reply."
    : `${waiting} are waiting for your reply.`;
}

/**
 * The person's own letters, one line each, and the way into each.
 *
 * ## Neutral on purpose, in both places it is drawn
 *
 * Each line is a reference, where the letter stands and the reply-by time, and **never a subject
 * line**: the profile is a page other people stand behind, and a list on the Queries page is read at
 * a desk someone else may pass. The subject of a letter about somebody's conduct is for the letter,
 * which is one press away on its own page. Used by the profile card and by the Queries page, so the
 * two cannot come to say different things about the same letter.
 */
export function LetterList({
  rows,
  timeZone,
}: {
  rows: readonly ApiQuerySummary[];
  timeZone: string;
}) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {rows.map((row) => (
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
            className="inline-flex min-h-6 items-center text-body-sm font-medium text-accent-text underline underline-offset-2 hover:no-underline pointer-coarse:min-h-11"
          >
            Open it
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** How many of a person's letters the profile card lists before sending them to the full list. */
const PROFILE_LIMIT = 5;

/**
 * "Letters from HR": the person's own letters, on their own profile. The full list, with the same
 * lines, is the **Queries** row in the sidebar.
 *
 * ## Drawn only when there is something to say
 *
 * Nothing at all unless the company has queries switched on, the person has at least one issued
 * to them, and the read worked. A failed read draws nothing rather than an error on a profile
 * page: there is no claim to correct, and the notification, the Queries page and the link in
 * either still work. "You have no letters" is never said here, because it is not worth saying to
 * everybody else; the Queries page, which somebody opens on purpose, does say it.
 *
 * ## "Waiting" is the server's count
 *
 * See `waitingLine`. Beyond five letters the card says where the rest are rather than cutting the
 * list off without a word.
 */
export function LettersFromHr() {
  const queries = useQueriesSwitch();
  const mine = useMyQueries(queries.on);
  const timeZone = useOrgTimezone();

  const rows = mine.data?.rows ?? [];
  if (!queries.on || rows.length === 0) return null;
  const description = waitingLine(mine.data?.waiting ?? null);

  return (
    <Card>
      <CardHeader
        title="Letters from HR"
        {...(description ? { description } : {})}
      />
      <CardBody>
        <LetterList rows={rows.slice(0, PROFILE_LIMIT)} timeZone={timeZone} />
        {rows.length > PROFILE_LIMIT && (
          <p className="mt-3 text-body-sm">
            <TextLink href="/people/queries">All your letters</TextLink>
          </p>
        )}
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
