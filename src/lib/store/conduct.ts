"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { BadgeTone } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  conductApi,
  type AcknowledgeActionBody,
  type ApiAcknowledgementRow,
  type ApiAction,
  type ApiConductRecord,
  type ApiMyPolicies,
  type ApiPolicy,
  type ApiPolicyDetail,
  type ApiPublishResult,
  type CreateActionBody,
  type CreatePolicyBody,
  type DisciplinaryLevel,
  type PolicyListParams,
  type PublishPolicyBody,
  type UpdateActionBody,
  type UpdatePolicyBody,
} from "@/lib/api/conduct";
import { EMPLOYEES } from "@/lib/mock/people";
import { TODAY } from "@/lib/today";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";
import { useRevalidation } from "@/lib/revalidate";

/**
 * The handbook, and the register of warnings.
 *
 * ## What demo mode is allowed to do, and why the answers differ
 *
 * Three kinds of write live in this module and they get three different demo
 * answers, which is a decision rather than an inconsistency:
 *
 * | Write | Demo | Why |
 * |---|---|---|
 * | Accepting a policy | **works**, persisted here | It is a decision about your own reading. Nothing downstream depends on it, and a handbook you cannot accept does not demonstrate a handbook — this is the highest-traffic screen in the module. |
 * | Publishing or editing a section | **refuses** | Publishing asks everybody in the company to accept something. A handbook written into one browser would be a company policy nobody else can ever see. |
 * | Recording or confirming a warning | **refuses** | A disciplinary record is a legal document. Keeping one in browser storage is the worst possible fake: it would look like evidence and be worth nothing. |
 *
 * `lib/store/departments.ts` refuses everything for the same reason the middle
 * row does, and `lib/store/notifications.ts` allows everything for the same
 * reason the top row does. This module needed both rules, so it states them.
 *
 * ## What persists in demo mode
 *
 * Only a diff: which seeded policy each demo sign-in has accepted, and at which
 * version. The sections themselves are regenerated from `DEMO_POLICIES` on
 * every load, so changing the seed never strands an unrelated acceptance — the
 * "overrides are a patch, not a copy" rule the employee store established.
 *
 * ## Reads are audited on the API, so nothing here polls
 *
 * Every disciplinary read writes an audit event before answering. An interval
 * refresh would fill the trail with reads nobody made, and that trail is what
 * answers "who has been looking at this person's warnings". These hooks load on
 * mount and reload after a write. Nowhere else.
 */

/* ==========================================================================
 * Words for things
 * ======================================================================== */

/**
 * The five levels, in escalating order.
 *
 * Sentence case rather than the API's lowercase `levelLabel`, because these
 * appear as a badge and in a picker where a lowercase label reads like a typo.
 * The API's version is the one to use mid-sentence.
 */
export const LEVEL_LABEL: Record<DisciplinaryLevel, string> = {
  VERBAL: "Verbal warning",
  WRITTEN: "Written warning",
  FINAL_WRITTEN: "Final written warning",
  SUSPENSION: "Suspension",
  DISMISSAL: "Dismissal",
};

/** Escalating, so a picker and a list read in the same order. */
export const LEVEL_ORDER: DisciplinaryLevel[] = [
  "VERBAL",
  "WRITTEN",
  "FINAL_WRITTEN",
  "SUSPENSION",
  "DISMISSAL",
];

/**
 * One line per level, for the picker.
 *
 * Says what the level *is* in the working life of a small company — not what
 * the field means. Somebody choosing between "Written" and "Final written" is
 * making a decision about a person, and the difference has to be legible
 * without an HR qualification.
 */
export const LEVEL_HINT: Record<DisciplinaryLevel, string> = {
  VERBAL: "You spoke to them. Nothing goes in a letter.",
  WRITTEN: "A letter on file. The normal first formal step.",
  FINAL_WRITTEN: "The last step before dismissal.",
  SUSPENSION: "Sent home while something is looked into.",
  DISMISSAL: "Employment ended.",
};

/** Colour rises with the level. Never the only carrier — the label says it too. */
export const LEVEL_TONE: Record<DisciplinaryLevel, BadgeTone> = {
  VERBAL: "neutral",
  WRITTEN: "warning",
  FINAL_WRITTEN: "warning",
  SUSPENSION: "danger",
  DISMISSAL: "danger",
};

