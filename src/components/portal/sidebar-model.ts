import type { ReactNode } from "react";
import type { NavGroup, NavItem } from "./nav";

/**
 * The sidebar's shape, as data.
 *
 * `nav.tsx` answers *who may have which door*; `visibleNav` has already
 * answered it by the time anything here runs. This file answers a different
 * question: given the doors this person has, **what does the top level look
 * like, which rows open a level of their own, which level is the current page
 * in, and which doors match what somebody typed into Find?**
 *
 * It is a pure function of `visibleNav`'s output and the current path, with no
 * React and no hooks, which is what makes it testable without rendering the
 * shell — and what makes the one promise this rewrite has to keep checkable
 * by a script: **no person gains or loses a destination.** Every item that
 * goes in is reachable by drilling and by Find, and nothing comes out that did
 * not go in. See `tests/sidebar-parity.test.tsx`.
 *
 * ## What changed from the long list, and what did not
 *
 * The sidebar used to print every visible item under a heading for each
 * module: forty-odd rows for an HR manager, all at once. Now:
 *
 * - an unheaded group (Home, My approvals, Assistant, Projects) is a run of
 *   plain links at the top;
 * - a group with **one** visible item is a plain link too — a panelist's
 *   Recruitment is just "My interviews", with nothing to open;
 * - a group with **several** is one row that opens a level of its own.
 *
 * The gating is untouched. This file never looks at a permission, a feature, a
 * fact or a plan — those have all been applied, and the lock `visibleNav` sets
 * on a group's items is only *read* here.
 */

/** The level the sidebar is on. `"root"` is the top; anything else is a group id. */
export type SidebarLevel = string;
export const ROOT: SidebarLevel = "root";

export type SidebarSection = {
  /** `null` for the run of items that sits above the first heading. */
  label: string | null;
  items: NavItem[];
};

/** A row that is just a link: Home, or a group with one visible item. */
export type SidebarLink = {
  kind: "link";
  key: string;
  item: NavItem;
  groupId: string;
  /** The group the item belongs to, for Find's context line. `null` for Home et al. */
  groupLabel: string | null;
};

/** A row that opens a level. A button, never a link: it goes nowhere on its own. */
export type SidebarDrill = {
  kind: "drill";
  key: string;
  /** Doubles as the level name. */
  id: SidebarLevel;
  label: string;
  icon: ReactNode;
  /** Flat, in the model's own order. */
  items: NavItem[];
  /** The same items, filed under small headings where there are enough to need them. */
  sections: SidebarSection[];
  /** Every item in it is locked — a group only ever locks as a whole. */
  locked: boolean;
};

export type SidebarEntry = SidebarLink | SidebarDrill;

/** Top-level rows in blocks, a hairline between blocks: yours, the modules, the company's. */
export type SidebarTree = SidebarEntry[][];

/* -------------------------------------------------------------------------- */

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Small headings inside a level, keyed by `<group id>/<item label>`.
 *
 * Only the items named here start or join a section; anything else inherits
 * the heading of the item before it, so a screen somebody adds to the end of a
 * group lands in the last section rather than nowhere. Sections are collected
 * in order of first appearance, which can move an item up or down a few
 * places within its own level; the *set* of items in the level is never
 * changed.
 *
 * Labels only show where they help — a level of eight or more items that falls
 * into at least two sections. Four rows under four headings is furniture.
 */
const SECTION_OF: Record<string, string> = {
  "core-hr/Employees": "People",
  "core-hr/Departments": "People",
  "core-hr/Org chart": "People",
  "core-hr/Onboarding": "Lifecycle",
  "core-hr/Probation": "Lifecycle",
  "core-hr/Promotions": "Lifecycle",
  "core-hr/Exit management": "Lifecycle",
  "core-hr/Surveys": "Engagement",
  "core-hr/One-to-ones": "Engagement",
  "core-hr/Documents": "Records",
  "core-hr/Signatures": "Records",
  "core-hr/Equipment": "Records",
  "core-hr/Import": "Records",

  "payroll/Monthly payroll": "Run payroll",
  "payroll/Pay setup": "Run payroll",
  "payroll/Statutory filings": "Run payroll",
  "payroll/Payslips": "Pay and claims",
  "payroll/Loans": "Pay and claims",
  "payroll/Pay early": "Pay and claims",
  "payroll/Expenses": "Pay and claims",
  "payroll/Wallet": "Money",
  "payroll/Payment history": "Money",

  "hiring/Overview": "Pipeline",
  "hiring/New role": "Pipeline",
  "hiring/Job adverts": "Pipeline",
  "hiring/Applications": "Pipeline",
  "hiring/Talent pool": "Pipeline",
  "hiring/Interviews": "Interviews and offers",
  "hiring/My interviews": "Interviews and offers",
  "hiring/Offers": "Interviews and offers",
  "hiring/Hired": "Interviews and offers",
  "hiring/Hiring settings": "Setup",
};

