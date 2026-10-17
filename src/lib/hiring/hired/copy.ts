import { formatDateShort } from "@/lib/time";
import type {
  CreateEmployeeCheck,
  HireState,
  HiredPerson,
  OnOfferAccepted,
} from "./model";

/**
 * The words around hiring somebody.
 *
 * ## Accepting an offer changed, and the screens say how
 *
 * Accepting an offer used to create the employee record in the same breath. Now it
 * puts the person on the Hired list, and an employee is made only when somebody
 * chooses to (or when the company's setting says to, as it always did). Anybody who
 * had the old behaviour is looking at a button whose effect is different, so every
 * place that records an acceptance says in one plain sentence what happens next.
 *
 * ## Said only when it is known
 *
 * The sentence is driven by two facts — the company's setting and whether it has
 * Core HR — and by nothing else. Where either is not known yet, the sentence claims
 * only what is true either way. And **no sentence here says an employee record or an
 * email was created**: that is said by the screens, from the API's answer, after it
 * has happened.
 *
 * No React, no state.
 */

/** What a person sees in the setting, the list and the toast. */
export const STATE_LABEL: Record<HireState, string> = {
  HIRED: "Hired",
  EMPLOYEE_CREATED: "Employee created",
  DID_NOT_JOIN: "Did not join",
};

export type AcceptContext = {
  /** `null` while the company's setting has not been read. */
  setting: OnOfferAccepted | null;
  /** `null` while it is not known whether the company has Core HR. */
  coreHr: boolean | null;
};

export type AcceptWords = {
  /** What happens to the person, in one sentence. */
  headline: string;
  /** Why, or what to do about it, when a second sentence helps. */
  detail: string | null;
  /** The employee record is made as part of recording the acceptance. */
  makesEmployee: boolean;
};

/** What recording an acceptance does for this company, before it is pressed. */
export function whatAcceptingDoes(context: AcceptContext): AcceptWords {
  const { setting, coreHr } = context;

  if (setting === null || coreHr === null) {
    return {
      headline: "They are added to the Hired list.",
      detail:
        "Whether an employee record is made as well depends on Hiring settings, under Accepted offers.",
      makesEmployee: false,
    };
  }

  if (setting === "CREATE_EMPLOYEE") {
    if (coreHr) {
      return {
        headline:
          "They are added to the Hired list and their employee record is created now.",
        detail:
          "That is how accepting an offer worked before the Hired list, and your company has kept it. You can change it in Hiring settings.",
        makesEmployee: true,
      };
    }
    return {
      headline:
        "They are added to the Hired list. No employee record is created, because your company does not use Core HR.",
      detail:
        "Your setting is to create one, but there is nowhere to create it. The Hired list is where they stay, and you can export it.",
      makesEmployee: false,
    };
  }

  return {
    headline:
      "They are added to the Hired list. No employee record is created yet.",
    detail: coreHr
      ? "Create it from the Hired list when you are ready, for one person or for many."
      : "Your company does not use Core HR, so the Hired list is where they stay. You can export it.",
    makesEmployee: false,
  };
}

/** What the API said recording an acceptance did, as far as the screen can tell. */
export type AcceptResult = {
  /** Set only when the API made an employee record. */
  employeeId: string | null;
  rejectedOthers: number;
  hiresSoFar?: number | undefined;
  headcount?: number | undefined;
  requisitionFilled?: boolean | undefined;
};

/**
 * The line shown after an acceptance was recorded.
 *
 * The employee clause comes from `employeeId` in the API's answer and from nothing
 * else: it is said when one was made, and when the API says none was it says that
 * instead of leaving a person to wonder.
 */
export function acceptedNotice(name: string, result: AcceptResult): string {
  const parts = [
    result.employeeId
      ? `${name} is on the Hired list and their employee record was created.`
      : `${name} is on the Hired list. No employee record was created.`,
  ];

  if (
    result.rejectedOthers === 0 &&
    result.requisitionFilled === false &&
    result.hiresSoFar !== undefined &&
    result.headcount !== undefined
  ) {
    parts.push(
      `That is hire ${String(result.hiresSoFar)} of ${String(result.headcount)} for this role, so it is still open.`,
    );
  } else if (result.rejectedOthers > 0) {
    const others = result.rejectedOthers === 1 ? "candidate" : "candidates";
    const were = result.rejectedOthers === 1 ? "was" : "were";
    parts.push(
      `${String(result.rejectedOthers)} other ${others} still in this pipeline ${were} automatically rejected: the role is filled.`,
    );
  }
  return parts.join(" ");
}

/* --------------------------------------------------------- create employee */

/**
 * A day, in the form the rest of the app uses.
 *
 * A bare `YYYY-MM-DD` (a start date, a filter) is a day and is written as that day
 * whatever zone anybody is in. An instant (when an offer was accepted) is written as
 * the day it was in the company's own zone.
 */
export const dayOf = (
  value: string | null | undefined,
  timeZone = "UTC",
): string | null => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return formatDateShort(`${value}T00:00:00Z`, "UTC");
  return formatDateShort(value, timeZone);
};

const date = (iso: string | null): string | null => dayOf(iso);

/** What making the employee record does, for the confirm dialog. */
export function createEmployeeLines(person: HiredPerson): string[] {
  const check = person.createEmployee;
  if (check.allowed && check.description) return [check.description];

  const start = date(person.startDate);
  return [
    `An employee record is created for ${person.name} from their application and offer${start ? `, starting ${start}` : ""}.`,
    "Onboarding starts for them, the same as it did when accepting an offer created the record.",
    "This step sends no email of its own. Whatever a new employee normally receives, they receive.",
  ];
}

/** Why Create employee is not on offer for somebody, or `null` when it is. */
export function whyNoEmployee(
  person: HiredPerson,
  coreHr: boolean,
): string | null {
  if (!coreHr)
    return "Your company does not use Core HR, so there are no employee records to create.";
  if (person.state === "EMPLOYEE_CREATED") return "Already an employee.";
  if (person.state === "DID_NOT_JOIN") return "They did not join.";
  const check: CreateEmployeeCheck = person.createEmployee;
  return check.allowed ? null : check.reason;
}

/* -------------------------------------------------------------- did not join */

export function didNotJoinLines(person: HiredPerson): string[] {
  return [
    `${person.name} stays on the list, marked Did not join, with the reason you give.`,
    `It frees their place on ${person.role}. If the job had been filled, it opens again so you can hire for it.`,
  ];
}

export const REASON_MIN = 3;
export const REASON_MAX = 500;

/* ----------------------------------------------------------------- the bulk */

export const people = (count: number): string =>
  `${count.toLocaleString("en-NG")} ${count === 1 ? "person" : "people"}`;

export function bulkCreateLines(count: number): string[] {
  return [
    `Each of the ${people(count)} gets an employee record made from their application and offer, and onboarding starts for them.`,
    "Anybody who cannot be done is left as they are and listed afterwards with the reason: they already are an employee, an employee with their email exists, they did not join, or the job already has all its people.",
    "This step sends no email of its own.",
  ];
}

/* ------------------------------------------------------------------- export */

export const EXPORT_PRIVACY =
  "The file holds people's names and contact details, and anything else you tick. Export it only for someone who needs it, and keep it safe. Each export is logged: who made it, when, and how many people it held. The file itself is not kept.";
