"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import {
  payrollApi,
  type ApiPayrollSettings,
  type PayrollSettingsPatch,
  type PayrollSettingsRow,
  type StatutoryNotice,
} from "@/lib/api/payroll";
import { DEMO_REFUSAL } from "@/lib/store/payroll-deductions";
import { useSession } from "@/lib/store/session";
import { DEFAULT_SETTINGS, type PayrollSettings } from "./settings";

/*
 * Company payroll settings — connected to the API, with a local fallback.
 *
 * ## Two stores merged into one hook
 *
 * Until this change, only the three statutory switches (`payeEnabled` /
 * `pensionEnabled` / `nhfEnabled`, in `lib/store/payroll-deductions.ts`) read
 * and wrote `GET/PATCH /payroll/settings`. Everything else here — working
 * days, the salary split, pension and NHF rates, the pre-run checks — lived
 * in **localStorage only**, even while connected to a real company. That is
 * the exact failure this codebase's own rule names: a working-days setting
 * that "looks saved" and never reaches the engine computing unpaid-day
 * proration is the same shape of bug as a switch that looks saved and moves
 * no payslip. `PayrollSettingsRow` already carries every one of these
 * fields — the API needed no change, only this hook did.
 *
 * ## Demo mode keeps its local store, deliberately
 *
 * The three switches refuse to save offline, because the demo's payslips are
 * fixed illustrative rows generated once by the real engine and a local
 * switch could move none of them. That reasoning does not extend to the rest
 * of this object: `workingDaysPerMonth` prorates the demo attendance
 * timesheet and the overtime worked example live, in the browser, with no
 * engine involved — a demo company genuinely can show what changing its
 * working month does. So offline, `save`/`reset` still write to
 * localStorage exactly as before; only `saveDeduction` refuses, matching
 * `useDeductionSwitches`.
 *
 * ## `save` never touches the three switches
 *
 * `settingsToPatch` deliberately omits `payeEnabled` / `pensionEnabled` /
 * `nhfEnabled` — the PATCH endpoint treats an absent field as "leave it
 * alone". Bundling them into the batched Save button is exactly the bug
 * `payroll-deductions.ts`'s own header warns about: pressing "Reset to
 * defaults" would quietly put PAYE back on for a company that had switched
 * it off. `saveDeduction` is the only path that ever changes them, and it
 * always saves immediately, never batched.
 */

const KEY = "approvehr.payroll.settings";

let cache: PayrollSettings = DEFAULT_SETTINGS;
let hydrated = false;
const listeners = new Set<() => void>();

function loadFromStorage(): PayrollSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    /* Merge over defaults so a settings object saved by an older build does
       not lose fields added since. */
    return raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as PayrollSettings) }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Returns defaults until the first subscription runs. Reading localStorage
 * during render would make the client's first paint disagree with the server
 * HTML — see the same note in lib/store/employees.
 */
function readLocal(): PayrollSettings {
  return cache;
}

function subscribeLocal(listener: () => void) {
  listeners.add(listener);

  if (!hydrated) {
    hydrated = true;
    queueMicrotask(() => {
      const stored = loadFromStorage();
      if (stored !== DEFAULT_SETTINGS) {
        cache = stored;
        listeners.forEach((l) => l());
      }
    });
  }

  return () => {
    listeners.delete(listener);
  };
}

/** The demo-mode store: unchanged from before this file read the API at all. */
function useLocalPayrollSettings(): {
  settings: PayrollSettings;
  save: (next: PayrollSettings) => void;
  reset: () => void;
} {
  const settings = useSyncExternalStore(
    subscribeLocal,
    readLocal,
    () => DEFAULT_SETTINGS, // server snapshot
  );

  const save = useCallback((next: PayrollSettings) => {
    cache = next;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* Storage can be unavailable in private mode. The in-memory cache still
         holds for this session, which is enough for the change to apply. */
    }
    listeners.forEach((l) => l());
  }, []);

  const reset = useCallback(() => {
    cache = DEFAULT_SETTINGS;
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  }, []);

  return { settings, save, reset };
}

/** `PayrollSettingsRow`'s decimal strings and three booleans, as the form reads them. */
function rowToSettings(row: PayrollSettingsRow): PayrollSettings {
  return {
    workingDaysPerMonth: row.workingDaysPerMonth,
    salarySplit: {
      basic: Number(row.basicPercent),
      housing: Number(row.housingPercent),
      transport: Number(row.transportPercent),
    },
    paye: { enabled: row.payeEnabled },
    pension: {
      enabled: row.pensionEnabled,
      employeeRate: Number(row.pensionEmployeeRate),
      employerRate: Number(row.pensionEmployerRate),
      basis: [
        ...(row.pensionOnBasic ? (["basic"] as const) : []),
        ...(row.pensionOnHousing ? (["housing"] as const) : []),
        ...(row.pensionOnTransport ? (["transport"] as const) : []),
      ],
    },
    nhf: {
      enabled: row.nhfEnabled,
      rate: Number(row.nhfRate),
      basis: row.nhfOnGross ? "gross" : "basic",
    },
    exceptions: {
      netSwingThreshold: Number(row.netSwingThreshold),
      requireBankAccount: row.requireBankAccount,
      requirePensionPin: row.requirePensionPin,
      blockNegativeNet: row.blockNegativeNet,
    },
  };
}

