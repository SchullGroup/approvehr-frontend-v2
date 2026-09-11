"use client";

import { useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  Spinner,
} from "@/components/ui";
import { PageBody } from "@/components/portal/shell";
import { useCan, usePermissions } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { useSessionRoles, roleTier, type RoleTier } from "@/lib/roles";
import { useDashboard, useReports } from "@/lib/store/insights";
import { useDashboardLayout } from "@/lib/store/dashboard-layout";
import { useSetupChecklist } from "@/lib/store/setup-checklist";
import { cn } from "@/lib/cn";
import { checklistRows } from "../settings/checklist";
import { SetupGuide } from "./setup-guide";
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
        {/* What is still not set up, where somebody actually is.
        
            The feedback asks for the post-signup "Complete Setup" prompt to
            appear on the dashboard too, and it is right about why: the wizard's
            own CTA is on a screen nobody returns to, so a company that stopped
            halfway had nothing telling them. `useSetupChecklist` is the same
            read `/settings` answers from, so the two cannot disagree about
            what is outstanding.
        
            Absent once everything is done, rather than a green "all set" card
            that lives on the dashboard for ever. */}
        <SetupPrompt />

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
                <div
                  key={widget.id}
                  /* `empty:hidden` is what makes the paragraph above true.
                     ------------------------------------------------------
                     Every widget returns `null` when it has nothing to draw,
                     and the header has always claimed that leaves no hole —
                     but this wrapper was emitted either way, so a quiet widget
                     kept its columns and the grid held a gap where it used to
                     be. On an owner's standard dashboard that was two gaps:
                     `my-queue` holding the first quarter of the stat row while
                     drawing nothing, and `chart-headcount-trend` holding half a
                     row, which left Hiring stranded beside white space.

                     A `null` child leaves the div with no child nodes at all,
                     so `:empty` matches it and `display: none` takes it out of
                     the grid — the row closes up and the next widget moves
                     into the slot. It cannot false-positive on a widget that
                     drew something, because anything rendered is a child node.

                     Applied here rather than inside each widget so the rule
                     holds for all of them, including the next one somebody
                     adds. */
                  className={cn(SPAN_CLASS[widget.span], "empty:hidden")}
                >
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
      <Callout tone="info" className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-body-sm">
            <span className="font-medium">
              {outstanding.length} of {rows.length} still to set up.
            </span>{" "}
            {/* Names the next one rather than only counting. A number alone is a
                nag; a number and the next step is a thing somebody can finish. */}
            <span className="text-muted">
              Next: {first.title.toLowerCase()}.
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {/* The way back to the walk. The guide offers itself once per
                browser; without this, somebody who dismissed it — or who
                arrived after a colleague dismissed it on a shared machine —
                has no way to ask for it again. */}
            <Button size="sm" variant="ghost" onClick={() => setGuiding(true)}>
              Walk me through it
            </Button>
            <ButtonLink size="sm" variant="secondary" href={first.href}>
              {first.linkLabel}
            </ButtonLink>
          </div>
        </div>
      </Callout>
      {guide}
    </>
  );
}
