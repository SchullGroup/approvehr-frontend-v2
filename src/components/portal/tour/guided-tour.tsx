"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { useCan } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { useSession } from "@/lib/store/session";
import { Spotlight, findTarget } from "./spotlight";

/**
 * The guided tour a new account gets once.
 *
 * ## What it is for, and what it deliberately is not
 *
 * It teaches **where things are**, not what they do. A tour that explains
 * payroll is a tour nobody finishes; the thing a person actually cannot
 * discover on their own is the shape of the place — that the sidebar is only
 * as long as this company's own answers made it, that anything waiting on them
 * collects in one queue, that the search reaches people and roles, and that
 * setup has a checklist which knows what is still missing.
 *
 * So every step points at real chrome that is on screen in every route, and
 * none of them navigate. A tour that walks you through four pages has to
 * survive four route changes, four sets of targets appearing late, and a Back
 * button that means two different things — for the sake of telling you what
 * the nav labels already say.
 *
 * ## It only ever points at something this company has
 *
 * The steps are filtered by the same two questions the sidebar is filtered by:
 * a permission the person holds, and a feature the company turned on. Pointing
 * at "Monthly payroll" for somebody who cannot open it, or at a Loans item a
 * company switched off in setup, would be the tour contradicting the product's
 * own progressive disclosure — which is the argument the product is sold on.
 *
 * A step whose target is not rendered at all — the sidebar on a phone — is not
 * dropped. `Spotlight` centres the card instead, and the copy is written so it
 * still reads without an arrow pointing anywhere. Dropping it would make the
 * tour shorter on small screens for no reason a reader could see.
 *
 * ## When it opens
 *
 * `tourDismissedAt === null` on the signed-in account, which the API answers on
 * every door that hands one back. Finishing and skipping both write it, because
 * both mean shown — and it can be reopened for good from the account menu, so
 * dismissing is never a decision somebody is stuck with.
 *
 * It does not open itself in demo mode: there is no account there to have
 * dismissed anything, and a tour that reappeared on every demo load would be
 * the first thing anybody demonstrating this product learned to click past.
 * The account menu still opens it by hand, which is how you would show it.
 */

/** Fired by the account menu's "Take the tour". See the listener below. */
const TOUR_OPEN = "approvehr:tour:open";

export function openTour(): void {
  window.dispatchEvent(new CustomEvent(TOUR_OPEN));
}

type Step = {
  id: string;
  title: string;
  body: string;
  /** Tried in order — the first rendered and visible one is pointed at. */
  target: readonly string[];
  /** Left out entirely when false. Absent means always. */
  when?: (ctx: { canApprove: boolean; canSettings: boolean }) => boolean;
};

const STEPS: readonly Step[] = [
  {
    id: "welcome",
    title: "A quick look round",
    body:
      "Four things, about half a minute. You can leave at any point and pick " +
      "it up again from your account menu.",
    target: [],
  },
  {
    id: "nav",
    title: "Only what you actually use",
    body:
      "The menu is built from the answers you gave during setup. A company " +
      "that does not lend to staff has no Loans; turn one on in Settings and " +
      "it appears here.",
    target: ['[data-tour="nav"]', '[data-tour="nav-toggle"]'],
  },
  {
    id: "approvals",
    title: "Anything waiting on you",
    body:
      "Leave, expenses, staff loans and payroll all put what needs a decision " +
      "in this one queue, oldest deadline first — so there is no module to " +
      "remember to check.",
    target: ['[data-tour="nav-item:/approvals"]', '[data-tour="nav"]'],
    when: ({ canApprove }) => canApprove,
  },
  {
    id: "search",
    title: "Find a person or a role",
    /* Worded to survive the card being centred rather than pointing at
       anything: the search sits in the header on a wide screen and is not
       there on a phone, so this says where it is without promising an arrow. */
    body:
      "The search at the top of a wide screen finds a person by name or job " +
      "title, and a role by what it is called. On a keyboard, / opens it.",
    target: ['[data-tour="search"]'],
  },
  {
    id: "settings",
    title: "What is still to set up",
    body:
      "Settings keeps a checklist of what a payroll needs before it can run — " +
      "work locations, leave, pay, who can approve — and marks off what you " +
      "have already done.",
    target: ['[data-tour="nav-item:/settings"]', '[data-tour="nav"]'],
    when: ({ canSettings }) => canSettings,
  },
];

export function GuidedTour() {
  const { tourSeen, dismissTour, isConnected } = useSession();
  const features = useFeatures();
  /* Both called unconditionally and combined after — `||` between two hook
     calls short-circuits the second one, which changes the hook order. */
  const approvesLeave = useCan("APPROVE_LEAVE");
  const approvesPayroll = useCan("APPROVE_PAYROLL");
  const canApprove = approvesLeave || approvesPayroll;
  const canSettings = useCan("MANAGE_SETTINGS");

  /**
   * `null` is "decide from the account". Opening it by hand sets `true`, and
   * closing sets `false` so it stays shut for this page load even when the
   * write to the server has not landed — or cannot, in demo mode.
   */
  const [asked, setAsked] = useState<boolean | null>(null);
  const [index, setIndex] = useState(0);

  /**
   * Reopening from the account menu.
   *
   * A `window` event rather than a prop or a store: the menu item lives inside
   * a dropdown that unmounts the moment it is clicked, and the tour has to
   * outlive that. Nothing else in the product reads "is the tour open", so a
   * store for it would be a store with one writer and one reader that are
   * already in the same shell.
   *
   * `setState` here is in a listener, not in the effect body — the subscribe
   * case `react-hooks/set-state-in-effect` exists to allow.
   */
  useEffect(() => {
    const onOpen = () => {
      setIndex(0);
      setAsked(true);
    };
    window.addEventListener(TOUR_OPEN, onOpen);
    return () => window.removeEventListener(TOUR_OPEN, onOpen);
  }, []);

  const steps = useMemo(
    () =>
      STEPS.filter((step) => step.when?.({ canApprove, canSettings }) ?? true),
    [canApprove, canSettings],
  );

  /* Auto-opens only for a real account that has not seen it. `features` is
     read so the sidebar has settled before anything points at it — a tour that
     opens mid-load points at a nav that is about to change size. */
  const unseen = isConnected && !tourSeen && !features.loading;
  const open = asked ?? unseen;

  if (!open || steps.length === 0) return null;

  const step = steps[Math.min(index, steps.length - 1)]!;
  const last = index >= steps.length - 1;

  const close = () => {
    setAsked(false);
    setIndex(0);
    void dismissTour();
  };

  return (
    <Spotlight target={step.target} onDismiss={close}>
      <p className="text-meta font-medium uppercase tracking-wide text-faint">
        {index + 1} of {steps.length}
      </p>
      <h2 className="mt-1.5 text-body font-semibold text-ink">{step.title}</h2>
      <p className="mt-1.5 text-body-sm leading-relaxed text-body">
        {step.body}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={close}>
          {last ? "Done" : "Skip"}
        </Button>
        <div className="flex gap-2">
          {index > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIndex((at) => at - 1)}
            >
              Back
            </Button>
          )}
          <Button
            variant="accent"
            size="sm"
            onClick={() => (last ? close() : setIndex((at) => at + 1))}
          >
            {last ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </Spotlight>
  );
}

export { findTarget };
