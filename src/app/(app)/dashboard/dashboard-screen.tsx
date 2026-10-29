"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoadFailure, LoadState } from "@/components/ui";
import { NOTICE_LINK, NoticeLine } from "@/components/portal/notice-line";
import { PageBody } from "@/components/portal/shell";
import { cn } from "@/lib/cn";
import {
  COLLABORATOR_HOME,
  useIsCollaborator,
} from "@/lib/hiring/access/collaborator";
import { useCan, usePermissions } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { useSessionRoles, roleTier, type RoleTier } from "@/lib/roles";
import { useDashboard, useReports } from "@/lib/store/insights";
import { useSetupChecklist } from "@/lib/store/setup-checklist";
import { checklistRows } from "../settings/checklist";
import { CompleteDetailsPrompt } from "./complete-details";
import { SetupGuide } from "./setup-guide";
import { DashboardHeader } from "./header";
import { WIDGET_COMPONENTS } from "./widgets";
import {
  defaultLayout,
  resolveLayout,
  type WidgetContext,
  type WidgetSpec,
} from "./catalogue";

/**
 * The screen people open first, and now the one they arrange.
 *
 * ## What this used to be
 *
 * 687 lines: two hard-coded sequences of blocks — one for somebody with company
 * permissions, one for somebody without — in an order chosen once. That is a
 * defensible design for a product with one kind of user, and this product
 * deliberately has several. The owner's screen opened with **their own leave
 * balance**, above the headcount, above the payroll, above what needed a
 * decision; and starting an appraisal period was a button in the page header,
 * telling nobody whether a period was running.
 *
 * It is a catalogue and a layout now. `catalogue.ts` says what exists and who
 * starts with what, `widgets.tsx` draws each one, `customize-drawer.tsx` is
 * where somebody changes it, and this file composes. The `CompanyOverview` /
 * `EmployeeOverview` split is gone — not because the distinction was wrong but
 * because it was the wrong mechanism: it is two permissions, and permissions
 * are already a gate every widget declares.
 *
 * ## Three requests at most, and usually one
 *
 * `/insights/dashboard` composes the company's figures server-side, as it
 * always has. `/insights/dashboard/layout` is one small read for the
 * arrangement. `/insights/reports` is fetched **only when a chart widget is
 * on** — `needsReports` below is that condition, and it is why `useReports`
 * grew an `enabled` argument rather than the dashboard pulling a payload most
 * people will not look at.
 *
 * ## Loading is one gate, deliberately
 *
 * The layout and the data are awaited together. Rendering the default
 * arrangement while the stored one is in flight would mean everybody's
 * dashboard visibly rearranges itself half a second after it appears, on every
 * single load — which is worse than a moment of spinner, and is the kind of
 * flicker somebody reports as a bug rather than as a preference.
 *
 * ## Absent widgets close the grid
 *
 * Every component returns `null` when it has nothing to draw — no payroll run
 * this month, no leave configured, an empty noticeboard. A `null` in a grid
 * leaves no hole, so a dashboard of eight widgets where three have nothing to
 * say reads as a dashboard of five rather than as a broken one. The
 * consequence worth knowing: **a widget can be on and invisible**, which is
 * why the drawer lists what is on rather than making somebody infer it from
 * the screen.
 */
