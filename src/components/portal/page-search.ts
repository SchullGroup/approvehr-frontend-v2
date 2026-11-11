import { PAGE_INDEX } from "@/lib/page-index.generated";
import {
  PAGE_MODULE,
  PAGE_WORDS,
  firstSentence,
  matches,
  termsOf,
} from "@/app/(app)/settings/filter";
import type { NavGroup } from "./nav";
import { buildSidebar, destinations, findDestinations } from "./sidebar-model";

/**
 * The pages the header search can offer one person, and in what order.
 *
 * ## Two sources, one permission rule
 *
 * 1. **The sidebar's own doors**, found the way the sidebar's Find box finds
 *    them (`findDestinations`: label, group, synonyms, ranked). Those are
 *    already exactly what this person may have.
 * 2. **Every other page** in `PAGE_INDEX`, which is generated from each page's
 *    own metadata. The sidebar links only about half of the product's pages;
 *    the rest (leave policies, the hiring settings, one page of a module) were
 *    unreachable by search, which is what this exists to fix.
 *
 * A page that is not a sidebar door has no permission of its own to read, so
 * it borrows its **owner's**: the longest sidebar address that is a path prefix
 * of it, taken from the *whole* menu and not only the visible one. It is
 * offered only if that owner is in the visible menu. The longest match matters:
 * `/people/leave` is its own door, so somebody who may not see it is not
 * handed it through `/people`, which they may. A page nothing owns is offered
 * only if it is in `PERSONAL` (the account pages everyone has).
 *
 * This is a statement about what to *show in a list*. Every page still
 * enforces its own access when opened; a mistake here costs a title, not data.
 */

/** Pages that belong to the person, not to a module, so they have no owner. */
const PERSONAL = new Set([
  "/profile",
  "/documents",
  "/equipment",
  "/notifications",
]);

/**
 * Other words people type for a page that is not a sidebar door. Kept to what
 * the page actually holds, as `PAGE_WORDS` is: a word that sends somebody to a
 * screen without the thing is worse than no word.
 */
const INDEX_WORDS: Readonly<Record<string, readonly string[]>> = {
  "/settings/leave": [
    "leave types",
    "types",
    "annual",
    "sick",
    "carry over",
    "accrual",
    "entitlement",
    "time off",
    "vacation",
    "unpaid",
  ],
  "/settings/leave/holidays": ["public holidays", "calendar", "gazetted"],
  "/performance/kpis": ["objectives", "goals", "okr", "targets", "measures"],
  "/performance/periods": ["appraisal", "review cycle", "cycle", "half year"],
  "/performance/skills": ["competencies", "levels", "ratings", "gaps"],
  "/performance/appraisers": ["mapping", "who appraises", "manager"],
  "/performance/work-record": ["tasks", "projects", "evidence", "delivery"],
  "/performance/review-tasks": ["weekly tasks", "task grading", "grade"],
  "/people/leave": ["time off", "vacation", "holiday", "absence", "book"],
  "/people/probation": ["confirmation", "confirm", "new starter"],
  "/people/changes": ["promotion", "transfer", "grade change", "pay change"],
  "/payroll/loans": ["repayment", "staff loan", "borrow"],
  "/payroll/advances": ["salary advance"],
};

export type PageHit = {
  key: string;
  href: string;
  label: string;
  /** The module first, then a short description. */
  sublabel: string;
  /** True when the sidebar itself has this door. */
  inSidebar: boolean;
};

const hrefsOf = (groups: readonly NavGroup[]): string[] =>
  groups.flatMap((group) => group.items.map((item) => item.href));

/** The longest address in `known` that is `href` or a path prefix of it. */
function ownerOf(href: string, known: readonly string[]): string | null {
  const path = href.split("?")[0] ?? href;
  let best: string | null = null;
  for (const candidate of known) {
    const base = candidate.split("?")[0] ?? candidate;
    if (path === base || path.startsWith(`${base}/`)) {
      if (best === null || base.length > best.length) best = base;
    }
  }
  return best;
}

const MAX_HITS = 12;

export function searchPages(
  visible: readonly NavGroup[],
  everything: readonly NavGroup[],
  query: string,
): PageHit[] {
  const terms = termsOf(query);
  if (terms.length === 0) return [];

  const tree = buildSidebar(visible);
  const doors = destinations(tree);
  const moduleOf = new Map<string, string>();
  for (const { item, groupLabel } of doors) {
    moduleOf.set(
      item.href.split("?")[0] ?? item.href,
      groupLabel ?? item.label,
    );
  }

  const hits: PageHit[] = findDestinations(tree, query).map(
    ({ item, groupLabel }) => ({
      key: `page-${item.href}`,
      href: item.href,
      label: item.label,
      sublabel: groupLabel ?? "Page",
      inSidebar: true,
    }),
  );
  const seen = new Set(hits.map((hit) => hit.href.split("?")[0]));

  const visibleHrefs = new Set(hrefsOf(visible).map((h) => h.split("?")[0]));
  const known = [...new Set([...hrefsOf(everything), ...hrefsOf(visible)])];

  const scored: { hit: PageHit; score: number; order: number }[] = [];
  PAGE_INDEX.forEach((page, order) => {
    if (seen.has(page.href)) return;
    const owner = ownerOf(page.href, known);
    const allowed = owner ? visibleHrefs.has(owner) : PERSONAL.has(page.href);
    if (!allowed) return;

    const moduleName =
      PAGE_MODULE[page.href] ??
      (owner ? moduleOf.get(owner) : undefined) ??
      "Page";
    const entry = {
      title: page.title,
      description: page.description,
      words: [
        moduleName,
        ...(PAGE_WORDS[page.href] ?? []),
        ...(INDEX_WORDS[page.href] ?? []),
      ],
    };
    if (!matches(terms, entry)) return;

    const title = page.title.toLowerCase();
    let score = 0;
    for (const term of terms) {
      score += title.startsWith(term)
        ? 120
        : new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(
              title,
            )
          ? 100
          : 50;
    }
    scored.push({
      hit: {
        key: `page-${page.href}`,
        href: page.href,
        label: page.title,
        sublabel: page.description
          ? `${moduleName}: ${firstSentence(page.description)}`
          : moduleName,
        inSidebar: false,
      },
      score,
      order,
    });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  for (const { hit } of scored) hits.push(hit);
  return hits.slice(0, MAX_HITS);
}
