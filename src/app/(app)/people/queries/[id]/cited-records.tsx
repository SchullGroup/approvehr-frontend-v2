"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  useToast,
} from "@/components/ui";
import type { ApiQueryDetail } from "@/lib/api/queries";
import {
  CITATION_KIND_WORD,
  MAX_CITATIONS,
  type ApiCitation,
} from "@/lib/api/query-ties";
import {
  citationRendering,
  citationStanding,
  type Formatters,
} from "@/lib/queries/citation-rows";
import { dayLabel } from "@/lib/store/conduct";
import { useQueryActions } from "@/lib/store/queries";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateTime } from "@/lib/time";
import { actionMessage } from "@/lib/use-action";
import { AddCitationDialog } from "./add-citation-dialog";

/**
 * The records a letter refers to, each as a read-only copy of what the record said.
 *
 * ## It is a copy, and it says so
 *
 * A reference is taken when it is added (so the issuer can see what it will say) and **taken again
 * and frozen when the letter is issued**. A draft's copy is a preview and a frozen one is what the
 * record said then: each says which, because a reader who took a preview for the frozen copy would
 * trust a figure that is about to be read again. The cited record changing afterwards changes
 * nothing here.
 *
 * ## Evidence, never a number
 *
 * Nothing here scores, ranks or counts anything. A field the copy did not hold draws no row
 * (`citationRendering`), and every value is typed text in a text node: a policy's wording is shown
 * as text and never as markup or a link.
 *
 * ## Who edits it
 *
 * `can.cite` is the server's and is the issuer's on a draft, and nobody else's: a drafting manager
 * cannot cite, so for them there is no control and no section while it is empty. Once the letter is
 * issued the section is read only for staff and for the person.
 */
export function CitedRecords({
  detail,
  refresh,
}: {
  detail: ApiQueryDetail;
  refresh: () => Promise<void>;
}) {
  const timeZone = useOrgTimezone();
  const toast = useToast();
  const actions = useQueryActions();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const editable = detail.can.cite;
  const citations = detail.citations;
  /* Nothing to say and nothing to do: no card, so a letter with no references reads as it did. */
  if (!editable && citations.length === 0) return null;

  const format: Formatters = {
    day: (day) => dayLabel(day),
    at: (instant) => formatDateTime(instant, timeZone),
  };

  async function remove(citation: ApiCitation) {
    setRemoving(citation.id);
    setProblem(null);
    try {
      await actions.removeCitation(detail.id, citation.id);
      await refresh();
      /* An act, never what was cited. */
      toast.push({ tone: "info", title: "Reference removed" });
    } catch (error) {
      setProblem(actionMessage(error, "that reference"));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="References"
        description={
          editable
            ? "Records about this person that the letter points to. Each is copied as it stands now and read again when the letter is issued."
            : "Records this letter points to, copied as they stood when it was issued."
        }
        action={
          editable ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAdding(true)}
              disabled={citations.length >= MAX_CITATIONS}
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Add a reference
            </Button>
          ) : undefined
        }
      />
      <CardBody className="flex flex-col gap-3">
        {citations.length === 0 ? (
          <p className="text-body-sm text-muted">
            No records are cited yet. A reference is optional.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {citations.map((citation) => (
              <CitationItem
                key={citation.id}
                citation={citation}
                format={format}
                {...(editable
                  ? {
                      onRemove: () => void remove(citation),
                      removing: removing === citation.id,
                    }
                  : {})}
              />
            ))}
          </ul>
        )}
        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </CardBody>

      {editable && (
        <AddCitationDialog
          open={adding}
          queryId={detail.id}
          subject={detail.subject}
          citations={citations}
          onClose={() => setAdding(false)}
          onAdded={refresh}
        />
      )}
    </Card>
  );
}

/** One reference: its kind and the server's one-line title, with the copy behind a disclosure. */
export function CitationItem({
  citation,
  format,
  onRemove,
  removing = false,
}: {
  citation: ApiCitation;
  format: Formatters;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const rendering = citationRendering(citation.asItStood, format);
  const standing = citationStanding(citation.frozen, citation.takenAt, format);
  return (
    <li className="rounded-md border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral" size="sm">
              {CITATION_KIND_WORD[citation.kind]}
            </Badge>
            <span className="break-words text-body-sm font-medium text-ink">
              {citation.title}
            </span>
          </p>
          <p className="mt-1 text-meta text-muted">{standing}</p>
        </div>
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            loading={removing}
            aria-label={`Remove this ${CITATION_KIND_WORD[citation.kind].toLowerCase()} reference`}
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
            Remove
          </Button>
        )}
      </div>

      {(rendering.rows.length > 0 ||
        rendering.notes.length > 0 ||
        rendering.wording !== null) && (
        <div className="mt-2">
          <Disclosure title="What the record said" level={4} dense>
            <div className="flex flex-col gap-3">
              {rendering.rows.length > 0 && (
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {rendering.rows.map((row) => (
                    <div key={row.label} className="flex flex-col gap-0.5">
                      <dt className="text-meta font-semibold text-muted">
                        {row.label}
                      </dt>
                      <dd className="break-words text-body-sm text-ink">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {rendering.notes.map((note) => (
                <p key={note} className="text-body-sm text-warning-text">
                  {note}
                </p>
              ))}
              {rendering.wording !== null && (
                <div className="flex flex-col gap-1">
                  <p className="text-meta font-semibold text-muted">
                    The wording as it stood
                  </p>
                  {/* Typed text, as text: never markup, never turned into links. */}
                  <p className="max-h-72 overflow-y-auto whitespace-pre-line break-words rounded-md bg-sunken p-3 text-body-sm text-ink">
                    {rendering.wording}
                  </p>
                </div>
              )}
            </div>
          </Disclosure>
        </div>
      )}
    </li>
  );
}
