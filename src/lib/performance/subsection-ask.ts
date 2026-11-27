import type { ReviewAudience, SubsectionAudience } from "@/lib/api/performance";

/**
 * Whether an appraisal period asks a directly rated subsection on its review
 * form, and of whom.
 *
 * A decision about a value, kept apart from the component that draws it so the
 * mapping can be read, and tested, without mounting anything.
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
 * ## Nothing here scores anybody
 *
 * Which answer becomes the rating is decided on the API when a form is sent.
 */

export type AskedChoice = "none" | "manager" | "employee" | "both";

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
 * questions list audiences in.
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
