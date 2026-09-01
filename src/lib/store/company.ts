"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { company as api, type ApiCompanyProfile } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";
import { useRevalidation } from "@/lib/revalidate";

/**
 * Company settings: profile, leave policy, roles, notifications, integrations.
 *
 * One store rather than five because these are one document — a company's
 * configuration — and they are read together far more often than separately.
 * Payroll settings stay in `lib/payroll/settings.ts` on purpose: those carry
 * statutory floors and a validation contract of their own, and mixing them in
 * here would bury that.
 *
 * The leave section is the one with teeth. `leaveTypes[].entitled` is what
 * `leaveBalancesFor` divides against, so changing Annual leave from 20 days to
 * 22 here moves every balance on `/people/leave` and every employee record
 * immediately. That is the same single-source-of-truth property the payroll
 * settings already have, and the reason these are settings rather than
 * constants: a company's leave policy is not ours to assume.
 */

/* ------------------------------------------------------------------ Profile */

export type LegalEntity = {
  id: string;
  name: string;
  rcNumber: string;
  taxState: string;
  address: string;
  /** Employees on this entity file PAYE to its tax state. */
  isPrimary: boolean;
};

export type CompanyProfile = {
  legalName: string;
  tradingName: string;
  rcNumber: string;
  tin: string;
  industry: string;
  address: string;
  city: string;
  state: string;
  entities: LegalEntity[];
};

/* --------------------------------------------------------------------- Leave */

export type LeaveTypePolicy = {
  /** Matches `LeaveType` in lib/mock/workflows.ts. */
  name: string;
  /** Days granted per year. Read by `leaveBalancesFor`. */
  entitled: number;
  accrual: "annual_upfront" | "monthly" | "on_completion";
  /** Days that may roll into next year. */
  carryOverMax: number;
  /** Months after year end that carried days expire. 0 = they do not. */
  carryOverExpiresMonths: number;
  requiresEvidence: boolean;
  /** Days of notice required before the start date. */
  minNoticeDays: number;
};

export type LeavePolicy = {
  types: LeaveTypePolicy[];
  /** Whether an approver may push someone into a negative balance. */
  allowNegativeBalance: boolean;
  /** Whether pending days are held against the remaining figure. */
  reservePendingDays: boolean;
};

/* --------------------------------------------------------------------- Roles */

export const PERMISSIONS = [
  { id: "view_salaries", label: "See salaries", detail: "Any employee's gross pay and payslips." },
  { id: "run_payroll", label: "Prepare a payroll run", detail: "Build and review a run, but not release it." },
  { id: "approve_payroll", label: "Approve a payroll run", detail: "Release the payment file. The highest-risk permission here." },
  { id: "edit_records", label: "Edit employee records", detail: "Change pay, bank details and employment terms." },
  { id: "approve_leave", label: "Approve leave", detail: "Decide leave for their own reports." },
  { id: "approve_leave_all", label: "Approve leave company-wide", detail: "Decide leave for anyone." },
  { id: "manage_hiring", label: "Manage hiring", detail: "Open requisitions and move candidates." },
  { id: "export_data", label: "Export employee data", detail: "Download the directory or a payroll register." },
  { id: "manage_settings", label: "Change company settings", detail: "Everything on this page, including roles." },
] as const;

export type PermissionId = (typeof PERMISSIONS)[number]["id"];

export type Role = {
  id: string;
  name: string;
  description: string;
  permissions: PermissionId[];
  /** Built-in roles cannot be deleted, only edited. */
  system: boolean;
};

/* ------------------------------------------------------------- Notifications */

export type NotificationRule = {
  id: string;
  event: string;
  detail: string;
  email: boolean;
  inApp: boolean;
  /** Who receives it, in plain words. */
  recipients: string;
};

/* -------------------------------------------------------------- Integrations */

export type IntegrationStatus = "unavailable" | "requested";

export type Integration = {
  id: string;
  name: string;
  category: "Accounting" | "Attendance" | "Identity" | "Communication" | "Banking";
  detail: string;
  status: IntegrationStatus;
};

/* ------------------------------------------------------------------- Defaults */

