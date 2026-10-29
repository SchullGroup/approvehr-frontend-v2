import type { ReviewAudience, SubsectionAudience } from "@/lib/api/performance";

/**
 * Whether an appraisal period asks a directly rated subsection on its review
 * form, and of whom.
 *
 * Everything here is a decision about a value, kept apart from the components
 * that draw it for the reason `answer-kind.ts` is: the words and the mapping can
 * be read, and tested, without mounting anything.
 *
 * ## Four choices, and one of them is "no question at all"
 *
 * A subsection is rated under Competency ratings whatever a period does. Asking
 * it on the form is a decision of the period, made while the period is a draft:
 * the manager, the employee, or both. **Not asked** is not a fifth audience, it is
 * the absence of a question, so saving it takes the question off the form and
 * saving anything else puts it there or moves who it is put to. The API has the
 * same shape (`PUT` makes or changes it, `DELETE` removes it), which is why
 * `askedOfChoice` returns `null` for it rather than an empty list: an empty list
 * is a request the API refuses.
 *
 * ## What each choice means for the mark
 *
 * Said in one short line under the control, and only where it changes the
 * decision. If only one of them is asked, that answer is the person's rating of
 * the subsection. If both are, the manager's is, and the employee's is shown on
 * the manager's form beside it, the way self-assessment is handled: a person's
 * view of themselves informs the mark and never sets it.
 *
 * ## Nothing here scores anybody
 *
 * Which answer becomes the rating is decided on the API when a form is sent. The
 * lines below describe that; they do not compute it.
 */

export type AskedChoice = "none" | "manager" | "employee" | "both";

/** The options of the control, in the order the product owner named them. */
export const ASKED_CHOICES: readonly { value: AskedChoice; label: string }[] = [
  { value: "none", label: "Not asked" },
  { value: "manager", label: "The manager" },
  { value: "employee", label: "The employee" },
  { value: "both", label: "Both" },
];

/**
 * What the control shows for what a period holds.
 *
 * `null` and an empty list are not asked. A list the API would never send (a
 * colleague among them) is read for the two audiences it can mean and nothing
 * else, so it cannot make a subsection look asked of somebody it is not.
 */
export function askedChoiceOf(
  askedOf: readonly ReviewAudience[] | null | undefined,
): AskedChoice {
  const self = askedOf?.includes("SELF") ?? false;
  const manager = askedOf?.includes("MANAGER") ?? false;
  if (self && manager) return "both";
  if (manager) return "manager";
  if (self) return "employee";
  return "none";
}

/**
 * The body `PUT .../subsection-questions/:competencyId` takes for a choice, or
 * `null` for **Not asked**, which is a `DELETE` and never a request with nobody
 * in it. The person comes before their manager, the order the rest of the
 * Questions dialog lists audiences in.
 */
export function askedOfChoice(
  choice: AskedChoice,
): SubsectionAudience[] | null {
  switch (choice) {
    case "none":
      return null;
    case "manager":
      return ["MANAGER"];
    case "employee":
      return ["SELF"];
    case "both":
      return ["SELF", "MANAGER"];
  }
}

/**
 * What choosing it means, in the words of the product owner's brief.
 *
 * **Not asked says nothing**: it is the default, and a line to say that a
 * subsection nobody asked is not asked is a sentence with no job.
 */
export const ASKED_CONSEQUENCE: Record<AskedChoice, string | null> = {
  none: null,
  manager: "Recorded when the manager sends their review.",
  employee: "Their own answer counts towards the mark.",
  both: "The manager's answer counts. The employee's is shown beside it.",
};

/**
 * What pressing the button would do, from what the period holds to what is chosen.
 *
 * The control picks who is asked and **writes nothing until a button is pressed**.
 * The first version wrote the moment a choice was picked, and somebody who had
 * just picked **Both** looked for the button that finishes the job, found none,
 * and asked where to click Add. So there is one, and its label is the act:
 *
 * - **add**: the period does not ask it, and a choice has been made.
 * - **change**: the period asks it, and somebody else is now chosen.
 * - **remove**: **Not asked** is chosen for a subsection the period does ask.
 *
 * `null` when the choice is what the period already holds, which is when there is
 * nothing to press: the button is then a disabled **Add** if the period does not
 * ask it (so the way to finish is on screen from the start), and the line **On the
 * review form** if it does.
 */
