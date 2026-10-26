"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui";
import { ApplicationAnswers } from "@/components/hiring/application-answers";
import { careersApi } from "@/lib/api/careers";
import { ApiError } from "@/lib/api/client";
import { hasExtras, type ApplicationExtras } from "@/lib/hiring/answers-view";
import { extrasFromDetail } from "@/lib/hiring/form-wire";
import { demoApplicationExtras } from "@/lib/store/careers";

/**
 * "Their answers" on one row of the queue, fetched when somebody asks.
 *
 * A list of two hundred applicants should not carry two hundred sets of answers,
 * most of which nobody opens. The row says how many things there are to look at
 * (a flag, a possible duplicate) from what the list already holds, and this loads
 * the rest, once, on the first open.
 *
 * Connected it asks the API for the application; in a demo it reads the seeded
 * answers. A person who may not open files does not get the Open button on a file
 * answer — `canOpenFiles` is the same gate `OpenCv` uses for a CV.
 */
export function RowAnswers({
  applicationId,
  connected,
  canOpenFiles,
}: {
  applicationId: string;
  connected: boolean;
  canOpenFiles: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; extras: ApplicationExtras }
    | { status: "failed"; message: string }
  >({ status: "idle" });
  const asked = useRef(false);

  async function load() {
    setState({ status: "loading" });
    try {
      if (!connected) {
        const extras = demoApplicationExtras(applicationId);
        setState({
          status: "ready",
          extras: extras ?? {
            reference: null,
            source: null,
            answers: [],
            consent: null,
            flagCount: 0,
            duplicate: null,
          },
        });
        return;
      }
      const detail = await careersApi.getApplication(applicationId);
      setState({ status: "ready", extras: extrasFromDetail(detail) });
    } catch (error) {
      asked.current = false;
      setState({
        status: "failed",
        message:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !asked.current) {
      asked.current = true;
      void load();
    }
  }

  const panelId = `answers-${applicationId}`;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="inline-flex items-center gap-1.5 rounded-md py-1 text-body-sm font-medium text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
        {open ? "Hide their answers" : "Their answers and what they agreed to"}
      </button>

      <div id={panelId} hidden={!open} className="mt-2">
        {open && state.status === "loading" && (
          <div>
            <Skeleton className="h-16 w-full" />
            <span className="sr-only-focusable">Loading their answers</span>
          </div>
        )}
        {open && state.status === "failed" && (
          <p role="alert" className="text-body-sm text-danger-text">
            {state.message}
          </p>
        )}
        {open && state.status === "ready" && (
          <>
            {hasExtras(state.extras) ? (
              <ApplicationAnswers
                extras={state.extras}
                {...(connected && canOpenFiles
                  ? {
                      openFile: (answerId: string) =>
                        careersApi.openAnswerFile(applicationId, answerId),
                    }
                  : {})}
              />
            ) : (
              <p className="text-body-sm text-muted">
                This advert asked nothing beyond the basics, so there are no
                answers to show.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