export const DEFAULT_COMPANY: {
  profile: CompanyProfile;
  leave: LeavePolicy;
  roles: Role[];
  notifications: NotificationRule[];
  integrations: Integration[];
} = {
  /**
   * A whole fabricated statutory identity, and therefore gated.
   *
   * An RC number, a TIN, a registered address and two invented legal entities.
   * All of it is demo seed and all of it shipped in the production bundle —
   * `verify-demo` passed because it looks for demo *copy* and seed *persona
   * names*, and a company registration number is neither.
   *
   * That is the defect this repo already paid for once, one noun along: three
   * fabricated pension PINs and a payment book reached a production build
   * behind a green gate. HANDOVER's own note on it lists RC-and-TIN-shaped
   * values as a thing the check did not cover. It does now.
   *
   * Empty in production rather than merely unreachable. The connected path no
   * longer reads this at all — `useLiveCompanyProfile` does — and demo mode
   * does not exist in a production build, so nothing reads it there. A value
   * nobody can reach is still a value in the bundle, and a bundle is a file
   * anybody can read.
   */
  profile: DEMO_ENABLED
    ? {
    legalName: "Schull Technologies Limited",
    tradingName: "Schull Technologies",
    rcNumber: "RC 1544820",
    tin: "2019384756",
    industry: "Software and IT services",
    address: "12B Adeola Odeku Street, Victoria Island",
    city: "Lagos",
    state: "Lagos",
    entities: [
      {
        id: "ent-01",
        name: "Schull Technologies Limited",
        rcNumber: "RC 1544820",
        taxState: "Lagos",
        address: "12B Adeola Odeku Street, Victoria Island, Lagos",
        isPrimary: true,
      },
      {
        id: "ent-02",
        name: "Schull Technologies (Abuja) Limited",
        rcNumber: "RC 1698204",
        taxState: "FCT",
        address: "Plot 44, Central Business District, Abuja",
        isPrimary: false,
      },
    ],
      }
    : {
        /* Production: nothing. Empty strings rather than omitted fields so the
           type is unchanged and every reader keeps working — they simply have
           nothing to show, which is the truth when there is no API answering. */
        legalName: "",
        tradingName: "",
        rcNumber: "",
        tin: "",
        industry: "",
        address: "",
        city: "",
        state: "",
        entities: [],
      },
  leave: {
    types: [
      {
        name: "Annual",
        entitled: 20,
        accrual: "monthly",
        carryOverMax: 5,
        carryOverExpiresMonths: 3,
        requiresEvidence: false,
        minNoticeDays: 7,
      },
      {
        name: "Sick",
        entitled: 10,
        accrual: "annual_upfront",
        carryOverMax: 0,
        carryOverExpiresMonths: 0,
        requiresEvidence: true,
        minNoticeDays: 0,
      },
      {
        name: "Compassionate",
        entitled: 5,
        accrual: "annual_upfront",
        carryOverMax: 0,
        carryOverExpiresMonths: 0,
        requiresEvidence: false,
        minNoticeDays: 0,
      },
      {
        name: "Maternity",
        entitled: 84,
        accrual: "on_completion",
        carryOverMax: 0,
        carryOverExpiresMonths: 0,
        requiresEvidence: true,
        minNoticeDays: 30,
      },
      {
        name: "Paternity",
        entitled: 14,
        accrual: "on_completion",
        carryOverMax: 0,
        carryOverExpiresMonths: 0,
        requiresEvidence: false,
        minNoticeDays: 14,
      },
    ],
    allowNegativeBalance: false,
    reservePendingDays: true,
  },
  roles: [
    {
      id: "role-admin",
      name: "Administrator",
      description: "Full access. Keep this to as few people as the work allows.",
      permissions: PERMISSIONS.map((p) => p.id),
      system: true,
    },
    {
      id: "role-hr",
      name: "HR manager",
      description: "Runs people operations. Cannot release a payment file.",
      permissions: [
        "view_salaries",
        "edit_records",
        "approve_leave_all",
        "manage_hiring",
        "export_data",
      ],
      system: true,
    },
    {
      id: "role-payroll",
      name: "Payroll analyst",
      description: "Prepares runs for someone else to approve.",
      permissions: ["view_salaries", "run_payroll", "export_data"],
      system: true,
    },
    {
      id: "role-finance",
      name: "Finance approver",
      description: "Approves what payroll prepared. Separation of duties.",
      permissions: ["view_salaries", "approve_payroll"],
      system: true,
    },
    {
      id: "role-manager",
      name: "Line manager",
      description: "Approves leave for their own reports and nothing else.",
      permissions: ["approve_leave", "manage_hiring"],
      system: true,
    },
    {
      id: "role-employee",
      name: "Employee",
      description: "Their own record, their own payslips, their own requests.",
      permissions: [],
      system: true,
    },
  ],
  notifications: [
    {
      id: "n-payroll-approval",
      event: "A payroll run needs approval",
      detail: "Sent when a run moves to review, and again 24 hours before the bank cut-off.",
      email: true,
      inApp: true,
      recipients: "Anyone with Approve a payroll run",
    },
    {
      id: "n-leave-request",
      event: "Leave request raised",
      detail: "Sent to the approver named on the request.",
      email: true,
      inApp: true,
      recipients: "The named approver",
    },
    {
      id: "n-leave-decision",
      event: "Leave approved or sent back",
      detail: "Sent to the employee who raised it.",
      email: true,
      inApp: true,
      recipients: "The requester",
    },
    {
      id: "n-payslip",
      event: "Payslip published",
      detail: "Sent after a run is released, with the payslip attached.",
      email: true,
      inApp: true,
      recipients: "Every employee on the run",
    },
    {
      id: "n-statutory-due",
      event: "A statutory filing is due",
      detail: "Seven days before the remittance deadline, then on the day.",
      email: true,
      inApp: true,
      recipients: "Anyone with Approve a payroll run",
    },
    {
      id: "n-record-change",
      event: "Bank details changed",
      detail: "Sent whenever a bank account is edited, including by the employee. Turning this off is not recommended.",
      email: true,
      inApp: true,
      recipients: "Anyone with Edit employee records",
    },
    {
      id: "n-attendance-exception",
      event: "Unexplained absence",
      detail: "A daily digest of anyone with no clock-in and no approved leave.",
      email: false,
      inApp: true,
      recipients: "Line managers",
    },
    {
      id: "n-offer-approval",
      event: "An offer needs approval",
      detail: "Sent when an offer is raised above or outside the approved band.",
      email: true,
      inApp: true,
      recipients: "The budget holder",
    },
  ],
  integrations: [
    { id: "int-quickbooks", name: "QuickBooks", category: "Accounting", detail: "Post the payroll journal after a run is released.", status: "unavailable" },
    { id: "int-sage", name: "Sage", category: "Accounting", detail: "Post the payroll journal after a run is released.", status: "unavailable" },
    { id: "int-xero", name: "Xero", category: "Accounting", detail: "Post the payroll journal after a run is released.", status: "unavailable" },
    { id: "int-biometric", name: "Biometric clock-in devices", category: "Attendance", detail: "Pull clock-in and clock-out events from ZKTeco and similar terminals.", status: "unavailable" },
    { id: "int-google", name: "Google Workspace", category: "Identity", detail: "Single sign-on, and provision accounts for new starters.", status: "unavailable" },
    { id: "int-microsoft", name: "Microsoft Entra ID", category: "Identity", detail: "Single sign-on and directory sync.", status: "unavailable" },
    { id: "int-slack", name: "Slack", category: "Communication", detail: "Approval reminders where your team already is.", status: "unavailable" },
    { id: "int-paystack", name: "Paystack", category: "Banking", detail: "Execute the payment file after a run is approved.", status: "unavailable" },
    { id: "int-flutterwave", name: "Flutterwave", category: "Banking", detail: "Execute the payment file after a run is approved.", status: "unavailable" },
  ],
};