/** Everything `save`/`reset` may change. Never the three switches — see the header. */
function settingsToPatch(s: PayrollSettings): PayrollSettingsPatch {
  return {
    workingDaysPerMonth: s.workingDaysPerMonth,
    basicPercent: s.salarySplit.basic,
    housingPercent: s.salarySplit.housing,
    transportPercent: s.salarySplit.transport,
    pensionEmployeeRate: s.pension.employeeRate,
    pensionEmployerRate: s.pension.employerRate,
    pensionOnBasic: s.pension.basis.includes("basic"),
    pensionOnHousing: s.pension.basis.includes("housing"),
    pensionOnTransport: s.pension.basis.includes("transport"),
    nhfRate: s.nhf.rate,
    nhfOnGross: s.nhf.basis === "gross",
    netSwingThreshold: s.exceptions.netSwingThreshold,
    requireBankAccount: s.exceptions.requireBankAccount,
    requirePensionPin: s.exceptions.requirePensionPin,
    blockNegativeNet: s.exceptions.blockNegativeNet,
  };
}

export type DeductionKey = "payeEnabled" | "pensionEnabled" | "nhfEnabled";

export type PayrollSettingsState = {
  settings: PayrollSettings;
  /** True only while the connected fetch's first request is in flight. */
  loading: boolean;
  error: ApiError | null;
  /** False offline — `saveDeduction` refuses there; `save`/`reset` do not. */
  available: boolean;
  /** True when the company has never saved a row: the engine's own defaults,
   *  not a decision anyone made. */
  defaults: boolean;
  headcount: number;
  notices: StatutoryNotice[];
  /** Every field except the three switches. Offline: localStorage. Connected: PATCH. */
  save: (next: PayrollSettings) => Promise<void> | void;
  /** Same fields, back to the engine's defaults. Never the three switches. */
  reset: () => Promise<void> | void;
  /** One statutory switch, saved immediately, never batched with `save`. */
  saveDeduction: (key: DeductionKey, value: boolean) => Promise<void>;
  /** Re-fetches the connected row from scratch. A no-op offline. */
  reload: () => void;
};

export function usePayrollSettings(): PayrollSettingsState {
  const { isConnected, isLoading } = useSession();
  const local = useLocalPayrollSettings();

  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    row: ApiPayrollSettings | null;
    error: ApiError | null;
  } | null>(null);

  /* `isLoading` matters: the session restores asynchronously, and firing this
     read before it resolves would send an unauthenticated request that comes
     back 401 and looks like a permission problem. */
  const active = isConnected && !isLoading;
  const key = `${String(active)}|${tick}`;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const row = await payrollApi.settings(controller.signal);
        if (!cancelled) setFetched({ key, row, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            row: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [key, active]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  const patch = useCallback(
    async (body: PayrollSettingsPatch) => {
      const row = await payrollApi.updateSettings(body);
      setFetched({ key, row, error: null });
    },
    [key],
  );

  const current = fetched?.key === key ? fetched : null;
  const row = current?.row?.settings ?? null;
  /**
   * Memoised on the row itself, not recomputed inline every render.
   *
   * A fresh object from `rowToSettings` on every render is a fresh reference
   * every render, and a consumer that keys a draft on "has `settings` changed
   * since I started editing" (the same pattern `overtime/form.tsx` uses) would
   * never see two renders agree that it had not — an edit in progress would
   * look like a new value arrived on every keystroke on any *other* field.
   */
  const settings = useMemo(
    () => (row ? rowToSettings(row) : DEFAULT_SETTINGS),
    [row],
  );

  if (!active) {
    return {
      settings: local.settings,
      loading: false,
      error: null,
      available: false,
      defaults: true,
      headcount: 0,
      notices: [],
      save: local.save,
      reset: local.reset,
      saveDeduction: () => Promise.reject(new Error(DEMO_REFUSAL)),
      reload: () => {
        /* Nothing to re-fetch offline; the local store is already live. */
      },
    };
  }

  return {
    settings,
    loading: current === null,
    error: current?.error ?? null,
    available: true,
    defaults: current?.row?.defaults ?? true,
    headcount: current?.row?.headcount ?? 0,
    notices: current?.row?.notices ?? [],
    save: (next) => patch(settingsToPatch(next)),
    reset: () => patch(settingsToPatch(DEFAULT_SETTINGS)),
    saveDeduction: (deductionKey, value) => patch({ [deductionKey]: value }),
    reload,
  };
}
