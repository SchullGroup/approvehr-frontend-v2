"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { setup, type ApiSetupChecklist } from "@/lib/api/setup";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { TODAY } from "@/lib/today";
import { useCompanySettings } from "./company";
import { useEmployeeStore } from "./employees";
import { useFeatures } from "./features";
import { useDemoHolidayCounts } from "./holidays";
import { useDemoWorkLocations } from "./work-locations";
import { useSession } from "./session";
import { useRevalidation } from "@/lib/revalidate";

/**
 * "What do I still need to set up?" — the one read behind `/settings`.
 *
 * ## Why the hub gets a hook of its own
 *
 * The Settings page was an index of eight links. It answered "what pages exist",
 * which is not the question anybody arrives with: the parameters of a company —
 * how many offices, which employee fields are asked for, leave types, holidays,
 * pay setup — are scattered across a dozen screens, and nothing presented them
 * as one job. A checklist needs a *fact* per row, and the facts live in nine
 * modules.
 *
 * Connected, that is **one request**: `GET /setup/checklist`, composed
 * server-side, for the reason its own header gives — a second implementation of
 * a fact is how two screens end up disagreeing about the same company.
 *
 * ## Demo mode composes locally, and that is the trade in this file
 *
 * `lib/store/insights.ts` records that the dashboard's first version was coupled
 * to three other screens' stores and that the coupling was removed. This hook
 * does the thing that warning is about, deliberately, and the difference is
 * worth stating:
 *
 * - Every demo read here is a **synchronous localStorage read**, not a request.
 *   The hub fires nothing at all offline.
 * - The alternative is a hub that cannot answer its own question on a laptop
 *   with no database, which is the room this product gets sold in. An empty
 *   checklist beside eight links is worse than the links alone.
 * - Two of the reads (`useDemoWorkLocations`, `useDemoHolidayCounts`) exist
 *   *specifically* so this file never triggers a fetch: their normal hooks load
 *   from the API when connected, and connected mode already has those figures
 *   inside the one response.
 *
 * ## What demo mode cannot know, and says so
 *
 * `bankAccounts` and the payroll-check switches are the honest gaps. The demo
 * payment book is private to `lib/store/payments.ts`, and rather than widen that
 * surface for a count, both come back **null** and the screen renders the row
 * without a claim. Absent is absent: "0 accounts" beside a company that has one
 * is exactly the kind of wrong figure this product is sold against.
 */

/**
 * The same shape the API sends, with `null` allowed wherever demo mode cannot
 * answer honestly. Connected, nothing here is ever null.
 */
export type SetupFacts = Omit<ApiSetupChecklist, "pay"> & {
  pay: Omit<
    ApiSetupChecklist["pay"],
    "components" | "grades" | "bankAccounts" | "hasPrimaryBankAccount"
  > & {
    /**
     * Null offline. Every one of these is an API-only surface — the demo has no
     * payment book, no pay components and no salary bands — and a zero would be
     * a claim that a company has none rather than that nothing was asked.
     */
    components: number | null;
    grades: number | null;
    bankAccounts: number | null;
    hasPrimaryBankAccount: boolean | null;
  };
};

export type ChecklistState = {
  /** Null while loading, or when the request failed. */
  facts: SetupFacts | null;
  loading: boolean;
  error: ApiError | null;
  source: "api" | "demo";
  reload: () => void;
};

/**
 * The year the holiday counts cover, in demo mode only.
 *
 * `TODAY` rather than the real clock, because the demo dataset is a fixed
 * snapshot and the leave screen draws the same year — a checklist counting a
 * different one would be two screens disagreeing about one calendar. Connected,
 * the **year is not sent at all**: the API defaults it to its own clock, which
 * is the authority, and a browser an hour into 1 January in another timezone
 * would otherwise ask about the wrong calendar. The answer carries the year it
 * used, so the screen renders that rather than assuming.
 */
const DEMO_YEAR = Number(TODAY.slice(0, 4));