export type CompanySettings = typeof DEFAULT_COMPANY;

/* A sparse patch per section, so a change to one does not rewrite the others
   and a new default field is picked up rather than shadowed by stale storage. */
type CompanyState = {
  profile?: Partial<CompanyProfile>;
  leave?: Partial<LeavePolicy>;
  roles?: Role[];
  notifications?: NotificationRule[];
  integrations?: Integration[];
};

const EMPTY: CompanyState = {};

const store = createPersistedState<CompanyState>({
  key: "approvehr.company.store",
  empty: EMPTY,
  version: 1,
});

/**
 * The company's real identity, when there is an API to ask.
 *
 * ## Why this is not `useCompanySettings`
 *
 * `DEFAULT_COMPANY` is a **fabricated** profile — a legal name, an RC number, a
 * TIN, a registered address and two legal entities, all invented. It is the
 * seed for demo mode and it is correct there.
 *
 * It reached a real customer twice. First the printed payslip, which carried a
 * fabricated legal name and RC number on a real company's document; that was
 * fixed at the payslip. Then `/settings/company` — the screen that *is* the
 * company's identity — which read the local store unconditionally, so a second
 * organisation signed in and was shown the first one's RC number and TIN, on a
 * form, above a panel explaining that these are what "PAYE, pension and NHF
 * schedules filed on your behalf" use.
 *
 * The form's own comment recorded the gap and deferred it: "the rest of this
 * form is demo-store only — converting all of it is its own piece of work."
 * That was defensible while one organisation existed and stopped being
 * defensible the moment a second one did.
 *
 * So there is one hook, exported, and both readers use it. A copy of this
 * living in a page is how the payslip and the settings screen came to disagree
 * about the same company in the first place.
 *
 * Returns `null` offline and while loading — callers fall back to the demo
 * store only when genuinely not connected, never as a loading state.
 */
