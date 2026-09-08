"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, CircleDashed } from "lucide-react";
import { Badge, Button, Modal, Spinner } from "@/components/ui";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import { useSetupChecklist } from "@/lib/store/setup-checklist";
import {
  checklistProgress,
  checklistRows,
  type ChecklistRow,
} from "../settings/checklist";
import {
  dismissGuide,
  guideStateNow,
  markGuideOffered,
  useSetupGuideState,
} from "@/lib/store/setup-guide";

/**
 * The walk through setting a company up, one step at a time.
 *
 * Christianah asked for *"pop-ups to guide users through initial system
 * setup"*. Two things about a company's setup already existed and neither is
 * this: `/settings` lists the seven things and their state, and the dashboard
 * names the next one. Both are places somebody has to think to go, and the
 * complaint is about the person who has just signed up and does not yet know
 * there is a list.
 *
 * ## What is done comes from the server, every time
 *
 * The steps, their wording and their state are `checklistRows(facts)` — the
 * same function `/settings` and the dashboard prompt call, from the same
 * `GET /setup/checklist`. So three surfaces cannot disagree about whether the
 * leave calendar is set up, and this one in particular **cannot tick a step
 * because somebody pressed Next**. A tour that recorded its own progress would
 * eventually show a company a green mark against work nobody did, which is the
 * same class of claim as a green "Paid" over money nobody moved.
 *
 * `lib/store/setup-guide.ts` holds two booleans about this browser and no facts
 * about the company. That file's header is the longer version of this argument.
 *
 * ## It opens once, on its own, and only where somebody can act
 *
 * Once per browser, on the dashboard, for a reader who holds `MANAGE_SETTINGS`
 * and whose setup is genuinely unfinished. An employee who cannot open Settings
 * gets a modal with a dead link in it, so they get nothing. Somebody who has
 * finished gets nothing — a congratulatory pop-up on every load is the thing
 * people learn to dismiss without reading, and then the one that mattered goes
 * with it.
 *
 * After that it is reachable on purpose from the dashboard prompt, which is the
 * other half of the same argument: an offer nobody can ask for again is an
 * offer somebody loses by clicking the wrong thing once.
 *
 * ## It waits for `GuidedTour`, and the hand-off costs no coupling
 *
 * `components/portal/tour/guided-tour.tsx` already opens itself for an account
 * that has never seen it, and it is a different thing: it teaches **where**
 * things are, points at the chrome, and navigates nowhere. One of its five
 * steps points at the setup checklist — and then nothing walked anybody
 * through it, which is the gap this fills.
 *
 * Two modals on one load is one too many, so this stays shut while
 * `session.tourSeen` is false. That needs no wiring between them: finishing or
 * skipping the tour writes the dismissal, `tourSeen` flips, and this opens on
 * the same screen a moment later. The tour teaches the shape of the place; this
 * one starts the work.
 *
 * ## It never blocks
 *
 * Dismissible, closeable, and nothing in the product waits on it. It is an
 * offer of help, and a company that would rather work it out is not wrong.
 */
