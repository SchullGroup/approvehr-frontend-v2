"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import {
  FEATURE_KEYS,
  RECORD_FIELD_KEYS,
  setup,
  type ApiFeatures,
  type ApiSeeded,
  type ApiWizardQuestion,
  type FeatureKey,
  type FeaturePatch,
  type HeadcountBand,
  type PayrollDeductions,
} from "@/lib/api/setup";
import { EMPLOYEES } from "@/lib/mock/people";
import { useSession } from "./session";

/**
 * Which parts of the product this company sees.
 *
 * This is Rule 2 of `PARITY.md` on the frontend: a five-person business sees
 * six nav items instead of thirty, because it answered a few questions once.
 * Nothing is deleted when a flag is off — `/settings/features` turns it back on
 * and the data is still there.
 *
 * ## One store, one request
 *
 * The sidebar reads `useFeatures()` on **every** page, so this is a module-level
 * singleton rather than a per-hook `useState`: twenty components asking for the
 * flags is one request, not twenty. Everything that changes a flag writes back
 * into the same cache, so the nav, the wizard and the settings page cannot
 * disagree about what is on.
 *
 * ## Why not `createPersistedState`
 *
 * `lib/store/persisted.ts` models a value whose home is localStorage. This
 * store's home is the API; localStorage is only the demo branch, and what it
 * holds is the answers, not the state. So the factory's shape does not fit —
 * but its **hydration rule does and is obeyed**: the snapshot starts at
 * `LOADING`, storage is read after mount, and the server snapshot is a stable
 * constant. See that file for why reading storage in `getSnapshot` breaks.
 *
 * ## Demo mode
 *
 * Answered questions persist to this browser and drive the same nav filtering.
 * The demo needs its own copy of the question set (`DEMO_QUESTIONS` below) for
 * the obvious reason that there is no server to ask. That copy is a demo prop:
 * the connected path never touches it, and if the two ever disagree the served
 * one is right.
 */

/* -------------------------------------------------------------------- shape */

export type FeatureFlags = Record<FeatureKey, boolean>;

type Source = "loading" | "api" | "demo";

type State = {
  flags: FeatureFlags;
  headcountBand: HeadcountBand;
  setupStep: number;
  totalSteps: number;
  setupCompletedAt: string | null;
  setupRequired: boolean;
  loading: boolean;
  /** A message ready to show. `null` when the last load worked. */
  error: string | null;
  source: Source;
  /**
   * What the **demo** company deducts, from the two payroll setup questions.
   *
   * Null on the API path, and that is not a gap: connected, the authority is
   * `GET /payroll/settings`, because those switches live on the payroll settings
   * row and are what the engine reads. `GET /setup/features` does not carry
   * them, so claiming a value here would be inventing one.
   *
   * It exists at all so the demo cannot contradict itself. The wizard's answer
   * persists locally, and without this the settings screen and the demo payroll
   * run would both keep saying PAYE was deducted after somebody answered that it
   * is not — two screens disagreeing about a money fact, in the mode people open
   * first.
   */
  deductions: PayrollDeductions | null;
};

/**
 * What a brand-new company sees: the smallest product that still pays people
 * correctly. These mirror the schema defaults on `OrgFeatures`, and they are
 * what renders for the half-second before the real row arrives — so getting
 * them wrong would flash nav items that then vanish.
 */
const BASE_FLAGS: FeatureFlags = {
  departments: false,
  grades: false,
  shifts: false,
  loans: false,
  expenses: false,
  appraisals: false,
  hiring: true,
  /* On, like hiring: the schema default matches, and a company that has
     answered nothing still sees the everyday clock-in button rather than
     losing it until the wizard says otherwise. */
  attendance: true,
  /* The three field groups start **on**, unlike every module above, and the
     schema default matches. Every company that existed before these columns did
     was shown the tax, pension and bank fields, and a flag that arrived
     switched off would have quietly stopped asking for somebody's pension PIN.
     A new company turns them off in Settings in one click; the form collapses
     them either way, which is what makes the minute-long add possible without
     touching a setting at all. */
  taxSetup: true,
  pensionSetup: true,
  bankDetails: true,
  /* Off, like every module. A company with one manager per person must never be
     shown a weighting table it did not ask for. */
  multiAppraiser: false,
};

