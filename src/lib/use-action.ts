"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui";
import { kindOf, serverSentence } from "@/lib/api/failure";

/**
 * A write that failed, turned into a sentence — the counterpart to
 * `components/portal/load-failure.tsx`, which does the same job for a read.
 *
 * ## Why a write needs its own wording
 *
 * `LoadFailure`'s sentences are baked to a read: "did not load", "while
 * loading", "the server took too long to *send* it". None of that describes a
 * save being refused. So 126 sites across 84 files each wrote their own, and 89
 * of them landed on the same hand-typed `"Something went wrong. Try again."`
 * with the API's own sentence thrown away on either side of it.
 *
 * Both surfaces now share `lib/api/failure.ts` for **what happened** and keep
 * their own words for **how to say it**. That is the only split that holds:
 * the classification is genuinely the same and the wording genuinely is not.
 *
 * ## The one place a write must not copy a read
 *
 * **A read that times out can be retried freely. A write cannot.**
 *
 * A 504 on a `GET` means the answer did not arrive. A 504 on a `POST` means
 * *the answer* did not arrive — the write itself may well have landed. Telling
 * somebody "nothing was saved" there is a claim this side cannot support, and
 * inviting them to press the button again is inviting a duplicate objective, a
 * duplicate rating, a second bonus on one payroll.
 *
 * So `actionMessage` says the honest thing for that case — that it is not known
 * whether it saved, and to reload before trying again — and `retryIsSafe` is
 * deliberately narrower than `LoadFailure`'s `retryCouldHelp`.
 */
export function actionMessage(error: unknown, subject?: string): string {
  /* The server's own sentence about this refusal, wherever it wrote one. It
     names the permission, the field or the collision; nothing here can. */
  const said = serverSentence(error);
  if (said) return said;

  const it = subject ?? "that";
  switch (kindOf(error)) {
    case "offline":
      return (
        `The app cannot reach the server, so ${it} was not saved. Check your ` +
        "internet connection, then try again."
      );
    case "session":
      return (
        `Your session has ended, so ${it} was not saved. Sign in again and ` +
        "repeat it."
      );
    case "missing":
      return `${capitalise(it)} is not there any more, so nothing was changed.`;
    case "timeout":
      /* Never "nothing was saved" — see the header. */
      return (
        "The server took too long to answer, so it is not clear whether " +
        `${it} saved. Reload the page to check before trying again.`
      );
    case "throttled":
      return "Too many requests at once. Wait a moment, then try again.";
    case "server":
      return (
        `Something went wrong on our side, so ${it} was not saved. Try again ` +
        "in a moment; if it keeps happening, tell your administrator."
      );
    default:
      /* Matches the sentence the 89 hand-written sites already use, so
         adopting this changes nothing a reader sees for the common case. */
      return "Something went wrong. Try again.";
  }
}

/**
 * Whether pressing the same button again is *safe*, which is a stricter
 * question than whether it could help.
 *
 * A timeout is excluded even though a retry might well work, because the cost
 * of being wrong is a duplicate write rather than a wasted request.
 */
export function retryIsSafe(error: unknown): boolean {
  switch (kindOf(error)) {
    case "offline":
    case "throttled":
    case "server":
      return true;
    default:
      return false;
  }
}

const capitalise = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

export type ActionOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

/**
 * Run a write, report it, and never let a status code reach a screen.
 *
 * ```tsx
 * const { run, pending } = useAction();
 * await run(() => kpis.agree(id), {
 *   success: "Objective agreed",
 *   subject: "the objective",
 *   onDone: kpis.reload,
 * });
 * ```
 *
 * `notice` is the warning half: a write that succeeded and still has something
 * the reader must know — people whose department moved, a figure that was
 * clamped, a note the API returned. Return a sentence and the toast turns
 * amber and carries it; return `null` and nothing is flagged. Silence on a
 * consequence somebody would want to know about is the failure this exists to
 * prevent, and a warning on every ordinary save is how people learn to ignore
 * the colour.
 */
export function useAction(): {
  run: <T>(
    action: () => Promise<T>,
    options?: {
      /** Toast title on success. Omit for a silent success. */
      success?: string;
      /** Toast title on failure. */
      failure?: string;
      /** The thing being saved, as a noun phrase: `"the objective"`. */
      subject?: string;
      /** A consequence worth flagging on an otherwise successful write. */
      notice?: (value: T) => string | null | undefined;
      /** Usually the store's `reload`. Runs only on success. */
      onDone?: (value: T) => void;
    },
  ) => Promise<ActionOutcome<T>>;
  /** True while a run is in flight. For disabling the button that started it. */
  pending: boolean;
} {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async <T,>(
      action: () => Promise<T>,
      options: {
        success?: string;
        failure?: string;
        subject?: string;
        notice?: (value: T) => string | null | undefined;
        onDone?: (value: T) => void;
      } = {},
    ): Promise<ActionOutcome<T>> => {
      setPending(true);
      try {
        const value = await action();
        const note = options.notice?.(value) ?? null;
        if (options.success ?? note) {
          toast.push({
            title: options.success ?? "Done",
            tone: note ? "warning" : "success",
            ...(note ? { detail: note } : {}),
          });
        }
        options.onDone?.(value);
        return { ok: true, value };
      } catch (error) {
        toast.push({
          title: options.failure ?? "That did not work",
          tone: "danger",
          detail: actionMessage(error, options.subject),
        });
        return { ok: false, error };
      } finally {
        setPending(false);
      }
    },
    [toast],
  );

  return { run, pending };
}
