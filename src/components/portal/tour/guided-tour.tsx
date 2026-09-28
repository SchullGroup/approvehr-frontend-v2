"use client";

import { useEffect, useMemo, useState } from "react";
import { APPROVE_PERMISSIONS } from "@/app/(app)/approvals/inbox";
import { Button } from "@/components/ui";
import { useDismiss } from "@/hooks/use-dismiss";
import type { FeatureKey } from "@/lib/api/setup";
import {
  hasAnyPermission,
  hasPermission,
  useIsManager,
  usePermissions,
  type PermissionKey,
  type PermissionSet,
} from "@/lib/permissions";
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
 * ## It only ever points at something this company has, and this reader can use
 *
 * `Step` carries the same `permission` / `anyPermission` / `feature` /
 * `always` vocabulary as `NavItem` in `nav.tsx`, filtered by `visibleSteps`
 * below in the same order `visibleNav` filters the sidebar. Pointing at
 * "Monthly payroll" for somebody who cannot open it, or at a Loans item a
 * company switched off in setup, would be the tour contradicting the
 * product's own progressive disclosure — which is the argument the product
 * is sold on. That includes the *sentence*, not only the target: a step can
 * be worth showing to everyone while still needing two different endings,
 * which is what a function `body` is for.
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
 * dismissing is never a decision somebody is stuck with. That reopen path is
 * also the answer to a promotion: somebody who dismissed the tour as a plain
 * employee and later gains `MANAGE_SETTINGS` does not see the extra step
 * appear on its own — `tourDismissedAt` is one flag for the whole account, not
 * one per combination of steps a permission set could produce, and "take the
 * tour" again is the deliberately simple way back rather than a second field
 * to keep in step with a catalogue that can grow.
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

type StepBodyCtx = { total: number; canSettings: boolean; canApprove: boolean };

type Step = {
  id: string;
  title: string;
  /**
   * A function where the sentence has to know more than its own words.
   *
   * `total` is for the welcome step: everybody without `MANAGE_SETTINGS` gets
   * five steps and a settings-manager gets six, so the count moves — and the
   * welcome step used to say "Four things" directly under a counter reading
   * "1 of 3" — one screen, two counts, neither role ever seeing both agree.
   *
   * `canSettings` is for the nav step: the step itself is worth showing to
   * everyone — knowing the menu reflects the company's own setup is not a
   * settings-manager-only fact — but its Loans example must not tell every
   * reader they personally can turn one on, which is exactly the ability the
   * settings step further down is already withheld from them for.
   *
   * `canApprove` is for the approvals step, for the same reason in reverse: a
   * non-approver still has real business on that screen — tracking what they
   * themselves sent in — so the step stays for everyone, and only the
   * sentence changes to match what they can actually do there.
   */
  body: string | ((ctx: StepBodyCtx) => string);
  /** Tried in order — the first rendered and visible one is pointed at. */
  target: readonly string[];
  /** Same vocabulary as `NavItem` (`nav.tsx`) — hidden unless held. */
  permission?: PermissionKey;
  /** Hidden unless at least one of these is held. */
  anyPermission?: PermissionKey[];
  /** Hidden unless the company has this feature switched on. */
  feature?: FeatureKey;
  /**
   * Self-documenting, mirroring `NavItem.always` — a step that carries no
   * `permission`/`anyPermission` is shown to everyone regardless, but writing
   * this makes that a sentence somebody chose rather than a gate somebody
   * forgot.
   */
  always?: boolean;
};

/**
 * Mirrors `visibleNav`'s own filter order in `nav.tsx`: a feature switched
 * off vetoes the step outright, `always` then bypasses the permission
 * question (never the feature one), and `anyPermission` takes priority over
 * a single `permission` the same way `NavItem`'s does.
 */
function visibleSteps(
  steps: readonly Step[],
  permissions: PermissionSet,
  features: Partial<Record<FeatureKey, boolean>>,
): readonly Step[] {
  return steps.filter((step) => {
    if (step.feature !== undefined && features[step.feature] === false) {
      return false;
    }
    if (step.always) return true;
    if (step.anyPermission) {
      return hasAnyPermission(permissions, step.anyPermission);
    }
    if (step.permission === undefined) return true;
    return hasPermission(permissions, step.permission);
  });
}

/* Spelled out, because the sentence reads as prose rather than as a count.
   Only 5 and 6 are reachable — `MANAGE_SETTINGS` is the one thing left that
   changes the length — and the numeral is there so a seventh step cannot
   make this render "undefined things". */
const WORD: Record<number, string> = { 5: "Five", 6: "Six" };

const STEPS: readonly Step[] = [
  {
    id: "welcome",
    title: "A quick look round",
    body: ({ total }) =>
      `${WORD[total] ?? total} things, about a minute. You can leave at ` +
      "any point and pick it up again from your account menu.",
    target: [],
    always: true,
  },
  {
    id: "nav",
    title: "Only what you actually use",
    body: ({ canSettings }) =>
      canSettings
        ? "The menu is built from the answers you gave during setup. A " +
          "company that does not lend to staff has no Loans; turn one on " +
          "in Settings and it appears here."
        : "The menu only shows what your company has actually turned on " +
          "— a company that does not lend to staff has no Loans, for " +
          "instance. Whoever manages your company's settings controls " +
          "what's here.",
    target: ['[data-tour="nav"]', '[data-tour="nav-toggle"]'],
    always: true,
  },
  {
    id: "yours",
    title: "Your day, and your time off",
    body:
      "Attendance shows where your day stands — clock yourself in if your " +
      "company has you do that, or see today's record if HR does it for " +
      "you. Leave shows your own balance and lets you ask for time off; " +
      "pending days are already held back from what's left.",
    target: [
      '[data-tour="nav-item:/people/attendance"]',
      '[data-tour="nav-item:/people/leave"]',
      '[data-tour="nav"]',
    ],
    always: true,
  },
  {
    id: "approvals",
    title: "Waiting on you, and sent by you",
    body: ({ canApprove }) =>
      canApprove
        ? "Leave, expenses, staff loans and payroll all put what needs a " +
          "decision in this one queue, oldest deadline first, so there is " +
          "no module to remember to check."
        : "Approving isn't part of your role, and this screen says so if " +
          "you ever wonder. Switch to Sent by you to see where a leave " +
          "request — or anything else you've sent off — currently stands, " +
          "without having to ask.",
    target: ['[data-tour="nav-item:/approvals"]', '[data-tour="nav"]'],
    always: true,
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
    always: true,
  },
  {
    id: "settings",
    title: "What is still to set up",
    body:
      "Settings keeps a checklist of what a payroll needs before it can run: " +
      "work locations, leave, pay, who can approve, and marks off what you " +
      "have already done.",
    target: ['[data-tour="nav-item:/settings"]', '[data-tour="nav"]'],
    permission: "MANAGE_SETTINGS",
  },
];

