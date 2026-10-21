"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Plus } from "lucide-react";
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Input,
  Skeleton,
  TextLink,
} from "@/components/ui";
import type { ApiShareLinks } from "@/lib/api/careers";
import type { ApiError } from "@/lib/api/client";

/**
 * The links to hand out for one advert, one per place it will be posted.
 *
 * Each carries `?src=` so an application says where its applicant came from, and
 * "Copy" puts that exact address on the clipboard. The addresses are the API's —
 * it knows where the careers pages are served — and nothing here is built from
 * `window.location`, which on the signed-in app is the wrong origin.
 *
 * "Open" is the site's own share page (LinkedIn's, X's, WhatsApp's), with the
 * tracked link already in it; opening it is the person's own click and nothing is
 * posted for them. A channel with no such page (the careers page itself, a job
 * board) has only Copy.
 *
 * Says plainly when the advert is not live: the links work, and open to nothing
 * until it is.
 */
export function ShareLinks({
  links,
  loading,
  error,
  onAdd,
  title,
}: {
  links: ApiShareLinks | null;
  loading: boolean;
  error: ApiError | null;
  onAdd: (channel: string) => boolean;
  title: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  async function copy(channel: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setFailed(null);
      setCopied(channel);
      window.setTimeout(
        () => setCopied((current) => (current === channel ? null : current)),
        2500,
      );
    } catch {
      /* A browser that will not let the page write to the clipboard still lets a
         person select what is on the screen, so show it. */
      setFailed(url);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Share this advert"
        description="Each link is tagged with where you post it, so you can see which place brings people in."
      />
      <CardBody className="flex flex-col gap-4">
        {loading && (
          <>
            <Skeleton className="h-24 w-full" />
            <span className="sr-only-focusable">Loading the links</span>
          </>
        )}

        {error && (
          <Callout tone="danger" title="The links did not load">
            {error.message}
          </Callout>
        )}

        {links && !links.live && (
          <Callout tone="warning" title={`${title} is not live`}>
            These links will open to nothing until it is published.
          </Callout>
        )}

        {links && (
          <>
            <ul className="flex list-none flex-col divide-y divide-line rounded-lg border border-line p-0">
              {links.links.map((link) => (
                <li
                  key={link.channel}
                  data-testid="share-link"
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-48 flex-1">
                    <p className="text-body-sm font-medium text-ink">
                      {link.label}
                    </p>
                    <p className="tabular break-all text-meta text-muted">
                      {link.url}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {link.shareUrl && (
                      <TextLink
                        href={link.shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-body-sm"
                      >
                        Open
                        <ExternalLink aria-hidden="true" className="size-3.5" />
                      </TextLink>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Copy the ${link.label} link`}
                      onClick={() => void copy(link.channel, link.url)}
                    >
                      {copied === link.channel ? (
                        <Check aria-hidden="true" className="size-3.5" />
                      ) : (
                        <Copy aria-hidden="true" className="size-3.5" />
                      )}
                      {copied === link.channel ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {failed && (
              <p role="status" className="text-body-sm text-muted">
                Your browser would not copy it. Select it here:{" "}
                <span className="tabular break-all text-ink">{failed}</span>
              </p>
            )}

            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (onAdd(custom)) {
                  setCustom("");
                  setCustomError(null);
                } else {
                  setCustomError("Name the place, like jobberman or campus.");
                }
              }}
            >
              <div className="min-w-48 flex-1">
                <label
                  htmlFor="share-custom"
                  className="mb-1.5 block text-body-sm font-medium text-ink"
                >
                  Another place
                </label>
                <Input
                  id="share-custom"
                  value={custom}
                  placeholder="jobberman"
                  maxLength={40}
                  aria-invalid={customError !== null}
                  aria-describedby={
                    customError ? "share-custom-error" : undefined
                  }
                  onChange={(event) => {
                    setCustom(event.target.value);
                    setCustomError(null);
                  }}
                />
              </div>
              <Button type="submit" variant="secondary" size="md">
                <Plus aria-hidden="true" className="size-4" />
                Add a link
              </Button>
              {customError && (
                <p
                  id="share-custom-error"
                  className="w-full text-body-sm text-danger-text"
                >
                  {customError}
                </p>
              )}
            </form>
          </>
        )}
      </CardBody>
    </Card>
  );
}
