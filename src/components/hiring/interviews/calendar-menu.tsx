"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarPlus, ChevronDown, Copy, Download } from "lucide-react";
import { useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { downloadBlob } from "@/lib/api/download";
import {
  eventFor,
  googleCalendarUrl,
  outlookCalendarUrl,
} from "@/lib/hiring/interviews/calendar";
import type { CalendarFile } from "@/lib/hiring/interviews/gateway";
import type { InterviewView } from "@/lib/hiring/interviews/model";
import { cn } from "@/lib/cn";

/**
 * "Add to calendar" for one interview.
 *
 * ## Links and a file, nothing else
 *
 * Google Calendar and Outlook are plain addresses that open the person's own calendar
 * with the entry filled in. The file is the calendar file for the interview: connected
 * it comes from the API (so the sequence and the contents are the server's, and the
 * download is on record), and the screen only saves it. No account is connected and
 * nothing is read from anybody's calendar.
 *
 * ## What is in it is not decided here
 *
 * The caller passes the fields this person is allowed to have. A panelist is passed what
 * the API gives a panelist, so a panelist's entry cannot carry more than that.
 *
 * Offered for an interview that is still to come, and for nothing else: a cancelled one
 * has no entry to add, and one that has happened has no use for it.
 */

type Props = {
  interview: Pick<
    InterviewView,
    | "id"
    | "candidateName"
    | "role"
    | "kind"
    | "scheduledFor"
    | "durationMins"
    | "location"
    | "joinUrl"
    | "sequence"
    | "status"
  >;
  /** Whose copy: a panelist's holds only what the API gives a panelist. */
  who: "staff" | "panelist";
  /** The file, from whichever side is in use. A rejection is shown as the sentence it carries. */
  getFile: () => Promise<CalendarFile>;
  /** Also offer to copy the join link, when the interview has one. */
  copyLink?: boolean;
  className?: string;
};

export function CalendarMenu({
  interview,
  who,
  getFile,
  copyLink = true,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLAnchorElement>(null);

  /* Escape closes it and gives focus back; opening it puts focus on the first choice. */
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (interview.status !== "SCHEDULED") return null;

  const event = eventFor(interview, who);
  const close = () => setOpen(false);

  async function download() {
    setBusy(true);
    try {
      const file = await getFile();
      downloadBlob(file.filename, file.blob);
      toast.push({
        title: `Downloaded ${file.filename}`,
        tone: "success",
        ...(file.note ? { detail: file.note } : {}),
      });
    } catch (error) {
      toast.push({
        title: "The calendar file was not downloaded",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(false);
      close();
    }
  }

  async function copy() {
    const link = interview.joinUrl;
    close();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.push({ title: "Join link copied", tone: "success" });
    } catch {
      toast.push({
        title: "The link was not copied",
        tone: "danger",
        detail:
          "Your browser would not let this page copy. Select it and copy it by hand.",
      });
    }
  }

  const item =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-body-sm text-body hover:bg-canvas hover:text-ink focus-visible:bg-canvas focus-visible:text-ink focus-visible:outline-none disabled:opacity-60";

  return (
    <div className={cn("relative inline-block text-left", className)}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-body-sm font-medium text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
      >
        <CalendarPlus aria-hidden="true" className="size-3.5" />
        Add to calendar
        <ChevronDown aria-hidden="true" className="size-3.5 text-muted" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={close}
            aria-hidden="true"
          />
          <div
            id={`${id}-menu`}
            role="menu"
            aria-label="Add to calendar"
            className="animate-scale-in absolute left-0 z-50 mt-1.5 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-1.5 shadow-lg"
          >
            <a
              ref={first}
              role="menuitem"
              href={googleCalendarUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              className={item}
            >
              Google Calendar
            </a>
            <a
              role="menuitem"
              href={outlookCalendarUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              className={item}
            >
              Outlook
            </a>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void download()}
              className={item}
            >
              <Download aria-hidden="true" className="size-3.5" />
              Download .ics
            </button>
            {copyLink && interview.joinUrl && (
              <button
                type="button"
                role="menuitem"
                onClick={() => void copy()}
                className={item}
              >
                <Copy aria-hidden="true" className="size-3.5" />
                Copy join link
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
