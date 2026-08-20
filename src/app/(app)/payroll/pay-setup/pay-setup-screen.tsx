"use client";

import { useState } from "react";
import { Coins, Layers, Scissors } from "lucide-react";
import { Tabs } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { GradesPanel } from "@/app/(app)/payroll/pay-setup/grades-panel";
import { ComponentsPanel } from "./components-panel";
import { PAY_SETUP_TABS, isPaySetupTab, type PaySetupTab } from "./tabs";

/**
 * Pay setup — one route, three tabs.
 *
 * This is Rule 1 from `PARITY.md` applied to the thing that made the rule
 * necessary. The incumbent has three separate pages here — allowance types,
 * deduction types, salary categories — which means a business owner has to
 * learn where each half of one idea lives before they can add a car allowance.
 * They are one concept: **what pay is made of, other than salary**. So they are
 * one route.
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
 * shell owns the heading and the route, every panel owns its own body. Keep that
 * division if a fourth tab is added.
 */

/* Labels and icons only. The ids and their order come from `tabs.ts`, which the
   server page also reads — see the note there about the client boundary. */
const META: Record<PaySetupTab, { label: string; icon: React.ReactNode }> = {
  allowances: { label: "Allowances", icon: <Coins aria-hidden="true" /> },
  deductions: { label: "Deductions", icon: <Scissors aria-hidden="true" /> },
  grades: { label: "Grades", icon: <Layers aria-hidden="true" /> },
};

const ITEMS = PAY_SETUP_TABS.map((id) => ({ id, ...META[id] }));

export function PaySetupScreen({ initialTab }: { initialTab: PaySetupTab }) {
  const [tab, setTab] = useState<PaySetupTab>(initialTab);

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

  return (
    <>
      <PageHeader
        title="Pay setup"
        description="What pay is made of besides salary: what you add, what you take off, and the bands each job sits in."
      />

      <PageBody>
        <Tabs items={ITEMS} value={tab} onChange={change}>
          {tab === "allowances" && <ComponentsPanel kind="ALLOWANCE" />}
          {tab === "deductions" && <ComponentsPanel kind="DEDUCTION" />}
          {/* Slot: owned by the grades agent. Do not edit grades-panel.tsx here. */}
          {tab === "grades" && <GradesPanel />}
        </Tabs>
      </PageBody>
    </>
  );
}
