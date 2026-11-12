"use client";

import { useCallback, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import type { ApiFormQuestion, ApiReviewDetail } from "@/lib/api/performance";
import { pinsOf, workPinsApi, type ApiPin } from "@/lib/api/work-pins";
import { mergePins } from "@/lib/performance/work-in-answers";
import { useSession } from "@/lib/store/session";

/**
 * The finished work pinned to the answers of one review, and the two things a person can do to it.
 *
 * ## Who can do what
 *
 * **Adding** needs all of: a connected server, the person's own self-review, not yet sent, the
 * company's setting on (`review.workPins`, which the server sends with the review and which is absent
 * from a server that predates it, and absent is off), and **a period with dates**: the picker lists the
 * work done between them, and a period that states none has no stretch to read, so there is nothing to
 * choose from and "Add work" is not offered. **Taking one off** needs the first three: a pin
 * somebody wrote while the setting was on is theirs to remove after it is turned off, because turning
 * it off stops anything new and does not trap what was written. Offline there is no server to hold a
 * pin, so neither is offered, and a pin is never drawn from a browser.
 *
 * ## What is read and what is held
 *
 * What the server holds is `question.pins`, read through `pinsOf` so only what is a pin gets through.
 * What this visit did is held as a diff: pins added, and ids taken off. `mergePins` lays the second
 * over the first, once each. Nothing is held about the **note**: it is read from the pin the server
 * returned.
 *
 * ## The server's list wins whenever it is read again
 *
 * The diff is for the length of a read, not for ever. When the review is read again (the window was
 * returned to, a pin was added or removed in another tab) **what was added here is dropped, because the
 * new list either has it or no longer does**, and a pin that was taken off here is forgotten once a
 * read no longer lists it (until then a read that still lists it is stale, and the pin stays hidden).
 * A pin removed from another tab therefore leaves this screen, instead of staying on it for ever.
 *
 * A delete the server answers with "not found" means the pin is **already gone**, which is what the
 * person asked for, so it is removed here with no error.
 *
 * Writes go to the server straight away rather than with the answer. A pin hangs off the question,
 * not off the answer's text, so it does not wait for one, and a person who closes the page after
 * pinning has not lost it. Each write's failure is thrown for the caller to say in the dialog, in the
 * server's own words, and nothing is added to or removed from what is held until the server agrees.
 */
export type ReviewPins = {
  /** The person's own unsent self-review, with the setting on: "Add work" is offered. */
  canAdd: boolean;
  /** The person's own unsent self-review: a pin can be taken off. */
  canRemove: boolean;
  pinsFor: (questionId: string) => ApiPin[];
  /**
   * Pin a task. Resolves to the pin, or `null` when it was written and the answer could not be read
   * (the caller says the pin may be saved and the page should be reloaded, not that nothing happened).
   */
  pin: (
    questionId: string,
    issueId: string,
    note: string,
  ) => Promise<ApiPin | null>;
  unpin: (questionId: string, pinId: string) => Promise<void>;
};

type Reviewed = Pick<
  ApiReviewDetail,
  "id" | "kind" | "submitted" | "mine" | "periodStart" | "periodEnd"
> & {
  workPins?: boolean | undefined;
  questions: Pick<ApiFormQuestion, "id" | "pins">[];
};

/** The ids of the pins taken off here that a read of the review still lists. */
function stillListed(
  removed: ReadonlySet<string>,
  questions: Reviewed["questions"],
): ReadonlySet<string> {
  if (removed.size === 0) return removed;
  const listed = new Set(
    questions.flatMap((question) => pinsOf(question.pins).map((pin) => pin.id)),
  );
  return new Set([...removed].filter((id) => listed.has(id)));
}

export function useReviewPins(review: Reviewed): ReviewPins {
  const { isConnected } = useSession();
  const [added, setAdded] = useState<Record<string, ApiPin[]>>({});
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());

  /* The server's list wins whenever the review is read again: see the header. Adjusted while
     rendering, from the list this was last given, and not in an effect. */
  const [seen, setSeen] = useState(review.questions);
  if (seen !== review.questions) {
    setSeen(review.questions);
    setAdded({});
    setRemoved(stillListed(removed, review.questions));
  }

  const own = isConnected && review.kind === "SELF" && !review.submitted;
  /* `mine` is whether the caller is the one who has to fill it in; for a self-review that is the
     person. A reader of somebody else's review has no pins to add or remove. */
  const canRemove = own && review.mine;
  /* A period with no dates has no stretch of work to read, so there is nothing to choose from. */
  const dated = Boolean(review.periodStart) && Boolean(review.periodEnd);
  const canAdd = canRemove && review.workPins === true && dated;

  /* Pins are the person's own, on their own self-review. A server that sent them on any other form
     would be sending something this side has no place to put, and they are not read. */
  const isSelf = review.kind === "SELF";
  const fromServer = useMemo(
    () =>
      new Map(
        review.questions.map((question) => [
          question.id,
          isSelf ? pinsOf(question.pins) : [],
        ]),
      ),
    [review.questions, isSelf],
  );

  const pinsFor = useCallback(
    (questionId: string): ApiPin[] =>
      mergePins(
        fromServer.get(questionId) ?? [],
        added[questionId] ?? [],
        removed,
      ),
    [fromServer, added, removed],
  );

  const reviewId = review.id;
  const pin = useCallback(
    async (questionId: string, issueId: string, note: string) => {
      const made = await workPinsApi.pin(reviewId, questionId, {
        issueId,
        ...(note.trim() ? { note } : {}),
      });
      if (made) {
        setAdded((current) => ({
          ...current,
          [questionId]: [...(current[questionId] ?? []), made],
        }));
        /* A pin taken off and put back is a new pin with a new id, but be safe about the id. */
        setRemoved((current) => {
          if (!current.has(made.id)) return current;
          const next = new Set(current);
          next.delete(made.id);
          return next;
        });
      }
      return made;
    },
    [reviewId],
  );

  const unpin = useCallback(
    async (questionId: string, pinId: string) => {
      try {
        await workPinsApi.unpin(reviewId, pinId);
      } catch (caught) {
        /* Already gone (taken off in another tab or window): that is what was asked for. Anything
           else is the server refusing, and is thrown for the caller to say. */
        if (!(caught instanceof ApiError && caught.status === 404))
          throw caught;
      }
      setAdded((current) => ({
        ...current,
        [questionId]: (current[questionId] ?? []).filter(
          (one) => one.id !== pinId,
        ),
      }));
      setRemoved((current) => new Set(current).add(pinId));
    },
    [reviewId],
  );

  return { canAdd, canRemove, pinsFor, pin, unpin };
}