const TOTAL_STEPS_FALLBACK = 5;

const LOADING: State = {
  flags: BASE_FLAGS,
  headcountBand: "UNDER_10",
  setupStep: 0,
  totalSteps: TOTAL_STEPS_FALLBACK,
  setupCompletedAt: null,
  /* Not "true" until something says so. A nav that renders during a load must
     not decide the customer needs setting up. */
  setupRequired: false,
  loading: true,
  error: null,
  source: "loading",
  /* Unknown until something says so, in both modes. */
  deductions: null,
};

/* ------------------------------------------------------------------- labels */

/**
 * One plain line per capability, shared by the settings page and the wizard's
 * summary so the two describe the same thing the same way.
 *
 * Each line says what it *is*, in words a shop owner uses. None of them explain
 * why the product wants it — the switch beside them is the argument.
 */
export const FEATURE_COPY: Record<
  FeatureKey,
  { label: string; line: string }
> = {
  departments: {
    label: "Departments and teams",
    line: "Group people into departments, and see what each one costs a month.",
  },
  grades: {
    label: "Salary grades",
    line: "Put people on a band, then raise a whole band at once.",
  },
  shifts: {
    label: "Shifts and nights",
    line: "Rotas, night duty and weekend cover instead of one working pattern.",
  },
  loans: {
    label: "Staff loans and advances",
    line: "Track repayments straight out of payroll.",
  },
  expenses: {
    label: "Expense claims",
    line: "Staff claim money back, you approve it and pay it.",
  },
  appraisals: {
    label: "Appraisals",
    line: "Scored reviews inside an appraisal period, on top of shared goals.",
  },
  hiring: {
    label: "Hiring",
    line: "Post a role, track candidates, send an offer.",
  },
  attendance: {
    label: "Attendance",
    line: "A clock-in button, today's roster, and a calendar of who came in.",
  },
  /* The three below hide fields on an employee record rather than screens, and
     their lines say what you lose rather than what they are — because that is
     the question somebody switching one off is actually asking. */
  taxSetup: {
    label: "Tax details",
    line: "Ask for a PAYE state, a TIN and declared rent. Off means payslips show no PAYE.",
  },
  pensionSetup: {
    label: "Pension and NHF",
    line: "Ask for an RSA PIN, a pension provider and an NHF number. Off means no pension is deducted or remitted.",
  },
  bankDetails: {
    label: "Bank accounts",
    line: "Ask for a bank and an account number. Off means you pay people some other way.",
  },
  /* Depth inside appraisals rather than a screen of its own. The line names the
     situation rather than the mechanism: nobody searches for "matrix
     management", and everybody recognises "two managers judging one person". */
  multiAppraiser: {
    label: "More than one appraiser per person",
    line: "For people judged by a project lead or another department's manager as well as their own. Each appraiser gets a share of the mark.",
  },
};

/**
 * The one sentence a person needs before they skip a group on the form.
 *
 * Deliberately harsher than `FEATURE_COPY.line`: that one describes a setting,
 * this one is read at the moment somebody is deciding not to fill something in,
 * and the consequence lands on a payslip somebody else receives. Kept here
 * rather than in the form so the Settings page and the form cannot describe the
 * same choice differently.
 */
export const SKIP_CONSEQUENCE: Record<
  (typeof RECORD_FIELD_KEYS)[number],
  string
> = {
  taxSetup:
    "Skip this and their payslip will not show PAYE, and nothing is filed to a state revenue service until you add it.",
  pensionSetup:
    "Skip this and no pension is deducted or remitted for them, and the payroll run will hold them back until an RSA PIN is added.",
  bankDetails:
    "Skip this and payroll has nowhere to send the money — you can add the account before the run.",
};

/** Every band, with the wording the wizard uses, for the settings page select. */
export const HEADCOUNT_LABELS: Record<HeadcountBand, string> = {
  UNDER_10: "Fewer than 10",
  FROM_10_TO_50: "10 to 50",
  FROM_50_TO_250: "50 to 250",
  OVER_250: "More than 250",
};

