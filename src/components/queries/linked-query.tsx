"use client";

import Link from "next/link";
import { Field, Select } from "@/components/ui";
import { STATUS_LABEL, type ApiQuerySummary } from "@/lib/api/queries";
import { queryHref } from "@/lib/api/query-ties";
import { useCan } from "@/lib/permissions";
import { useQueriesSwitch, useQueryRegister } from "@/lib/store/queries";

/**
 * A plain, optional "Linked query" choice for another module's own form.
 *
 * ## A note about why, and nothing more
 *
 * A warning, an employment change or an exit can carry the id of a query as a note that it
 * followed one. **A query never sets anything in those modules**, and linking changes nothing in
 * the query either: the creator chooses it, here, in that module's own form, and the record is
 * made by that module with that module's own permission. Nothing on this field makes, changes or
 * ends anything.
 *
 * ## Who is offered what
 *
 * Only somebody who works queries (`ISSUE_QUERIES` or `DECIDE_QUERIES`, which every
 * `EDIT_RECORDS` holder has through the server's legacy expansion), only while the company has
 * queries on, only with a server, and only the queries **about this person** that have been served
 * and not withdrawn: the same list the server will accept. The server is still the authority and
 * refuses anything else in its own sentence.
 *
 * ## What it shows
 *
 * The reference and where it stands, never the subject line: a letter's subject is not for the
 * form of some other module. A person with no linkable query is shown nothing at all, not an
 * empty choice, and so is a failed read: the field is optional and a sentence about a read that
 * did not come back would only be noise.
 */
export function useLinkableQueries(subjectId: string): {
  rows: ApiQuerySummary[];
  /** Whether this reader may be offered the field at all. */
  offered: boolean;
} {
  const canIssue = useCan("ISSUE_QUERIES");
  const canDecide = useCan("DECIDE_QUERIES");
  const queries = useQueriesSwitch();
  const offered = (canIssue || canDecide) && queries.on && subjectId !== "";
  const register = useQueryRegister({ subjectId }, offered);
  const rows = (register.data?.rows ?? []).filter(
    (row) => row.status !== "DRAFT" && row.status !== "WITHDRAWN",
  );
  return { rows, offered };
}

export function LinkedQueryField({
  subjectId,
  value,
  onChange,
}: {
  subjectId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const { rows, offered } = useLinkableQueries(subjectId);
  if (!offered || rows.length === 0) return null;
  return (
    <Field
      label="Linked query"
      optional
      help="A note that this followed a query. It changes nothing about the query, and the query changes nothing here."
    >
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">None</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.reference ?? "A query"}, {STATUS_LABEL[row.status].toLowerCase()}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/**
 * The link back, on a record that was made after a query.
 *
 * Drawn only when the server sent a `queryId` with the record, which it does only for a reader who
 * may see it (a warning to the person it is about and to whoever edits records; a change or an exit
 * to staff). The address is built from the id. Draws nothing for a record with no query.
 */
export function LinkedQueryLine({
  queryId,
  reference,
  className,
  label = "Followed a query",
}: {
  queryId: string | null | undefined;
  reference: string | null | undefined;
  className?: string;
  /** What the link is the reader of: "Followed a query", or "Asked under a query" for a document. */
  label?: string;
}) {
  if (!queryId) return null;
  return (
    <p className={className ?? "text-meta text-muted"}>
      {label}:{" "}
      <Link
        href={queryHref(queryId)}
        className="font-medium text-accent-text underline-offset-2 hover:underline"
      >
        {reference ?? "open it"}
      </Link>
    </p>
  );
}

/**
 * The link from a document request back to the query it was asked under, **for staff screens
 * only**. A person reading their own request never gets this: the notification they followed said
 * only that HR asked for a document, and the request page is where they read what for.
 *
 * Drawn only for somebody who works queries (so the link opens for them and is not a 404 for
 * somebody who may not read it) while the company has queries on, and only where the server sent
 * the id with the request.
 */
export function QueryOriginLine({
  queryId,
  className,
}: {
  queryId: string | null | undefined;
  className?: string;
}) {
  const canIssue = useCan("ISSUE_QUERIES");
  const canDecide = useCan("DECIDE_QUERIES");
  const queries = useQueriesSwitch();
  if (!queryId || !(canIssue || canDecide) || !queries.on) return null;
  return (
    <LinkedQueryLine
      queryId={queryId}
      reference={null}
      label="Asked under a query"
      {...(className ? { className } : {})}
    />
  );
}