export function SetupGuide({
  open,
  onClose,
  onOpen,
}: {
  /** Controlled by the dashboard, which also owns the "Show me" button. */
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
}) {
  const canManage = useCan("MANAGE_SETTINGS");
  const { facts, loading } = useSetupChecklist();
  /* True with no account at all, so demo mode is not held up waiting for a
     tour nobody can have dismissed. See the note above. */
  const { tourSeen } = useSession();
  const guide = useSetupGuideState();
  /* Null until somebody navigates: the opening step is then derived below as
     the first one that is not done. An initial `0` would open a company that
     is four-fifths set up on a step it finished last week, and make them press
     Next four times to reach the one that is left — which is the shape of
     thing the feedback was complaining about. */
  const [at, setAt] = useState<number | null>(null);
  const router = useRouter();

  const rows = facts === null ? [] : checklistRows(facts);
  const progress = checklistProgress(rows);
  const unfinished = progress.outstanding.length > 0;

  /* The one automatic thing this does. In an effect because it is a side
     effect on arrival rather than a response to anything the reader did.

     It does **not** mark the offer spent — `markGuideOffered` is called from
     the controls below instead. Signing in with an unfinished company
     redirects to the setup wizard, so this screen mounts for a frame on the
     way past; marking it here spent the one offer on a modal nobody saw. */
  useEffect(() => {
    if (!canManage || loading || facts === null || !tourSeen) return;
    if (!unfinished) return;
    /* `guideStateNow`, not the `guide` snapshot in the deps below. That
       snapshot is the seed until hydration lands a microtask later, so on the
       first pass after a reload it says "never offered" about a browser that
       was — and the guide reopened itself every single load. `guide` stays in
       the deps only so a commit re-runs this. */
    const held = guideStateNow();
    if (held.offered || held.dismissed) return;
    onOpen();
  }, [
    canManage,
    loading,
    facts,
    tourSeen,
    guide.offered,
    guide.dismissed,
    unfinished,
    onOpen,
  ]);

  if (!open) return null;

  /* Every counted row, not only the outstanding ones. Somebody halfway through
     wants to see what they have already done — a walk that showed only what is
     left reads as a list that never shrinks. */
  const steps = rows.filter(
    (row) => row.status !== "optional" && row.status !== "unknown",
  );
  const firstUndone = steps.findIndex((row) => row.status !== "done");
  const index =
    at === null
      ? firstUndone === -1
        ? 0
        : firstUndone
      : Math.min(Math.max(at, 0), Math.max(0, steps.length - 1));
  const step = steps[index];

  /** Any press at all. Proves a person saw this, which is what spends the offer. */
  const touched = () => markGuideOffered();

  const close = () => {
    dismissGuide();
    onClose();
  };

  const goThere = (href: string) => {
    dismissGuide();
    onClose();
    router.push(href);
  };

  const step_ = (to: number) => {
    touched();
    setAt(to);
  };

  return (
    <Modal
      open
      onClose={close}
      size="md"
      title="Setting up your company"
      description={
        loading || step === undefined
          ? "Reading what is set up so far."
          : /* The dots below already say which step this is, so the sentence says
               the other thing. "Step 1 of 5" beside "4 of 5 done" is two counts
               sharing a denominator and meaning different axes — position and
               progress — which is the claim-under-the-wrong-label mistake this
               codebase keeps a helper for one module along. */
            `${progress.done} of ${progress.total} set up so far.`
      }
      footer={
        step === undefined ? (
          <Button onClick={close}>Close</Button>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              I&apos;ll do this later
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {index > 0 && (
                <Button size="sm" onClick={() => step_(index - 1)}>
                  Back
                </Button>
              )}
              {index < steps.length - 1 ? (
                <Button size="sm" onClick={() => step_(index + 1)}>
                  Next
                </Button>
              ) : null}
              {/* The primary action goes to the screen that fixes this step —
                  never "Done", which would be a button claiming somebody had
                  finished something the checklist alone can say. */}
              <Button
                variant="accent"
                size="sm"
                onClick={() => goThere(step.href)}
              >
                {step.linkLabel}
              </Button>
            </div>
          </div>
        )
      }
    >
      {loading ? (
        <p className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          Reading what is set up so far
        </p>
      ) : step === undefined ? (
        <p className="text-body-sm leading-relaxed text-body">
          There is nothing to walk through — this company is set up. Everything
          here lives under Settings if you want to change it.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Where this step sits in the seven, so somebody can see the shape
              of the job rather than only the step in front of them. */}
          <ol className="flex flex-wrap gap-1.5" aria-label="Setup steps">
            {steps.map((row, dot) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => step_(dot)}
                  aria-current={dot === index ? "step" : undefined}
                  className={
                    "flex size-7 items-center justify-center rounded-full border text-meta " +
                    (dot === index
                      ? "border-accent bg-accent text-on-accent"
                      : row.status === "done"
                        ? "border-line bg-success-soft text-ink"
                        : "border-line bg-canvas text-muted")
                  }
                >
                  <span className="sr-only">
                    {row.title} — {STATUS_WORD[row.status]}
                  </span>
                  {row.status === "done" ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    <span aria-hidden="true">{dot + 1}</span>
                  )}
                </button>
              </li>
            ))}
          </ol>

          <div>
            <h3 className="flex flex-wrap items-center gap-2 text-h4 text-ink">
              {step.title}
              <StatusBadge status={step.status} />
            </h3>
            {/* Why it matters, then where it stands. Both are the checklist's
                own sentences — a second set written here would be a second
                account of the same company. */}
            <p className="mt-2 text-body-sm leading-relaxed text-body">
              {step.affects}
            </p>
            <p className="mt-2 text-body-sm leading-relaxed text-muted">
              {step.detail}
            </p>
            {step.also && (
              <p className="mt-2 text-body-sm text-muted">
                Some of this is set elsewhere:{" "}
                <button
                  type="button"
                  onClick={() => goThere(step.also!.href)}
                  className="font-medium text-accent-text underline-offset-2 hover:underline"
                >
                  {step.also.label}
                </button>
                .
              </p>
            )}
          </div>

          <p className="text-meta leading-relaxed text-faint">
            Nothing here is ticked by pressing Next: every step reads its own
            state from your settings. The same list is under Settings whenever
            you want it.
          </p>
        </div>
      )}
    </Modal>
  );
}

const STATUS_WORD: Record<ChecklistRow["status"], string> = {
  done: "done",
  attention: "needs attention",
  todo: "still to do",
  optional: "optional",
  unknown: "not known",
};

/**
 * `attention` is not a softer `todo` — the checklist's own header says so, and
 * the badge has to keep them apart. Something set up and dangerous right now
 * is a different problem from something nobody has started.
 */
function StatusBadge({ status }: { status: ChecklistRow["status"] }) {
  if (status === "done") {
    return (
      <Badge tone="success" size="sm">
        <Check aria-hidden="true" className="size-3" />
        Done
      </Badge>
    );
  }
  if (status === "attention") {
    return (
      <Badge tone="warning" size="sm">
        <CircleAlert aria-hidden="true" className="size-3" />
        Needs attention
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" size="sm">
      <CircleDashed aria-hidden="true" className="size-3" />
      Not done yet
    </Badge>
  );
}