export function useLiveCompanyProfile(): {
  profile: ApiCompanyProfile | null;
  reload: () => void;
} {
  const { isConnected } = useSession();
  const [profile, setProfile] = useState<ApiCompanyProfile | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    /* No `setProfile(null)` here — a disconnected read is *derived* below
       rather than written from an effect. Setting state on the way out of an
       effect is the cascading-render shape `lib/store/my-record.ts` was
       restructured to remove, and the lint rule that names it is right. */
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await api.profile(controller.signal);
        if (!cancelled) setProfile(result);
      } catch {
        /* Absent, not fabricated. A failed read must not fall through to the
           seed — that is the whole defect this hook exists for. */
        if (!cancelled) setProfile(null);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  /* Derived, so a stale profile cannot survive a disconnect. */
  return { profile: isConnected ? profile : null, reload };
}

export function useCompanySettings() {
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );

  const settings: CompanySettings = {
    profile: { ...DEFAULT_COMPANY.profile, ...state.profile },
    leave: { ...DEFAULT_COMPANY.leave, ...state.leave },
    roles: state.roles ?? DEFAULT_COMPANY.roles,
    notifications: state.notifications ?? DEFAULT_COMPANY.notifications,
    integrations: state.integrations ?? DEFAULT_COMPANY.integrations,
  };

  const updateProfile = useCallback((patch: Partial<CompanyProfile>) => {
    const s = store.current();
    store.commit({ ...s, profile: { ...s.profile, ...patch } });
  }, []);

  const updateLeave = useCallback((patch: Partial<LeavePolicy>) => {
    const s = store.current();
    store.commit({ ...s, leave: { ...s.leave, ...patch } });
  }, []);

  /** Patch one leave type by name, leaving the others untouched. */
  const updateLeaveType = useCallback(
    (name: string, patch: Partial<LeaveTypePolicy>) => {
      const s = store.current();
      const current = s.leave?.types ?? DEFAULT_COMPANY.leave.types;
      store.commit({
        ...s,
        leave: {
          ...s.leave,
          types: current.map((t) => (t.name === name ? { ...t, ...patch } : t)),
        },
      });
    },
    [],
  );

  const setRolePermission = useCallback(
    (roleId: string, permission: PermissionId, on: boolean) => {
      const s = store.current();
      const roles = s.roles ?? DEFAULT_COMPANY.roles;
      store.commit({
        ...s,
        roles: roles.map((role) =>
          role.id !== roleId
            ? role
            : {
                ...role,
                permissions: on
                  ? [...new Set([...role.permissions, permission])]
                  : role.permissions.filter((p) => p !== permission),
              },
        ),
      });
    },
    [],
  );

  const setNotification = useCallback(
    (id: string, patch: Partial<Pick<NotificationRule, "email" | "inApp">>) => {
      const s = store.current();
      const rules = s.notifications ?? DEFAULT_COMPANY.notifications;
      store.commit({
        ...s,
        notifications: rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      });
    },
    [],
  );

  const setIntegrationStatus = useCallback(
    (id: string, status: IntegrationStatus) => {
      const s = store.current();
      const list = s.integrations ?? DEFAULT_COMPANY.integrations;
      store.commit({
        ...s,
        integrations: list.map((i) => (i.id === id ? { ...i, status } : i)),
      });
    },
    [],
  );

  const resetAll = useCallback(() => store.reset(), []);

  return {
    settings,
    updateProfile,
    updateLeave,
    updateLeaveType,
    setRolePermission,
    setNotification,
    setIntegrationStatus,
    resetAll,
  };
}