export function DashboardScreen() {
  const { data, loading, error, reload } = useDashboard();
  const { permissions, loading: permissionsLoading } = usePermissions();
  const features = useFeatures();
  const roles = useSessionRoles();
  const router = useRouter();

  /* Somebody invited to help hire has no day to look at: their one room is My
     interviews. Sent there, and shown nothing of the company's figures meanwhile. */
  const collaborator = useIsCollaborator();
  useEffect(() => {
    if (collaborator) router.replace(COLLABORATOR_HOME);
  }, [collaborator, router]);

  /**
   * The two gates a catalogue can answer.
   *
   * Memoised on the permission set and the flags rather than rebuilt every
   * render: `availableWidgets` runs over the whole catalogue and the drawer
   * calls it too, and a fresh context object each render would make every
   * `useMemo` downstream of it recompute. Same reasoning as `usePayrollSettings`
   * memoising `rowToSettings`.
   */
  const context: WidgetContext = useMemo(
    () => ({
      has: (permission) => permissions.has(permission),
      /* `features[key] === false` is the test, not falsiness: the store starts
         every flag as `undefined` while it loads, and reading that as "off"
         would hide half the dashboard for the first moment of every load. */
      featureOff: (feature) => features[feature] === false,
    }),
    [permissions, features],
  );

  const tier: RoleTier = roles.primary ? roleTier(roles.primary.name) : "staff";

  /**
   * The arrangement, resolved.
   *
   * `null` from the store is "never chosen", and that is when the catalogue's
   * defaults answer. A stored list is filtered against what exists and what
   * this person may see — see `resolveLayout` for the three things it drops and
   * why it drops rather than rewrites.
   */
  /* One arrangement for everybody of a kind. It used to be customisable, and a
     customised board left gaps and an order nobody could predict; a fixed one
     can be arranged properly. */
  const chosen = useMemo(
    () => resolveLayout(defaultLayout(tier, context), context),
    [tier, context],
  );

  /* Only ask for the reports payload if something is going to draw it. */
  const needsReports = chosen.some((widget) => widget.source === "reports");
  const reports = useReports(undefined, needsReports);

  /* One gate. See the header for why the layout is awaited with the data. */
  if (collaborator || loading || permissionsLoading || roles.loading) {
    return (
      <>
        <DashboardHeader />
        <PageBody>
          <LoadState loading error={null} subject="your day" skeleton="page">
            {null}
          </LoadState>
        </PageBody>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <DashboardHeader />
        <PageBody>
          <LoadFailure
            subject="your dashboard"
            error={error ?? new Error("no data")}
            onRetry={reload}
          />
        </PageBody>
      </>
    );
  }

  const props = {
    dashboard: data,
    reports: reports.data,
    reportsLoading: needsReports && reports.loading,
  };

  const sections = dashboardSections(chosen, tier);
  const headerWidgets = chosen.filter((widget) => widget.slot === "header");

  return (
    <>
      <DashboardHeader
        action={
          headerWidgets.length > 0 ? (
            <>
              {headerWidgets.map((widget) => {
                const Widget = WIDGET_COMPONENTS[widget.id];
                return Widget ? <Widget key={widget.id} {...props} /> : null;
              })}
            </>
          ) : undefined
        }
      />

      <PageBody>
        {/* What is still not set up, where somebody actually is. Absent once
            everything is done. */}
        <SetupPrompt />
        <CompleteDetailsPrompt />

        <div className="flex flex-col gap-4">
          {sections.map((section) => (
            <div key={section.key} className={SECTION_CLASS[section.key]}>
              {section.widgets.map((widget) => {
                const Widget = WIDGET_COMPONENTS[widget.id];
                if (!Widget) return null;
                /* A widget with nothing to draw returns null and leaves its
                   wrapper empty, which `empty:hidden` takes out of the row:
                   the others share it instead of leaving a hole. The wrapper is
                   a grid so whatever it holds fills the cell, in both
                   directions, and a row of cards is a row of equal heights. */
                return (
                  <div
                    key={widget.id}
                    className={cn(CELL_CLASS[section.key], "empty:hidden")}
                  >
                    <Widget {...props} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </PageBody>
    </>
  );
}

/**
 * The dashboard in the order it is read, as five kinds of row.
 *
 * ```
 * page header ........ greeting, date, and the Start-something menu
 * lead ............... the one thing a tier opens the page to do (staff: clock in)
 * metrics ............ ONE row of figure cards, four at most
 * banner ............. one sentence worth knowing, full width
 * cards .............. a two-column grid of cards, equal height within a row
 * foot ............... full-width and quiet: the assistant, the noticeboard
 * ```
 *
 * ## What the old arrangement did, and why this is a different shape
 *
 * Six kinds of row, each with its own width rule, in an order that grew by
 * accretion: a stat row that orphaned a tile when its count was not a divisor of
 * twelve, a masonry of halves with dead space beside whichever card was
 * shortest, "Start something" as eight tiles, and "7 requests waiting" said in
 * Needs you and again as a stat two inches below it. 4,541px on a phone.
 *
 * **Metrics are one row and at most four.** Four is what fits a row at the
 * widest and two-by-two on a phone, and a fifth tile is where the orphan came
 * from. A tile beyond the fourth is not dropped — it joins the cards, where a
 * tile is a perfectly good card — because dropping a figure silently is worse
 * than a row that is a little uneven.
 *
 * **Cards are two across, and equal in height within a row.** A row that has one
 * card left over is not a half and a hole: the leftover takes the whole row, so
 * there is never an empty column. That is `flex-wrap` with a grow, not a grid —
 * a grid cannot know that the card in its second column drew nothing.
 *
 * **Today leads the cards, after Needs you.** Needs you is the company's
 * held-up work; Today is this person's. Beside each other they are the two
 * questions somebody opens the page with, and where only one has an answer it
 * takes the row.
 *
 * The widths are static class strings, never interpolated: Tailwind reads the
 * source as text and a computed class compiles to no CSS at all.
 */
export type SectionKey = "lead" | "metrics" | "banner" | "cards" | "foot";
export type Section = { key: SectionKey; widgets: WidgetSpec[] };

/** Four across at the widest, two-by-two on a phone, and a lone last one fills its row. */
export const MAX_METRICS = 4;

const SECTION_CLASS: Readonly<Record<SectionKey, string>> = {
  lead: "flex flex-col gap-4",
  metrics: "flex flex-wrap gap-3 sm:gap-4",
  banner: "flex flex-col gap-4",
  cards: "flex flex-wrap gap-4",
  foot: "flex flex-col gap-4",
};

const CELL_CLASS: Readonly<Record<SectionKey, string>> = {
  lead: "grid min-w-0",
  /* 9.5rem is what two tiles need on a 390px phone. Grow, so three tiles in a
     row of four are three wider tiles and not three tiles and a gap. */
  metrics: "grid min-w-0 grow basis-[9.5rem]",
  banner: "grid min-w-0",
  /* One column below `xl`; two from there. A hair under half, so two cells plus
     the gap never add up to more than the row and wrap by a rounding error. */
  cards: "grid min-w-0 grow basis-full xl:basis-[calc(50%-0.55rem)]",
  foot: "grid min-w-0",
};

export function dashboardSections(
  chosen: readonly WidgetSpec[],
  tier: RoleTier,
): Section[] {
  const placed = chosen.filter((widget) => widget.slot !== "header");
  const leads = (widget: WidgetSpec) => widget.leadFor?.includes(tier) === true;

  const lead = placed.filter(
    (widget) =>
      widget.span === "full" && widget.slot === undefined && leads(widget),
  );
  const banner = placed.filter((widget) => widget.slot === "banner");
  const foot = placed.filter((widget) => widget.slot === "foot");
  const figures = placed.filter((widget) => widget.span === "quarter");
  const metrics = figures.slice(0, MAX_METRICS);
  const cards = placed.filter(
    (widget) =>
      !lead.includes(widget) &&
      !banner.includes(widget) &&
      !foot.includes(widget) &&
      !metrics.includes(widget),
  );

  const rows: Section[] = [
    { key: "lead", widgets: lead },
    { key: "metrics", widgets: metrics },
    { key: "banner", widgets: banner },
    { key: "cards", widgets: cards },
    { key: "foot", widgets: foot },
  ];
  return rows.filter((row) => row.widgets.length > 0);
}

/**
 * What is still outstanding in setting the company up.
 *
 * Renders nothing when the checklist is complete, when it has not answered
 * yet, or for somebody who could not act on it anyway — a prompt to finish
 * setting up the company shown to an employee who cannot open Settings is a
 * dead end with a link on it.
 *
 * The count and the wording come from the same `checklistRows` the settings
 * hub renders, so the dashboard cannot say "3 things left" while the hub says
 * four.
 */
function SetupPrompt() {
  const canManage = useCan("MANAGE_SETTINGS");
  const { facts, loading } = useSetupChecklist();
  /* Held here rather than inside the guide, because this callout owns the
     button that reopens it and the guide owns the once-per-browser offer. Two
     components, one piece of open/closed state, and it lives with the one that
     renders on every load. */
  const [guiding, setGuiding] = useState(false);

  /* Mounted before the permission and completeness checks below, because the
     guide answers both for itself — and because a hook cannot be skipped. It
     renders nothing when there is nothing to walk through. */
  const guide = (
    <SetupGuide
      open={guiding}
      onOpen={() => setGuiding(true)}
      onClose={() => setGuiding(false)}
    />
  );

  if (!canManage || loading || !facts) return guide;

  /* `optional` and `unknown` are left out of the denominator for the reason
     the checklist's own header gives: a row that cannot be incomplete would
     make the count a number that never falls to zero, and a count that never
     completes stops being read. */
  const rows = checklistRows(facts).filter(
    (row) => row.status !== "optional" && row.status !== "unknown",
  );
  const outstanding = rows.filter((row) => row.status !== "done");
  if (outstanding.length === 0) return guide;

  const first = outstanding[0]!;
  return (
    <>
      <NoticeLine tone="accent" className="mb-4">
        {/* Names the next one rather than only counting. A number alone is a
            nag; a number and the next step is a thing somebody can finish. */}
        <span>
          {outstanding.length} of {rows.length} still to set up. Next:{" "}
          {first.title.toLowerCase()}.
        </span>
        <Link href={first.href} className={NOTICE_LINK}>
          {first.linkLabel}
        </Link>
        {/* The way back to the walk. The guide offers itself once per browser;
            without this, somebody who dismissed it — or who arrived after a
            colleague dismissed it on a shared machine — has no way to ask for
            it again. */}
        <button
          type="button"
          className={NOTICE_LINK}
          onClick={() => setGuiding(true)}
        >
          Walk me through it
        </button>
      </NoticeLine>
      {guide}
    </>
  );
}