/** `2026-08-19` → `19 Aug 2026`. Long enough to be unambiguous on a legal record. */
export function dayLabel(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * "22 of 31 accepted", and the honest variants of it.
 *
 * A draft, a withdrawn section and a reference section all have nothing
 * outstanding, and printing "0 of 31 accepted" against them would read as a
 * failure rather than as a category. One function so five call sites cannot
 * each decide differently.
 */
export function acceptanceLabel(policy: ApiPolicy): string {
  if (!policy.requiresAcknowledgement) return "Read only: no acceptance needed";
  if (!policy.published) return "Not published yet";
  if (policy.archived) return "Withdrawn";
  const staff = policy.acceptedCount + policy.outstandingCount;
  if (staff === 0) return "Nobody on the payroll to ask";
  return `${policy.acceptedCount} of ${staff} accepted`;
}

/** Where a warning stands today, in the words the panel prints. */
export function actionStatus(action: ApiAction): {
  label: string;
  tone: BadgeTone;
} {
  if (action.disputedAt) return { label: "Disagreed with", tone: "danger" };
  if (action.awaitingConfirmation) {
    return { label: "Not confirmed yet", tone: "warning" };
  }
  if (!action.active) return { label: "Lapsed", tone: "neutral" };
  return { label: "Confirmed", tone: "success" };
}

/**
 * How long a warning has left, or that it has none.
 *
 * `expiresOn` is the last day it counts, so one expiring today is live today
 * and lapsed tomorrow. That off-by-one is worth getting right in the copy: it
 * decides whether somebody is on a final warning at a meeting this afternoon.
 */
export function lapseLabel(action: ApiAction): string {
  if (action.neverLapses) return "Never lapses";
  if (!action.expiresOn) return "Never lapses";
  return action.active
    ? `Counts until ${dayLabel(action.expiresOn)}`
    : `Lapsed ${dayLabel(action.expiresOn)}`;
}

/* ==========================================================================
 * Demo data
 * ======================================================================== */

/**
 * Current staff, for the demo's denominator.
 *
 * `inactive` is the seed's nearest thing to a leaver, and the API excludes
 * leavers from both halves of the fraction so that "18 of 20" adds up. Counting
 * them here and not there would make the demo and the product disagree about
 * whether a policy is fully accepted.
 */
const DEMO_STAFF = EMPLOYEES.filter((e) => e.status !== "inactive").length;

type DemoPolicy = {
  id: string;
  title: string;
  category: string;
  version: number;
  publishedAt: string;
  requiresAcknowledgement: boolean;
  /** How many colleagues have accepted the version in force. */
  acceptedBase: number;
  body: string;
};

/*
 * A handbook a Nigerian small business would actually have, at the length one
 * of its sections actually runs to. Two of them are deliberately awkward: the
 * expenses section is on version 3 and still short of everybody, and the code
 * of conduct is reference-only, so the screen has to render both the chase case
 * and the "nothing to chase" case without being told.
 */
const DEMO_POLICIES: DemoPolicy[] = DEMO_ENABLED ? [
  {
    id: "pol-01",
    title: "Staff handbook",
    category: "Company",
    version: 2,
    publishedAt: "2026-06-01",
    requiresAcknowledgement: true,
    acceptedBase: 8,
    body:
      "Working hours are 8:30am to 5:00pm, Monday to Friday, with an hour for lunch. " +
      "If you cannot get in, tell your manager before 9:00am: a message is fine.\n\n" +
      "Salaries are paid on the 25th of each month, or the last working day before " +
      "it when the 25th falls on a weekend or a public holiday.\n\n" +
      "You are entitled to 20 working days of annual leave a year, booked through " +
      "ApproveHR and approved by your manager. Unused days do not carry into a new " +
      "year beyond five.",
  },
  {
    id: "pol-02",
    title: "Expenses and claims",
    category: "Money",
    version: 3,
    publishedAt: "2026-08-04",
    requiresAcknowledgement: true,
    acceptedBase: 4,
    body:
      "Keep the receipt. A claim without one cannot be paid, however small.\n\n" +
      "File a claim within 30 days of spending the money. Claims are approved by " +
      "your manager and paid with the next month's salary.\n\n" +
      "Client entertainment above ₦50,000 needs approval before you spend it, not " +
      "after.",
  },
  {
    id: "pol-03",
    title: "Phones, laptops and company data",
    category: "IT",
    version: 1,
    publishedAt: "2026-03-17",
    requiresAcknowledgement: true,
    acceptedBase: 9,
    body:
      "Company laptops and phones stay with the company. You hand them back on " +
      "your last day, in working order.\n\n" +
      "Do not keep customer or staff records on a personal device, and do not " +
      "share your sign-in with anybody, including a colleague covering for you.\n\n" +
      "Tell us the same day if a device is lost or stolen. Nobody is in trouble " +
      "for losing a laptop; they are in trouble for not saying so.",
  },
  {
    id: "pol-04",
    title: "Code of conduct",
    category: "Company",
    version: 1,
    publishedAt: "2026-01-08",
    requiresAcknowledgement: false,
    acceptedBase: 0,
    body:
      "Treat colleagues, customers and suppliers with respect. Harassment, " +
      "discrimination and bullying are grounds for dismissal.\n\n" +
      "Declare anything that could look like a conflict of interest (a supplier" +
      "you are related to, a second job with a competitor) in writing, to your" +
      "manager.\n\n" +
      "This section is here to read. There is nothing to accept.",
  },
] : [];

/**
 * Demo disciplinary history.
 *
 * Deliberately built so the panel's arithmetic has something to be right about:
 * Chidi carries a lapsed verbal and a live written, so "2 total, 1 active" is a
 * real answer rather than a tautology, and Ngozi's is recorded but unconfirmed,
 * which is the state the chase copy exists for.
 */
type DemoAction = {
  id: string;
  employeeId: string;
  level: DisciplinaryLevel;
  incidentOn: string;
  summary: string;
  detail: string;
  outcome: string | null;
  issuedById: string;
  issuedAt: string;
  expiresOn: string | null;
  acknowledgedAt: string | null;
  disputedAt: string | null;
  disputeNote: string | null;
};

const DEMO_ACTIONS: DemoAction[] = DEMO_ENABLED ? [
  {
    id: "da-01",
    employeeId: "p-03",
    level: "VERBAL",
    incidentOn: "2026-02-10",
    summary: "Late three times in one week without telling anyone.",
    detail:
      "Arrived after 10:00am on 4, 5 and 9 February. No message to the team on " +
      "any of the three days.",
    outcome: "Agreed to message the team before 9:00am when running late.",
    issuedById: "p-01",
    issuedAt: "2026-02-11T09:20:00.000Z",
    expiresOn: "2026-07-10",
    acknowledgedAt: "2026-02-11T14:02:00.000Z",
    disputedAt: null,
    disputeNote: null,
  },
  {
    id: "da-02",
    employeeId: "p-03",
    level: "WRITTEN",
    incidentOn: "2026-07-22",
    summary: "Deployed to production on a Friday evening without a review.",
    detail:
      "Change went out at 6:40pm with no approval on the pull request. The " +
      "payments page was down for 25 minutes.",
    outcome: "Deployment access now needs a second approver until October.",
    issuedById: "p-01",
    issuedAt: "2026-07-23T10:05:00.000Z",
    expiresOn: "2027-01-22",
    acknowledgedAt: "2026-07-23T16:30:00.000Z",
    disputedAt: null,
    disputeNote: null,
  },
  {
    id: "da-03",
    employeeId: "p-04",
    level: "WRITTEN",
    incidentOn: "2026-08-11",
    summary: "Client work promised for the 7th was delivered on the 11th.",
    detail: "Client chased twice. No handover was arranged before annual leave.",
    outcome: null,
    issuedById: "p-02",
    issuedAt: "2026-08-12T08:45:00.000Z",
    expiresOn: "2027-02-11",
    acknowledgedAt: null,
    disputedAt: null,
    disputeNote: null,
  },
] : [];

const nameOf = (id: string): { name: string; employeeNo: string; jobTitle: string } => {
  const employee = EMPLOYEES.find((e) => e.id === id);
  return employee
    ? {
        name: `${employee.firstName} ${employee.lastName}`,
        employeeNo: employee.employeeNo,
        jobTitle: employee.jobTitle,
      }
    : { name: "Unknown", employeeNo: "—", jobTitle: "—" };
};

/** Same rule as the API: the last day it counts, compared at UTC midnight. */
const stillCounts = (expiresOn: string | null): boolean =>
  expiresOn === null || new Date(expiresOn).getTime() >= new Date(TODAY).getTime();

function demoAction(row: DemoAction): ApiAction {
  const subject = nameOf(row.employeeId);
  const issuer = nameOf(row.issuedById);
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: subject.name,
    employeeNo: subject.employeeNo,
    level: row.level,
    levelLabel: LEVEL_LABEL[row.level].toLowerCase(),
    incidentOn: row.incidentOn,
    summary: row.summary,
    detail: row.detail,
    outcome: row.outcome,
    issuedById: row.issuedById,
    issuedByName: issuer.name,
    issuedAt: row.issuedAt,
    expiresOn: row.expiresOn,
    neverLapses: row.expiresOn === null,
    active: stillCounts(row.expiresOn),
    acknowledgedAt: row.acknowledgedAt,
    disputedAt: row.disputedAt,
    disputeNote: row.disputeNote,
    awaitingConfirmation: row.acknowledgedAt === null,
    createdAt: row.issuedAt,
    updatedAt: row.issuedAt,
  };
}

