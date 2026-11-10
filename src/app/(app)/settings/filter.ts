import { tokensOf } from "@/components/portal/sidebar-model";

/**
 * The filter box on the Settings screen.
 *
 * ## What it is for
 *
 * Settings is one checklist of seven rows and a list of about twenty pages, and
 * nothing on it could be searched. The sidebar's Find box only reaches pages
 * that are in the sidebar, and Settings has two entries there, so typing
 * "overtime" or "pension" found nothing on the one screen that holds them. People
 * arrive with a word and not a page name: "where do I change the pension rate",
 * "where are the holidays". This narrows what is on screen to the entries that
 * mention that word.
 *
 * ## What it is not
 *
 * It does not search *inside* the pages. "Negative balance" will not open the
 * leave rules, because that needs an index of every setting on every screen, and
 * an index that is not kept current is how a search starts sending people to the
 * wrong place. It finds the page; the page has the setting.
 *
 * ## How it matches
 *
 * Every word typed must start a word in the entry's title, its description or
 * its keywords. A word *start*, not any substring: "pay" finds Payroll and Pay
 * setup and not "display", and "ho" does not find every entry with "who" in it.
 * Nothing is ranked. The page keeps its own order, so the same entry is in the
 * same place whatever is typed.
 *
 * The matching is kept apart from the layout for the reason `./checklist.ts`
 * is: it is a page of conditions, and mixing it into JSX is how two screens end
 * up disagreeing about what a word finds.
 */

/** What a filter looks at. The state of a row ("Not set up") is deliberately not in it. */
export type Searchable = {
  title: string;
  /** Static text only: what the entry is for. Never a sentence about today's state. */
  description?: string;
  /** Other words somebody might type for the same thing. */
  words?: readonly string[];
};

const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * The words in a query, as the sidebar's Find box reads them (case and accents
 * folded, punctuation dropped), so a word finds the same thing in both. Empty
 * for a query of spaces and punctuation, which filters nothing.
 */
export function termsOf(query: string): string[] {
  return tokensOf(query);
}

/**
 * Whether an entry answers a query. An empty query matches everything, so a
 * caller does not have to special-case "not filtering".
 */
export function matches(terms: readonly string[], entry: Searchable): boolean {
  if (terms.length === 0) return true;
  const haystack = wordsOf(
    [entry.title, entry.description ?? "", ...(entry.words ?? [])].join(" "),
  );
  return terms.every((term) => haystack.some((word) => word.startsWith(term)));
}

/**
 * Other words for each page, keyed by where it lives.
 *
 * These are only for finding the page, so each one has to be something the page
 * actually holds: a keyword that sends somebody to a screen without the thing is
 * worse than no keyword. Words already in a title or description are not
 * repeated here.
 */
export const PAGE_WORDS: Readonly<Record<string, readonly string[]>> = {
  "/settings/features": [
    "modules",
    "loans",
    "expenses",
    "hiring",
    "shifts",
    "attendance",
    "grades",
    "departments",
    "turn off",
    "turn on",
  ],
  "/settings/job-roles": ["job titles", "positions", "competencies"],
  "/settings/required-details": [
    "profile",
    "next of kin",
    "date of birth",
    "missing details",
  ],
  "/settings/announcements": [
    "announcements",
    "notices",
    "news",
    "broadcast",
    "dashboard",
  ],
  "/settings/security": [
    "2fa",
    "two-factor",
    "otp",
    "code",
    "login",
    "sign in",
  ],
  "/settings/helpdesk": ["tickets", "sla", "support", "requests"],
  "/settings/knowledge": ["articles", "faq", "help", "searches"],
  "/settings/policies": ["acknowledge", "handbook", "documents", "read"],
  "/settings/attendance": [
    "shift",
    "clock in",
    "clock-in",
    "late",
    "grace",
    "weekdays",
    "hours",
  ],
  "/settings/devices": ["fingerprint", "biometric", "clocking", "machines"],
  "/settings/overtime": ["rates", "weekend", "public holiday", "minutes"],
  "/settings/performance": [
    "appraisal",
    "weights",
    "rating",
    "marks",
    "overall mark",
    "self-assessment",
    "scoring",
  ],
  "/settings/notifications": ["email", "reminders", "alerts"],
  "/settings/sms": ["sms", "text message", "texts", "weekly"],
  "/settings/appearance": ["dark", "light", "theme", "display", "colour"],
  "/settings/ai": ["ai", "assistant", "gemini", "claude", "key", "suggestions"],
  "/settings/integrations": ["jira", "accounting", "connect", "tickets"],
  "/settings/audit": ["log", "history", "who changed", "trail"],
  "/people": ["directory", "staff", "employees", "access"],
};

/**
 * Other words for each checklist row, keyed by its id. Rows are keyed by id and
 * not by where they link: the "Payroll checks" row links to the new-employee
 * form when somebody is missing a detail, and to Pay setup when the checks are
 * clear, so its address is not what the row is about.
 */
export const ROW_WORDS: Readonly<Record<string, readonly string[]>> = {
  company: [
    "logo",
    "rc number",
    "registration",
    "address",
    "tin",
    "tax state",
    "paye state",
    "entity",
    "entities",
    "profile",
  ],
  locations: [
    "office",
    "offices",
    "branch",
    "branches",
    "geofence",
    "clock in",
    "remote",
  ],
  "record-fields": [
    "fields",
    "pension pin",
    "tin",
    "nhf",
    "bank details",
    "employee record",
  ],
  leave: [
    "holidays",
    "annual",
    "sick",
    "entitlement",
    "carry over",
    "accrual",
    "time off",
    "vacation",
    "balance",
  ],
  pay: [
    "pension",
    "nhf",
    "paye",
    "tax",
    "salary",
    "deductions",
    "bank",
    "payslip",
    "working days",
  ],
  roles: ["permissions", "access", "admin", "approver", "who can"],
  "payroll-checks": ["blockers", "warnings", "bank account", "pension pin"],
};

/** Billing is a card and not a row, so its words live here. */
export const BILLING: Searchable = {
  title: "Billing",
  description: "Your plan, free trial, subscription and renewal.",
  words: ["plan", "trial", "subscribe", "subscription", "renew", "invoice"],
};

/**
 * The module each entry belongs to, shown first on a search result so a hit
 * reads "Time and attendance, Overtime" and not a bare title. Static text, one
 * word or two, kept beside the keywords because both are about finding a page.
 */
export const PAGE_MODULE: Readonly<Record<string, string>> = {
  "/settings/features": "Company",
  "/settings/job-roles": "People",
  "/settings/required-details": "People",
  "/settings/announcements": "Communication",
  "/settings/security": "Security",
  "/settings/helpdesk": "Help desk",
  "/settings/knowledge": "Help desk",
  "/settings/policies": "People",
  "/settings/attendance": "Time and attendance",
  "/settings/devices": "Time and attendance",
  "/settings/overtime": "Time and attendance",
  "/settings/performance": "Performance",
  "/settings/notifications": "Communication",
  "/settings/sms": "Communication",
  "/settings/appearance": "Personal",
  "/settings/ai": "Integrations",
  "/settings/integrations": "Integrations",
  "/settings/audit": "Security",
  "/people": "People",
};

export const ROW_MODULE: Readonly<Record<string, string>> = {
  company: "Company",
  locations: "Company",
  "record-fields": "People",
  leave: "Leave",
  pay: "Payroll",
  roles: "Security",
  "payroll-checks": "Payroll",
};

export const BILLING_MODULE = "Billing";

/** The first sentence, so a result carries a small description and not a paragraph. */
export function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}
