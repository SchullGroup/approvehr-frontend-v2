"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { ApiError } from "@/lib/api/client";
import {
  workFlagsApi,
  type ApiWorkFlag,
  type WorkFlags,
} from "@/lib/api/work-flags";
import { useRevalidation } from "@/lib/revalidate";
import { createSharedResource } from "@/lib/shared-resource";
import { useFeatureSettings } from "@/lib/store/features";
import { useSession } from "@/lib/store/session";

/**
 * The flags on one person's finished work for one cycle, and the two things the person can do to them.
 *
 * ## What it says
 *
 * - `flags` is what was written, or **`null` when the server did not say**. A panel draws a flag, and
 *   a count of them, whenever this is a map, **whether or not the switch is on**: turning "Work in
 *   review answers" off keeps what was written and keeps showing it. `null` is no claim, never "nothing
 *   was flagged": not asked yet, offline, a reader the server refuses, a failed request, or a server one
 *   deploy behind that sends no list.
 * - `on` says only whether a flag can be raised or changed now. Taking one back is not gated by it.
 *
 * ## One answer for every panel
 *
 * The live list and the record kept with a rating are two panels on one page, and a flag raised in one
 * has to be on the other at once. The answer is held in a shared resource keyed by cycle and person, so
 * two panels are one read and one state, and a write publishes to both.
 *
 * ## A write never blanks the screen
 *
 * Raising or taking back a flag writes the server's own reply into the shared answer (`set`), and
 * nothing is dropped and re-read: the panel, the dialog that raised it and where the person is focused
 * all stay where they were. A reply that cannot be read falls back to a quiet second read. That read,
 * and the one made when this screen mounts again or the window is returned to, **replace the answer
 * when they land and never empty it first**, and one that fails or cannot be read changes nothing.
 *
 * It asks only when `enabled` (the panel is one the reader can see) and the server said what the
 * setting is (`workInAnswers` is not `null`): a server that does not know the setting has no such route.
 *
 * Failures are thrown, for the dialog or the row that asked to say in the server's own words. Taking a
 * flag back that the server says is not there (answered with 404) is not one: it is already gone, which
 * is what the person asked for, and it leaves the answer as if it had just been taken back.
 */
export type WorkFlagsRead = {
  /** A flag can be raised or changed now. */
  on: boolean;
  /** By task id, which is how a row finds its flag. `null`: the server did not say, so draw nothing. */
  flags: ReadonlyMap<string, ApiWorkFlag> | null;
  flag: (issueId: string, reason: string) => Promise<void>;
  unflag: (issueId: string) => Promise<void>;
};

const keyOf = (cycleId: string, employeeId: string): string =>
  `${cycleId}|${employeeId}`;

const readKey = (key: string, signal?: AbortSignal) => {
  const at = key.indexOf("|");
  return workFlagsApi.read(key.slice(0, at), key.slice(at + 1), signal);
};

/** One answer per person and cycle, however many panels on the screen ask for it. */
const answers = createSharedResource<WorkFlags | null>(readKey);

/** A second read that replaces the answer without emptying it, and is one read however many ask. */
const inflight = new Map<string, Promise<void>>();

function reread(key: string): Promise<void> {
  const running = inflight.get(key);
  if (running) return running;
  const next = (async () => {
    try {
      const fresh = await readKey(key);
      /* An answer this side cannot read is not worth replacing a good one with. */
      if (fresh !== null) answers.set(key, fresh);
    } catch {
      /* What is held stays: one failed read is no reason to blank a screen. */
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, next);
  return next;
}

export function useWorkFlags(args: {
  cycleId: string | null;
  subjectId: string;
  enabled: boolean;
}): WorkFlagsRead {
  const { cycleId, subjectId, enabled } = args;
  const { isConnected } = useSession();
  const { workInAnswers } = useFeatureSettings();
  const key =
    isConnected && enabled && workInAnswers !== null && cycleId !== null
      ? keyOf(cycleId, subjectId)
      : null;

  const answer = answers.use(key);

  /* What is held right now, for the two writes and the quiet read below to build on. */
  const held = useRef(answer);
  useEffect(() => {
    held.current = answer;
  });

  /* The shared answer has no focus revalidation of its own. Where something is already held, this
     screen mounting again or the window being returned to asks once more, quietly. A first mount has
     nothing held, and the resource's own first read is the one request it needs. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (key !== null && held.current !== null) void reread(key);
  }, [key, revalidation]);

  const flags = useMemo(
    () =>
      answer !== null && answer.flags !== null
        ? new Map(answer.flags.map((flag) => [flag.issueId, flag]))
        : null,
    [answer],
  );

  const flag = useCallback(
    async (issueId: string, reason: string) => {
      if (cycleId === null) return;
      const made = await workFlagsApi.flag(cycleId, subjectId, issueId, reason);
      const at = keyOf(cycleId, subjectId);
      const base = held.current;
      if (made !== null && base !== null && base.flags !== null) {
        /* The server's own reply: a flag it accepted proves a flag can be raised. */
        answers.set(at, {
          on: true,
          flags: [...base.flags.filter((one) => one.issueId !== issueId), made],
        });
      } else {
        await reread(at);
      }
    },
    [cycleId, subjectId],
  );

  const unflag = useCallback(
    async (issueId: string) => {
      if (cycleId === null) return;
      try {
        await workFlagsApi.unflag(cycleId, subjectId, issueId);
      } catch (caught) {
        /* Not found: the flag is already gone (taken back in another tab or window), which is what was
           asked for. It leaves the answer here too, with nothing said. Anything else is the server
           refusing, and is thrown for the row to say. */
        if (!(caught instanceof ApiError && caught.status === 404))
          throw caught;
      }
      const at = keyOf(cycleId, subjectId);
      const base = held.current;
      if (base !== null && base.flags !== null) {
        answers.set(at, {
          on: base.on,
          flags: base.flags.filter((one) => one.issueId !== issueId),
        });
      } else {
        await reread(at);
      }
    },
    [cycleId, subjectId],
  );

  return { on: answer !== null && answer.on, flags, flag, unflag };
}