/* ------------------------------------------------- what this browser accepted */

type AcceptanceState = {
  /** Keyed `employeeId|policyId`, so switching demo sign-in does not inherit. */
  accepted: Record<string, { version: number; at: string }>;
};

const store = createPersistedState<AcceptanceState>({
  key: "approvehr.conduct.store",
  empty: { accepted: {} },
});

const acceptanceKey = (employeeId: string, policyId: string) =>
  `${employeeId}|${policyId}`;

/** Reads the demo acceptance diff, hydration-safe. */
function useAcceptances(): AcceptanceState {
  return useSyncExternalStore(store.subscribe, store.read, store.getServerSnapshot);
}

function demoPolicy(
  row: DemoPolicy,
  acceptedByMe: boolean,
): ApiPolicy & { body: string } {
  const chased = row.requiresAcknowledgement;
  const accepted = chased ? Math.min(row.acceptedBase + (acceptedByMe ? 1 : 0), DEMO_STAFF) : 0;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    version: row.version,
    published: true,
    publishedAt: `${row.publishedAt}T09:00:00.000Z`,
    requiresAcknowledgement: row.requiresAcknowledgement,
    archived: false,
    acceptedCount: accepted,
    outstandingCount: chased ? Math.max(DEMO_STAFF - accepted, 0) : 0,
    fullyAccepted: chased ? accepted >= DEMO_STAFF : true,
    createdAt: `${row.publishedAt}T09:00:00.000Z`,
    updatedAt: `${row.publishedAt}T09:00:00.000Z`,
    body: row.body,
  };
}

