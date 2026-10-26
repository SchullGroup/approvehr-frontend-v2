"use client";

import { Callout, Skeleton } from "@/components/ui";
import type { EmailPreview } from "@/lib/hiring/comms/model";

/**
 * What an email would look like.
 *
 * Connected, the API makes it and sends the email as it would go out, which is shown
 * inside a frame that can run nothing: it is a company's own words merged with a
 * stranger's name, and none of it is ever treated as part of this page. Offline there
 * is no renderer, so it shows the subject and the words.
 *
 * It says plainly whose details it is made with. A preview with made-up details is a
 * shape, not a promise about any one person.
 */

const list = (fields: readonly string[]): string =>
  fields.map((field) => `{${field}}`).join(", ");

export function EmailPreviewPane({
  preview,
  loading,
}: {
  preview: EmailPreview | null;
  /** An answer for the text as it was a moment ago is on its way. */
  loading: boolean;
}) {
  if (!preview) {
    return (
      <div aria-busy={loading}>
        <Skeleton className="h-40 w-full" />
        <span className="sr-only-focusable">Making the preview</span>
      </div>
    );
  }

  if (!preview.valid) {
    return (
      <p className="rounded-md border border-dashed border-line-strong p-4 text-body-sm text-muted">
        There is no preview yet. Fix what is marked on the left, and it will
        appear here.
      </p>
    );
  }

  return (
    <div
      className={
        loading ? "flex flex-col gap-3 opacity-60" : "flex flex-col gap-3"
      }
    >
      <p className="text-meta text-muted">
        {preview.sample
          ? "Made with made-up details, so you can see the shape."
          : "Made with this person's own details."}
      </p>

      {preview.missing.length > 0 && (
        <Callout tone="warning" title="This would not be sent">
          {list(preview.missing)} has no value for this person, and an email
          with a blank in it is worse than none.
        </Callout>
      )}

      {preview.html ? (
        <iframe
          title="The email as it would be sent"
          sandbox=""
          srcDoc={preview.html}
          className="h-96 w-full rounded-md border border-line bg-surface"
        />
      ) : (
        <div className="rounded-md border border-line bg-surface p-4">
          <p className="text-body-sm font-semibold text-ink">
            {preview.subject}
          </p>
          <div className="mt-3 flex flex-col gap-3 text-body-sm text-body">
            {(preview.text ?? "")
              .split(/\n{2,}/)
              .filter((paragraph) => paragraph.trim() !== "")
              .map((paragraph, index) => (
                <p key={index} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
