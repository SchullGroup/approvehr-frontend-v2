"use client";

import { Button, Modal } from "@/components/ui";
import type { ApiPosting } from "@/lib/api/careers";
import { payRange, workTypeLabel } from "@/lib/marketing/careers";

/**
 * "Publish it?", with the page a candidate will read (UAT 23 Nov, U98 /
 * PERF-18).
 *
 * Publishing used to be one menu click with no question, and an advert could go
 * public saying nothing about the job. Publishing puts a statement out in the
 * company's name where anybody can read it, so it asks first and shows what is
 * about to be public: the title, the line under it and the description.
 *
 * An advert with no description is not offered: the box says so and the button
 * is off, because a candidate cannot apply sensibly to a title alone. The way
 * on is Edit, which the screen that opened this already offers.
 */
export function PublishAdvertDialog({
  posting,
  open,
  busy = false,
  onClose,
  onPublish,
}: {
  posting: Pick<
    ApiPosting,
    | "title"
    | "summary"
    | "description"
    | "location"
    | "employmentType"
    | "showSalary"
    | "salaryMinKobo"
    | "salaryMaxKobo"
  > | null;
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onPublish: () => void;
}) {
  const description = (posting?.description ?? "").trim();
  const empty = description === "";
  const pay =
    posting && posting.showSalary
      ? payRange({
          salaryMinKobo: posting.salaryMinKobo,
          salaryMaxKobo: posting.salaryMaxKobo,
        })
      : null;
  const facts = posting
    ? [workTypeLabel(posting.employmentType), posting.location, pay].filter(
        (fact): fact is string => Boolean(fact),
      )
    : [];

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={posting ? `Publish ${posting.title}?` : "Publish this advert?"}
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={busy}
            disabled={empty}
            onClick={onPublish}
          >
            Publish it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-muted">
          It goes on your careers page, where anybody can read it and apply.
          This is what they will see.
        </p>
        {posting && (
          <section
            aria-label="How the advert will read"
            className="rounded-lg border border-line p-4"
          >
            <h3 className="text-body-md font-semibold text-ink">
              {posting.title}
            </h3>
            {facts.length > 0 && (
              <p className="mt-1 text-meta text-muted">{facts.join(" · ")}</p>
            )}
            {posting.summary.trim() && (
              <p className="mt-3 text-body-sm text-ink">{posting.summary}</p>
            )}
            {empty ? (
              <p className="mt-3 text-body-sm text-danger-text">
                It says nothing about the job yet. Edit it and add a description
                first.
              </p>
            ) : (
              <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-line text-body-sm text-body">
                {description}
              </p>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
