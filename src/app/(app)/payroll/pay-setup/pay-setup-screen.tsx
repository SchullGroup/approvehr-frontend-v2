"use client";

import { useState } from "react";
import { Coins, HeartPulse, Layers, Scissors, ShieldAlert } from "lucide-react";
import { EmptyState, Tabs } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { GradesPanel } from "@/app/(app)/payroll/pay-setup/grades-panel";
import { useCan } from "@/lib/permissions";
import { ComponentsPanel } from "./components-panel";
import { BenefitsPanel } from "./benefits-panel";
import { PAY_SETUP_TABS, isPaySetupTab, type PaySetupTab } from "./tabs";

/**
 * Pay setup — one route, four tabs.
 *
 * This is Rule 1 from `PARITY.md` applied to the thing that made the rule
 * necessary. The incumbent has three separate pages here — allowance types,
 * deduction types, salary categories — which means a business owner has to
 * learn where each half of one idea lives before they can add a car allowance.
 * They are one concept: **what pay is made of, other than salary**. So they are
 * one route — and Benefits joined them for the same reason, having briefly had
 * a sidebar item and a route of its own while being a fourth answer to that
 * same question. A benefit plan is a definition of what the company gives and
 * what each side pays for it, which is an allowance with a scheme attached.
 *
 * The tab is in the query string, so a link to the deductions tab opens on the
 * deductions tab. It is written with `history.replaceState` rather than a router
 * push: switching tab is not a navigation, should not add a back-button step,
 * and must not re-run a server render that would throw away the search box.
 *
 * ## The Grades tab is somebody else's component
 *
 * `grades-panel.tsx` in this directory is owned by the grades work. It is
 * imported, never edited here, and it renders no page header of its own — the
 * shell owns the heading and the route, every panel owns its own body. That
 * division is what the fourth tab followed: `benefits-panel.tsx` is the old
 * Benefits screen with its page header taken off.
 *
 * ## Who may look
 *
 * Allowances and deductions are read with `VIEW_SALARIES` on the API
 * (`GET /pay-components`) — the same permission the Grades tab's own store
 * additionally requires to *edit*, so `VIEW_SALARIES` is the floor for those
 * three tabs. It is **not** the floor for the page any more: Benefits asks its
 * own question, for the reason set out on `visible` below.
 * Connected, this is a second lock on a door already locked. It
 * earns its place in demo mode, where `useGrades` and `usePayComponents`
 * answer regardless of role unless a screen asks: previewing "Employee"
 * under `/settings/roles` must not still show what pay is made of.
 */

/* Labels and icons only. The ids and their order come from `tabs.ts`, which the
   server page also reads — see the note there about the client boundary. */
const META: Record<PaySetupTab, { label: string; icon: React.ReactNode }> = {
  allowances: { label: "Allowances", icon: <Coins aria-hidden="true" /> },
  deductions: { label: "Deductions", icon: <Scissors aria-hidden="true" /> },
  grades: { label: "Grades", icon: <Layers aria-hidden="true" /> },
  benefits: { label: "Benefits", icon: <HeartPulse aria-hidden="true" /> },
};

const ITEMS = PAY_SETUP_TABS.map((id) => ({ id, ...META[id] }));

export function PaySetupScreen({ initialTab }: { initialTab: PaySetupTab }) {
  const canView = useCan("VIEW_SALARIES");
  const canPrice = useCan("MANAGE_PAY_STRUCTURE");
  const canEnrol = useCan("EDIT_RECORDS");
  const [tab, setTab] = useState<PaySetupTab>(initialTab);

  /**
   * Which tabs this person may see, asked per tab rather than once.
   *
   * This page used to refuse as a whole on `VIEW_SALARIES`, which was right
   * while every tab on it was a salary figure. Benefits is not: the panel
   * withholds its cost figures on that same permission and lets somebody who
   * enrols people carry on working, so gating the page would have removed the
   * feature from the person it was shaped for — an HR manager who may put
   * somebody on the company HMO and may not see what anybody earns.
   *
   * So `VIEW_SALARIES` still gates what pay is made of, and Benefits asks the
   * two permissions that can actually act on it. Somebody holding only
   * `EDIT_RECORDS` gets Pay setup with one tab on it, which is the honest
   * answer rather than a locked door.
   */
  const visible = ITEMS.filter((item) =>
    item.id === "benefits" ? canView || canPrice || canEnrol : canView,
  );

  /* A `?tab=` for something this reader may not see falls back to the first
     they may, rather than rendering an empty tab panel. */
  const shown = visible.some((item) => item.id === tab)
    ? tab
    : (visible[0]?.id ?? tab);

  const change = (next: string) => {
    if (!isPaySetupTab(next)) return;
    setTab(next);
    /* Shareable without a navigation. `replaceState` keeps the back button
       pointing at wherever the reader came from rather than at the tab they
       looked at three seconds ago. */
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };

  if (visible.length === 0) {
    return (
      <>
        <PageHeader title="Pay setup" />
        <PageBody>
          <EmptyState
            icon={<ShieldAlert aria-hidden="true" />}
            title="You cannot view pay setup"
            description={
              "Seeing what pay is made of — allowances, deductions and " +
              "grades — needs the “View salaries” permission. Ask " +
              "somebody who holds it."
            }
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Pay setup" />

      <PageBody>
        <Tabs items={visible} value={shown} onChange={change}>
          {shown === "allowances" && <ComponentsPanel kind="ALLOWANCE" />}
          {shown === "deductions" && <ComponentsPanel kind="DEDUCTION" />}
          {/* Slot: owned by the grades agent. Do not edit grades-panel.tsx here. */}
          {shown === "grades" && <GradesPanel />}
          {shown === "benefits" && <BenefitsPanel />}
        </Tabs>
      </PageBody>
    </>
  );
}
