/**
 * Suggested phrasing for a pick-from-a-list question, by subsection name.
 *
 * Offered in `period-dialogs.tsx`'s choice editor as one-click adds when HR
 * is filing a question under a subsection — a starting point drawn from how
 * Nigerian HR practice actually writes appraisal questions, not a fixed
 * vocabulary. Every suggestion is an ordinary choice once added: editable,
 * removable, and no different from one typed by hand.
 *
 * Keyed by the exact competency names `modules/performance/framework.ts`
 * seeds, so a company using the framework as shipped gets suggestions that
 * line up with what they are actually asking about. A company that renamed
 * or added a subsection simply sees no suggestions for it — `ChoiceEditor`
 * falls back to the whole bank, unfiltered, rather than showing nothing.
 *
 * Nothing here is company-specific. The phrasing style follows the
 * company's own Employee Performance Review Guide and general Nigerian
 * appraisal practice, generalised for any organisation rather than lifted
 * from one client's framework.
 */
export const QUESTION_BANK: Record<string, readonly string[]> = {
  "Job knowledge": [
    "Understands the role fully",
    "Understands most of the role, with some gaps",
    "Still learning the basics of the role",
  ],
  "Quality of work": [
    "Consistently accurate, rarely needs correction",
    "Mostly accurate, occasional rework needed",
    "Frequent errors that need correction",
  ],
  Dependability: [
    "Always meets commitments without being chased",
    "Usually meets commitments, occasional reminders needed",
    "Regularly needs chasing to deliver",
  ],
  Diligence: [
    "Consistently thorough and attentive to detail",
    "Generally careful, occasional oversights",
    "Attention to detail needs improvement",
  ],
  Respect: [
    "Consistently professional with colleagues and clients",
    "Generally professional, occasional friction",
    "Professionalism needs improvement",
  ],
  Integrity: [
    "Consistently honest and accountable for outcomes",
    "Generally trustworthy, occasional lapses in accountability",
    "Accountability needs improvement",
  ],
  Communication: [
    "Explains clearly in writing and in person",
    "Communicates adequately, sometimes unclear",
    "Communication needs improvement",
    "Listens actively and confirms understanding",
  ],
  Teamwork: [
    "Works well across teams and functions",
    "Cooperates when asked, rarely initiates",
    "Struggles to work with others outside their own function",
  ],
  Initiative: [
    "Regularly acts without waiting to be told",
    "Occasionally shows initiative",
    "Rarely acts without explicit direction",
  ],
  Adaptability: [
    "Handles changing priorities smoothly",
    "Adapts with some difficulty",
    "Struggles when priorities change",
  ],
  "Delivery against objectives": [
    "Consistently delivers agreed objectives on time",
    "Delivers most objectives, some slippage",
    "Regularly misses agreed objectives",
  ],
  "Customer or stakeholder outcomes": [
    "Consistently improves the experience of whoever receives the work",
    "Meets expectations most of the time",
    "Stakeholder outcomes need improvement",
  ],
  "Process and compliance": [
    "Consistently follows the required process",
    "Generally compliant, occasional deviations",
    "Process compliance needs improvement",
  ],
  "Developing people": [
    "Actively grows the people who report to them",
    "Provides some development support",
    "Rarely invests in developing their team",
  ],
  "Decision making": [
    "Decides confidently with incomplete information and owns the outcome",
    "Decides adequately, sometimes needs prompting",
    "Struggles to decide without complete information",
  ],
  "Accountability for a team": [
    "Consistently answers for the team's results as a whole",
    "Usually accountable, sometimes deflects to individuals",
    "Accountability for team outcomes needs improvement",
  ],
};
