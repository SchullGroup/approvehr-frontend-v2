"use client";

import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import { Button, TextLink } from "@/components/ui";
import { failureMessage } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";

/**
 * "Open CV" — one press, one audited request, one file.
 *
 * ## Why it asks every time
 *
 * A list of two hundred applicants used to carry two hundred download links
 * minted at the moment the list loaded: live for as long as they lasted, in the
 * page source, and nothing recorded who followed which. Now a row carries no link
 * at all. Pressing this asks the API for **one** short-lived address for **this**
 * person's file, and the API writes down who asked. The cost is a round trip on
 * the press; the gain is that "who looked at this candidate's CV" has an answer.
 *
 * ## The tab is opened before the answer arrives
 *
 * A browser lets a page open a new tab inside a click and is suspicious of one
 * opened after an `await` — Safari most of all. So the tab is opened blank in the
 * click, cut loose from this page (`opener = null`, which is what `noopener`
 * does for a link), and pointed at the file when the address arrives. If the
 * browser still refused the tab, the address is shown as a link to press, which
 * is a fresh click and always allowed. If the request fails, the blank tab is
 * closed again rather than left behind.
 *
 * ## Nothing to open is an answer, not a failure
 *
 * The API answers with no address and a sentence when file storage is not set up
 * or the application names a CV that was never uploaded. That is shown as the
 * API wrote it — it is the one place that knows which of the two it is — and the
 * blank tab is closed again.
 *
 * ## It says why it failed
 *
 * Not allowed, a file the virus check flagged, storage down and "try again" are
 * different sentences. The API writes the first two and the storage one itself, so
 * those are shown as written; anything else goes through the shared failure
 * panel's wording. It appears beside the button, announced, and the button comes
 * back.
 */
export function OpenCv({
  open,
  label = "Open CV",
  className,
}: {
  /** Asks the API for the file's address. Throws an `ApiError` when refused. */
  open: () => Promise<{ url: string | null; note: string | null }>;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "opening" }
    | { status: "blocked"; url: string }
    | { status: "nothing"; note: string | null }
    | { status: "failed"; error: unknown }
  >({ status: "idle" });
  const busy = useRef(false);

  async function press() {
    if (busy.current) return;
    busy.current = true;
    setState({ status: "opening" });

    /* Inside the click, so it counts as the person's own action. */
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;

    try {
      const { url, note } = await open();
      if (url === null) {
        tab?.close();
        setState({ status: "nothing", note });
      } else if (tab) {
        tab.location.href = url;
        setState({ status: "idle" });
      } else {
        setState({ status: "blocked", url });
      }
    } catch (error) {
      tab?.close();
      setState({ status: "failed", error });
    } finally {
      busy.current = false;
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant="ghost"
        size="sm"
        loading={state.status === "opening"}
        disabled={state.status === "opening"}
        onClick={() => void press()}
        className={className}
      >
        <FileText aria-hidden="true" className="size-3.5" />
        {state.status === "opening" ? "Opening…" : label}
      </Button>

      {state.status === "blocked" && (
        <span role="status" className="text-meta text-muted">
          Your browser stopped the new tab.{" "}
          <TextLink href={state.url} target="_blank" rel="noopener noreferrer">
            Open the file
          </TextLink>
        </span>
      )}

      {state.status === "nothing" && (
        <span role="status" className="max-w-xs text-meta text-muted">
          {state.note ?? "There is no file to open for this application."}
        </span>
      )}

      {state.status === "failed" && (
        <span role="alert" className="max-w-xs text-meta text-danger-text">
          {cvFailure(state.error)}
        </span>
      )}
    </span>
  );
}

/**
 * The sentence for a CV that would not open.
 *
 * A 503 is the one server error whose text the API wrote for the reader — "we
 * could not check your CV just now, wait a minute" — so it is shown as written.
 * Every other 5xx has no sentence of its own and falls through to the shared
 * wording, as does everything that is not an `ApiError` at all.
 */
function cvFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 503 && error.message) {
    return error.message;
  }
  return failureMessage(error, "this CV");
}

/**
 * Whether this person may ask for a CV.
 *
 * The same two permissions that can read an application at all: managing hiring
 * or approving it. The API enforces it and refuses everybody else; this is so the
 * button is not offered to somebody who can only get a refusal.
 */
export function useCanOpenCv(): boolean {
  const manage = useCan("MANAGE_HIRING");
  const approve = useCan("APPROVE_HIRING");
  return manage || approve;
}