/** Exposed so a test can hold every key to an item that exists. */
export const SECTION_KEYS = Object.keys(SECTION_OF);

const SECTION_MIN_ITEMS = 8;

function sectionsOf(
  groupId: string,
  items: readonly NavItem[],
): SidebarSection[] {
  const order: (string | null)[] = [];
  const filed = new Map<string | null, NavItem[]>();
  let current: string | null = null;
  for (const item of items) {
    const named = SECTION_OF[`${groupId}/${item.label}`];
    if (named !== undefined) current = named;
    if (!filed.has(current)) {
      filed.set(current, []);
      order.push(current);
    }
    filed.get(current)!.push(item);
  }
  const worthLabelling = items.length >= SECTION_MIN_ITEMS && order.length > 1;
  if (!worthLabelling) return [{ label: null, items: [...items] }];
  return order.map((label) => ({ label, items: filed.get(label)! }));
}

/**
 * The top level, from what `visibleNav` left.
 *
 * Zones are read off the model rather than named in it: no heading is Home's
 * own run; a `billingModule` is a module; a heading with neither is one of the
 * company's (Reports, Settings). A group that has nothing left never reaches
 * here — `visibleNav` already dropped it — and one that somehow does is
 * skipped rather than drawn as an empty row.
 */
export function buildSidebar(groups: readonly NavGroup[]): SidebarTree {
  const yours: SidebarEntry[] = [];
  const modules: SidebarEntry[] = [];
  const company: SidebarEntry[] = [];

  groups.forEach((group, index) => {
    if (group.items.length === 0) return;
    const heading = group.heading;
    const id = group.id ?? (heading ? slug(heading) : `g${index}`);

    if (heading === undefined) {
      for (const item of group.items) {
        yours.push({
          kind: "link",
          key: `link:${id}/${item.label}`,
          item,
          groupId: id,
          groupLabel: null,
        });
      }
      return;
    }

    const zone = group.billingModule !== undefined ? modules : company;
    const [only] = group.items;
    if (group.items.length === 1 && only) {
      zone.push({
        kind: "link",
        key: `link:${id}/${only.label}`,
        item: only,
        groupId: id,
        groupLabel: heading,
      });
      return;
    }

    zone.push({
      kind: "drill",
      key: `drill:${id}`,
      id,
      label: heading,
      icon: group.icon ?? null,
      items: [...group.items],
      sections: sectionsOf(id, group.items),
      locked: group.items.every((item) => item.locked === true),
    });
  });

  return [yours, modules, company].filter((block) => block.length > 0);
}