/* --------------------------------------------------------- the demo fallback */

/**
 * A mirror of the served question set, for demonstrations with no database.
 *
 * The wording, order and flag mappings are the API's to change. This exists so
 * the wizard — the second thing a customer sees, and our clearest usability
 * argument — can be shown on a laptop in a room with no backend. It is read
 * only when `useSession().isConnected` is false.
 */
const DEMO_QUESTIONS: ApiWizardQuestion[] = DEMO_ENABLED ? [
  {
    id: "headcount",
    step: 1,
    question: "How many people do you pay?",
    help: "Everyone on the payroll, full-time or not.",
    options: [
      {
        value: "UNDER_10",
        label: "Fewer than 10",
        sets: { headcountBand: "UNDER_10", departments: false, grades: false },
      },
      {
        value: "FROM_10_TO_50",
        label: "10 to 50",
        sets: {
          headcountBand: "FROM_10_TO_50",
          departments: true,
          grades: false,
        },
      },
      {
        value: "FROM_50_TO_250",
        label: "50 to 250",
        sets: {
          headcountBand: "FROM_50_TO_250",
          departments: true,
          grades: true,
        },
      },
      {
        value: "OVER_250",
        label: "More than 250",
        sets: { headcountBand: "OVER_250", departments: true, grades: true },
      },
    ],
  },
  {
    id: "shifts",
    step: 2,
    question: "Does anyone work shifts or nights?",
    help: "A rota, night duty, or weekend cover.",
    options: [
      { value: "yes", label: "Yes", sets: { shifts: true } },
      { value: "no", label: "No", sets: { shifts: false } },
    ],
  },
  {
    id: "loans",
    step: 3,
    question: "Do you give staff loans or salary advances?",
    help: "Money you recover from their salary later.",
    options: [
      { value: "yes", label: "Yes", sets: { loans: true } },
      { value: "no", label: "No", sets: { loans: false } },
    ],
  },
  {
    id: "expenses",
    step: 4,
    question: "Do staff claim money back from you?",
    help: "Transport, airtime, anything they paid for and you refund.",
    options: [
      { value: "yes", label: "Yes", sets: { expenses: true } },
      { value: "no", label: "No", sets: { expenses: false } },
    ],
  },
  {
    id: "appraisals",
    step: 5,
    question: "Do you run formal appraisals?",
    help: "Scored reviews inside an appraisal period, not just shared goals.",
    options: [
      { value: "yes", label: "Yes", sets: { appraisals: true } },
      { value: "no", label: "No", sets: { appraisals: false } },
    ],
  },
  /* The last two write the payroll engine's settings rather than a feature flag,
     so their options carry `payroll` and their "No" carries the consequence. See
     `PayrollDeductions` in `lib/api/setup.ts` for why that is a second patch. */
  {
    id: "paye",
    step: 6,
    question: "Do you deduct PAYE from your staff\u2019s pay?",
    help: "Income tax you take off salaries and pay to the state tax office.",
    options: [
      { value: "yes", label: "Yes", sets: {}, payroll: { payeEnabled: true } },
      {
        value: "no",
        label: "No \u2014 staff handle their own tax",
        sets: {},
        payroll: { payeEnabled: false },
        consequence:
          "No tax comes off anybody\u2019s pay, payslips show no PAYE at all and " +
          "there is no monthly schedule to file. Under the Personal Income Tax " +
          "Act it is the employer who has to deduct and remit, so keep your " +
          "staff\u2019s own evidence of filing. You can switch this on later.",
      },
    ],
  },
  {
    id: "pension",
    step: 7,
    question: "Do you run a pension scheme for your staff?",
    help: "Contributions to a PFA \u2014 8% from them, 10% from you, or more.",
    options: [
      { value: "yes", label: "Yes", sets: {}, payroll: { pensionEnabled: true } },
      {
        value: "no",
        label: "No \u2014 we have no scheme",
        sets: {},
        payroll: { pensionEnabled: false },
        consequence:
          "Nothing is deducted for pension, nothing is added on top, and there " +
          "is no schedule for a fund administrator. The Pension Reform Act 2014 " +
          "requires a scheme once you employ 15 or more people. You can switch " +
          "this on later.",
      },
    ],
  },
  {
    id: "attendance",
    step: 8,
    question: "Do you want staff to check in and out on ApproveHR?",
    help: "A clock-in button, today's roster, and a calendar of who came in.",
    options: [
      { value: "yes", label: "Yes", sets: { attendance: true } },
      {
        value: "no",
        label: "No — we do not track attendance",
        sets: { attendance: false },
        consequence:
          "Nobody sees a check-in button, and there is no roster or attendance " +
          "calendar. Payroll already does not deduct for unattended days at a " +
          "company that has never used this, so switching it off changes what " +
          "staff see, not what they are paid. You can switch this on later.",
      },
    ],
  },
  {
    id: "roles",
    step: 9,
    question: "Any other roles this company needs?",
    help:
      "Owner, Administrator, HR manager, Payroll analyst, Payroll officer, " +
      "Finance approver, Line manager and Employee are already set up.",
    options: [{ value: "continue", label: "Continue", sets: {} }],
  },
] : [];

