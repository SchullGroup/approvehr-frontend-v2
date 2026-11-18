import type { ApiPin } from "@/lib/api/work-pins";
import { PINS_PER_ANSWER, PIN_NOTE_MAX } from "@/lib/api/work-pins";
import {
  FLAG_REASON_MAX,
  FLAG_REASON_MIN,
  type ApiWorkFlag,
} from "@/lib/api/work-flags";
import type { SharedColleague } from "@/lib/api/shared-projects";
import { dayLabel } from "@/lib/api/performance";
import { formatDateShort } from "@/lib/time";

/**
 * Using your own finished project work in a review: the words, the limits and the small decisions,
 * kept apart from the screens so they are said once and can be read, and tested, on their own.
 *
 * Three things share this file because they share one setting ("Work in review answers") and one
 * rule: **evidence for a person to read, never a number.** A pin is a task the person chose to put
 * beside one answer. A shared-project label orders a list somebody still picks from. A flag is a
 * statement that an item is wrong. None of them removes anything from any list, scores anything, or
 * says what the work was worth.
 */

/* ----------------------------------------------------------------- the wording */

/**
 * What the picker says about titles, once. The list shows the live title so the person can tell
 * their tasks apart, and **a pin keeps no title**: the reader sees the key, the dates and the note,
 * and opens the task to read it as it is now. Saying so is what stops a person typing something
 * sensitive into a task and believing it travels with the pin.
 */
export const PIN_TITLE_NOTE =
  "The title is shown here to help you choose and is not saved with the pin. Readers see the task's key, the day it was finished and your note, and can open the task to read it where they are allowed to.";

/** What adding work to an answer does, in one sentence a person can act on. */
export const PIN_PURPOSE =
  "The people who read your review see what you add beside this answer. The full list of your finished work is still one press away for them, so this shows what you want them to look at, not the whole picture.";

/** Said wherever a person is about to pin: it is their choice, and it moves no mark. */
export const PIN_NO_MARK =
  "It does not change your mark, and nothing is added or graded for you.";

/** The limit, as a sentence that is true at every count. */
export function pinCountLine(count: number): string {
  if (count >= PINS_PER_ANSWER) {
    return `${String(count)} of ${String(PINS_PER_ANSWER)} added. Unpin one to add another.`;
  }
  return count === 0
    ? `Up to ${String(PINS_PER_ANSWER)} on each answer.`
    : `${String(count)} of ${String(PINS_PER_ANSWER)} added.`;
}

/** The note's counter, shown from the moment it is useful and in the colour of a warning at the limit. */
export function noteCounter(length: number): string | null {
  return length >= PIN_NOTE_MAX - 40
    ? `${String(length)} of ${String(PIN_NOTE_MAX)} characters`
    : null;
}

/** A note is optional. Over the limit is the only thing wrong with one. */
export function noteProblem(note: string): string | null {
  return note.trim().length > PIN_NOTE_MAX
    ? `Keep the note to ${String(PIN_NOTE_MAX)} characters.`
    : null;
}

/* ------------------------------------------------------------------ reading a pin */

/** "Finished 4 Nov 2026", from the instant when there is one and the company's own day when not. */
function finishedLabel(
  pin: Pick<ApiPin, "doneAt" | "finishedOn">,
  timeZone: string,
): string | null {
  if (pin.doneAt !== "")
    return `Finished ${formatDateShort(pin.doneAt, timeZone)}`;
  /* The company's own day is already a day: `dayLabel` does not read it as an instant, which in
     some zones would move it. */
  return pin.finishedOn !== "" ? `Finished ${dayLabel(pin.finishedOn)}` : null;
}

/**
 * The quiet facts under a pinned task's key, in the order a reader looks for them. On time and late
 * are the same quiet word, a task with no due date says nothing about one, and "Set by" appears only
 * when somebody else made the task, as everywhere else the finished work is listed.
 */
export function pinFacts(
  pin: Pick<
    ApiPin,
    "personal" | "doneAt" | "finishedOn" | "timing" | "setBy" | "linked"
  >,
  timeZone: string,
): string[] {
  const finished = finishedLabel(pin, timeZone);
  return [
    ...(pin.personal ? ["Personal"] : []),
    ...(finished ? [finished] : []),
    ...(pin.timing === "ON_TIME"
      ? ["On time"]
      : pin.timing === "LATE"
        ? ["Late"]
        : []),
    ...(pin.setBy ? [`Set by ${pin.setBy.name}`] : []),
    ...(pin.linked ? ["Under an objective"] : []),
  ];
}

