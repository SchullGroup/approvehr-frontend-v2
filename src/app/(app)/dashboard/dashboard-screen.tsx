"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoadFailure, LoadState } from "@/components/ui";
import { NOTICE_LINK, NoticeLine } from "@/components/portal/notice-line";
import { PageBody } from "@/components/portal/shell";
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

  /* Widened so a row of stat tiles actually fills its row. See `tileSpans`. */
  const sections = dashboardSections(chosen, tier);

  return (
    <>
      <DashboardHeader />

      <PageBody>
        {/* What is still not set up, where somebody actually is. Absent once
            everything is done. */}
        <SetupPrompt />

        <div className="flex flex-col gap-4">
          {sections.map((section) => (
            <div key={section.key} className="flex flex-wrap gap-4">
              {section.widgets.map((widget) => {
                const Widget = WIDGET_COMPONENTS[widget.id];
                if (!Widget) return null;
                /* A widget with nothing to draw returns null and leaves its
                   wrapper empty, which `empty:hidden` takes out of the grid:
                   the others share the row instead of leaving a hole. */
                return (
                  <div
                    key={widget.id}
                    className="min-w-0 empty:hidden"
                    style={{ flex: `1 1 ${section.min}` }}
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
 * The column span each chosen widget gets, so a row of stat tiles fills its row.
 *
 * ## The gap this closes
 *
 * `SPAN_CLASS` gives a `quarter` widget three of twelve columns whatever else
 * is on the screen, and nothing in the product emits quarters in multiples of
 * four. An employee's standard arrangement is three of them — what is waiting
 * on you, your last payslip, your leave — so the row came to nine columns and
 * left a quarter of the screen blank beside it, every load, for every member
 * of staff. It read as a widget that had failed to render rather than as a row
 * that had finished.
 *
 * So a **run** of adjacent quarters divides its row: three become thirds, two
 * become halves, four stay quarters.
 *
 * ## Each run size gets its own ladder, so none of them orphans a tile
 *
 * The count has to divide the row at *every* width, not only the widest. A run
 * of three stepping 1 → 2 → 3 looks tidy at the ends and puts a lone tile
 * beside half a row of nothing everywhere in between, which is the same hole
 * this function exists to close, moved to the tablet. So a run of three never
 * goes through a two-column stage at all: it holds one column until there is
 * room for three. A run of four can pair, because four pairs evenly.
 *
 * | Run | phone | 640 | 768 | 1280 |
 * |---|---|---|---|---|
 * | 1 | full | full | full | quarter |
 * | 2 | full | half | half | half |
 * | 3 | full | full | third | third |
 * | 4 | full | half | half | quarter |
 *
 * Five or more is the one case that can still orphan, and it is left to: past
 * four tiles in a row the arrangement is the reader's own doing, and the
 * alternative is a fifth tile stretched across half the screen.
 *
 * ## Why a run and not the whole list
 *
 * Because the arrangement is the reader's. Somebody who puts a chart between
 * two stat tiles has separated them on purpose, and widening across the chart
 * would silently re-join them. A run is the set of tiles that are actually
 * going to share a row.
 *
 * ## What it deliberately does not try to do
 *
 * A widget with nothing to draw returns `null`, `empty:hidden` takes it out of
 * the grid, and the row closes up short — three thirds where one is quiet
 * leaves four columns over. Sizing for that is not possible here: whether a
 * widget has anything to say is a question only the widget can answer, and it
 * answers it during render. This sizes for what is *on* the dashboard, which
 * is the case that was wrong on every load rather than occasionally.
 *
 * Static class strings, never interpolated: Tailwind reads the source as text
 * and a computed `xl:col-span-${n}` compiles to no CSS at all.
 */
type Section = { key: string; min: string; widgets: WidgetSpec[] };

/**
 * The dashboard in the order it should be read: what needs you, then the key
 * figures, then the working panels, then charts, then the rest. Each row shares
 * wraps and grows to fill its width, so a missing card closes up, a short last
 * line widens its cards, and there is no slot left empty.
 */
export function dashboardSections(
  chosen: readonly WidgetSpec[],
  tier: RoleTier,
): Section[] {
  const leads = (widget: WidgetSpec) => widget.leadFor?.includes(tier) === true;
  const attention = chosen.filter(
    (widget) => widget.span === "full" && widget.group === "attention",
  );
  const lead = chosen.filter(
    (widget) =>
      widget.span === "full" && leads(widget) && !attention.includes(widget),
  );
  const figures = chosen.filter((widget) => widget.span === "quarter");
  const charts = chosen.filter(
    (widget) =>
      widget.span !== "quarter" &&
      widget.span !== "full" &&
      widget.group === "charts",
  );
  const panels = chosen.filter(
    (widget) =>
      widget.span !== "quarter" &&
      widget.span !== "full" &&
      widget.group !== "charts",
  );
  const rest = chosen.filter(
    (widget) =>
      widget.span === "full" &&
      !attention.includes(widget) &&
      !lead.includes(widget),
  );
  const rows: Section[] = [
    { key: "attention", min: "100%", widgets: attention },
    { key: "lead", min: "100%", widgets: lead },
    { key: "figures", min: "14rem", widgets: figures },
    { key: "panels", min: "24rem", widgets: panels },
    { key: "charts", min: "24rem", widgets: charts },
    { key: "rest", min: "100%", widgets: rest },
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