/* ------------------------------------------------------------------ Validation */

export type ProfileError = { field: keyof CompanyProfile; message: string };

/**
 * Checked against what the Corporate Affairs Commission and the tax offices
 * actually accept, so a profile that passes here is one you could file with.
 */
export function validateProfile(patch: Partial<CompanyProfile>): ProfileError[] {
  const errors: ProfileError[] = [];

  if (patch.legalName !== undefined && !patch.legalName.trim()) {
    errors.push({ field: "legalName", message: "The registered name is required." });
  }
  if (patch.rcNumber !== undefined && patch.rcNumber.trim()) {
    if (!/^(RC\s?)?\d{4,8}$/i.test(patch.rcNumber.trim())) {
      errors.push({
        field: "rcNumber",
        message: "An RC number is 4 to 8 digits, optionally prefixed with RC.",
      });
    }
  }
  if (patch.tin !== undefined && patch.tin.trim()) {
    if (!/^\d{10}$/.test(patch.tin.replace(/[\s-]/g, ""))) {
      errors.push({ field: "tin", message: "A Nigerian TIN is 10 digits." });
    }
  }
  return errors;
}

/* -------------------------------------------------------------- Org tax state */

/**
 * The company's own default PAYE state — read and set directly, without the
 * rest of the profile.
 *
 * `/settings/company` still reads and writes the demo store only; connecting
 * that whole screen to the API is its own piece of work (HANDOVER's "still not
 * done" list). This hook exists because one field on it — the org's default
 * tax state — has a real consequence with no other way to fix it today: every
 * employee create refuses outright when neither the row nor the organisation
 * has a state to file to, and a company that has never opened Settings has
 * nowhere connected to set one. Demo mode always has a default (see
 * `DEFAULT_COMPANY.profile.state`), so this only has work to do connected.
 */
export function useOrgTaxState() {
  const { isConnected } = useSession();
  const demo = useCompanySettings();

  /* `null` means "not fetched yet", which only happens connected — demo mode
     never reads this and `taxState` below never depends on it disconnected,
     so there is nothing to reset when `isConnected` flips and the effect can
     skip doing anything at all rather than writing state back to empty. */
  const [remote, setRemote] = useState<{ taxState: string | null } | null>(null);
  const [saving, setSaving] = useState(false);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;

    /* Retried rather than accepted on the first failure — measured live: this
       screen's mount fires several concurrent `company/profile` requests (this
       hook is one of a few readers), and one of them can lose a race with a
       token refresh and come back 401 while its siblings come back 200 a beat
       later. Reporting that as "confirmed unset" was a real bug: it told an
       administrator whose company plainly had a tax state on file that it did
       not, purely because this one request was the unlucky one. Three tries
       covers a refresh; a company that has genuinely never answered this
       question settles on `null` after them, same as before. */
    async function load() {
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          const profile = await api.profile();
          if (!cancelled) setRemote({ taxState: profile.taxState });
          return;
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
        }
      }
      if (!cancelled) setRemote({ taxState: null });
    }
    void load();

    return () => {
      cancelled = true;
    };
  }, [isConnected, revalidation]);

  const loading = isConnected && remote === null;
  const taxState = isConnected
    ? (remote?.taxState ?? null)
    : (demo.settings.profile.state || null);

  const setTaxState = useCallback(
    async (state: string): Promise<boolean> => {
      if (!isConnected) {
        demo.updateProfile({ state });
        return true;
      }
      setSaving(true);
      try {
        const profile = await api.updateProfile({ taxState: state });
        setRemote({ taxState: profile.taxState });
        return true;
      } catch {
        return false;
      } finally {
        setSaving(false);
      }
    },
    [isConnected, demo],
  );

  return { taxState, loading, saving, setTaxState };
}

