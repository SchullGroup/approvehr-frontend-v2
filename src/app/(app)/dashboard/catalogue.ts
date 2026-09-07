import type { PermissionKey } from "@/lib/permissions";
import type { FeatureKey } from "@/lib/api/setup";
import type { RoleTier } from "@/lib/roles";

/**
 * Everything that can go on a dashboard, and who starts with what.
 *
 * ## Why a catalogue exists at all
 *
 * The dashboard was a fixed sequence of blocks in one 687-line component, in an
 * order somebody chose once. That is defensible for a product with one kind of
 * user and this product deliberately has several: an owner opens it to find out
 * whether the company is on track, a payroll officer to find out whether this
 * month can go out, an employee to find out whether they have been paid. The
 * old screen answered the third question first — "Leave left" above the
 * headcount — for everybody including the owner, whose own leave balance is the
 * least interesting fact on their screen.
 *
 * So: every block is an entry here, the screen renders the entries somebody
 * keeps, and `customize-drawer.tsx` is where they choose. `PARITY.md` Rule 2 is
 * "a five-person business sees six nav items instead of thirty"; this is the
 * same argument applied inside the one screen everybody opens.
 *
 * ## Three gates, and they are not interchangeable
 *
 * | Gate | Question | Failure if you get it wrong |
 * |---|---|---|
 * | `permission` / `anyPermission` | may this person see it | a 403, or worse a figure they should not have |
 * | `feature` | did this company turn the module on | a card about shifts for a company with no shifts |
 * | data presence | did the API send the block | `₦0.00` where a figure does not belong |
 *
 * The first two are asked here, by `availableWidgets`. The **third is asked by
 * the widget itself**, and has to be: `/insights/dashboard` omits a block the
 * caller may not see, and a catalogue entry cannot know whether this month has
 * a payroll run. A widget with nothing to draw returns `null` and the grid
 * closes over it.
 *
 * ## `defaultFor` is a tier, not a permission
 *
 * Permissions decide what somebody *may* see; a tier is a guess at what they
 * *want* first, and a guess is the honest word for it — which is exactly why
 * the drawer exists. `roleTier` is already how the role badge decides its
 * treatment, and a company's own created role reads as `custom`, which starts
 * from the administrator's arrangement because a custom role was made to add
 * something rather than to take everything away.
 *
 * The one entry that turns on this and not on a permission is `my-leave`: the
 * owner is not shown their own leave balance to begin with, because it was the
 * first thing on their screen and the last thing they came for. It is one click
 * away in the drawer for the owner who wants it, and on by default for
 * everybody else — including an HR manager, who is also a member of staff with
 * days to book.
 */

/** Where a widget's figures come from. Decides which request the screen makes. */
export type WidgetSource =
  /** `/insights/dashboard`, the one request the screen has always made. */
  | "dashboard"
  /**
   * `/insights/reports` — a **second** request, made only when at least one
   * chart is on. That conditional is the whole reason this field exists: a
   * dashboard that always pulled the reports payload would double the cost of
   * the screen that has to load fastest, for charts most people will not keep.
   */
  | "reports"
  /** Reads its own store. Costs the dashboard nothing. */
  | "local";

/**
 * How wide, at the top breakpoint.
 *
 * A twelve-column grid, so thirds and quarters both divide it. Everything
 * collapses to full width on a phone — see `SPAN_CLASS`, and the responsive
 * entry in HANDOVER for why a grid item also needs `min-w-0`.
 */
export type WidgetSpan = "quarter" | "third" | "half" | "full";

/** The headings the drawer groups by. Ordered as the drawer shows them. */
export const WIDGET_GROUPS = [
  "attention",
  "people",
  "pay",
  "charts",
  "you",
  "tools",
] as const;

export type WidgetGroup = (typeof WIDGET_GROUPS)[number];

export const GROUP_LABELS: Readonly<Record<WidgetGroup, string>> = {
  attention: "Needs a decision",
  people: "Your people",
  pay: "Pay and money",
  charts: "Charts and trends",
  you: "About you",
  tools: "Tools and notices",
};