export type AskAction = "add" | "change" | "remove";

export function askActionFor(
  saved: AskedChoice,
  chosen: AskedChoice,
): AskAction | null {
  if (chosen === saved) return null;
  if (chosen === "none") return "remove";
  return saved === "none" ? "add" : "change";
}

/** What each press says it does. The first is also the disabled start. */
export const ASK_ACTION_LABEL: Record<AskAction, string> = {
  add: "Add to the review form",
  change: "Save change",
  remove: "Take it off the form",
};

/** Who a saved choice puts the question to, as it reads in a sentence. */
const SAVED_TO: Record<Exclude<AskedChoice, "none">, string> = {
  manager: "the manager",
  employee: "the employee",
  both: "both",
};

/**
 * What is said once a choice has been written.
 *
 * The button that wrote it is replaced by **On the review form**, which stays, so
 * this is the message that goes after six seconds. It says what happened, to
 * whom, and where to find the question, because that is the next thing anybody
 * asks.
 *
 * ## The name is in the title, and the detail is short and fixed
 *
 * A toast clamps its detail to two lines, about forty characters each at its
 * width, and the first draft put the name in the detail: "...It is listed under
 * All questions." came out as "...It is listed under All...", which cut off the
 * very words that say where to look. The title is not clamped, so the name goes
 * there, and nothing in the detail varies with it.
 *
 * `from` is what the period held before: putting a subsection on the form and
 * changing who it is put to are different acts to read about.
 */
export function savedWords(
  to: AskedChoice,
  name: string,
  from: AskedChoice,
): { title: string; detail: string } {
  if (to === "none") {
    return {
      title: `${name} taken off the review form`,
      detail: "It is no longer asked in this period.",
    };
  }
  return {
    title:
      from === "none"
        ? `${name} added to the review form`
        : `${name} updated on the review form`,
    detail: `Asked of ${SAVED_TO[to]}. Find it under All questions.`,
  };
}

/**
 * Who a subsection question is put to, as a row of the full list says it:
 * **Manager**, **Employee** or **Both**. `null` for a list that is neither, so a
 * row can fall back to the audience words every other question uses instead of
 * claiming one of these.
 */
export function askedWho(
  askedOf: readonly ReviewAudience[] | null | undefined,
): "Manager" | "Employee" | "Both" | null {
  switch (askedChoiceOf(askedOf)) {
    case "manager":
      return "Manager";
    case "employee":
      return "Employee";
    case "both":
      return "Both";
    case "none":
      return null;
  }
}

/**
 * What a screen needs to put subsections on one period's form: what the period
 * holds, and the two writes.
 *
 * **Absent where the period cannot be asked** (no API, no permission, or nothing
 * yet read), and the control is then not drawn at all. A control that said "Not
 * asked" before the period's questions had loaded, or after they failed to,
 * would be a claim about the form made without an answer: absent is not none.
 */
export type SubsectionAsk = {
  periodName: string;
  /** Only a draft period can change who is asked: the API refuses it after. */
  draft: boolean;
  /**
   * Who this period asks of a subsection, or `null` when it does not ask it.
   * Read from the period's own questions, never assumed.
   */
  askedOf: (competencyId: string) => readonly ReviewAudience[] | null;
  /** Put it on the form, or change who is asked. Rejects with the API's refusal. */
  onAsk: (competencyId: string, askedOf: SubsectionAudience[]) => Promise<void>;
  /** Take it off the form. Rejects with the API's refusal. */
  onStop: (competencyId: string) => Promise<void>;
};

/** Why the control cannot be changed once the period has started. */
export function periodStartedReason(periodName: string): string {
  return `${periodName} has started, so this can no longer change.`;
}

/**
 * Why a pick-one subsection cannot be asked yet. Nobody could answer a required
 * question with nothing to pick, and every form carrying it would stay unsent.
 */
export const NEEDS_CHOICES =
  "It needs at least two choices before a form can ask it.";