/**
 * Module-level, shared across every mounted `useCompanyLogo()` — the sidebar
 * badge and the settings card both hold one at once, and a save in the
 * second must appear in the first immediately, not on the next window
 * focus. `useRevalidation` solves a different problem (two separate
 * *windows* drifting apart) and would still have made the settings card
 * wait on a blur/focus cycle to see its own save reflected next to it. A
 * plain module-level value, notified on write, is the whole fix — the same
 * `useSyncExternalStore` shape `revalidate.ts` uses, one level narrower.
 */
let logoState: { logoUrl: string | null } | null = null;
let logoFetchPromise: Promise<void> | null = null;
const logoListeners = new Set<() => void>();

function setLogoState(next: { logoUrl: string | null } | null): void {
  logoState = next;
  for (const listener of logoListeners) listener();
}

function subscribeToLogo(listener: () => void): () => void {
  logoListeners.add(listener);
  return () => {
    logoListeners.delete(listener);
  };
}

const getLogoSnapshot = () => logoState;
const getLogoServerSnapshot = () => null;

/**
 * The company's logo, which is a real API field rather than a demo one.
 *
 * Shaped on `useOrgTaxState` above, including its retry: this screen fires
 * several concurrent `company/profile` reads and one can lose a race with a
 * token refresh, and reporting that as "no logo" would make an administrator
 * think theirs had been lost.
 *
 * The file never leaves the browser as a file. It is read to a `data:` URI
 * here and travels as one — see `Organization.logoUrl` for why a logo is the
 * one file in this product that lives in Postgres, and
 * `updateProfileSchema` for what the API will accept.
 */
export function useCompanyLogo() {
  const { isConnected } = useSession();

  const remote = useSyncExternalStore(
    subscribeToLogo,
    getLogoSnapshot,
    getLogoServerSnapshot,
  );
  const [saving, setSaving] = useState(false);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected) return;
    /* The badge and the card both mount `useCompanyLogo()` on a cold load of
       `/settings/company`, and without this, both would fire the same read.
       The shared promise, not a boolean, is what makes this safe under
       StrictMode's double-invoke: the second invocation of this same effect
       runs synchronously after the first assigns `logoFetchPromise`, before
       any `await` inside it yields, so it always sees the first's promise
       rather than a flag the first has not yet had a chance to set. A plain
       boolean flipped back off in a `finally` cannot make that guarantee —
       it briefly reads `false` again between the two invocations whenever
       the fetch settles in that window, and the second invocation starts a
       fetch of its own no cleanup ever cancels. */
    if (logoState !== null || logoFetchPromise) return;

    logoFetchPromise = (async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const profile = await api.profile();
          setLogoState({ logoUrl: profile.logoUrl });
          return;
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
        }
      }
      setLogoState({ logoUrl: null });
    })().finally(() => {
      logoFetchPromise = null;
    });
  }, [isConnected, revalidation]);

  /**
   * `null` clears the logo; a data URI sets it. Throws the API's own refusal
   * so the caller can render it — the messages name the actual problem
   * ("that is not an image file we can put on a payslip"), which is more use
   * than anything this side could compose.
   */
  const save = useCallback(
    async (logoUrl: string | null): Promise<void> => {
      if (!isConnected) {
        throw new ApiError(
          0,
          "offline",
          "Saving a logo needs the API. A logo kept in this browser would " +
            "never reach a payslip anybody else opens.",
        );
      }
      setSaving(true);
      try {
        const profile = await api.updateProfile({ logoUrl });
        setLogoState({ logoUrl: profile.logoUrl });
      } finally {
        setSaving(false);
      }
    },
    [isConnected],
  );

  return {
    logoUrl: remote?.logoUrl ?? null,
    loading: isConnected && remote === null,
    saving,
    available: isConnected,
    save,
  };
}