export type WidgetSpec = {
  id: string;
  title: string;
  /** One line in the drawer. What it shows, not what it is called. */
  blurb: string;
  group: WidgetGroup;
  span: WidgetSpan;
  source: WidgetSource;
  /** Held by this person. */
  permission?: PermissionKey;
  /** Any one of these. For a block the API gates on a pair. */
  anyPermission?: readonly PermissionKey[];
  /** Switched on by this company. */
  feature?: FeatureKey;
  /** Tiers that get it without opening the drawer. */
  defaultFor: readonly RoleTier[];
};

/* The two company-wide gates, spelled once. `/insights/dashboard` sends
   `headcount`, `approvals` and `today` to anybody holding either, and a widget
   drawn from those must ask the same question or it offers a card that will
   render nothing. */
const SEES_COMPANY: readonly PermissionKey[] = [
  "EDIT_RECORDS",
  "VIEW_SALARIES",
];

const EVERYONE: readonly RoleTier[] = ["owner", "admin", "custom", "staff"];
const RUNS_THE_COMPANY: readonly RoleTier[] = ["owner", "admin", "custom"];

export const WIDGETS: readonly WidgetSpec[] = [
  /* ------------------------------------------------------------- attention */
  {
    id: "needs-you",
    title: "Needs you",
    blurb:
      "Every held-up thing with the button that clears it: approvals waiting, records payroll would refuse, exits and starters part-done.",
    group: "attention",
    span: "full",
    source: "dashboard",
    anyPermission: SEES_COMPANY,
    defaultFor: RUNS_THE_COMPANY,
  },
  {
    id: "my-queue",
    title: "Waiting on you",
    blurb: "How many decisions are sitting in your own approval queue.",
    group: "attention",
    span: "quarter",
    source: "dashboard",
    defaultFor: EVERYONE,
  },

  /* ---------------------------------------------------------------- people */
  {
    id: "stat-headcount",
    title: "On the payroll",
    blurb: "How many people work here, and how many started this month.",
    group: "people",
    span: "quarter",
    source: "dashboard",
    anyPermission: SEES_COMPANY,
    defaultFor: RUNS_THE_COMPANY,
  },
  {
    id: "stat-approvals",
    title: "Waiting for a decision",
    blurb:
      "The whole company's approval backlog, and how long the oldest has waited.",
    group: "people",
    span: "quarter",
    source: "dashboard",
    anyPermission: SEES_COMPANY,
    defaultFor: RUNS_THE_COMPANY,
  },
  {
    id: "stat-records",
    title: "Records to finish",
    blurb:
      "People payroll would refuse to pay — no account number, or no pension PIN. The same test the run uses.",
    group: "people",
    span: "quarter",
    source: "dashboard",
    anyPermission: SEES_COMPANY,
    defaultFor: RUNS_THE_COMPANY,
  },
  {
    id: "stat-attendance",
    title: "Not accounted for today",
    blurb: "Who has not clocked in, against who is expected.",
    group: "people",
    span: "quarter",
    source: "dashboard",
    anyPermission: SEES_COMPANY,
    feature: "attendance",
    defaultFor: ["admin", "custom"],
  },
  {
    id: "who-is-in",
    title: "Who is in today",
    blurb: "Clocked in, late, on leave and unaccounted for, as one bar.",
    group: "people",
    span: "half",
    source: "dashboard",
    anyPermission: SEES_COMPANY,
    feature: "attendance",
    defaultFor: ["admin", "custom"],
  },

  /* ------------------------------------------------------------------- pay */
  {
    id: "payroll-month",
    title: "This month's payroll",
    blurb:
      "Net and gross for the current run, its status, and what is left to check.",
    group: "pay",
    span: "half",
    source: "dashboard",
    permission: "VIEW_SALARIES",
    defaultFor: RUNS_THE_COMPANY,
  },
  {
    id: "money-owed",
    title: "Money owed",
    blurb:
      "Committed and not yet paid out: staff loans, approved expenses, overtime awaiting approval.",
    group: "pay",
    span: "half",
    source: "dashboard",
    permission: "VIEW_SALARIES",
    defaultFor: ["owner"],
  },
  {
    id: "hiring",
    title: "Hiring",
    blurb:
      "Candidates in play, anyone stalled a week, interviews this week, offers out.",
    group: "pay",
    span: "half",
    source: "dashboard",
    permission: "MANAGE_HIRING",
    feature: "hiring",
    defaultFor: RUNS_THE_COMPANY,
  },

  /* ---------------------------------------------------------------- charts */
  {
    id: "chart-headcount-trend",
    title: "Headcount over time",
    blurb:
      "A month-by-month line, derived from real start and end dates — not a snapshot table, and nothing invented.",
    group: "charts",
    span: "half",
    source: "reports",
    anyPermission: SEES_COMPANY,
    defaultFor: ["owner"],
  },
  {
    id: "chart-joiners-leavers",
    title: "Joiners and leavers",
    blurb: "Who arrived and who left, month by month, over the same window.",
    group: "charts",
    span: "half",
    source: "reports",
    anyPermission: SEES_COMPANY,
    defaultFor: [],
  },
  {
    id: "stat-turnover",
    title: "Turnover",
    blurb: "Leavers against average headcount over the last twelve months.",
    group: "charts",
    span: "quarter",
    source: "reports",
    anyPermission: SEES_COMPANY,
    defaultFor: ["owner"],
  },
  {
    id: "stat-tenure",
    title: "Average tenure",
    blurb: "How long the people here now have been here, on average.",
    group: "charts",
    span: "quarter",
    source: "reports",
    anyPermission: SEES_COMPANY,
    defaultFor: ["owner"],
  },
  {
    id: "chart-headcount-by-department",
    title: "Headcount by department",
    blurb: "Where everybody sits, largest first.",
    group: "charts",
    span: "half",
    source: "reports",
    anyPermission: SEES_COMPANY,
    feature: "departments",
    defaultFor: [],
  },
  {
    id: "chart-employment-types",
    title: "Contract types",
    blurb:
      "Full time, part time, contract and the rest, as a share of the company.",
    group: "charts",
    span: "half",
    source: "reports",
    anyPermission: SEES_COMPANY,
    defaultFor: [],
  },
  {
    id: "chart-payroll-by-department",
    title: "Payroll cost by department",
    blurb:
      "What each department costs this month. Needs a payroll run to have happened.",
    group: "charts",
    span: "half",
    source: "reports",
    permission: "VIEW_SALARIES",
    feature: "departments",
    defaultFor: ["owner"],
  },
  {
    id: "chart-gross-breakdown",
    title: "What gross is made of",
    blurb:
      "Basic, housing, transport, allowances and employer pension, for this month's run.",
    group: "charts",
    span: "half",
    source: "reports",
    permission: "VIEW_SALARIES",
    defaultFor: [],
  },
  {
    id: "operational-load",
    title: "How much is in flight",
    blurb:
      "Leave requests, open tickets, pending approvals and attendance corrections, right now.",
    group: "charts",
    span: "half",
    source: "reports",
    anyPermission: SEES_COMPANY,
    defaultFor: [],
  },

  /* ------------------------------------------------------------------- you */
  {
    id: "my-pay",
    title: "Your last payslip",
    blurb: "What you took home, and whether the money has actually left.",
    group: "you",
    span: "quarter",
    source: "dashboard",
    defaultFor: EVERYONE,
  },
  {
    /* Off for the owner by default, and that is the whole of the difference —
       see the header. Every other tier keeps it: an HR manager is also somebody
       with days to book. */
    id: "my-leave",
    title: "Your leave left",
    blurb: "Days remaining against your entitlement, one line per leave type.",
    group: "you",
    span: "quarter",
    source: "dashboard",
    defaultFor: ["admin", "custom", "staff"],
  },
  {
    id: "my-clock",
    title: "Clock in and out",
    blurb: "Your own attendance for today, with the button that records it.",
    group: "you",
    span: "half",
    source: "local",
    feature: "attendance",
    defaultFor: ["staff"],
  },

  /* ----------------------------------------------------------------- tools */
  {
    id: "appraisals",
    title: "Appraisals",
    blurb:
      "Where the current period has got to — self-reviews in, manager reviews in, marks final, signed off — and the button that starts one.",
    group: "tools",
    span: "half",
    source: "local",
    feature: "appraisals",
    defaultFor: RUNS_THE_COMPANY,
  },
  {
    id: "assistant",
    title: "Ask about your company",
    blurb:
      "One question, answered from your own records. Nothing here changes anything.",
    group: "tools",
    span: "full",
    source: "local",
    defaultFor: EVERYONE,
  },
  {
    id: "quick-actions",
    title: "Things to start",
    blurb:
      "The handful of acts people begin from this screen, filtered to what you can do.",
    group: "tools",
    span: "full",
    source: "local",
    defaultFor: ["admin", "custom"],
  },
  {
    id: "noticeboard",
    title: "Noticeboard",
    blurb:
      "Company announcements you have not read. Draws nothing when there are none.",
    group: "tools",
    span: "full",
    source: "dashboard",
    defaultFor: EVERYONE,
  },
];