/** The one refusal message, so every demo path says the same thing. */
function refuse(what: string): never {
  throw new ApiError(0, "offline", what);
}

const PUBLISH_REFUSAL =
  "Publishing a section asks everyone in the company to accept it. That needs the API: a handbook written into this browser would reach nobody.";

const RECORD_REFUSAL =
  "A warning is a legal record. Saving one needs the API, so it lands somewhere other than this browser.";

/* ==========================================================================
 * The handbook
 * ======================================================================== */

type PolicyRows = {
  policies: ApiPolicy[];
  total: number;
  error: ApiError | null;
};

/**
 * The handbook, paged.
 *
 * `includeDrafts` and `includeArchived` are forced to false by the API for a
 * caller without `MANAGE_SETTINGS` rather than refused, so a screen can send
 * them unconditionally and an employee still sees the handbook.
 *
 * ## Why the answer is keyed by the query
 *
 * The result is stored as `{ key, rows }`, and `loading` is derived from whether
 * the stored key matches the query being asked. That buys two things at once: a
 * slow answer for a search the user has already changed cannot be rendered, and
 * there is nothing to *clear* when the query changes — so no setState runs in
 * the effect body, which this repo treats as an error rather than a warning.
 */
export function usePolicies(params: PolicyListParams = {}) {
  const { isConnected, employeeId } = useSession();
  const acceptances = useAcceptances();

  /* Serialised so the effect re-runs on a value change rather than on every
     render — an inline object literal is a new reference each time. */
  const key = JSON.stringify(params);

  const [fetched, setFetched] = useState<(PolicyRows & { key: string }) | null>(
    null,
  );
  /* Bumped by `reload`, so a write can force a re-read without this hook
     keeping a second copy of "am I loading". */
  const [tick, setTick] = useState(0);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await conductApi.policies(
          JSON.parse(key) as PolicyListParams,
          controller.signal,
        );
        if (!cancelled) {
          setFetched({
            key,
            policies: result.data,
            total: result.meta.total,
            error: null,
          });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({
          key,
          policies: [],
          total: 0,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, key, tick, revalidation]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  /* Parsed from `key` rather than closing over `params`, so the memo's
     dependency is a value and not an object literal re-created every render. */
  const demo = useMemo((): PolicyRows => {
    const parsed = JSON.parse(key) as PolicyListParams;
    const needle = parsed.q?.toLowerCase();
    const rows = DEMO_POLICIES.filter((row) => {
      if (parsed.category && row.category !== parsed.category) return false;
      if (!needle) return true;
      return (
        row.title.toLowerCase().includes(needle) ||
        row.category.toLowerCase().includes(needle) ||
        row.body.toLowerCase().includes(needle)
      );
    }).map((row) => {
      const mine = employeeId
        ? acceptances.accepted[acceptanceKey(employeeId, row.id)]
        : undefined;
      return demoPolicy(row, mine?.version === row.version);
    });
    return { policies: rows, total: rows.length, error: null };
  }, [key, acceptances, employeeId]);

  const guard = useCallback(() => {
    if (!isConnected) refuse(PUBLISH_REFUSAL);
  }, [isConnected]);

  const create = useCallback(
    async (body: CreatePolicyBody): Promise<ApiPolicyDetail> => {
      guard();
      const policy = await conductApi.createPolicy(body);
      reload();
      return policy;
    },
    [guard, reload],
  );

  const update = useCallback(
    async (id: string, body: UpdatePolicyBody): Promise<ApiPolicyDetail> => {
      guard();
      const policy = await conductApi.updatePolicy(id, body);
      reload();
      return policy;
    },
    [guard, reload],
  );

  const publish = useCallback(
    async (id: string, body: PublishPolicyBody = {}): Promise<ApiPublishResult> => {
      guard();
      const result = await conductApi.publishPolicy(id, body);
      reload();
      return result;
    },
    [guard, reload],
  );

  const matched = fetched !== null && fetched.key === key;
  const rows: PolicyRows = isConnected
    ? matched
      ? fetched
      : { policies: [], total: 0, error: null }
    : demo;

  return {
    ...rows,
    loading: isConnected && !matched,
    /** False in demo mode: sections can be read, not written. */
    editable: isConnected,
    reload,
    create,
    update,
    publish,
  };
}

/**
 * One section with its text, for the editor.
 *
 * Kept as `{ id, detail }` rather than a bare detail so the result carries the
 * id it belongs to. A slow answer for a section you have navigated away from
 * cannot then be shown, and there is nothing to clear when `id` changes — the
 * stale value simply stops matching. Clearing it in the effect body would be a
 * setState in a render path, which cascades.
 */
export function usePolicyText(id: string | null) {
  const { isConnected } = useSession();
  const [fetched, setFetched] = useState<{
    id: string;
    detail: ApiPolicyDetail | null;
    error: ApiError | null;
  } | null>(null);

  const demoBody = useMemo(() => {
    if (isConnected || !id) return null;
    const row = DEMO_POLICIES.find((p) => p.id === id);
    return row ? demoPolicy(row, false) : null;
  }, [isConnected, id]);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || !id) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const detail = await conductApi.policy(id, controller.signal);
        if (!cancelled) setFetched({ id, detail, error: null });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({
          id,
          detail: null,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, id, revalidation]);

  if (!isConnected) {
    return { policy: demoBody, loading: false, error: null as ApiError | null };
  }

  const matched = id !== null && fetched !== null && fetched.id === id;
  return {
    policy: matched ? fetched.detail : null,
    /* Derived, not tracked: we are loading exactly while a live id has no
       matching answer yet. True from the moment `id` changes, so no window
       shows the previous section's text as though it were this one's. */
    loading: id !== null && !matched,
    error: matched ? fetched.error : null,
  };
}

/**
 * Who has accepted the version in force, and who has not.
 *
 * The response is paged over **people**, so the version those rows are measured
 * against is not in it — pass the policy you already hold to the screen and read
 * `version` from there.
 */
export function useAcknowledgements(
  policyId: string | null,
  state: "all" | "accepted" | "outstanding" = "all",
) {
  const { isConnected } = useSession();
  const [fetched, setFetched] = useState<{
    key: string;
    rows: ApiAcknowledgementRow[];
    total: number;
    error: ApiError | null;
  } | null>(null);

  const key = policyId ? `${policyId}:${state}` : null;

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || !policyId || !key) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await conductApi.acknowledgements(
          policyId,
          { state, pageSize: 200 },
          controller.signal,
        );
        if (!cancelled) {
          setFetched({
            key,
            rows: result.data,
            total: result.meta.total,
            error: null,
          });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({
          key,
          rows: [],
          total: 0,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, policyId, state, key, revalidation]);

  const matched = key !== null && fetched !== null && fetched.key === key;
  return {
    rows: matched ? fetched.rows : [],
    total: matched ? fetched.total : 0,
    loading: isConnected && key !== null && !matched,
    error: matched ? fetched.error : null,
    /** False in demo mode: there is no register of other people's acceptances. */
    available: isConnected,
  };
}

/* ==========================================================================
 * The caller's own handbook
 * ======================================================================== */

const EMPTY_MINE: ApiMyPolicies = {
  outstanding: [],
  accepted: [],
  reference: [],
  counts: { outstanding: 0, accepted: 0, reference: 0 },
};

/**
 * What I still have to accept, what I have accepted, and what is there to read.
 *
 * Not paged, by design on the API: a to-do list split across pages stops being
 * one. Everybody in the company hits this after a publish, so it is the one
 * thing in the module that has to work in demo mode too.
 */
export function useMyPolicies() {
  const { isConnected, employeeId } = useSession();
  const acceptances = useAcceptances();

  const [fetched, setFetched] = useState<{
    data: ApiMyPolicies;
    error: ApiError | null;
  } | null>(null);
  const [tick, setTick] = useState(0);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await conductApi.myPolicies(controller.signal);
        if (!cancelled) setFetched({ data, error: null });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({
          data: EMPTY_MINE,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, tick, revalidation]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const demo = useMemo((): ApiMyPolicies => {
    const outstanding: ApiMyPolicies["outstanding"] = [];
    const accepted: ApiMyPolicies["accepted"] = [];
    const reference: ApiMyPolicies["reference"] = [];

    for (const row of DEMO_POLICIES) {
      const summary = {
        id: row.id,
        title: row.title,
        category: row.category,
        version: row.version,
        publishedAt: `${row.publishedAt}T09:00:00.000Z`,
      };
      if (!row.requiresAcknowledgement) {
        reference.push(summary);
        continue;
      }
      const mine = employeeId
        ? acceptances.accepted[acceptanceKey(employeeId, row.id)]
        : undefined;
      if (mine && mine.version === row.version) {
        accepted.push({ ...summary, acceptedAt: mine.at });
      } else {
        outstanding.push({
          ...summary,
          previouslyAcceptedVersion: mine ? mine.version : null,
        });
      }
    }

    return {
      outstanding,
      accepted,
      reference,
      counts: {
        outstanding: outstanding.length,
        accepted: accepted.length,
        reference: reference.length,
      },
    };
  }, [acceptances, employeeId]);

  /**
   * Accept the version in force.
   *
   * Idempotent on the API — a second press returns the first timestamp and
   * writes no second audit event — so the screen never has to guard the button
   * against a double click.
   */
  const accept = useCallback(
    async (policyId: string) => {
      if (!isConnected) {
        if (!employeeId) {
          refuse(
            "Sign in as somebody on the payroll to accept a policy. Nobody is signed in.",
          );
        }
        const row = DEMO_POLICIES.find((p) => p.id === policyId);
        if (!row) refuse("That section is not in the demo handbook.");
        const current = store.current();
        store.commit({
          accepted: {
            ...current.accepted,
            [acceptanceKey(employeeId, policyId)]: {
              version: row.version,
              at: new Date().toISOString(),
            },
          },
        });
        return;
      }
      await conductApi.acceptPolicy(policyId);
      reload();
    },
    [isConnected, employeeId, reload],
  );

  return {
    ...(isConnected ? (fetched?.data ?? EMPTY_MINE) : demo),
    loading: isConnected && fetched === null,
    error: isConnected ? (fetched?.error ?? null) : null,
    accept,
    reload,
    /** True when acceptance is recorded against a real company record. */
    onTheRecord: isConnected,
  };
}

/* ==========================================================================
 * One person's record
 * ======================================================================== */

const emptyRecord = (employeeId: string): ApiConductRecord => ({
  employee: { id: employeeId, name: "", employeeNo: "", jobTitle: "" },
  summary: {
    active: 0,
    lapsed: 0,
    total: 0,
    awaitingConfirmation: 0,
    disputed: 0,
    activeByLevel: {
      VERBAL: 0,
      WRITTEN: 0,
      FINAL_WRITTEN: 0,
      SUSPENSION: 0,
      DISMISSAL: 0,
    },
  },
  actions: [],
  total: 0,
  page: 1,
  pageSize: 25,
});

function demoRecord(employeeId: string): ApiConductRecord {
  const actions = DEMO_ACTIONS.filter((a) => a.employeeId === employeeId).map(
    demoAction,
  );
  const subject = nameOf(employeeId);
  const activeByLevel: Record<DisciplinaryLevel, number> = {
    VERBAL: 0,
    WRITTEN: 0,
    FINAL_WRITTEN: 0,
    SUSPENSION: 0,
    DISMISSAL: 0,
  };
  for (const action of actions) {
    if (action.active) activeByLevel[action.level] += 1;
  }
  const active = actions.filter((a) => a.active).length;
  return {
    employee: {
      id: employeeId,
      name: subject.name,
      employeeNo: subject.employeeNo,
      jobTitle: subject.jobTitle,
    },
    summary: {
      active,
      lapsed: actions.length - active,
      total: actions.length,
      awaitingConfirmation: actions.filter((a) => a.awaitingConfirmation).length,
      disputed: actions.filter((a) => a.disputedAt !== null).length,
      activeByLevel,
    },
    actions: [...actions].sort((a, b) => b.incidentOn.localeCompare(a.incidentOn)),
    total: actions.length,
    page: 1,
    pageSize: 25,
  };
}

/**
 * Somebody's disciplinary record: the history and the counts that go with it.
 *
 * The counts come from the API rather than being derived here, because "how
 * many active warnings" must have exactly one answer. Two screens counting the
 * lapsed ones differently is how a product comes to disagree with itself about
 * whether a person is on a final warning.
 *
 * The read is gated to the subject or `EDIT_RECORDS` — a 403 is a normal
 * outcome, not a bug, and it is returned as `error` rather than thrown so the
 * panel can say "not yours to read" instead of blanking.
 */
export function useConductRecord(employeeId: string | null) {
  const { isConnected } = useSession();

  const [fetched, setFetched] = useState<{
    id: string;
    record: ApiConductRecord | null;
    error: ApiError | null;
  } | null>(null);

  /* A tick the effect depends on, so a write can force a re-read without the
     hook keeping a second copy of "am I loading". Incrementing it is the whole
     of `reload`. */
  const [tick, setTick] = useState(0);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || !employeeId) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const record = await conductApi.record(employeeId, {}, controller.signal);
        if (!cancelled) setFetched({ id: employeeId, record, error: null });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({
          id: employeeId,
          record: null,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, employeeId, tick, revalidation]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const guard = useCallback(() => {
    if (!isConnected) refuse(RECORD_REFUSAL);
  }, [isConnected]);

  const record = useCallback(
    async (body: CreateActionBody) => {
      guard();
      const created = await conductApi.createAction(body);
      reload();
      return created;
    },
    [guard, reload],
  );

  const update = useCallback(
    async (id: string, body: UpdateActionBody) => {
      guard();
      const updated = await conductApi.updateAction(id, body);
      reload();
      return updated;
    },
    [guard, reload],
  );

  const confirm = useCallback(
    async (id: string, body: AcknowledgeActionBody = {}) => {
      guard();
      const confirmed = await conductApi.acknowledgeAction(id, body);
      reload();
      return confirmed;
    },
    [guard, reload],
  );

  const demo = useMemo(
    () => (employeeId ? demoRecord(employeeId) : null),
    [employeeId],
  );

  if (!isConnected) {
    return {
      record: demo ?? emptyRecord(employeeId ?? ""),
      loading: false,
      error: null as ApiError | null,
      editable: false,
      reload,
      recordAction: record,
      update,
      confirm,
    };
  }

  const matched =
    employeeId !== null && fetched !== null && fetched.id === employeeId;
  return {
    record: matched && fetched.record ? fetched.record : emptyRecord(employeeId ?? ""),
    /* Derived from whether a live id has a matching answer, so nothing sets
       state during a render to clear the previous person's history. */
    loading: employeeId !== null && !matched,
    error: matched ? fetched.error : null,
    editable: true,
    reload,
    recordAction: record,
    update,
    confirm,
  };
}