const DEMO_KEY = "approvehr.features.demo";
/* 2: `deductions` arrived with the two payroll questions. A version 1 payload is
   dropped rather than left to render `undefined.payeEnabled`. */
const DEMO_VERSION = 2;

type DemoState = {
  flags: FeatureFlags;
  headcountBand: HeadcountBand;
  setupStep: number;
  setupCompletedAt: string | null;
  /**
   * What the demo company deducts.
   *
   * A demo answer to the two payroll questions has to persist, or the wizard
   * cannot mark the option the company is already on and "Skip this one" stops
   * being honest. It moves no figure anywhere else: the demo payslips are fixed
   * illustrative rows generated by the API's engine, so a local switch does not
   * and must not change them — `/settings/payroll` says so in those words.
   */
  deductions: PayrollDeductions;
};

/** The band the seed company is actually in. Ten people is ten people. */
function seedBand(): HeadcountBand {
  const size = EMPLOYEES.length;
  if (size < 10) return "UNDER_10";
  if (size <= 50) return "FROM_10_TO_50";
  if (size <= 250) return "FROM_50_TO_250";
  return "OVER_250";
}

function optionFor(questionId: string, value: string) {
  return DEMO_QUESTIONS.find((q) => q.id === questionId)?.options.find(
    (option) => option.value === value,
  );
}

function applySets(state: DemoState, sets: FeaturePatch): DemoState {
  const flags = { ...state.flags };
  for (const key of FEATURE_KEYS) {
    const value = sets[key];
    if (value !== undefined) flags[key] = value;
  }
  return {
    ...state,
    flags,
    headcountBand: sets.headcountBand ?? state.headcountBand,
  };
}

/**
 * Applying a patch the way the server does it, without a second copy of the
 * rule: a named band applies that band's own option first, then the explicit
 * patch lands on top. So `{ headcountBand: "UNDER_10" }` switches departments
 * and grades off, and `{ headcountBand: "UNDER_10", departments: true }` keeps
 * departments — because the caller said so.
 */
function demoApply(state: DemoState, patch: FeaturePatch): DemoState {
  let next = state;
  if (patch.headcountBand) {
    const option = optionFor("headcount", patch.headcountBand);
    if (option) next = applySets(next, option.sets);
  }
  next = applySets(next, patch);

  /* The one dependency the server enforces, mirrored so the demo does not teach
     a shape the connected product refuses. Appraisals off takes the mapping off
     with it; the *refusal* half (turning the mapping on while appraisals are
     off) is the API's and is not re-implemented, because the settings page
     cannot offer that switch while appraisals are off in the first place. */
  if (!next.flags.appraisals && next.flags.multiAppraiser) {
    next = { ...next, flags: { ...next.flags, multiAppraiser: false } };
  }
  return next;
}

/**
 * The demo's starting point: the seed company's real size, run through the same
 * question the wizard asks. Derived rather than declared, so the demo cannot
 * claim a shape its own data contradicts.
 */
