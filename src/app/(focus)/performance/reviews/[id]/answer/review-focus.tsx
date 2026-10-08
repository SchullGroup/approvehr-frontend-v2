"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ButtonLink, Spinner } from "@/components/ui";
import { useReview } from "@/lib/store/performance";
import { FocusForm, type SentInfo } from "./focus-form";
import { SentScreen } from "./focus-sent";

/**
 * False until the stores this component reads have had their turn; true after.
 *
 * Not the plain "is this the client" flag. The demo's data lives in browser
 * storage, and the store loads it a microtask *after* something first
 * subscribes — so a form mounted on the render right after hydration would read
 * an empty review, decide it was new, and open on the first page. This turns
 * true one microtask after its own subscription, which is after the store's
 * (it subscribed first, because `useReview` is read before this), and the
 * render that follows sees both. Connected, the review is not in hand until the
 * request lands, and none of this matters.
 */
let subscribed = false;
const subscribe = (notify: () => void) => {
  let live = true;
  queueMicrotask(() => {
    if (!live) return;
    subscribed = true;
    notify();
  });
  return () => {
    live = false;
  };
};
const useStoresReady = () =>
  useSyncExternalStore(
    subscribe,
    () => subscribed,
    () => false,
  );

/**
 * Loads the review and decides what the person is looking at.
 *
 * The form itself mounts only once the review is in hand **and** the browser
 * has hydrated. It starts from browser storage (the unsent mark and note) and
 * from the answers already saved, and a first render that guessed either would
 * not match what the server drew.
 */
export function ReviewFocus({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const { review, loading, error } = useReview(reviewId);
  const ready = useStoresReady();

  /* What was sent, once it has been. Held here rather than in the form so that
     the moment survives the review turning into a sent one underneath it: the
     store reports it as sent the instant it is, and a page that then decided
     "this is the record" would send somebody away from the confirmation. */
  const [sent, setSent] = useState<SentInfo | null>(null);
  const [sending, setSending] = useState(false);

  /* Only a review that is still theirs to write is answered here. One that has
     gone, or is somebody else's, is the record. */
  const answerable = Boolean(review && review.mine && !review.submitted);
  const gone = Boolean(review && !answerable) && sent === null && !sending;
  useEffect(() => {
    if (gone) router.replace(`/performance/reviews/${reviewId}`);
  }, [gone, reviewId, router]);

  if (!ready || loading || gone) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          Loading the form
        </span>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-5">
        <p className="text-body-md text-ink">
          {error?.message ?? "That review is not available to you."}
        </p>
        <ButtonLink href="/performance" variant="accent">
          Back to performance
        </ButtonLink>
      </div>
    );
  }

  if (sent) {
    return (
      <SentScreen review={review} answered={sent.answered} mark={sent.mark} />
    );
  }

  return <FocusForm review={review} onSent={setSent} onSending={setSending} />;
}