const BY_ID = new Map(WIDGETS.map((widget) => [widget.id, widget]));

export function widgetById(id: string): WidgetSpec | undefined {
  return BY_ID.get(id);
}

/** The Tailwind span at `xl`. Full width below it — a card at a quarter of a
 *  phone is unreadable, and `min-w-0` is what stops one item flooring the whole
 *  track (see the responsive entry in HANDOVER). */
export const SPAN_CLASS: Readonly<Record<WidgetSpan, string>> = {
  /* `col-span-12` is the **base**, and leaving it off is a real bug rather than
     a tidier default: a grid item with no span occupies one column, so on a
     phone every quarter-width widget rendered at a twelfth of the screen and
     the cards overlapped into an unreadable stack. Found by looking at it at
     375px, which is the width this product is mostly used at. */
  quarter: "min-w-0 col-span-12 sm:col-span-6 xl:col-span-3",
  third: "min-w-0 col-span-12 sm:col-span-6 xl:col-span-4",
  half: "min-w-0 col-span-12 xl:col-span-6",
  full: "min-w-0 col-span-12",
};

export type WidgetContext = {
  /** From `usePermissions`. */
  has: (permission: PermissionKey) => boolean;
  /** From `useFeatures`. `false` means switched off; anything else is on. */
  featureOff: (feature: FeatureKey) => boolean;
};

