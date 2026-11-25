"use client";

import { useEffect, useState } from "react";
import { meApi, sectionData } from "@/lib/api/me";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "@/lib/store/session";

/**
 * The signed-in person's own birthday greeting, or `null`.
 *
 * `GET /me/today?sections=birthday` asks for that one section alone, which the
 * API works out on the spot from the person's own record and the company's
 * calendar day. It answers a greeting on the day and `null` on every other, so
 * **`null` is the ordinary answer and the screen draws nothing for it**.
 *
 * ## Why this is not read from `useMeToday`
 *
 * The Today panel's own read is the whole panel, about twenty queries, behind a
 * skeleton and a retry card. A greeting must not wait for that, and must not
 * share its failure: if the panel could not load, the greeting is still true, and
 * if the greeting could not load nobody has lost anything. One section is cheap
 * and the API says so.
 *
 * ## Everything that is not a greeting is silence
 *
 * The section is `unavailable` where the company has not switched birthday
 * greetings on or the account has no employee record, it is missing from an API
 * one deploy behind, the route may not exist, and a read can fail. All of them
 * draw nothing: this is the first line on the first screen everybody opens, and
 * an error card there about a happy birthday that was never promised would be the
 * only unkind thing the feature could do.
 *
 * ## A failure wins over what was held
 *
 * Re-reading when somebody comes back to the window is what makes the greeting
 * appear at midnight in a tab left open overnight, and go the next morning. A
 * read that fails must therefore clear it rather than keep it: a greeting held
 * across a failed read could outlive the day it was true for.
 *
 * ## There is no demo half
 *
 * The greeting says things about a real person's real birthday. With nobody
 * connected there is nothing to read and nothing is invented.
 *
 * ## What it hands back
 *
 * The title and the message, exactly as the API wrote them. Nothing else is read
 * off the answer, so a field the API added (or a hostile one) cannot turn up on
 * the screen: there is no date, no year and no age to draw, and none is derived.
 */

export type BirthdayGreeting = { title: string; message: string };

/** A greeting is two non-empty strings. Anything else is not one. */
function greetingOf(value: unknown): BirthdayGreeting | null {
  if (typeof value !== "object" || value === null) return null;
  const { title, message } = value as Record<string, unknown>;
  if (typeof title !== "string" || title.trim() === "") return null;
  if (typeof message !== "string" || message.trim() === "") return null;
  return { title, message };
}

export function useBirthdayGreeting(): BirthdayGreeting | null {
  const { isConnected } = useSession();
  const [greeting, setGreeting] = useState<BirthdayGreeting | null>(null);

  /* Re-ask when somebody comes back to the window, under the same guards as every
     store (see `lib/revalidate.ts`). Not in any key: the answer replaces the old
     one without anything flashing. */
  const revalidation = useRevalidation();

  useEffect(() => {
    if (!isConnected) return;
    let stale = false;
    void (async () => {
      try {
        const answer = await meApi.today(["birthday"]);
        if (stale) return;
        const section = sectionData(answer.sections.birthday);
        setGreeting(greetingOf(section?.greeting));
      } catch {
        /* Not announced: see the header. Cleared, not kept. */
        if (!stale) setGreeting(null);
      }
    })();
    return () => {
      stale = true;
    };
  }, [isConnected, revalidation]);

  /* Signed out, or no API: whatever was held is not this person's to show. */
  return isConnected ? greeting : null;
}
