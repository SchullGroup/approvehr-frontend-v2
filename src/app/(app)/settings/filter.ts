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
    "fields",
    "employee record",
    "bank details",
  ],
  "/settings/job-roles": ["job titles", "positions", "competencies"],
  "/settings/queries": ["letters", "reply", "written"],
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
  "/settings/company": [
    "logo",
    "rc number",
    "registration",
    "address",
    "tin",
    "tax state",
    "paye state",
    "entity",
    "entities",
  ],
  "/settings/locations": [
    "office",
    "offices",
    "branch",
    "branches",
    "geofence",
    "clock in",
    "remote",
  ],
  "/settings/leave": [
    "holidays",
    "public holidays",
    "annual",
    "sick",
    "entitlement",
    "carry over",
    "accrual",
    "time off",
    "vacation",
    "balance",
  ],
  "/settings/payroll": [
    "pension",
    "nhf",
    "paye",
    "tax",
    "salary",
    "deductions",
    "payslip",
    "working days",
  ],
  "/settings/bank-accounts": ["bank", "salary account", "payout"],
  "/payroll/pay-setup": ["allowances", "deductions", "grades", "salary bands"],
  "/settings/roles": ["permissions", "roles", "admin", "approver", "who can"],
  "/people/departments": ["department", "teams", "org structure", "head"],
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

/** Billing sits in the Pay group. */
export const BILLING_MODULE = "Pay";

/** The first sentence, so a result carries a small description and not a paragraph. */
export function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

/**
 * The six groups the Settings page is laid out in (UAT 23 Nov, U43: HR-9,
 * NC-17). The hub used to be 19 unsorted cards whose names did not match the
 * pages they opened, with the main setup pages reachable only through a small
 * "Setting up" chip. Every page is now listed once, in one of these, under the
 * title the page itself carries.
 */
export const SETTINGS_GROUPS = [
  { id: "company", title: "Company" },
  { id: "people", title: "People" },
  { id: "time", title: "Time and leave" },
  { id: "pay", title: "Pay" },
  { id: "access", title: "Access" },
  { id: "system", title: "System" },
] as const;

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]["id"];

/**
 * A page listed only once it can be used (UAT 23 Nov, U52, HR-17). Until then
 * it says "not set up on this server" and nothing a customer does changes
 * that, so it is not offered at all.
 */
export type SettingsNeeds = "assistant" | "sms" | "integrations";

export type SettingsPage = {
  href: string;
  /** The page's own title, as its header and the browser tab say it. */
  title: string;
  description: string;
  group: SettingsGroupId;
  /** The setup checklist row this page answers, whose state is shown beside it. */
  row?: string;
  /** Hidden while the company has this switched off. */
  feature?: "departments" | "appraisals";
  needs?: SettingsNeeds;
};

/**
 * The settings pages, as data, so the screen and the global search read one
 * list. The screen adds the icons; the search adds nothing it should not show.
 */