function demoDefaults(): DemoState {
  const base: DemoState = {
    flags: BASE_FLAGS,
    headcountBand: "UNDER_10",
    setupStep: 0,
    setupCompletedAt: null,
    /* All three on, the same default the API ships, for the same reason: a
       company that has answered nothing deducts what the law expects. */
    deductions: { payeEnabled: true, pensionEnabled: true, nhfEnabled: true },
  };
  return demoApply(base, { headcountBand: seedBand() });
}

function readDemo(): DemoState {
  const defaults = demoDefaults();
  try {
    const raw = window.localStorage.getItem(DEMO_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as { v?: number; data?: Partial<DemoState> };
    if (parsed.v !== DEMO_VERSION || !parsed.data) return defaults;
    return {
      ...defaults,
      ...parsed.data,
      flags: { ...defaults.flags, ...parsed.data.flags },
      deductions: { ...defaults.deductions, ...parsed.data.deductions },
    };
  } catch {
    return defaults;
  }
}

function writeDemo(state: DemoState): DemoState {
  try {
    window.localStorage.setItem(
      DEMO_KEY,
      JSON.stringify({ v: DEMO_VERSION, data: state }),
    );
  } catch {
    /* Private browsing, or storage full. The in-memory cache still holds for
       this session, so the demo stays consistent — it just will not survive a
       reload. There is nothing useful to tell the user about that mid-wizard. */
  }
  return state;
}

/* ------------------------------------------------------------ the singleton */

let cache: State = LOADING;
/** Which session this cache belongs to. A different org must not inherit it. */
let loadedFor: string | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
  cache = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function fromApi(features: ApiFeatures): State {
  return {
    /* The payroll settings row is the authority connected — see the field. */
    deductions: null,
    flags: {
      departments: features.departments,
      grades: features.grades,
      shifts: features.shifts,
      loans: features.loans,
      expenses: features.expenses,
      appraisals: features.appraisals,
      hiring: features.hiring,
      attendance: features.attendance,
      taxSetup: features.taxSetup,
      pensionSetup: features.pensionSetup,
      bankDetails: features.bankDetails,
      multiAppraiser: features.multiAppraiser,
    },
    headcountBand: features.headcountBand,
    setupStep: features.setupStep,
    totalSteps: features.totalSteps,
    setupCompletedAt: features.setupCompletedAt,
    setupRequired: features.setupRequired,
    loading: false,
    error: null,
    source: "api",
  };
}

function fromDemo(demo: DemoState): State {
  return {
    deductions: demo.deductions,
    flags: demo.flags,
    headcountBand: demo.headcountBand,
    setupStep: demo.setupStep,
    totalSteps: DEMO_QUESTIONS.length,
    setupCompletedAt: demo.setupCompletedAt,
    setupRequired: demo.setupCompletedAt === null,
    loading: false,
    error: null,
    source: "demo",
  };
}

/**
 * Load once per session key.
 *
 * The key is `api:<organizationId>` or `demo`, so signing out of one company
 * and into another reloads rather than showing the previous company's nav.
 */
async function ensure(key: string, force = false): Promise<void> {
  if (!force && loadedFor === key) return;
  if (inflight) return inflight;

  loadedFor = key;
  if (!cache.loading) set({ ...cache, loading: true, error: null });

  inflight = (async () => {
    try {
      if (key === "demo") {
        set(fromDemo(readDemo()));
        return;
      }
      set(fromApi(await setup.features()));
    } catch (error) {
      /* A failed load must not invent flags. The last known state stays, with a
         message beside it — a nav that guesses is worse than one that is stale. */
      set({
        ...cache,
        loading: false,
        error:
          error instanceof ApiError
            ? error.message
            : "Could not read which features are on.",
      });
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Writes straight into the cache, so every screen sees it at once. */
function commit(features: ApiFeatures) {
  set(fromApi(features));
}

/* --------------------------------------------------------------------- hooks */

function useLoadedState(): State {
  const { isConnected, isLoading, user } = useSession();
  const state = useSyncExternalStore(subscribe, () => cache, () => LOADING);

  const key = isConnected ? `api:${user?.organizationId ?? "self"}` : "demo";

  useEffect(() => {
    /* Nothing to load until the session knows whether it is signed in — loading
       demo first and API second would flash a different nav. */
    if (isLoading) return;
    void ensure(key);
  }, [key, isLoading]);

  return state;
}

/**
 * The flags, flat.
 *
 * `const features = useFeatures(); features.loans` — that shape is the point:
 * the sidebar filters items with it, and a filter should not have to reach
 * through a wrapper. `headcountBand` rides along because "how many people do
 * you pay" is the answer that decides two of the flags, and screens legitimately
 * want to know it.
 *
 * Safe to call anywhere, including during the first render on the server: it
 * returns the smallest-product defaults with `loading: true` and never throws.
 */
export function useFeatures(): FeatureFlags & {
  headcountBand: HeadcountBand;
  setupRequired: boolean;
  setupStep: number;
  totalSteps: number;
  setupCompletedAt: string | null;
  loading: boolean;
  error: string | null;
  /** `"api"` or `"demo"` once loaded. Screens that say which mode they are in. */
  source: Source;
  reload: () => void;
} {
  const state = useLoadedState();
  const { isConnected, user } = useSession();

  const reload = useCallback(() => {
    void ensure(isConnected ? `api:${user?.organizationId ?? "self"}` : "demo", true);
  }, [isConnected, user?.organizationId]);

  return {
    ...state.flags,
    headcountBand: state.headcountBand,
    setupRequired: state.setupRequired,
    setupStep: state.setupStep,
    totalSteps: state.totalSteps,
    setupCompletedAt: state.setupCompletedAt,
    loading: state.loading,
    error: state.error,
    source: state.source,
    reload,
  };
}

/**
 * The settings page's hook: the same state, plus the write.
 *
 * `editable` is false when the API is connected and this account has no
 * `MANAGE_SETTINGS` — the reads are open to everybody because the nav is built
 * from them, but reshaping the product for the whole company is not.
 */
export function useFeatureSettings() {
  const state = useLoadedState();
  const { isConnected, can } = useSession();
  const [saving, setSaving] = useState<FeatureKey | "headcountBand" | null>(null);

  const editable = !isConnected || can("MANAGE_SETTINGS");

  const save = useCallback(
    async (
      patch: FeaturePatch,
      field: FeatureKey | "headcountBand",
    ): Promise<FeatureFlags & { headcountBand: HeadcountBand }> => {
      setSaving(field);
      try {
        if (!isConnected) {
          const next = writeDemo(demoApply(readDemo(), patch));
          set(fromDemo(next));
          return { ...next.flags, headcountBand: next.headcountBand };
        }
        const features = await setup.updateFeatures(patch);
        commit(features);
        return {
          departments: features.departments,
          grades: features.grades,
          shifts: features.shifts,
          loans: features.loans,
          expenses: features.expenses,
          appraisals: features.appraisals,
          hiring: features.hiring,
          attendance: features.attendance,
          taxSetup: features.taxSetup,
          pensionSetup: features.pensionSetup,
          bankDetails: features.bankDetails,
          multiAppraiser: features.multiAppraiser,
          headcountBand: features.headcountBand,
        };
      } finally {
        setSaving(null);
      }
    },
    [isConnected],
  );

  return {
    flags: state.flags,
    headcountBand: state.headcountBand,
    loading: state.loading,
    error: state.error,
    source: state.source,
    setupRequired: state.setupRequired,
    editable,
    saving,
    /** Returns the state the server settled on, which may not be what was sent. */
    setFeature: useCallback(
      (key: FeatureKey, value: boolean) => {
        const patch: FeaturePatch = {};
        patch[key] = value;
        return save(patch, key);
      },
      [save],
    ),
    setHeadcountBand: useCallback(
      (headcountBand: HeadcountBand) => save({ headcountBand }, "headcountBand"),
      [save],
    ),
  };
}

/* -------------------------------------------------------------- the wizard */

type WizardState = {
  questions: ApiWizardQuestion[];
  /** Answered up to here. `0` means nothing answered. */
  step: number;
  setupCompletedAt: string | null;
  /**
   * What this company deducts, so an option can be marked "Now".
   *
   * **Null means unknown, not "everything on".** A company with no settings row
   * has not answered, and marking "Yes" from a default would tell somebody they
   * had answered a question nobody asked them.
   */
  deductions: PayrollDeductions | null;
  loading: boolean;
  error: string | null;
};

/**
 * What the demo company deducts, or null.
 *
 * Null connected — `useDeductionSwitches` reads the real thing from
 * `GET /payroll/settings` there — and null while the store is still loading.
 * Every caller has to treat null as "no local answer applies", never as "all
 * three off": an absence and a zero are different claims, and on this one they
 * are the difference between a payslip with tax on it and one without.
 */
export function useDemoDeductions(): PayrollDeductions | null {
  return useLoadedState().deductions;
}

/**
 * The wizard, fetched.
 *
 * Only mounted on `/setup`, so this one is a plain hook rather than a singleton:
 * one screen, one request. The questions are the server's — see the note at the
 * top of `lib/api/setup.ts` for why none of them are written here.
 */
export function useWizard() {
  const { isConnected, isLoading, can } = useSession();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<WizardState>({
    questions: [],
    step: 0,
    setupCompletedAt: null,
    deductions: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;

    void (async () => {
      if (!isConnected) {
        const demo = readDemo();
        if (cancelled) return;
        setState({
          questions: DEMO_QUESTIONS,
          step: demo.setupStep,
          setupCompletedAt: demo.setupCompletedAt,
          deductions: demo.deductions,
          loading: false,
          error: null,
        });
        return;
      }
      try {
        const wizard = await setup.wizard();
        if (cancelled) return;
        setState({
          questions: wizard.questions,
          step: wizard.step,
          setupCompletedAt: wizard.setupCompletedAt,
          deductions: wizard.payroll,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (cancelled) return;
        setState((current) => ({
          ...current,
          loading: false,
          error:
            error instanceof ApiError
              ? error.message
              : "The questions did not load. Try again in a moment.",
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, isLoading, attempt]);

  const answer = useCallback(
    async (questionId: string, value: string): Promise<void> => {
      if (!isConnected) {
        const option = optionFor(questionId, value);
        const question = DEMO_QUESTIONS.find((q) => q.id === questionId);
        if (!option || !question) return;
        const current = readDemo();
        const next = writeDemo({
          ...demoApply(current, option.sets),
          /* The two payroll questions write here rather than into `flags`. Same
             split as the API, so the demo cannot answer a question the connected
             product answers differently. */
          deductions: { ...current.deductions, ...option.payroll },
          setupStep: Math.max(current.setupStep, question.step),
        });
        set(fromDemo(next));
        setState((s) => ({ ...s, step: next.setupStep, deductions: next.deductions }));
        return;
      }
      const result = await setup.answer(questionId, value);
      commit(result);
      setState((s) => ({
        ...s,
        step: result.setupStep,
        deductions: result.payroll,
      }));
    },
    [isConnected],
  );

  /**
   * Finish.
   *
   * Returns what was seeded when the API did the seeding, and `null` in demo
   * mode — where nothing was created, and saying otherwise would be a lie about
   * the one part of setup that does real work.
   */
  const complete = useCallback(async (): Promise<ApiSeeded | null> => {
    if (!isConnected) {
      const current = readDemo();
      const next = writeDemo({
        ...current,
        setupStep: DEMO_QUESTIONS.length,
        setupCompletedAt: current.setupCompletedAt ?? new Date().toISOString(),
      });
      set(fromDemo(next));
      setState((s) => ({ ...s, setupCompletedAt: next.setupCompletedAt }));
      return null;
    }
    const result = await setup.complete();
    commit(result);
    setState((s) => ({ ...s, setupCompletedAt: result.setupCompletedAt }));
    return result.seeded;
  }, [isConnected]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setAttempt((n) => n + 1);
  }, []);

  return {
    ...state,
    /** False when this account may read the questions but not answer them. */
    canAnswer: !isConnected || can("MANAGE_SETTINGS"),
    answer,
    complete,
    reload,
  };
}
