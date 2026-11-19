import {
  QUERY_LIMITS,
  type ApiQueryDetail,
  type LetterBody,
  type QueryServedHow,
} from "@/lib/api/queries";
import { instantFromWall, wallClockIn } from "@/lib/time";

/**
 * A draft letter as the form holds it, and the diff that is sent.
 *
 * Pure, so the rules a form is easy to get wrong are tested without rendering one:
 *
 * - **Only what changed is sent.** A PATCH that restated every field would restate a field the
 *   issuer never touched, and would clear nothing by accident. A cleared optional field is `null`
 *   (the API's "clear it"), never an empty string.
 * - **A time is a wall time in the company's zone.** A date and a time box are turned into an
 *   instant with `instantFromWall`, never through the browser's own zone, so two people in two
 *   countries read and write the same reply-by time. `null` for a time that does not exist.
 * - **Nothing here says whether the letter is complete.** The server names everything missing at
 *   once when it is issued, in its own words, and that is what is shown.
 */

export type LetterDraft = {
  subjectLine: string;
  whatHappened: string;
  rulesRelied: string;
  incidentOn: string;
  incidentUntil: string;
  question: string;
  replyByDay: string;
  replyByTime: string;
  servedHow: QueryServedHow | "";
  servedAtDay: string;
  servedAtTime: string;
  servedHandedByName: string;
  servedWitnessName: string;
  servedRefusedToReceive: boolean;
  servedNote: string;
};

export function draftFromDetail(
  detail: ApiQueryDetail,
  timeZone: string,
): LetterDraft {
  const replyBy = wallClockIn(detail.replyBy, timeZone);
  const servedAt = wallClockIn(detail.served.at, timeZone);
  return {
    subjectLine: detail.subjectLine,
    whatHappened: detail.whatHappened,
    rulesRelied: detail.rulesRelied ?? "",
    incidentOn: detail.incidentOn ?? "",
    incidentUntil: detail.incidentUntil ?? "",
    question: detail.question,
    replyByDay: replyBy?.day ?? "",
    replyByTime: replyBy?.time ?? "",
    servedHow: detail.served.how ?? "",
    servedAtDay: servedAt?.day ?? "",
    servedAtTime: servedAt?.time ?? "",
    servedHandedByName: detail.served.handedByName ?? "",
    servedWitnessName: detail.served.witnessName ?? "",
    servedRefusedToReceive: detail.served.refusedToReceive,
    servedNote: detail.served.note ?? "",
  };
}

const orNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export type DiffResult =
  | { ok: true; body: LetterBody }
  /** A time that does not exist in the zone (the hour a clock skips), named so the form can say so. */
  | { ok: false; problem: string };

/** What to PATCH: only the fields that differ from what was saved. Empty when nothing changed. */
export function diffBody(
  now: LetterDraft,
  saved: LetterDraft,
  timeZone: string,
): DiffResult {
  const body: LetterBody = {};

  if (now.subjectLine.trim() !== saved.subjectLine.trim())
    body.subjectLine = now.subjectLine.trim();
  if (now.whatHappened.trim() !== saved.whatHappened.trim())
    body.whatHappened = now.whatHappened.trim();
  if (now.rulesRelied.trim() !== saved.rulesRelied.trim())
    body.rulesRelied = orNull(now.rulesRelied);
  if (now.incidentOn !== saved.incidentOn)
    body.incidentOn = now.incidentOn === "" ? null : now.incidentOn;
  if (now.incidentUntil !== saved.incidentUntil)
    body.incidentUntil = now.incidentUntil === "" ? null : now.incidentUntil;
  if (now.question.trim() !== saved.question.trim())
    body.question = now.question.trim();

  if (
    now.replyByDay !== saved.replyByDay ||
    now.replyByTime !== saved.replyByTime
  ) {
    const instant = instantFromWall(now.replyByDay, now.replyByTime, timeZone);
    if (instant === null) {
      return {
        ok: false,
        problem:
          "That reply-by date and time is not a real one in your company's time zone. Check both boxes.",
      };
    }
    body.replyBy = instant;
  }

  if (now.servedHow !== saved.servedHow && now.servedHow !== "")
    body.servedHow = now.servedHow;

  if (
    now.servedAtDay !== saved.servedAtDay ||
    now.servedAtTime !== saved.servedAtTime
  ) {
    if (now.servedAtDay === "" && now.servedAtTime === "") {
      body.servedAt = null;
    } else {
      const instant = instantFromWall(
        now.servedAtDay,
        now.servedAtTime,
        timeZone,
      );
      if (instant === null) {
        return {
          ok: false,
          problem:
            "That hand-over date and time is not a real one in your company's time zone. Check both boxes.",
        };
      }
      body.servedAt = instant;
    }
  }

  if (now.servedHandedByName.trim() !== saved.servedHandedByName.trim())
    body.servedHandedByName = orNull(now.servedHandedByName);
  if (now.servedWitnessName.trim() !== saved.servedWitnessName.trim())
    body.servedWitnessName = orNull(now.servedWitnessName);
  if (now.servedRefusedToReceive !== saved.servedRefusedToReceive)
    body.servedRefusedToReceive = now.servedRefusedToReceive;
  if (now.servedNote.trim() !== saved.servedNote.trim())
    body.servedNote = orNull(now.servedNote);

  return { ok: true, body };
}

/**
 * Whether the draft can be saved at all: only the bounds the **schema** holds, which are looser
 * than what issuing needs. A half-written letter is a normal thing to keep.
 */
export function saveProblem(draft: LetterDraft): string | null {
  if (draft.subjectLine.trim().length < 3)
    return "Give it a subject line of at least three characters.";
  if (draft.subjectLine.trim().length > QUERY_LIMITS.subjectLine.max)
    return `Keep the subject line to ${QUERY_LIMITS.subjectLine.max} characters.`;
  if (draft.whatHappened.trim().length > QUERY_LIMITS.whatHappened.max)
    return `What happened is limited to ${QUERY_LIMITS.whatHappened.max} characters.`;
  if (draft.question.trim().length > QUERY_LIMITS.question.max)
    return `The question is limited to ${QUERY_LIMITS.question.max} characters.`;
  if (draft.rulesRelied.trim().length > QUERY_LIMITS.rulesRelied.max)
    return `The rules relied on are limited to ${QUERY_LIMITS.rulesRelied.max} characters.`;
  return null;
}

/** "212 of 300 characters", from `from` characters on. `null` before that, so a counter is not noise. */
export function counter(
  value: string,
  max: number,
  from = Math.floor(max * 0.8),
): string | null {
  const length = value.trim().length;
  if (length < from && length <= max) return null;
  return `${length} of ${max} characters`;
}
