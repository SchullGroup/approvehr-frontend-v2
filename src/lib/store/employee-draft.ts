"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { RecordFieldKey } from "@/lib/api/setup";
import type { EmploymentStatus, EmploymentType } from "@/lib/types";
import { createPersistedState } from "./persisted";

/**
 * A half-finished new starter, kept in this browser.
 *
 * ## Local, and the UI has to say so
 *
 * A server-side draft was the other option and it was rejected, not overlooked.
 * It would need a model, a migration, a router, a tenant-isolation test and a
 * decision about who may read somebody else's half-typed salary — for a thing
 * whose entire value is the four minutes of typing between a phone call and a
 * signature. `createPersistedState` gives resumability for none of that.
 *
 * The cost is real and is exactly one sentence long: **this draft does not
 * follow you to another device or survive clearing site data.** Every surface
 * that mentions the draft says that, in those words, because a draft that
 * silently vanishes when somebody opens their laptop instead of their desktop is
 * worse than no draft at all — they would have trusted it.
 *
 * ## What is stored, and what is not
 *
 * The typed values, which groups the person opened, and where they had got to.
 * Not the payslip preview (the API owns that), not the department list, and not
 * anything read-only. `savedAt` is the flag as well as the timestamp: `null`
 * means there is nothing to resume, which is a different state from a draft
 * whose fields all happen to be empty.
 *
 * ## Hydration
 *
 * All of it is `createPersistedState`'s, including the rule that makes it work:
 * storage is read after mount, never inside a snapshot, so the server and the
 * client's first render agree. See that file's header before changing anything
 * here.
 */

/* --------------------------------------------------------------------- shape */

/**
 * Every value the add-an-employee wizard collects, as the strings its inputs
 * hold.
 *
 * Strings rather than numbers for money and dates, because that is what a
 * controlled input owns and converting on every keystroke is how a half-typed
 * "1200" becomes 1200 and then refuses the next digit. `grossMonthly` becomes
 * integer kobo exactly once, at the boundary, via `koboFromDecimal`.
 */
export type EmployeeDraft = {
  firstName: string;
  lastName: string;
  /** Optional. Left out of a name entirely when empty, not sent as "". */
  middleName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  /** Where they live, one line. Not the office, and not the tax state. */
  addressLine: string;
  /** National Identification Number, 11 digits as typed. */
  nin: string;
  /** State of origin — not `taxState`, which is where PAYE is filed. */
  stateOfOrigin: string;
  /** Local government area inside that state. Free text: there are 774. */
  lgaOfOrigin: string;
  religion: string;
  /** An id from the live source, never a name. The API takes ids. */
  workLocationId: string;

  jobTitle: string;
  departmentId: string;
  managerId: string;
  employmentType: EmploymentType;
  status: EmploymentStatus;
  startDate: string;
  grossMonthly: string;

  /* Tax group. */
  taxState: string;
  tin: string;
  /** Declared annual rent, in naira as typed. Empty means undeclared. */
  annualRent: string;

  /* Pension group. */
  pensionPin: string;
  pensionProvider: string;
  nhfNumber: string;

  /* Bank group. */
  bankName: string;
  bankAccount: string;
};

/** Which optional groups the person has opened. */
export type OpenGroups = Record<RecordFieldKey, boolean>;

type Stored = {
  draft: EmployeeDraft;
  open: OpenGroups;
  /** Which wizard step they were on, so resuming lands where they left. */
  step: number;
  /** ISO timestamp, or `null` for "no draft". Not merely a display value. */
  savedAt: string | null;
};

/**
 * A blank starter.
 *
 * `taxState` is deliberately **empty** rather than "Lagos". The old form
 * defaulted it, which meant every company outside Lagos filed its PAYE to the
 * wrong revenue service unless somebody noticed a select they never touched.
 * Left blank, `POST /employees` falls back to the company's own state, which is
 * an answer somebody actually gave.
 */
export const BLANK_DRAFT: EmployeeDraft = {
  firstName: "",
  lastName: "",
  middleName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  workLocationId: "",
  jobTitle: "",
  departmentId: "",
  managerId: "",
  employmentType: "full_time",
  status: "onboarding",
  startDate: "",
  grossMonthly: "",
  taxState: "",
  tin: "",
  annualRent: "",
  pensionPin: "",
  pensionProvider: "",
  nhfNumber: "",
  addressLine: "",
  nin: "",
  stateOfOrigin: "",
  lgaOfOrigin: "",
  religion: "",
  bankName: "",
  bankAccount: "",
};

const CLOSED: OpenGroups = {
  taxSetup: false,
  pensionSetup: false,
  bankDetails: false,
};

const EMPTY: Stored = {
  draft: BLANK_DRAFT,
  open: CLOSED,
  step: 0,
  savedAt: null,
};

/**
 * Version 2. Bump on any incompatible change to `EmployeeDraft` — a stale
 * payload is then dropped rather than half-restored, which for four minutes of
 * typing is the right trade and for a partially-migrated shape would not be.
 *
 * 2 adds `middleName`. A version-1 payload predates the field entirely rather
 * than merely lacking a value for it, so `draft.middleName.trim()` would throw
 * on `undefined` if it were half-restored instead of dropped.
 */
const store = createPersistedState<Stored>({
  key: "approvehr.employee-draft.store",
  empty: EMPTY,
  version: 2,
});

/* --------------------------------------------------------------------- hook */

export type EmployeeDraftState = {
  /** Present only when something was actually saved. */
  saved: { draft: EmployeeDraft; open: OpenGroups; step: number; savedAt: string } | null;
  /** Write the whole draft. Called from an explicit press, never on keystroke. */
  save: (draft: EmployeeDraft, open: OpenGroups, step: number) => void;
  /** Throw it away. Used by Discard, and by a successful create. */
  discard: () => void;
};

export function useEmployeeDraft(): EmployeeDraftState {
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );

  const save = useCallback(
    (draft: EmployeeDraft, open: OpenGroups, step: number) => {
      store.commit({ draft, open, step, savedAt: new Date().toISOString() });
    },
    [],
  );

  const discard = useCallback(() => store.reset(), []);

  return {
    /* `savedAt` is the discriminator rather than "are any fields non-empty":
       somebody who saved a draft with one name typed has a draft, and somebody
       who never pressed Save has none even if the form is full. */
    saved:
      state.savedAt === null
        ? null
        : {
            draft: state.draft,
            open: state.open,
            step: state.step,
            savedAt: state.savedAt,
          },
    save,
    discard,
  };
}

/** "2 minutes ago", for the resume banner. Coarse on purpose. */
export function savedAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "a minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "an hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
