"use client";

import { useState } from "react";
import { Button, Callout, Checkbox, Modal, Skeleton } from "@/components/ui";
import { EXPORT_PRIVACY, people } from "@/lib/hiring/hired/copy";
import type { ExportExtra, ExportOptions } from "@/lib/hiring/hired/model";
import type { ApiError } from "@/lib/api/client";

/**
 * Exporting the Hired list to a spreadsheet.
 *
 * ## What it will not hide
 *
 * - **It is personal data**, and the dialog says so, and that the export is logged:
 *   who, when and how many people, never the contents.
 * - **The columns are the API's.** Every file carries the hire's own record, and the
 *   dialog lists those columns so nobody is surprised by what is in it. What can be
 *   chosen is what to add: an answer to each question, a screening score, pay.
 * - **What the viewer may not see is not offered.** Extras come from the API already
 *   narrowed to what this person may read. A column they may not see is absent, not
 *   greyed: a greyed one still tells them it exists, and asking for one is refused
 *   rather than quietly leaving it out of the file.
 * - **The cap is the API's.** When the list is longer than one file holds, the button
 *   is off and the API's own wording says how to narrow it.
 *
 * It is the same dialog whether it is for the whole list under its filters or for the
 * people who are ticked; `scope` says which, in words.
 */

export function ExportDialog({
  open,
  onClose,
  scope,
  total,
  options,
  loading,
  loadError,
  busy,
  error,
  onExport,
}: {
  open: boolean;
  onClose: () => void;
  /** Who the file is for, in words: "everyone on the list under these filters". */
  scope: string;
  /** How many people the file would hold. */
  total: number;
  options: ExportOptions | null;
  loading: boolean;
  loadError: ApiError | null;
  busy: boolean;
  /** The last refusal, in the API's words. */
  error: string | null;
  onExport: (extras: ExportExtra[]) => void;
}) {
  const [extras, setExtras] = useState<ReadonlySet<ExportExtra>>(new Set());
  const [wasOpen, setWasOpen] = useState(false);

  /* Each time it opens it starts with nothing added. Derived while rendering, so
     nothing flashes a stale choice. */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setExtras(new Set());
  }

  const over = options !== null && total > options.maxRows;
  const capSentence =
    options === null
      ? null
      : (options.capMessage ??
        `A file holds at most ${options.maxRows.toLocaleString("en-NG")} people. Narrow the filters, or tick fewer people, and export in parts.`);

  const toggle = (key: ExportExtra) => {
    const next = new Set(extras);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExtras(next);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Export the Hired list"
      description={`A spreadsheet of ${scope}: ${people(total)}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={options === null || over || total === 0}
            onClick={() => onExport([...extras])}
          >
            Download CSV
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Callout tone="warning" title="This file holds personal data">
          {EXPORT_PRIVACY}
        </Callout>

        {loading && (
          <>
            <Skeleton className="h-24 w-full" />
            <span className="sr-only-focusable">
              Loading the export options
            </span>
          </>
        )}

        {loadError && !options && (
          <p role="alert" className="text-body-sm text-danger-text">
            {loadError.message}
          </p>
        )}

        {options && (
          <>
            <div>
              <p className="text-body-sm font-semibold text-ink">
                Every file has these columns
              </p>
              <p className="mt-1 text-body-sm text-muted">
                {options.fixed.join(", ")}.
              </p>
            </div>

            {options.extras.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-body-sm font-semibold text-ink">
                  Add to the file
                </legend>
                {options.extras.map((extra) => (
                  <Checkbox
                    key={extra.key}
                    label={extra.label}
                    {...(extra.help ? { description: extra.help } : {})}
                    checked={extras.has(extra.key)}
                    onChange={() => toggle(extra.key)}
                  />
                ))}
              </fieldset>
            )}

            {over && capSentence && (
              <p role="alert" className="text-body-sm text-danger-text">
                {capSentence}
              </p>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="text-body-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
