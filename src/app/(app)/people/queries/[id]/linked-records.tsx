"use client";

import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { EXIT_KINDS } from "@/lib/api/offboarding";
import type { ApiQueryDetail } from "@/lib/api/queries";
import {
  LEAD_DATE_WORD,
  LEAD_KIND_WORD,
  leadHref,
  type ApiQueryLead,
} from "@/lib/api/query-ties";
import { LEVEL_LABEL, dayLabel } from "@/lib/store/conduct";

/**
 * The records this query led to, and a way to each.
 *
 * ## A link, and nothing more
 *
 * A query **performs none of these**. Each record was made in its own module, by somebody holding
 * that module's own permission, and carries this query's id as a note about why. So this section
 * is a list of links, and it says so: there is no button here that makes, changes or ends
 * anything, and a query never sets a status or opens an exit.
 *
 * ## Staff only, and only what the server sent
 *
 * `leads` is absent for the person (they never learn from a letter that a change or an exit is
 * being prepared) and for a drafting manager, and for staff it holds only the kinds that reader
 * may read in their own module. So a link is drawn for each lead the server sent and for nothing
 * else, and the address is built from the kind and ids (`leadHref`), never from text the API wrote.
 */
export function LinkedRecords({ detail }: { detail: ApiQueryDetail }) {
  const leads = detail.leads ?? [];
  if (leads.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title="Linked records"
        description="Made in their own part of ApproveHR and noted as following this query. A query makes none of them."
      />
      <CardBody>
        <ul className="flex flex-col gap-2">
          {leads.map((lead) => (
            <li
              key={`${lead.kind}-${lead.id}`}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-line p-3"
            >
              <span className="min-w-0 text-body-sm text-ink">
                <span className="font-medium">{LEAD_KIND_WORD[lead.kind]}</span>
                {leadWords(lead) && (
                  <span className="text-muted">, {leadWords(lead)}</span>
                )}
              </span>
              <Link
                href={leadHref(lead, detail.subject.id)}
                className="text-body-sm font-medium text-accent-text underline-offset-2 hover:underline"
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

const CHANGE_KIND_WORD: Record<string, string> = {
  CONFIRMATION: "confirmation",
  PROBATION_EXTENDED: "probation extended",
  PROBATION_FAILED: "probation not confirmed",
  PROMOTION: "promotion",
  TRANSFER: "transfer",
  GRADE_CHANGE: "grade change",
  PAY_CHANGE: "pay change",
};

/** "written warning, recorded 12 Nov 2026": the sub-kind and the day, each only if the server sent it. */
export function leadWords(lead: ApiQueryLead): string | null {
  const kind = lead.subKind;
  let sub: string | null = null;
  if (kind) {
    if (lead.kind === "WARNING") {
      const level = Object.entries(LEVEL_LABEL).find(([id]) => id === kind);
      sub = level ? level[1].toLowerCase() : null;
    } else if (lead.kind === "EMPLOYMENT_CHANGE") {
      sub = CHANGE_KIND_WORD[kind] ?? null;
    } else {
      sub = EXIT_KINDS.find((entry) => entry.value === kind)?.label ?? null;
    }
  }
  const when =
    lead.date && lead.dateMeans
      ? `${LEAD_DATE_WORD[lead.dateMeans]} ${dayLabel(lead.date)}`
      : null;
  const words = [sub, when].filter((part): part is string => part !== null);
  return words.length > 0 ? words.join(", ") : null;
}
