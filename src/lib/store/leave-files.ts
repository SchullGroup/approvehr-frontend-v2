"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  leaveFilesApi,
  type AttachmentRule,
  type LeaveFileLimits,
  type LeaveFileList,
} from "@/lib/api/leave-files";
import { createSharedResource } from "@/lib/shared-resource";
import { useRevalidation } from "@/lib/revalidate";
import { useDebounced } from "@/lib/use-debounced";
import { useSession } from "./session";

/**
 * Files on leave requests, from the API.
 *
 * Connected only. A file goes to object storage through the API, and the demo
 * has neither, so every hook here answers "nothing" offline and no screen
 * offers a picker for something that could not be kept: absent is not zero, and
 * an offered control that cannot work is the dead button this product refuses.
 *
 * ## Why the limits are one shared read
 *
 * They are the same for everybody and change when the server is redeployed, and
 * three places ask: the request form, the leave-type settings and the drawer's
 * "add a file". One request per session, however many ask.
 *
 * ## The value is the outcome, not the limits
 *
 * The fetcher resolves rather than rejecting, because a shared resource caches
 * what it resolves and a rejection arrives as `null`, which here would read as
 * "nothing is known", and `storage: false` is a fact that **hides** the picker.
 * A failed read must not look like either. The unknown state shows nothing and
 * lets the API refuse in its own words if somebody gets that far.
 */

type LimitsOutcome = { limits: LeaveFileLimits | null; error: ApiError | null };

const limitsResource = createSharedResource<LimitsOutcome>(
  async (_key, signal) => {
    try {
      return { limits: await leaveFilesApi.limits(signal), error: null };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      return { limits: null, error: error instanceof ApiError ? error : null };
    }
  },
);

const LIMITS_KEY = "company";

export type LeaveFileLimitsState = {
  /** Null until it answers, offline, and when the read failed. */
  limits: LeaveFileLimits | null;
  /**
   * Whether files can be kept here at all. **Null is unknown**, which is not
   * `false`: only an answer of `storage: false` disables a control, and only an
   * answer of `true` offers a picker.
   */
  storage: boolean | null;
};

export function useLeaveFileLimits(): LeaveFileLimitsState {
  const { isConnected } = useSession();
  const outcome = limitsResource.use(isConnected ? LIMITS_KEY : null);
  const limits = outcome?.limits ?? null;
  return { limits, storage: limits ? limits.storage : null };
}

/* ------------------------------------------------------------- the rule */

export type AttachmentRuleInput = {
  leaveTypeId: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  endDate: string;
};

/**
 * Whether the leave type asks for a supporting file for these dates, as they
 * are picked.
 *
 * The API decides, from the request's own days (working or calendar, less
 * holidays, as the type counts them), so this never counts a day. `required` is
 * already false when the server cannot store a file, which is also what `create`
 * does: not satisfiable is not the same as not satisfied.
 *
 * ## An answer is read against the live dates, not the debounced ones
 *
 * Debouncing the request alone leaves the answer to the previous dates on
 * screen beside a date that has already changed, and "a file is required" for
 * three days is a different statement from the one for two. The answer carries
 * the key it was asked for, and is read only against the key now on screen.
 * `null` is "not known": no line, which is not the same as "not required".
 */
export function useAttachmentRule(input: AttachmentRuleInput | null): {
  rule: AttachmentRule | null;
} {
  const { isConnected } = useSession();
  const liveKey = input
    ? `${input.leaveTypeId}|${input.startDate}|${input.endDate}`
    : null;
  const asked = useDebounced(liveKey, 250);
  const [answer, setAnswer] = useState<{
    key: string;
    rule: AttachmentRule | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected || !asked) return;
    const [leaveTypeId, startDate, endDate] = asked.split("|");
    if (!leaveTypeId || !startDate || !endDate) return;
    const controller = new AbortController();
    let current = true;
    leaveFilesApi
      .rule({ leaveTypeId, startDate, endDate }, controller.signal)
      .then((rule) => {
        if (current) setAnswer({ key: asked, rule });
      })
      /* Dates the API will not price (an end before a start) are the form's own
         refusal to show; here they are just "not known". */
      .catch(() => {
        if (current) setAnswer({ key: asked, rule: null });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [isConnected, asked]);

  return {
    rule:
      answer && liveKey !== null && answer.key === liveKey ? answer.rule : null,
  };
}

/* ---------------------------------------------------------- one request's files */

export type LeaveFilesState = {
  list: LeaveFileList | null;
  loading: boolean;
  /** The API's refusal, if it gave one. A 403 is `forbidden`: render nothing. */
  error: ApiError | null;
  reload: () => void;
};

/**
 * The files on one request, for a reader the API lets in.
 *
 * Pass `null` for anybody who would be refused: the screen decides from what the
 * detail says (the owner, HR, or a reduced read), because a call that is certain
 * to be a 403 is a request for nothing. The list is metadata only, so asking is
 * not a look in the audit trail; opening a file is, and is a different call.
 */
export function useLeaveFiles(requestId: string | null): LeaveFilesState {
  const { isConnected } = useSession();
  const active = isConnected && requestId !== null;
  const [nonce, setNonce] = useState(0);
  const [fetched, setFetched] = useState<{
    id: string;
    list: LeaveFileList | null;
    error: ApiError | null;
  } | null>(null);

  /* Re-ask when somebody comes back to the window, without blanking the list. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!active || requestId === null) return;
    const controller = new AbortController();
    let current = true;
    leaveFilesApi
      .list(requestId, controller.signal)
      .then((list) => {
        if (current) setFetched({ id: requestId, list, error: null });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (current) {
          setFetched({
            id: requestId,
            list: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [active, requestId, nonce, revalidation]);

  const matched = active && fetched !== null && fetched.id === requestId;
  return {
    list: matched ? fetched.list : null,
    loading: active && !matched,
    error: matched ? fetched.error : null,
    reload: () => setNonce((n) => n + 1),
  };
}