/**
 * Who pinned it and when. The person pinning is always the self-review's author, so the name is
 * passed in by whoever knows it; without one the line says only when. Said as a fact in a muted
 * line, so a reader knows this is the person's own choice and not the appraiser's selection.
 */
export function pinnedLine(
  pinnedBy: string | null,
  pinnedAt: string,
  timeZone: string,
): string {
  const when =
    pinnedAt === "" ? "" : ` on ${formatDateShort(pinnedAt, timeZone)}`;
  return pinnedBy ? `Pinned by ${pinnedBy}${when}` : `Pinned${when}`;
}

/** Where a pinned task opens: the task by its id, which sends a board task on to its board. */
export const pinHref = (pin: Pick<ApiPin, "issueId">): string =>
  `/projects/tasks/${encodeURIComponent(pin.issueId)}`;

/**
 * What an answer carries: what the server sent, less what was unpinned in this visit, plus what was
 * pinned in it, once each. A diff over the server's list and not a copy of it, so a review that is
 * read again (the window was focused, a pin was added from another tab) is not shadowed by a stale
 * list held in state.
 */
export function mergePins(
  fromServer: readonly ApiPin[],
  added: readonly ApiPin[],
  removed: ReadonlySet<string>,
): ApiPin[] {
  const seen = new Set<string>();
  const out: ApiPin[] = [];
  for (const pin of [...fromServer, ...added]) {
    if (removed.has(pin.id) || seen.has(pin.id)) continue;
    seen.add(pin.id);
    out.push(pin);
  }
  return out;
}

/* --------------------------------------------------------- colleagues who shared a project */

/** "Shared 1 project" or "Shared 3 projects". Never "Shared 0 projects": that is not a suggestion. */
export const sharedLabel = (count: number): string =>
  `Shared ${String(count)} ${count === 1 ? "project" : "projects"}`;

/**
 * People who shared a project first, the rest after them, each group in the order it came in.
 *
 * Within the first group the ones who shared the most come first, and ties keep their incoming
 * order, so a list that is already alphabetical stays alphabetical inside each group. It orders and
 * nothing else: nobody is added, dropped or chosen, so a person left out of the shared list is
 * still in the list, in the same place relative to the others.
 */
export function orderBySharedProjects<T extends { id: string }>(
  people: readonly T[],
  colleagues: readonly SharedColleague[] | null,
): { person: T; shared: number }[] {
  const counts = new Map(
    (colleagues ?? []).map((one) => [one.employeeId, one.sharedProjects]),
  );
  const decorated = people.map((person, index) => ({
    person,
    shared: counts.get(person.id) ?? 0,
    index,
  }));
  return decorated
    .sort((a, b) => {
      const aShared = a.shared > 0;
      const bShared = b.shared > 0;
      if (aShared !== bShared) return aShared ? -1 : 1;
      if (aShared && a.shared !== b.shared) return b.shared - a.shared;
      return a.index - b.index;
    })
    .map(({ person, shared }) => ({ person, shared }));
}

/* ------------------------------------------------------------------------ flags */

/** What a flag is and is not, said beside the control that raises one. */
export const FLAG_PURPOSE =
  "This tells whoever reads your work that an item is not right. It does not remove it from the list and it does not change your mark.";

/** The reason, or why it cannot be sent yet. Empty is not a problem to shout about, just not ready. */
export function reasonProblem(reason: string): string | null {
  const length = reason.trim().length;
  if (length === 0) return null;
  if (length < FLAG_REASON_MIN) {
    return `Say a little more, at least ${String(FLAG_REASON_MIN)} characters.`;
  }
  return length > FLAG_REASON_MAX
    ? `Keep it to ${String(FLAG_REASON_MAX)} characters.`
    : null;
}

/** A reason can be sent when it is within the API's bounds. */
export const reasonReady = (reason: string): boolean => {
  const length = reason.trim().length;
  return length >= FLAG_REASON_MIN && length <= FLAG_REASON_MAX;
};

/**
 * One flag as a reader sees it: who raised it, when, and what they said. The person themselves is
 * the only one who can, so the name is the review's subject's.
 */
export function flagLine(
  flag: Pick<ApiWorkFlag, "reason" | "flaggedAt">,
  by: string,
  timeZone: string,
): string {
  const when =
    flag.flaggedAt === ""
      ? ""
      : ` on ${formatDateShort(flag.flaggedAt, timeZone)}`;
  return `Flagged by ${by}${when}: ${flag.reason}`;
}

/** "1 flagged as wrong" or "3 flagged as wrong". Nothing for none: a heading with a nought says nothing. */
export function flaggedCount(count: number): string | null {
  return count > 0 ? `${String(count)} flagged as wrong` : null;
}
