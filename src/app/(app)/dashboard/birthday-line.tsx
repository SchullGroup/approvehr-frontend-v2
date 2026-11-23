"use client";

import { Cake } from "lucide-react";
import { useBirthdayGreeting } from "@/lib/store/birthday";

/**
 * Your birthday, as a quiet note under the greeting.
 *
 * It is a line and not a card, on purpose. It has no count so it can never add
 * to *To do*, nothing in it is to be cleared or dismissed, and a day that is
 * somebody's own does not need a banner across the top of their work. A small
 * icon and the company's own words, the title over the message, and nothing
 * else: no confetti, no colour beyond the product's own, no date and no age.
 *
 * The title and the message are drawn exactly as the API wrote them (see
 * `useBirthdayGreeting`), which also means the wording can change on the server
 * without a deploy here.
 *
 * It draws **nothing** on every other day, and for a company that has not
 * switched greetings on, an account with no employee record, an API that does
 * not have the section, and a read that failed. Only the person themselves is
 * ever shown this: the request has no id in it and the answer has nothing about
 * anybody else.
 */
export function BirthdayLine() {
  const greeting = useBirthdayGreeting();
  if (!greeting) return null;

  return (
    <div className="flex items-start gap-3">
      <Cake
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-accent-text"
      />
      <div className="min-w-0 text-body-sm">
        <p className="font-semibold text-ink">{greeting.title}</p>
        <p className="text-muted">{greeting.message}</p>
      </div>
    </div>
  );
}