/* Matches `animate-scale-out`'s own duration in globals.css. `Spotlight` has
   no `open` prop of its own — `GuidedTour` is the thing that knows whether the
   tour is open, so `useDismiss` lives here and `closing` travels down as a
   prop, the mirror of how Modal and Drawer own it directly. */
const EXIT_MS = 160;

export function GuidedTour() {
  const { tourSeen, dismissTour, isConnected } = useSession();
  const features = useFeatures();
  const { permissions } = usePermissions();
  const isManager = useIsManager();
  /* The app's own definition of "can approve", not a second one — see
     `approvals/inbox.tsx#APPROVE_PERMISSIONS`, already imported for the
     identical reason in `shell.tsx`. A hand-rolled pair of `useCan()` calls
     here once missed `isManager`, `APPROVE_LEAVE_ALL`, `APPROVE_LOANS` and
     `APPROVE_EXPENSES` — a manager who approves only by virtue of being
     someone's manager, or somebody holding only `APPROVE_LOANS`, has real
     work in that queue and would never have been told about it. */
  const canApprove =
    isManager || hasAnyPermission(permissions, APPROVE_PERMISSIONS);
  const canSettings = hasPermission(permissions, "MANAGE_SETTINGS");

  /**
   * `null` is "decide from the account". Opening it by hand sets `true`, and
   * closing sets `false` so it stays shut for this page load even when the
   * write to the server has not landed — or cannot, in demo mode.
   */
  const [asked, setAsked] = useState<boolean | null>(null);
  /**
   * Tracked by id, never by index. `steps` below is recomputed whenever the
   * signed-in person's permissions or features change — on first load,
   * `usePermissions()` resolves in two phases (the token's own claims, then
   * the authoritative read) that can disagree — and a plain numeric position
   * would then point at whatever happens to occupy that slot in the new
   * array, silently swapping the card's content mid-read with the "X of N"
   * counter now wrong too. Deriving `index` by finding this id in `steps`
   * means a reader's position survives a recompute as long as their step
   * still exists at all.
   */
  const [stepId, setStepId] = useState<string>(STEPS[0]!.id);

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
      setStepId(STEPS[0]!.id);
      setAsked(true);
    };
    window.addEventListener(TOUR_OPEN, onOpen);
    return () => window.removeEventListener(TOUR_OPEN, onOpen);
  }, []);

  const steps = useMemo(
    () => visibleSteps(STEPS, permissions, features),
    [permissions, features],
  );

  /* Auto-opens only for a real account that has not seen it. `features` is
     read so the sidebar has settled before anything points at it — a tour that
     opens mid-load points at a nav that is about to change size. */
  const unseen = isConnected && !tourSeen && !features.loading;
  /* `steps.length === 0` can't happen today — welcome, nav, yours, approvals
     and search all carry `always: true` — but folding it into `useDismiss`'s
     input rather than a second early return keeps the "should this be open"
     question in one place. */
  const wantOpen = (asked ?? unseen) && steps.length > 0;
  const { mounted, closing } = useDismiss(wantOpen, EXIT_MS);

  if (!mounted) return null;

  /* Only reached if the current step genuinely vanished mid-tour (a
     permission or feature narrowed under the reader) — falls back to the
     first step rather than crashing on an undefined index. */
  const position = steps.findIndex((s) => s.id === stepId);
  const index = position === -1 ? 0 : position;
  const step = steps[index]!;
  const last = index >= steps.length - 1;

  const close = () => {
    setAsked(false);
    /* `stepId` is deliberately left alone here: the card stays mounted for
       `EXIT_MS` to play its exit animation, and resetting the step now would
       flip the visible content to "1 of N" for that last frame instead of
       fading out the step actually being read. `onOpen` above resets it for
       the next time the tour is opened, which is the only path back to
       `wantOpen` being true after a close. */
    void dismissTour();
  };

  return (
    <Spotlight target={step.target} onDismiss={close} closing={closing}>
      <p className="text-meta font-medium text-faint">
        {index + 1} of {steps.length}
      </p>
      <h2 className="mt-1.5 text-body font-semibold text-ink">{step.title}</h2>
      <p className="mt-1.5 text-body-sm leading-relaxed text-body">
        {typeof step.body === "function"
          ? step.body({ total: steps.length, canSettings, canApprove })
          : step.body}
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
              onClick={() => setStepId(steps[index - 1]!.id)}
            >
              Back
            </Button>
          )}
          <Button
            variant="accent"
            size="sm"
            onClick={() => (last ? close() : setStepId(steps[index + 1]!.id))}
          >
            {last ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </Spotlight>
  );
}

export { findTarget };
