"use client";

import { useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { Button, Callout, Card, CardBody, Spinner } from "@/components/ui";
import { PageBody } from "@/components/portal/shell";
import { usePermissions } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { useSessionRoles, roleTier, type RoleTier } from "@/lib/roles";
import { useDashboard, useReports } from "@/lib/store/insights";
import { useDashboardLayout } from "@/lib/store/dashboard-layout";
import { DashboardHeader } from "./header";
import { CustomizeDrawer } from "./customize-drawer";
import { WIDGET_COMPONENTS } from "./widgets";
import {
  SPAN_CLASS,
  defaultLayout,
  resolveLayout,
  type WidgetContext,
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
  const layout = useDashboardLayout();
  const { permissions, loading: permissionsLoading } = usePermissions();
  const features = useFeatures();
  const roles = useSessionRoles();

  const [customizing, setCustomizing] = useState(false);

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
  const chosen = useMemo(() => {
    if (layout.widgets === null)
      return resolveLayout(defaultLayout(tier, context), context);
    return resolveLayout(layout.widgets, context);
  }, [layout.widgets, tier, context]);

  /* Only ask for the reports payload if something is going to draw it. */
  const needsReports = chosen.some((widget) => widget.source === "reports");
  const reports = useReports(undefined, needsReports);

  /* One gate. See the header for why the layout is awaited with the data. */
  if (loading || layout.loading || permissionsLoading || roles.loading) {
    return (
      <>
        <DashboardHeader />
        <PageBody>
          <div className="flex items-center gap-3 py-16">
            <Spinner />
            <span className="text-body-sm text-muted">Loading your day…</span>
          </div>
        </PageBody>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <DashboardHeader />
        <PageBody>
          <Card>
            <CardBody className="flex flex-col items-start gap-3">
              <p className="text-body">
                {error ?? "Your dashboard did not load. Try again in a moment."}
              </p>
              <button
                type="button"
                onClick={reload}
                className="text-body-sm font-medium text-accent-text underline"
              >
                Try again
              </button>
            </CardBody>
          </Card>
        </PageBody>
      </>
    );
  }

  const props = {
    dashboard: data,
    reports: reports.data,
    reportsLoading: needsReports && reports.loading,
  };

  return (
    <>
      <DashboardHeader
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setCustomizing(true)}
          >
            <LayoutGrid aria-hidden="true" className="size-3.5" />
            Customise
          </Button>
        }
      />

      <PageBody>
        {/* The arrangement failed to load and the standard one is showing. Said
            once, here, rather than left for somebody to notice their dashboard
            has reverted. */}
        {layout.error && !customizing && (
          <Callout tone="warning" className="mb-4">
            {layout.error}
          </Callout>
        )}

        {chosen.length === 0 ? (
          <Card>
            <CardBody className="flex flex-col items-start gap-3">
              <p className="text-body">There is nothing on your dashboard.</p>
              <p className="text-body-sm text-muted">
                That is a real choice and it stays until you change it — nothing
                has gone wrong.
              </p>
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={() => setCustomizing(true)}
              >
                <LayoutGrid aria-hidden="true" className="size-3.5" />
                Choose what to show
              </Button>
            </CardBody>
          </Card>
        ) : (
          /* Twelve columns, so thirds and quarters both divide it. Every widget
             is full width below `sm` — a stat at a quarter of a phone is
             unreadable — and each carries `min-w-0` from `SPAN_CLASS`, without
             which one item that cannot compress floors the whole track. See the
             responsive entry in HANDOVER. */
          <div className="grid grid-cols-12 gap-4">
            {chosen.map((widget) => {
              const Widget = WIDGET_COMPONENTS[widget.id];
              if (!Widget) return null;
              return (
                <div key={widget.id} className={SPAN_CLASS[widget.span]}>
                  <Widget {...props} />
                </div>
              );
            })}
          </div>
        )}
      </PageBody>

      <CustomizeDrawer
        open={customizing}
        onClose={() => setCustomizing(false)}
        chosen={chosen}
        context={context}
        connected={layout.connected}
        saving={layout.saving}
        error={layout.error}
        onChange={(ids) => void layout.save(ids)}
        onReset={() => void layout.reset()}
      />
    </>
  );
}