export function useSetupChecklist(): ChecklistState {
  const { isConnected } = useSession();

  /* Local reads, all of them synchronous and none of them a request. `useFeatures`
     is shared through a module-level cache — the sidebar reads it on every page —
     so calling it here costs nothing in either mode. */
  const features = useFeatures();
  const company = useCompanySettings();
  const { settings: payroll } = usePayrollSettings();
  const employees = useEmployeeStore();
  const demoLocations = useDemoWorkLocations();
  const demoHolidays = useDemoHolidayCounts(DEMO_YEAR);

  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    facts: ApiSetupChecklist | null;
    error: ApiError | null;
  } | null>(null);

  const key = String(tick);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const facts = await setup.checklist(undefined, controller.signal);
        if (!cancelled) setFetched({ key, facts, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            facts: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, key, revalidation]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  /* The demo answer, derived and never written to state. */
  const demoFacts = useMemo<SetupFacts>(() => {
    const profile = company.settings.profile;
    const fenced = demoLocations.filter((row) => row.radiusMetres !== null);
    const staff = employees.directory;

    return {
      setupCompletedAt: features.setupCompletedAt,
      company: {
        /* Demo mode holds no logo — the upload is API-only, and the card on
           `/settings/company` says so. False rather than absent because the
           checklist's own sentence is what tells somebody it exists at all. */
        logo: false,
        rcNumber: profile.rcNumber.trim() !== "",
        tin: profile.tin.trim() !== "",
        addressLine: profile.address.trim() !== "",
        taxState: profile.state.trim() !== "",
        entities: profile.entities.length,
      },
      locations: {
        total: demoLocations.length,
        withGeofence: fenced.length,
        enforcing: fenced.filter((row) => row.geofenceEnforced).length,
      },
      recordFields: {
        taxSetup: features.taxSetup,
        pensionSetup: features.pensionSetup,
        bankDetails: features.bankDetails,
      },
      leave: {
        types: company.settings.leave.types.length,
        year: DEMO_YEAR,
        holidays: demoHolidays.holidays,
        awaitingProclamation: demoHolidays.awaitingProclamation,
      },
      pay: {
        /* Always true offline: `usePayrollSettings` has defaults rather than an
           empty state, which is the same thing the API's seed does on day one. */
        settings: true,
        /* Absent, not zero, on all four: they are API-only surfaces and a zero
           would read as "this company has none". */
        components: null,
        grades: null,
        bankAccounts: null,
        hasPrimaryBankAccount: null,
      },
      access: {
        roles: company.settings.roles.length,
        /* The demo has no user accounts distinct from employees, so a count of
           users would be a count of something else wearing its name. */
        users: staff.length,
        usersWithoutRole: 0,
        /* The demo's own permission id, which is not the API's `APPROVE_PAYROLL`.
           Two vocabularies for one thing, and this is the only place they meet —
           `lib/store/company.ts#PERMISSIONS` owns the local list. */
        canApprovePayroll: company.settings.roles.filter((role) =>
          role.permissions.includes("approve_payroll"),
        ).length,
      },
      payrollChecks: {
        employees: staff.length,
        requireBankAccount: payroll.exceptions.requireBankAccount,
        requirePensionPin: payroll.exceptions.requirePensionPin,
        missingBankAccount: staff.filter((person) => !person.bankAccount).length,
        missingPensionPin: staff.filter((person) => !person.pensionPin).length,
      },
    };
  }, [company.settings, demoHolidays, demoLocations, employees.directory, features, payroll]);

  /* Staleness by comparing the key during render, not by clearing state in an
     effect — which would be a synchronous setState and a cascaded render. */
  const matched = fetched !== null && fetched.key === key;

  if (!isConnected) {
    return { facts: demoFacts, loading: false, error: null, source: "demo", reload };
  }

  return {
    facts: matched ? fetched.facts : null,
    loading: !matched,
    error: matched ? fetched.error : null,
    source: "api",
    reload,
  };
}
