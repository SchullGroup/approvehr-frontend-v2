"use client";

import { useCallback, useSyncExternalStore } from "react";
import { ONBOARDING } from "@/lib/mock/workflows";
import { daysSince } from "@/lib/today";
import type { Employee } from "@/lib/types";
import { createPersistedState } from "./persisted";

/**
 * The new-starter checklist.
 *
 * ## Two kinds of step, and the difference matters
 *
 * Half of onboarding is **already recorded somewhere**: whether a bank account
 * is on file, whether the pension PIN arrived, whether payroll can pay them at
 * all. Those steps are read off the employment record and cannot be ticked by
 * hand — ticking "bank account collected" while the field is empty would be a
 * checklist that lies to the person reading it, and the run would still leave
 * them out.
 *
 * The other half is somebody doing something off-screen: handing over a laptop,
 * booking a check-in. Nothing in the database knows, so those are ticked here.
 *
 * ## Why the ticks are local, in both modes
 *
 * There is no onboarding module in the API. Rather than inventing one on the
 * client and dressing it up as saved, the manual ticks live in this browser and
 * the screen says so — in connected mode too, because a tick that survives a
 * reload on this laptop and nowhere else is not "live". The derived steps are as
 * live as the record they read, which connected means Postgres.
 *
 * When the module lands, `toggle` is the only function that changes.
 */

export type StepOwner = "employee" | "hr" | "manager" | "it";

export type OnboardingStep = {
  id: string;
  label: string;
  owner: StepOwner;
  /** Days relative to the start date. Negative is before they arrive. */
  dueOffsetDays: number;
  /**
   * Answers itself from the record. Absent means it is ticked by hand.
   *
   * A predicate rather than a field name so a step can depend on more than one
   * — "bank account and pension PIN" is one job to whoever is chasing it.
   */
  fromRecord?: (employee: Employee) => boolean;
};

/**
 * The default template. Nigerian SME defaults, populated rather than configured
 * — nobody should have to build a checklist before they can hire somebody.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "o1",
    label: "Signed contract returned",
    owner: "employee",
    dueOffsetDays: -7,
  },
  {
    id: "o2",
    label: "Bank account and pension PIN collected",
    owner: "hr",
    dueOffsetDays: -3,
    fromRecord: (e) => Boolean(e.bankAccount) && Boolean(e.pensionPin),
  },
  {
    id: "o3",
    label: "TIN and NHF number recorded",
    owner: "hr",
    dueOffsetDays: -3,
    fromRecord: (e) => Boolean(e.tin) && Boolean(e.nhfNumber),
  },
  {
    id: "o4",
    label: "Laptop and accounts provisioned",
    owner: "it",
    dueOffsetDays: -1,
  },
  {
    id: "o5",
    label: "Payroll can pay them",
    owner: "hr",
    dueOffsetDays: 0,
    fromRecord: (e) => Boolean(e.bankAccount) && Boolean(e.pensionPin) && Boolean(e.tin),
  },
  {
    id: "o6",
    label: "First-week check-in booked",
    owner: "manager",
    dueOffsetDays: 2,
  },
  {
    id: "o7",
    label: "Handbook and policies acknowledged",
    owner: "employee",
    dueOffsetDays: 5,
  },
  {
    id: "o8",
    label: "30-day review scheduled",
    owner: "manager",
    dueOffsetDays: 14,
  },
];

type State = {
  /** Employee id → the ids of the manual steps ticked for them. */
  done: Record<string, string[]>;
};

/**
 * Seeded from the demo fixture, so the seeded starters keep the partial
 * progress the screen has always shown.
 *
 * A real employee id never collides with `p-08`, so connected this is inert.
 */
const EMPTY: State = {
  done: Object.fromEntries(
    ONBOARDING.map((o) => [
      o.employeeId,
      o.tasks.filter((t) => t.done).map((t) => t.id),
    ]),
  ),
};

const store = createPersistedState<State>({
  key: "approvehr.onboarding.store",
  empty: EMPTY,
  version: 1,
});

/** `2026-08-01` plus five days. */
export function dueOn(startDate: string, offsetDays: number): string {
  const date = new Date(startDate);
  if (Number.isNaN(date.getTime())) return startDate;
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export type ResolvedStep = {
  step: OnboardingStep;
  done: boolean;
  /** True when the record answers this step, so it cannot be ticked by hand. */
  derived: boolean;
  due: string;
  overdue: boolean;
};

export function useOnboardingChecklist() {
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );

  const toggle = useCallback((employeeId: string, stepId: string) => {
    const current = store.current();
    const ticked = current.done[employeeId] ?? [];
    store.commit({
      done: {
        ...current.done,
        [employeeId]: ticked.includes(stepId)
          ? ticked.filter((id) => id !== stepId)
          : [...ticked, stepId],
      },
    });
  }, []);

  /** Every step for one person, with where its answer came from. */
  const stepsFor = useCallback(
    (employee: Employee): ResolvedStep[] => {
      const ticked = state.done[employee.id] ?? [];
      return ONBOARDING_STEPS.map((step) => {
        const done = step.fromRecord
          ? step.fromRecord(employee)
          : ticked.includes(step.id);
        const due = dueOn(employee.startDate, step.dueOffsetDays);
        return {
          step,
          done,
          derived: step.fromRecord !== undefined,
          due,
          overdue: !done && daysSince(due) > 0,
        };
      });
    },
    [state.done],
  );

  return { stepsFor, toggle };
}
