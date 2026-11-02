import type { PermissionKey, PermissionSet } from "@/lib/permissions";

/**
 * The questions the Assistant page offers as buttons, and the sentence above them.
 *
 * ## One rule: a button only asks what this person's lookups can answer
 *
 * The assistant answers from a fixed set of lookups in the API
 * (`src/modules/ai/reads.ts` in the backend), and each one is narrowed to the
 * caller. Some need a permission (`find_people` needs `EDIT_RECORDS`,
 * `payroll_periods` needs `VIEW_SALARIES`), and `leave_requests` narrows inside:
 * somebody who holds `APPROVE_LEAVE_ALL` or `EDIT_RECORDS` is given everybody's
 * requests, and everybody else is given their own. A button for a question the
 * lookups cannot answer is worse than no button, because the assistant has
 * nothing to say and what it says instead can read as an answer.
 *
 * The first permission-aware version broke the rule twice.
 *
 * - **Line managers.** It offered "Whose leave requests are waiting for me?" and
 *   "Who on my team is on leave?". The lookup behind both returns a line manager
 *   only their own requests, because `APPROVE_LEAVE` reaches one report's request
 *   when it is decided and does not list anybody's. "There are no approved leave
 *   requests" would be a claim about a team the lookup never looked at, which is
 *   the absent-is-not-zero defect in a sentence.
 * - **Payroll roles.** The payroll button sat inside the `EDIT_RECORDS` branch, so
 *   the Payroll analyst and the Finance approver, who hold `VIEW_SALARIES` and not
 *   `EDIT_RECORDS`, were offered none, while the lookups only they can use had no
 *   button at all.
 *
 * So each button here names the lookups that answer it (`reads`) and says who is
 * offered it, by what the person holds and not by the name of a role: a company
 * can make any role it likes, and the API decides by permission.
 * `tests/assistant-openers-lookups.test.ts` reads the API's source as text and
 * fails when this table asks something the API would not answer for the person it
 * is offered to. It skips when there is no backend checkout, because the
 * frontend's CI clones this repo alone; `scripts/backend-source.ts` says where it
 * looks.
 *
 * A line manager therefore has no button about their team's leave: nothing the
 * assistant can look up answers it. A manager decides their reports' requests in
 * the approvals inbox, and that is not one of the lookups. Giving the assistant a
 * lookup of it is a backend change and a product decision, not a wording fix.
 *
 * ## The sentence above the buttons is made from the buttons
 *
 * Each button carries the topics it is about, and the sentence is those topics,
 * in order, with no repeats. It cannot promise something no button offers, and it
 * cannot leave out something one does, which is how an administrator's sentence
 * used to mention payroll for a person who could not see any.
 */

/** What the assistant's lookups care about in the person asking. */
export type Standing = {
  /** `EDIT_RECORDS`: `find_people`, and everybody's requests in `leave_requests`. */
  editsRecords: boolean;
  /** `VIEW_SALARIES`: `payroll_periods` and `payroll_settings`. */
  viewsSalaries: boolean;
  /** `APPROVE_LEAVE_ALL`: everybody's requests in `leave_requests`. */
  approvesAllLeave: boolean;
};

/**
 * The permission behind each part of a standing.
 *
 * Exported so the test that reads the API's source can name the permissions it is
 * checking instead of repeating them.
 */
export const STANDING_PERMISSIONS = {
  editsRecords: "EDIT_RECORDS",
  viewsSalaries: "VIEW_SALARIES",
  approvesAllLeave: "APPROVE_LEAVE_ALL",
} as const satisfies Record<keyof Standing, PermissionKey>;

export function standingFrom(permissions: PermissionSet): Standing {
  return {
    editsRecords: permissions.has(STANDING_PERMISSIONS.editsRecords),
    viewsSalaries: permissions.has(STANDING_PERMISSIONS.viewsSalaries),
    approvesAllLeave: permissions.has(STANDING_PERMISSIONS.approvesAllLeave),
  };
}

/**
 * Whether `leave_requests` lists everybody's requests for this person.
 *
 * Mirrors the API's `seesEveryone` in `reads.ts` clause for clause, and the test
 * above checks that it still does. Everybody else is given their own requests only.
 */
export function seesAllLeave(who: Standing): boolean {
  return who.editsRecords || who.approvesAllLeave;
}

export type Opener = {
  /** The button's text, which is what is put in the box when it is pressed. */
  ask: string;
  /** What it is about, in the words of the sentence above the buttons. */
  topics: readonly string[];
  /** The API lookups that answer it, by the `name` each has in `reads.ts`. */
  reads: readonly string[];
  /** For `leave_requests`: whose requests the answer is made of. */
  leave?: "all" | "own";
  /** Who is offered it. */
  offeredTo: (who: Standing) => boolean;
};

/**
 * Every question that can be offered, most useful to somebody running the company
 * first. A person is shown the first few that apply to them (`MAX_TOPICAL`).
 */
export const OPENERS: readonly Opener[] = [
  {
    ask: "How many people have no bank account?",
    topics: ["your people"],
    reads: ["headcount"],
    offeredTo: (who) => who.editsRecords,
  },
  {
    ask: "Whose leave requests are still waiting?",
    topics: ["your leave"],
    reads: ["leave_requests"],
    leave: "all",
    offeredTo: seesAllLeave,
  },
  {
    /* `headcount` counts what is missing (a bank account, a pension PIN, a TIN).
       Naming the people needs `find_people`, which is `EDIT_RECORDS`, so a person
       who holds only `VIEW_SALARIES` is given the counts. */
    ask: "Is anyone missing something before payday?",
    topics: ["your payroll runs"],
    reads: ["headcount"],
    offeredTo: (who) => who.viewsSalaries,
  },
  {
    ask: "What did we pay last month?",
    topics: ["your payroll runs"],
    reads: ["payroll_periods"],
    offeredTo: (who) => who.viewsSalaries,
  },
  {
    ask: "What was my last net pay?",
    topics: ["your own pay"],
    reads: ["my_payslip"],
    offeredTo: () => true,
  },
  {
    /* For somebody who is given everybody's requests, `leave_requests` is not
       "mine", so this is only offered to those who are given their own. */
    ask: "What leave have I asked for?",
    topics: ["your leave"],
    reads: ["leave_requests"],
    leave: "own",
    offeredTo: (who) => !seesAllLeave(who),
  },
  {
    ask: "Which review periods are running?",
    topics: ["the review periods"],
    reads: ["review_periods"],
    offeredTo: () => true,
  },
];

/** The one question that needs no lookup: it is answered from what the assistant can do. */
export const OPEN_ENDED = "What can you do for me?";

/** How many of the questions above a person is shown, before the open-ended one. */
export const MAX_TOPICAL = 3;

/** "a", "a or b", "a, b, or c": the way the sentence above the buttons lists topics. */
function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return items.join(" or ");
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1] ?? ""}`;
}

export function openersFor(who: Standing): {
  questions: string[];
  intro: string;
} {
  const shown = OPENERS.filter((opener) => opener.offeredTo(who)).slice(
    0,
    MAX_TOPICAL,
  );
  const topics = [...new Set(shown.flatMap((opener) => opener.topics))];
  return {
    questions: [...shown.map((opener) => opener.ask), OPEN_ENDED],
    intro: `Ask about ${listOf(topics)}.`,
  };
}