export const SETTINGS_PAGES: readonly SettingsPage[] = [
  {
    href: "/settings/company",
    title: "Company profile",
    description:
      "Legal entities, RC numbers, registered addresses, tax states and the logo on every payslip.",
    group: "company",
    row: "company",
  },
  {
    href: "/settings/locations",
    title: "Work locations",
    description:
      "The offices, branches and sites people clock in at, and the area around each one.",
    group: "company",
    row: "locations",
  },
  {
    href: "/people/departments",
    title: "Departments and teams",
    description:
      "Your org structure: departments, the teams inside them, and who leads each one.",
    group: "company",
    feature: "departments",
  },
  {
    href: "/settings/features",
    title: "Turn on more features",
    description:
      "Switch modules on and off: loans, expenses, hiring, shifts, attendance. A module switched off leaves the menu, and its data is kept.",
    group: "company",
  },
  {
    href: "/settings/announcements",
    title: "Noticeboard",
    description:
      "Notices everybody sees on their dashboard. Publishing is what makes one visible; a draft appears nowhere.",
    group: "company",
  },
  {
    href: "/settings/policies",
    title: "Handbook",
    description:
      "Your company policies, the version in force, and who has accepted each one.",
    group: "company",
  },
  {
    href: "/settings/job-roles",
    title: "Job roles",
    description:
      "What jobs this company has, what each one involves, and what people on it are judged against.",
    group: "people",
  },
  {
    href: "/settings/required-details",
    title: "Required details",
    description:
      "Which personal details every member of staff must fill in on My profile, such as date of birth or next of kin, and who still has gaps.",
    group: "people",
  },
  {
    href: "/settings/queries",
    title: "Queries",
    description:
      "Whether queries are switched on, the usual time to reply, and whether the person who issued a query may decide it when nobody else can.",
    group: "people",
  },
  {
    href: "/settings/performance",
    title: "Appraisal scoring",
    description:
      "How much each part of an appraisal counts, what each mark is called, and whether forms end with an overall mark. Each part counts in proportion to the total, and the weights are frozen onto an appraisal period when it starts.",
    group: "people",
  },
  {
    href: "/settings/helpdesk",
    title: "Help desk",
    description:
      "What people can raise a request about, and how quickly you have promised to answer.",
    group: "people",
  },
  {
    href: "/settings/knowledge",
    title: "Help articles",
    description:
      "Write and publish help articles, and see the searches that found nothing.",
    group: "people",
  },
  {
    href: "/settings/leave",
    title: "Leave policies",
    description:
      "Leave types, entitlements, carry-over and the public holidays.",
    group: "time",
    row: "leave",
  },
  {
    href: "/settings/attendance",
    title: "Working hours",
    description:
      "The shift everybody's clock-in is measured against, the grace before it counts as late, and which weekdays are working days.",
    group: "time",
  },
  {
    href: "/settings/overtime",
    title: "Overtime policy",
    description:
      "Whether overtime is paid, from how many minutes, and the weekday, weekend and public-holiday rates.",
    group: "time",
  },
  {
    href: "/settings/devices",
    title: "Biometric terminals",
    description:
      "The clock-in machines on your walls, and which person each one's enrolment numbers mean.",
    group: "time",
  },
  {
    href: "/settings/payroll",
    title: "Payroll settings",
    description:
      "Working month, salary structure, statutory rates and the checks that stop payroll.",
    group: "pay",
    row: "pay",
  },
  {
    href: "/settings/bank-accounts",
    title: "Bank accounts",
    description:
      "The accounts salaries are paid out of. Exactly one is the salary account.",
    group: "pay",
  },
  {
    href: "/payroll/pay-setup",
    title: "Pay setup",
    description:
      "Allowances, deductions and salary grades, with what each one does to tax, pension and take-home pay.",
    group: "pay",
  },
  {
    href: "/settings/roles",
    title: "Access",
    description:
      "Who can see salaries, approve payroll, change settings or export staff data.",
    group: "access",
    row: "roles",
  },
  {
    href: "/settings/security",
    title: "Sign-in security",
    description:
      "Two-factor sign-in, and which actions need a code from email. Off until you turn it on.",
    group: "access",
  },
  {
    href: "/settings/audit",
    title: "Audit log",
    description: "Who changed what, and when.",
    group: "access",
  },
  {
    href: "/settings/notifications",
    title: "Notifications",
    description: "What triggers an email, and who receives approval reminders.",
    group: "system",
  },
  {
    href: "/settings/sms",
    title: "Text messages",
    description:
      "A weekly text of counts and a link, only for people who opt in.",
    group: "system",
    needs: "sms",
  },
  {
    href: "/settings/ai",
    title: "Assistant settings",
    description:
      "Suggested objectives, drafted progress notes and development areas, and what is sent to the assistant.",
    group: "system",
    needs: "assistant",
  },
  {
    href: "/settings/integrations",
    title: "Integrations",
    description: "Connect Jira so finished tickets reach the weekly task log.",
    group: "system",
    needs: "integrations",
  },
  {
    href: "/settings/appearance",
    title: "Appearance",
    description:
      "Light or dark, or match your device. Does not follow you to another one.",
    group: "system",
  },
];

/**
 * The group each page is in, shown first on a search result so a hit reads
 * "Time and leave, Overtime policy" and not a bare title. The header search
 * reads it too.
 */
export const PAGE_MODULE: Readonly<Record<string, string>> = Object.fromEntries(
  SETTINGS_PAGES.map((page) => [
    page.href,
    SETTINGS_GROUPS.find((group) => group.id === page.group)!.title,
  ]),
);