/**
 * Which widgets this person could have at all.
 *
 * The two gates a catalogue can answer. Data presence is the widget's own
 * question — see the header.
 */
export function availableWidgets(context: WidgetContext): WidgetSpec[] {
  return WIDGETS.filter((widget) => {
    if (widget.feature !== undefined && context.featureOff(widget.feature))
      return false;
    if (widget.permission !== undefined && !context.has(widget.permission))
      return false;
    if (widget.anyPermission && !widget.anyPermission.some(context.has))
      return false;
    return true;
  });
}

/**
 * The arrangement somebody gets before they have chosen one.
 *
 * In catalogue order, which is the order the groups are declared in — attention
 * first, then people, pay, charts, you, tools. That sequence is the argument:
 * what needs a decision, then the company, then the money, then the trends,
 * then you, then the furniture. The old screen opened with a leave balance.
 */
export function defaultLayout(
  tier: RoleTier,
  context: WidgetContext,
): string[] {
  return availableWidgets(context)
    .filter((widget) => widget.defaultFor.includes(tier))
    .map((widget) => widget.id);
}

/**
 * A stored arrangement, cleaned up against what exists and what is allowed.
 *
 * Three things happen here and each one has bitten a dashboard somewhere:
 *
 * - **An id nobody recognises is dropped.** A widget retired in a release
 *   leaves a dead id in every row that had it, and the API deliberately does
 *   not validate the vocabulary — see the note on `DashboardLayout`.
 * - **A widget they may no longer see is dropped**, without rewriting their
 *   row. Somebody whose `VIEW_SALARIES` was taken away this morning must not
 *   be shown the payroll card, and must get it back if the permission returns.
 *   Filtering on read rather than saving over it is what makes that reversible.
 * - **A duplicate is dropped.** The API refuses one, so this is belt and
 *   braces — but a widget rendered twice is a bug with no error attached.
 */
export function resolveLayout(
  stored: readonly string[],
  context: WidgetContext,
): WidgetSpec[] {
  const allowed = new Set(availableWidgets(context).map((widget) => widget.id));
  const seen = new Set<string>();
  const out: WidgetSpec[] = [];
  for (const id of stored) {
    if (seen.has(id) || !allowed.has(id)) continue;
    const widget = widgetById(id);
    if (!widget) continue;
    seen.add(id);
    out.push(widget);
  }
  return out;
}