/** Every destination, once, with the group it lives in — the sidebar's whole reach. */
export function destinations(
  tree: SidebarTree,
): { item: NavItem; groupId: string; groupLabel: string | null }[] {
  const out: { item: NavItem; groupId: string; groupLabel: string | null }[] =
    [];
  for (const entry of tree.flat()) {
    if (entry.kind === "link") {
      out.push({
        item: entry.item,
        groupId: entry.groupId,
        groupLabel: entry.groupLabel,
      });
    } else {
      for (const item of entry.items) {
        out.push({ item, groupId: entry.id, groupLabel: entry.label });
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */

/**
 * The single nav item that matches the current path.
 *
 * A plain prefix test lights up every ancestor: on `/people/attendance` both
 * "Employees" (`/people`, a prefix) and "Attendance" (an exact match) were
 * highlighted, which makes the sidebar look broken and tells you nothing about
 * where you are.
 *
 * So the **longest** matching href wins, and only that one. `/people` still
 * highlights for `/people/p-01`, because a record page genuinely belongs to the
 * directory and has no nav item of its own — but the moment a more specific item
 * exists, it takes the highlight outright.
 *
 * Moved here from `shell.tsx` unchanged, so the level the sidebar opens at and
 * the row it lights are decided by the one rule.
 */
export function resolveActiveHref(
  groups: readonly NavGroup[],
  pathname: string,
): string | null {
  let best: string | null = null;
  let bestRank = -1;
  for (const group of groups) {
    for (const item of group.items) {
      /* An item that owns a wider area than its own door (`activePrefix`)
         matches on that, and ranks by it too, so `/hiring/settings/tags`
         (Hiring settings, 15 chars) beats Overview (`/hiring`, 7). A locked
         item never claims a path: its href is `/billing/pay` whatever it was. */
      const base =
        !item.locked && item.activePrefix ? item.activePrefix : item.href;
      const matches =
        pathname === item.href ||
        pathname === base ||
        /* `/dashboard` is the app root and must not claim every path under it. */
        (base !== "/dashboard" && pathname.startsWith(`${base}/`));
      if (!matches) continue;
      /* `best` stays the item's href (that is what rows compare against), so
         rank by the matched base in a parallel variable. */
      if (best === null || base.length > bestRank) {
        best = item.href;
        bestRank = base.length;
      }
    }
  }
  return best;
}

/**
 * Whether one row renders as the current page.
 *
 * **A locked item is never active.** `visibleNav` maps every surviving item in
 * a locked group to the identical href `/billing/pay`, so without the
 * `!item.locked` guard, standing on that page would light up every locked row
 * in every locked group at once — `item.href === activeHref` is true for all
 * of them simultaneously, because they are all the same string.
 */
export function isNavItemActive(
  item: Pick<NavItem, "href" | "locked">,
  activeHref: string | null,
): boolean {
  return item.href === activeHref && !item.locked;
}

export type Location = {
  /** The level that contains the current page: `ROOT` or a group id. */
  level: SidebarLevel;
  /** The top-level row it falls under, for the "you are here" mark. */
  entryKey: string | null;
  activeHref: string | null;
};

/**
 * Where the current route sits in the sidebar.
 *
 * A route that belongs to **no** nav item — the profile, the notifications
 * inbox, a screen only a notification points at — has no level, so it is the
 * top level with nothing lit. The same goes for `/billing/pay`, which every
 * locked item points at and none of them may claim.
 */
export function locate(
  tree: SidebarTree,
  groups: readonly NavGroup[],
  pathname: string,
): Location {
  const activeHref = resolveActiveHref(groups, pathname);
  for (const entry of tree.flat()) {
    if (entry.kind === "link") {
      if (isNavItemActive(entry.item, activeHref)) {
        return { level: ROOT, entryKey: entry.key, activeHref };
      }
    } else if (entry.items.some((item) => isNavItemActive(item, activeHref))) {
      return { level: entry.id, entryKey: entry.key, activeHref };
    }
  }
  return { level: ROOT, entryKey: null, activeHref: null };
}

/* -------------------------------------------------------------------------- */

/**
 * Other ways people say what a door is called.
 *
 * Keyed `<group id>/<item label>` for an item and `<group id>` for a whole
 * group. By label rather than by href because `visibleNav` rewrites an item's
 * href — to the reader's own page, or to `/billing/pay` when it is locked — and
 * the words people use for "Documents" do not change with where it goes.
 *
 * Group words are broad ("hire" finds all of Recruitment); item words are
 * specific ("payslip" finds Payslips first). Keep both short: a synonym that
 * matches too much teaches people that Find is noise.
 */
const KEYWORDS: Record<string, string[]> = {
  "core-hr": ["hr", "people", "staff", "records"],
  payroll: ["pay", "salary", "salaries", "wages", "money"],
  hiring: [
    "hire",
    "hiring",
    "recruit",
    "recruiting",
    "jobs",
    "vacancy",
    "vacancies",
    "candidates",
    "applicants",
    "ats",
  ],
  time: ["time off", "attendance", "clock", "hours", "absence", "holiday"],
  performance: ["appraisal", "review", "goals", "okr", "kpi", "ratings"],
  desk: ["help", "support", "helpdesk", "tickets", "faq"],
  reports: ["analytics", "export", "charts", "insights"],
  settings: ["configuration", "config", "preferences", "admin"],

  "home/Home": ["dashboard", "start", "overview", "today"],
  "home/My approvals": ["approve", "inbox", "pending", "requests", "to do"],
  "home/Assistant": ["ai", "ask", "chat", "copilot"],
  "home/Projects": ["tasks", "kanban", "board", "issues", "work"],

  "core-hr/Employees": ["staff", "people", "directory", "team", "workers"],
  "core-hr/Departments": ["teams", "units", "divisions", "org structure"],
  "core-hr/Org chart": [
    "organisation",
    "organization",
    "hierarchy",
    "reporting lines",
    "structure",
  ],
  "core-hr/Onboarding": ["new hire", "new starter", "joiner", "induction"],
  "core-hr/Probation": ["confirmation", "trial period", "confirm"],
  "core-hr/Surveys": [
    "feedback",
    "pulse",
    "questionnaire",
    "engagement",
    "poll",
  ],
  "core-hr/Promotions": ["promote", "raise", "transfer", "regrade", "career"],
  "core-hr/Exit management": [
    "offboarding",
    "resign",
    "resignation",
    "leaver",
    "leavers",
    "quit",
    "termination",
    "notice",
  ],
  "core-hr/Documents": ["files", "contracts", "letters", "paperwork", "upload"],
  "core-hr/Signatures": ["sign", "esign", "signing", "contract"],
  "core-hr/One-to-ones": ["1:1", "one on one", "meetings", "check-in"],
  "core-hr/Equipment": [
    "laptop",
    "assets",
    "devices",
    "phone",
    "repair",
    "fault",
  ],
  "core-hr/Import": [
    "upload",
    "csv",
    "bulk",
    "excel",
    "spreadsheet",
    "migrate",
  ],

  "payroll/Monthly payroll": ["run payroll", "salary", "wages", "pay run"],
  "payroll/Pay setup": [
    "allowances",
    "deductions",
    "grades",
    "benefits",
    "pay structure",
  ],
  "payroll/Payslips": ["payslip", "pay slip", "salary slip"],
  "payroll/Loans": ["borrow", "staff loan", "lending"],
  "payroll/Pay early": [
    "advance",
    "salary advance",
    "early pay",
    "earned wage",
  ],
  "payroll/Expenses": ["claims", "reimbursement", "receipts", "spend"],
  "payroll/Wallet": ["bank", "balance", "transfer", "payout", "funds"],
  "payroll/Payment history": ["transactions", "transfers", "payouts"],
  "payroll/Statutory filings": [
    "tax",
    "paye",
    "pension",
    "nhf",
    "nsitf",
    "itf",
    "remittance",
    "compliance",
  ],

  "hiring/Overview": ["recruitment"],
  "hiring/New role": ["vacancy", "requisition", "headcount", "new job"],
  "hiring/Job adverts": ["postings", "jobs", "careers", "advertise"],
  "hiring/Applications": ["applicants", "candidates", "cv", "resume"],
  "hiring/Talent pool": ["candidates", "shortlist", "bench"],
  "hiring/Interviews": ["schedule", "panel", "interviewing"],
  "hiring/My interviews": ["panel", "feedback", "scorecard"],
  "hiring/Offers": ["offer letter", "job offer"],
  "hiring/Hired": ["accepted offers", "new hires", "joined", "export"],
  "hiring/Hiring settings": ["pipelines", "stages", "careers page"],

  "time/Attendance": [
    "clock in",
    "clock out",
    "check in",
    "presence",
    "timesheet",
    "late",
    "absent",
  ],
  "time/Attendance history": ["past attendance", "calendar", "roster"],
  "time/Shifts": ["rota", "roster", "schedule", "swap"],
  "time/Leave": [
    "time off",
    "holiday",
    "holidays",
    "vacation",
    "pto",
    "annual leave",
    "sick",
    "day off",
  ],
  "time/Overtime": ["extra hours", "after hours"],

  "performance/Overview": ["performance", "appraisal"],
  "performance/KPIs": ["goals", "okrs", "targets", "objectives", "metrics"],
  "performance/Weekly tasks": ["review tasks", "to do", "weekly"],
  "performance/Competency ratings": ["skills", "competencies", "scores"],
  "performance/Appraisal periods": [
    "review cycle",
    "cycle",
    "appraisals",
    "annual review",
  ],
  "performance/Objectives to agree": ["approve objectives", "sign off"],
  "performance/Who appraises whom": ["appraisers", "reviewers", "360"],

  "desk/Help desk": ["tickets", "support", "request", "contact hr", "ask hr"],
  "desk/Help articles": ["faq", "knowledge base", "kb", "guides", "policies"],

  "reports/Reports": ["export", "charts", "analytics", "download", "headcount"],
  "reports/Explore": ["3d", "workforce", "clusters", "visual", "graph"],

  "settings/Settings": ["configuration", "company", "preferences", "features"],
  "settings/Roles": ["permissions", "access", "admins", "security"],
};

/** Exposed so a test can hold every key to a door that exists. */
export const KEYWORD_KEYS = Object.keys(KEYWORDS);

export type FindResult = {
  key: string;
  item: NavItem;
  groupId: string;
  groupLabel: string | null;
  /** The words matched, for highlighting the label. */
  tokens: string[];
};

const fold = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function tokensOf(query: string): string[] {
  return fold(query)
    .split(/[^a-z0-9:]+/)
    .filter(Boolean);
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Position of `token` at the start of the text or of one of its words, else -1. */
function wordStart(text: string, token: string): number {
  if (text.startsWith(token)) return 0;
  const at = text.search(new RegExp(`[^a-z0-9]${escapeRegExp(token)}`));
  return at === -1 ? -1 : at + 1;
}

/**
 * How well one typed word matches one door, 0 for not at all.
 *
 * From best to worst: the word starts the label, is a word in it, an exact
 * synonym of the door or of its group, starts a synonym, is somewhere in the
 * label, starts the group's name, is somewhere in a synonym. Synonyms of the
 * *group* score a little under the door's own, so "hire" puts Recruitment's
 * doors ahead of the one Core HR screen that happens to say "new hire".
 */
function scoreToken(
  token: string,
  label: string,
  group: string,
  itemWords: string[],
  groupWords: string[],
): number {
  let best = 0;
  if (label.startsWith(token)) best = 120;
  else if (wordStart(label, token) !== -1) best = 100;
  else if (label.includes(token)) best = 60;

  for (const word of itemWords) {
    if (word === token) best = Math.max(best, 70);
    else if (wordStart(word, token) !== -1) best = Math.max(best, 55);
    else if (word.includes(token)) best = Math.max(best, 30);
  }
  for (const word of groupWords) {
    if (word === token) best = Math.max(best, 65);
    else if (wordStart(word, token) !== -1) best = Math.max(best, 35);
    else if (word.includes(token)) best = Math.max(best, 20);
  }
  if (wordStart(group, token) !== -1) best = Math.max(best, 40);
  else if (group.includes(token)) best = Math.max(best, 25);
  return best;
}

/**
 * Find: every door whose label, group name or synonyms contain what was typed.
 *
 * Every word typed has to match somewhere on the door — label, the group it
 * lives in, or a synonym — and the order is how well: a label that starts
 * with the word first, a word inside the label next, a synonym or the group
 * after that. A whole phrase that is one of the door's own synonyms ("time
 * off") beats the same words matching in different places. Ties keep the
 * sidebar's own order.
 *
 * It searches `tree`, which is already what this person may have, so it can
 * never offer a door they could not open.
 */
export function findDestinations(
  tree: SidebarTree,
  query: string,
): FindResult[] {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return [];
  const phrase = tokens.join(" ");

  const scored: { result: FindResult; score: number; order: number }[] = [];
  destinations(tree).forEach(({ item, groupId, groupLabel }, order) => {
    const label = fold(item.label);
    const group = fold(groupLabel ?? "");
    const itemWords = (KEYWORDS[`${groupId}/${item.label}`] ?? []).map(fold);
    const groupWords = (KEYWORDS[groupId] ?? []).map(fold);

    let score = 0;
    for (const token of tokens) {
      const s = scoreToken(token, label, group, itemWords, groupWords);
      if (s === 0) return;
      score += s;
    }
    if (label === phrase) score += 200;
    else if (label.includes(phrase)) score += 50;
    if (itemWords.includes(phrase)) score += 150;
    else if (groupWords.includes(phrase)) score += 100;
    else if (itemWords.some((word) => word.includes(phrase))) score += 40;

    scored.push({
      result: {
        key: `${groupId}/${item.label}`,
        item,
        groupId,
        groupLabel,
        tokens,
      },
      score,
      order,
    });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.result);
}

/** A label cut into runs, the ones that matched what was typed marked. */
export function highlight(
  label: string,
  tokens: readonly string[],
): { text: string; hit: boolean }[] {
  if (tokens.length === 0) return [{ text: label, hit: false }];
  /* Matched on the folded text, which is the same length as the original for
     every character this product's labels use, so the same offsets cut both. */
  const folded = fold(label);
  const marks = new Array<boolean>(label.length).fill(false);
  for (const token of tokens) {
    let from = 0;
    while (from <= folded.length) {
      const at = folded.indexOf(token, from);
      if (at === -1) break;
      for (let i = at; i < at + token.length && i < marks.length; i++) {
        marks[i] = true;
      }
      from = at + token.length;
    }
  }
  const runs: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < label.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.hit === marks[i]) last.text += label[i];
    else runs.push({ text: label[i]!, hit: marks[i]! });
  }
  return runs;
}
