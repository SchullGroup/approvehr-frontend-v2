"use client";

import { request } from "@/lib/api/client";

/**
 * Finished project work pinned to an answer in a self-review, over the wire.
 *
 * `POST /performance/reviews/:id/questions/:questionId/pins` and
 * `DELETE /performance/reviews/:id/pins/:pinId`, and `questions[].pins` on the review itself.
 *
 * ## What a pin is
 *
 * One finished task the person chose to attach to one answer of their **own** self-review, with a
 * note of their own if they wrote one. The appraiser reads it beside the answer, and the full list
 * of what was finished is one press away from it, so a pin is never the whole picture and does not
 * claim to be. Nothing here carries a grade, a count that reads as a rate, or anything that looks
 * like a mark.
 *
 * ## There is no task title in a pin
 *
 * The API keeps the task's key, its dates, who set it and where it sat, and **no title**: a title can
 * hold health or trade-union details, which the Nigeria Data Protection Act names as sensitive. A
 * reader opens the task by its id to read it as it is now. `toPin` picks every field by name, so a
 * `title` that arrives anyway is dropped here and cannot be drawn by accident, and a test holds it.
 *
 * ## Claims only what the API said
 *
 * A pin needs an id, a task id and a key to be a pin. Everything else is optional on this side, so a
 * pin the person chose is still drawn when a date is missing: it just says less. An unreadable
 * answer to a pin that was written is `null`, and the caller says the pin may be saved and the page
 * could not read it back, never that nothing happened.
 */

/** The most pins one answer carries. The API enforces it and says so in its own words. */
export const PINS_PER_ANSWER = 5;
/** The longest note on a pin, in characters. */
export const PIN_NOTE_MAX = 280;

export type PinTiming = "ON_TIME" | "LATE" | "NO_DUE_DATE";

export type ApiPin = {
  id: string;
  /** The task, as it is now. The link opens it. */
  issueId: string;
  key: string;
  /** TASK, STORY or PROBLEM. */
  type: string;
  /** On the person's own task list rather than a project board. */
  personal: boolean;
  projectId: string;
  /** When it was finished, as an instant. Empty when the server did not say. */
  doneAt: string;
  /** The company's calendar day it was finished, `YYYY-MM-DD`. Empty when not said. */
  finishedOn: string;
  dueDate: string | null;
  timing: PinTiming;
  /** Whether it sat under an objective. */
  linked: boolean;
  /** Who created it when that was somebody else. */
  setBy: { id: string; name: string } | null;
  /** The person's own words about it, or null. */
  note: string | null;
  /** When it was pinned. */
  pinnedAt: string;
  /**
   * Whether **this reader** may open the task, worked out by the server by the same rule as the rows
   * of the live list. **Only `true` makes the key a link.** Absent is a server that does not say, and
   * an absent answer makes no claim that the task can be opened: the key is plain text, as it is for
   * `false`. The real server always sends it, so nothing changes against it.
   */
  canOpen?: boolean;
};

type Raw = Record<string, unknown>;

const obj = (value: unknown): Raw =>
  value && typeof value === "object" ? (value as Raw) : {};
const str = (value: unknown): string =>
  typeof value === "string" ? value : "";
const isTiming = (value: unknown): value is PinTiming =>
  value === "ON_TIME" || value === "LATE" || value === "NO_DUE_DATE";

/**
 * One pin, or `null` when it is not one.
 *
 * Every field is picked by name. A `title`, a description or anything else the server sends is
 * not read.
 */
export function toPin(raw: unknown): ApiPin | null {
  const row = obj(raw);
  const id = str(row["id"]);
  const issueId = str(row["issueId"]);
  const key = str(row["key"]);
  if (id === "" || issueId === "" || key === "") return null;
  const setter = obj(row["setBy"]);
  const dueDate = str(row["dueDate"]);
  const note = str(row["note"]).trim();
  return {
    id,
    issueId,
    key,
    type: str(row["type"]),
    personal: row["personal"] === true,
    projectId: str(row["projectId"]),
    doneAt: str(row["doneAt"]),
    finishedOn: str(row["finishedOn"]),
    dueDate: dueDate === "" ? null : dueDate.slice(0, 10),
    /* A timing this side does not know is said as nothing: the pin is still the person's choice. */
    timing: isTiming(row["timing"]) ? row["timing"] : "NO_DUE_DATE",
    linked: row["linked"] === true,
    /* A name is shown only when the API named somebody. */
    setBy:
      str(setter["id"]) !== "" && str(setter["name"]) !== ""
        ? { id: str(setter["id"]), name: str(setter["name"]) }
        : null,
    note: note === "" ? null : note,
    pinnedAt: str(row["pinnedAt"]),
    ...(typeof row["canOpen"] === "boolean" ? { canOpen: row["canOpen"] } : {}),
  };
}

/**
 * The pins an answer carries, from whatever the server sent. Anything that is not a pin is left
 * out, and a missing or malformed list is no pins, which is what a server that predates them
 * sends for every question.
 */
export function pinsOf(raw: unknown): ApiPin[] {
  return Array.isArray(raw) ? raw.flatMap((item) => toPin(item) ?? []) : [];
}

export type PinBody = {
  /** A task from the person's own finished work in this cycle. */
  issueId: string;
  /** Optional; up to `PIN_NOTE_MAX` characters. A blank one is sent as no note. */
  note?: string;
};

export const workPinsApi = {
  /**
   * Pin one finished task to one answer. Only the author of an unsent self-review, only while the
   * company has the setting on, only a task from the list the review shows for them, at most
   * `PINS_PER_ANSWER`, and not twice: each refusal comes back in the API's own sentence.
   *
   * `null` when the pin was written and the answer could not be read, which is not a failure.
   */
  pin: async (
    reviewId: string,
    questionId: string,
    body: PinBody,
  ): Promise<ApiPin | null> => {
    const note = body.note?.trim();
    const answer = await request<unknown>(
      `/performance/reviews/${reviewId}/questions/${questionId}/pins`,
      {
        method: "POST",
        body: { issueId: body.issueId, ...(note ? { note } : {}) },
      },
    );
    return toPin(obj(answer)["pin"]);
  },

  /** Take a pin off. The author, while the review is unsent. */
  unpin: async (reviewId: string, pinId: string): Promise<void> => {
    await request<unknown>(`/performance/reviews/${reviewId}/pins/${pinId}`, {
      method: "DELETE",
    });
  },
};
