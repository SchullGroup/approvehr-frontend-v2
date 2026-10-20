/**
 * What happened to an application, and who did it.
 *
 * The API writes one of these inside the same transaction as every move an
 * application makes — screened in, moved to a stage, rejected, offered, hired,
 * turned down — and returns the list, oldest first, inside both application
 * detail responses (`/careers/applications/:id` and `/recruitment/applications/:id`).
 * A public application and the pipeline record it became are one story to whoever
 * is reading, so the careers detail carries the pipeline's events too.
 *
 * ## What it is not
 *
 * Not backfilled. An application that moved before the API began keeping this has
 * no history, and the screen says that rather than implying nothing happened. And
 * stage names are the names the stage had **at the time** — a stage renamed or
 * deleted since still reads the way it did.
 *
 * No React, no state: this file knows the shape of the wire and how to put one
 * event into a sentence, and nothing else.
 */

export type ApplicationEventKind =
  | "SCREENED_IN"
  | "DECLINED"
  | "STAGE_MOVED"
  | "REJECTED"
  | "WITHDRAWN"
  | "OFFER_SENT"
  | "OFFER_DECLINED"
  | "OFFER_WITHDRAWN"
  | "HIRED"
  | "AUTO_REJECTED";

export type ApiHistoryEvent = {
  id: string;
  /** A string, not just the union: the API may add a kind this build predates. */
  kind: ApplicationEventKind | (string & {});
  /** `null` where the event has no stage on that side. */
  fromStage: string | null;
  toStage: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  /** The account that made the move. `null` when the system did. */
  byUserId: string | null;
  /** That account's name, where it still resolves. */
  by: string | null;
  note: string | null;
  /** ISO instant. */
  at: string;
};

export type DescribedEvent = {
  title: string;
  /** A second line, when there is something more to say. */
  detail: string | null;
  tone: "neutral" | "success" | "warning" | "danger" | "accent";
  /** Who, in words. Never empty: the system and a departed account have names too. */
  actor: string;
};

/** "AUTO_REJECTED" → "Auto rejected". For a kind this build has no sentence for. */
const humanise = (kind: string): string => {
  const words = kind.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * Who did it, in words.
 *
 * Three different facts that must not read as one: a named person; an account
 * the API knows made the move but whose name no longer resolves (they have left,
 * or the account was removed); and nobody — the system, as when a role being
 * filled rejects everyone else still waiting. Blank would be the worst of the
 * three, because it reads as "nobody knows".
 */
export function actorOf(event: ApiHistoryEvent): string {
  if (event.by) return event.by;
  if (event.byUserId) return "An account that has since been removed";
  return "ApproveHR, automatically";
}

const moved = (event: ApiHistoryEvent): string | null => {
  if (event.fromStage && event.toStage) {
    return `From ${event.fromStage} to ${event.toStage}`;
  }
  if (event.toStage) return `Into ${event.toStage}`;
  if (event.fromStage) return `Out of ${event.fromStage}`;
  return null;
};

/** One event as a title, a detail, a tone and a name. */
export function describeEvent(event: ApiHistoryEvent): DescribedEvent {
  const actor = actorOf(event);
  const note = event.note?.trim() ? event.note.trim() : null;

  switch (event.kind) {
    case "SCREENED_IN":
      return {
        title: "Screened in",
        detail: event.toStage ? `Placed in ${event.toStage}` : note,
        tone: "success",
        actor,
      };
    case "DECLINED":
      return {
        title: "Turned down at screening",
        detail: note ? `Reason kept on file: ${note}` : null,
        tone: "danger",
        actor,
      };
    case "STAGE_MOVED":
      return {
        title:
          event.fromStage && event.toStage
            ? `Moved from ${event.fromStage} to ${event.toStage}`
            : event.toStage
              ? `Moved into ${event.toStage}`
              : "Moved to another stage",
        detail: note,
        tone: "accent",
        actor,
      };
    case "REJECTED":
      return {
        title: event.fromStage ? `Rejected in ${event.fromStage}` : "Rejected",
        detail: note,
        tone: "danger",
        actor,
      };
    case "AUTO_REJECTED":
      return {
        title: event.fromStage
          ? `Rejected in ${event.fromStage}, automatically`
          : "Rejected automatically",
        detail: note,
        tone: "danger",
        actor,
      };
    case "WITHDRAWN":
      return {
        title: "Withdrew from the process",
        detail: note,
        tone: "neutral",
        actor,
      };
    case "OFFER_SENT":
      return { title: "Offer sent", detail: note, tone: "accent", actor };
    case "OFFER_DECLINED":
      return {
        title: "Declined the offer",
        detail: note,
        tone: "warning",
        actor,
      };
    case "OFFER_WITHDRAWN":
      return {
        title: "Offer withdrawn",
        detail: note,
        tone: "warning",
        actor,
      };
    case "HIRED":
      return { title: "Hired", detail: note, tone: "success", actor };
    default:
      return {
        title: humanise(event.kind),
        detail: moved(event) ?? note,
        tone: "neutral",
        actor,
      };
  }
}
