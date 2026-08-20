"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  auditApi,
  isQueryableEntityType,
  isUuid,
  type AuditActor,
  type AuditEntry,
  type AuditEntryDetail,
  type AuditListParams,
  type AuditSummary,
} from "@/lib/api/audit";
import { actionLabel } from "@/lib/audit/language";
import { todayDate } from "@/lib/today";
import { useSession } from "./session";

/**
 * The audit trail, from whichever source is available.
 *
 * ## Where the demo line falls, and why it falls there
 *
 * Connected, every hook here reads the API. Demo mode reads a **fixture**, and
 * the fixture is read-only — there is nothing to write, because reading a log is
 * the only thing this module does.
 *
 * The fixture needs its reasoning stated, because an audit trail is the one
 * dataset where inventing rows is closest to inventing proof. Two facts settle
 * it:
 *
 * 1. **Demo mode records nothing.** The localStorage stores write no events, so
 *    an edit made in a demo session will not appear here however this file is
 *    written. A fixture does not hide that; an empty screen does not fix it.
 * 2. **The alternative teaches less and claims the same.** A blank timeline in
 *    a room with no database says "we did not build this". Every row here is
 *    badged "Demo data, this browser only" on screen, which is the same
 *    contract `lib/store/notifications.ts` already ships for messages that make
 *    exactly this kind of assertion about who did what.
 *
 * So: a fixture, badged, and this paragraph rather than a paragraph on screen.
 *
 * ## The fixture mirrors the API's warts on purpose
 *
 * `payroll` writes its subject type as `PayrollRun` — PascalCase, where every
 * other module writes `snake_case` — and the audit module's `entityType`
 * validator only accepts lower case. So a payroll run cannot be filtered for or
 * looked up by id, and its label resolves to the type plus a short id rather
 * than to a period. The fixture reproduces that instead of quietly writing
 * `payroll_runs`, because a demo that looks better than the product is how a
 * bug survives a demo.
 *
 * The fix is one line in the API — `"payroll_runs"` at
 * `src/modules/payroll/router.ts:68,89,104`, plus a `payroll_runs` entry in
 * `src/modules/audit/labels.ts` so the run gets a name. It is another module's
 * file, so it is reported rather than changed.
 */

/* ------------------------------------------------------------------ fixture */

/**
 * Late afternoon on the demo's day.
 *
 * `todayDate()` is midnight, so anything measured back from it lands in
 * yesterday and no row would ever group under "Today".
 */
const DEMO_NOW = new Date(todayDate().getTime() + 17 * 3_600_000);

type SeedChange = {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
  redacted?: boolean;
};

type SeedFact = { field: string; label: string; value: unknown; redacted?: boolean };

type Seed = {
  id: string;
  action: string;
  minutesAgo: number;
  actor: { id: string | null; name: string; email?: string };
  entity: { type: string; id: string | null; label: string; noun: string };
  changes?: SeedChange[];
  details?: SeedFact[];
  isRead?: boolean;
};

const GRACE = { id: "u-08", name: "Grace Effiong", email: "grace.effiong@schulltech.com" };
const TUNDE = { id: "u-02", name: "Tunde Bakare", email: "tunde.bakare@schulltech.com" };
const SYSTEM = { id: null, name: "System" };

const person = (id: string, label: string) => ({
  type: "employees",
  id,
  label,
  noun: "employee",
});

/*
 * Every row points at a record that exists in the seed data, so following one
 * to `/people/p-06` lands on a real screen — the same rule the notification
 * fixture follows. The ids are the mock ids (`p-06`), which is also why demo
 * mode never calls the API with them: they are not uuids and the API is right
 * to refuse them.
 */
const SEED: Seed[] = [
  {
    id: "ae-01",
    action: "employee.updated",
    minutesAgo: 35,
    actor: GRACE,
    entity: person("p-06", "Amara Nwachukwu (AHR-0502)"),
    changes: [
      {
        field: "bankAccount",
        label: "Bank account",
        from: "[redacted]",
        to: "[changed]",
        redacted: true,
      },
    ],
  },
  {
    id: "ae-02",
    action: "leave_request.created",
    minutesAgo: 95,
    actor: { id: "u-03", name: "Chidi Nwosu", email: "chidi.nwosu@schulltech.com" },
    entity: {
      type: "leave_requests",
      id: "lv-02",
      label: "Annual leave — Chidi Nwosu",
      noun: "leave request",
    },
    details: [
      { field: "days", label: "Days", value: 2 },
      { field: "startDate", label: "Start date", value: "2026-09-14" },
      { field: "endDate", label: "End date", value: "2026-09-15" },
    ],
  },
  {
    id: "ae-03",
    action: "approval.decided",
    minutesAgo: 150,
    actor: TUNDE,
    entity: {
      type: "approval_requests",
      id: "ap-11",
      label: "August 2026 payroll",
      noun: "approval",
    },
    details: [
      { field: "decision", label: "Decision", value: "Approved" },
      { field: "headcount", label: "Headcount", value: 10 },
    ],
  },
  {
    id: "ae-04",
    action: "payroll.approved",
    minutesAgo: 165,
    actor: TUNDE,
    /* Deliberately as the API writes it. See the header. */
    entity: {
      type: "PayrollRun",
      id: "run-2026-08",
      label: "PayrollRun 4f21ba90",
      noun: "PayrollRun",
    },
    details: [
      { field: "settledLoanInstalments", label: "Settled loan instalments", value: 3 },
      { field: "settledExpenseClaims", label: "Settled expense claims", value: 2 },
    ],
  },
  {
    id: "ae-05",
    action: "employee.created",
    minutesAgo: 1_180,
    actor: GRACE,
    entity: person("p-10", "Halima Sani (AHR-0388)"),
    details: [
      { field: "employeeNo", label: "Employee no", value: "AHR-0388" },
      { field: "jobTitle", label: "Job title", value: "Customer Success Lead" },
    ],
  },
  {
    id: "ae-06",
    action: "audit_log.entity_read",
    minutesAgo: 1_240,
    actor: GRACE,
    entity: person("p-06", "Amara Nwachukwu (AHR-0502)"),
    isRead: true,
    details: [
      {
        field: "note",
        label: "Note",
        value: "Someone opened the audit trail. Reads of the log are recorded.",
      },
    ],
  },
  {
    id: "ae-07",
    action: "salary_grade.increase_applied",
    minutesAgo: 2_900,
    actor: TUNDE,
    entity: {
      type: "salary_grades",
      id: "sg-03",
      label: "M3 Senior Engineer",
      noun: "salary grade",
    },
    details: [
      { field: "percent", label: "Percent", value: 10 },
      { field: "employees", label: "Employees", value: 4 },
    ],
  },
  {
    id: "ae-08",
    action: "loan.approved",
    minutesAgo: 3_050,
    actor: TUNDE,
    entity: {
      type: "loans",
      id: "ln-02",
      label: "Loan — Musa Ibrahim",
      noun: "loan",
    },
    details: [
      { field: "principalKobo", label: "Principal", value: 45_000_000 },
      { field: "months", label: "Months", value: 6 },
    ],
  },
  {
    id: "ae-09",
    action: "employee.updated",
    minutesAgo: 4_400,
    actor: GRACE,
    entity: person("p-04", "Ngozi Eze (AHR-0205)"),
    changes: [
      { field: "jobTitle", label: "Job title", from: "Analyst", to: "Senior Analyst" },
      { field: "salaryGradeId", label: "Salary grade", from: "M2", to: "M3" },
      { field: "department", label: "Department", from: "Operations", to: "Finance" },
      {
        field: "grossMonthly",
        label: "Gross monthly",
        from: "[redacted]",
        to: "[changed]",
        redacted: true,
      },
    ],
  },
  {
    id: "ae-10",
    action: "department.employees_assigned",
    minutesAgo: 5_900,
    actor: GRACE,
    entity: {
      type: "departments",
      id: "d-02",
      label: "Finance",
      noun: "department",
    },
    details: [{ field: "employees", label: "Employees", value: 2 }],
  },
  {
    id: "ae-11",
    action: "role.members_added",
    minutesAgo: 7_400,
    actor: TUNDE,
    entity: { type: "roles", id: "r-03", label: "Payroll officer", noun: "role" },
    details: [{ field: "added", label: "Added", value: ["Fatima Bello"] }],
  },
  {
    id: "ae-12",
    action: "reimbursement.paid",
    minutesAgo: 8_800,
    actor: TUNDE,
    entity: {
      type: "reimbursements",
      id: "rb-04",
      label: "Client dinner — Fatima Bello",
      noun: "expense claim",
    },
    details: [{ field: "amountKobo", label: "Amount", value: 2_850_000 }],
  },
  {
    id: "ae-13",
    action: "import_batch.applied",
    minutesAgo: 11_600,
    actor: GRACE,
    entity: {
      type: "import_batches",
      id: "im-01",
      label: "staff-list-august.csv",
      noun: "import",
    },
    details: [
      { field: "created", label: "Created", value: 4 },
      { field: "updated", label: "Updated", value: 6 },
      { field: "skipped", label: "Skipped", value: 0 },
    ],
  },
  {
    id: "ae-14",
    action: "attendance.corrected",
    minutesAgo: 13_000,
    actor: GRACE,
    entity: {
      type: "attendance_entries",
      id: "at-77",
      label: "Musa Ibrahim — 2026-08-11",
      noun: "attendance entry",
    },
    changes: [{ field: "clockIn", label: "Clock in", from: null, to: "08:12" }],
    details: [
      { field: "note", label: "Note", value: "Fingerprint reader was down at the gate." },
    ],
  },
  {
    id: "ae-15",
    action: "user.password_reset",
    minutesAgo: 17_500,
    actor: SYSTEM,
    entity: {
      type: "users",
      id: "u-07",
      label: "Musa Ibrahim (musa.ibrahim@schulltech.com)",
      noun: "user",
    },
  },
  {
    id: "ae-16",
    action: "employee.archived",
    minutesAgo: 20_200,
    actor: GRACE,
    entity: person("p-09", "Emeka Anyanwu (AHR-0758)"),
  },
  {
    id: "ae-17",
    action: "setup.features_updated",
    minutesAgo: 29_000,
    actor: TUNDE,
    entity: {
      type: "org_features",
      id: null,
      label: "Company setup",
      noun: "company setup",
    },
    changes: [{ field: "loans", label: "Loans", from: false, to: true }],
  },
];

const DEMO_IP = "102.89.34.17";
const DEMO_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36";

/**
 * Builds a fixture row in exactly the shape the API returns — including
 * deriving `changedFields` and `redactedFields` from the diff rather than
 * listing them separately, which is what the API's `summarise` does. Two
 * sources of the same truth is how a fixture drifts from the thing it stands in
 * for.
 */
function buildDemo(seed: Seed): AuditEntryDetail {
  const changes = (seed.changes ?? []).map((change) => ({
    field: change.field,
    label: change.label,
    from: change.from,
    to: change.to,
    redacted: change.redacted ?? false,
  }));
  const details = (seed.details ?? []).map((fact) => ({
    field: fact.field,
    label: fact.label,
    value: fact.value,
    redacted: fact.redacted ?? false,
  }));
  const redactedFields = [...changes, ...details]
    .filter((item) => item.redacted)
    .map((item) => item.field);

  return {
    id: seed.id,
    action: seed.action,
    actionLabel: actionLabel(seed.action),
    at: new Date(DEMO_NOW.getTime() - seed.minutesAgo * 60_000).toISOString(),
    actor: {
      id: seed.actor.id,
      name: seed.actor.name,
      isSystem: seed.actor.id === null,
    },
    entity: seed.entity,
    changedFields: changes.map((change) => change.label),
    redactedFields,
    isRead: seed.isRead ?? false,
    ipAddress: seed.actor.id === null ? null : DEMO_IP,
    diff: { changes, details, redactedFields },
    actorEmail: seed.actor.email ?? null,
    userAgent: seed.actor.id === null ? null : DEMO_AGENT,
  };
}

const DEMO_ENTRIES: AuditEntryDetail[] = SEED.map(buildDemo);

/* ------------------------------------------------------- fixture filtering */

/** The whole day, both ends. The off-by-one the API is careful about too. */
function inRange(iso: string, from?: string, to?: string): boolean {
  const at = new Date(iso).getTime();
  if (from && at < new Date(`${from}T00:00:00.000Z`).getTime()) return false;
  if (to && at >= new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000) return false;
  return true;
}

function matchesDemo(entry: AuditEntryDetail, params: AuditListParams): boolean {
  if (!params.includeReads && entry.isRead) return false;
  if (params.actorUserId === "system" && !entry.actor.isSystem) return false;
  if (
    params.actorUserId &&
    params.actorUserId !== "system" &&
    entry.actor.id !== params.actorUserId
  ) {
    return false;
  }
  if (params.entityType && entry.entity.type !== params.entityType) return false;
  if (params.entityId && entry.entity.id !== params.entityId) return false;
  if (params.action) {
    const matched = params.action.endsWith(".")
      ? entry.action.startsWith(params.action)
      : entry.action === params.action;
    if (!matched) return false;
  }
  if (!inRange(entry.at, params.from, params.to)) return false;

  if (params.q) {
    const term = params.q.trim().toLowerCase();
    const haystack = [
      entry.action,
      entry.actionLabel,
      entry.entity.label,
      entry.entity.noun,
      entry.entity.type.replace(/_/g, " "),
      entry.actor.name,
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(term)) return false;
  }

  return true;
}

/* ----------------------------------------------------------------- the log */

const PAGE_SIZE = 30;

type ListState = {
  rows: AuditEntry[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  error: ApiError | null;
};

const EMPTY_LIST: ListState = {
  rows: [],
  total: 0,
  hasMore: false,
  loading: true,
  error: null,
};

/**
 * The paged log.
 *
 * `filters` **must be a stable reference** — memoise it in the caller. Every
 * request and the "show older" window key off its identity, so a fresh object
 * each render would refetch on every keystroke elsewhere on the page.
 */
export function useAuditTrail(filters: AuditListParams) {
  const { isConnected, isLoading: sessionLoading } = useSession();
  const [live, setLive] = useState<ListState>(EMPTY_LIST);

  /* The window, keyed by the filters it belongs to.
     Changing a filter must go back to the first page, and the id of the object
     that produced the current window is enough to know that — so the reset is
     derived during render rather than done by an effect that would fire a
     second render for it. */
  const [shown, setShown] = useState<{ for: AuditListParams; limit: number }>({
    for: filters,
    limit: PAGE_SIZE,
  });
  const limit = shown.for === filters ? shown.limit : PAGE_SIZE;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!isConnected) return;
      setLive((state) => ({ ...state, loading: true, error: null }));
      try {
        const result = await auditApi.list({ ...filters, pageSize: limit }, signal);
        setLive({
          rows: result.data,
          total: result.meta.total,
          hasMore: result.meta.hasMore,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLive((state) => ({
          ...state,
          loading: false,
          error: error instanceof ApiError ? error : null,
        }));
      }
    },
    [isConnected, filters, limit],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const demo = useMemo(() => {
    const matched = DEMO_ENTRIES.filter((entry) => matchesDemo(entry, filters));
    const ordered =
      filters.order === "asc"
        ? [...matched].sort((a, b) => a.at.localeCompare(b.at))
        : matched;
    return { rows: ordered.slice(0, limit), total: ordered.length };
  }, [filters, limit]);

  /* Memoised so it is one reference per mode rather than a new `Date` on every
     render, which would defeat every `useMemo` downstream that groups by day.
     Frozen at mount is also what the notification inbox does: relative labels
     that tick on their own are motion nobody asked for. */
  const now = useMemo(() => (isConnected ? new Date() : DEMO_NOW), [isConnected]);

  return {
    entries: isConnected ? live.rows : demo.rows,
    total: isConnected ? live.total : demo.total,
    loading: isConnected ? live.loading : sessionLoading,
    error: isConnected ? live.error : null,
    hasMore: isConnected ? live.hasMore : demo.rows.length < demo.total,
    showMore: () => setShown({ for: filters, limit: limit + PAGE_SIZE }),
    /** False in demo mode, so the screen can say so rather than imply a server. */
    live: isConnected,
    /** The wall clock when connected; the fixture's own day otherwise. */
    now,
    reload: load,
  };
}

/* ------------------------------------------------------------- one event */

/**
 * One event with its before and after.
 *
 * Kept as `{ id, detail }` rather than a bare detail so the result carries the
 * id it belongs to: a slow response for a row the reader has already collapsed
 * cannot be shown, and there is nothing to clear when the id changes — the
 * stale value simply stops matching. Clearing it would be a `setState` in an
 * effect body, which cascades a render for nothing.
 */
export function useAuditEvent(id: string | null) {
  const { isConnected } = useSession();
  const [fetched, setFetched] = useState<{
    id: string;
    detail: AuditEntryDetail | null;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!id || !isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const detail = await auditApi.get(id, controller.signal);
        if (!cancelled) setFetched({ id, detail, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            id,
            detail: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, isConnected]);

  const demo = useMemo(
    () => (id ? DEMO_ENTRIES.find((entry) => entry.id === id) ?? null : null),
    [id],
  );

  if (!isConnected) {
    return { detail: demo, loading: false, error: null };
  }

  const matched = fetched !== null && id !== null && fetched.id === id;
  return {
    detail: matched ? fetched.detail : null,
    /* Derived, not tracked: we are loading exactly while an id has no matching
       result yet, which is true from the moment the id changes. */
    loading: id !== null && !matched,
    error: matched ? fetched.error : null,
  };
}

/* ---------------------------------------------------- one record's history */

export type RecordTimeline = {
  entries: AuditEntry[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  /**
   * False when the record's own module writes a subject type the audit API
   * cannot be asked about — `PayrollRun` today. The panel says so in one line
   * rather than rendering an empty timeline, which would read as "nothing has
   * ever happened to this record" and be untrue.
   */
  queryable: boolean;
  live: boolean;
  now: Date;
};

/** Everything that ever happened to one record. Newest first. */
export function useRecordTimeline(
  entityType: string,
  entityId: string,
  options: { limit?: number; includeReads?: boolean } = {},
): RecordTimeline {
  const { isConnected } = useSession();
  const limit = options.limit ?? 8;
  const includeReads = options.includeReads ?? false;
  const queryable = isQueryableEntityType(entityType);

  const [live, setLive] = useState<ListState>(EMPTY_LIST);

  /* An id the API would reject is not a request worth making. Demo ids
     (`p-06`) are the normal case for this, not an error. */
  const askable = isConnected && queryable && isUuid(entityId);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!askable) return;
      setLive((state) => ({ ...state, loading: true, error: null }));
      try {
        const result = await auditApi.timeline(
          entityType,
          entityId,
          { pageSize: limit, includeReads },
          signal,
        );
        setLive({
          rows: result.data,
          total: result.meta.total,
          hasMore: result.meta.hasMore,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLive((state) => ({
          ...state,
          loading: false,
          error: error instanceof ApiError ? error : null,
        }));
      }
    },
    [askable, entityType, entityId, limit, includeReads],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const demo = useMemo(() => {
    const matched = DEMO_ENTRIES.filter(
      (entry) =>
        entry.entity.type === entityType &&
        entry.entity.id === entityId &&
        (includeReads || !entry.isRead),
    );
    return { rows: matched.slice(0, limit), total: matched.length };
  }, [entityType, entityId, limit, includeReads]);

  const now = useMemo(() => (isConnected ? new Date() : DEMO_NOW), [isConnected]);

  return {
    entries: isConnected ? live.rows : demo.rows,
    total: isConnected ? live.total : demo.total,
    loading: askable ? live.loading : false,
    error: isConnected ? live.error : null,
    queryable,
    live: isConnected,
    now,
  };
}

/* ----------------------------------------------------- filters and counts */

export type AuditFilterOptions = {
  actors: AuditActor[];
  /** Only the kinds actually present, so the dropdown cannot go stale. */
  kinds: { type: string; noun: string; count: number }[];
  summary: AuditSummary | null;
  loading: boolean;
  error: ApiError | null;
};

/**
 * What the filter dropdowns offer, and the counts above them.
 *
 * Two requests, one hook: the actor list and the summary are always shown
 * together, and the summary's `byEntityType` **is** the kind dropdown. Deriving
 * the options from what the data contains rather than from a hardcoded list is
 * the API's decision, and the reason a module shipping next month appears in
 * this filter without anybody editing the frontend.
 */
export function useAuditFilterOptions(range: { from?: string; to?: string } = {}) {
  const { isConnected } = useSession();
  const { from, to } = range;

  const [state, setState] = useState<{
    actors: AuditActor[];
    summary: AuditSummary | null;
    loading: boolean;
    error: ApiError | null;
  }>({ actors: [], summary: null, loading: true, error: null });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!isConnected) return;
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const params = {
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        };
        const [actors, summary] = await Promise.all([
          auditApi.actors(params, signal),
          auditApi.summary(params, signal),
        ]);
        setState({ actors, summary, loading: false, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof ApiError ? error : null,
        }));
      }
    },
    [isConnected, from, to],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const demo = useMemo(() => demoOptions(from, to), [from, to]);

  const options: AuditFilterOptions = isConnected
    ? {
        actors: state.actors,
        kinds: state.summary?.byEntityType ?? [],
        summary: state.summary,
        loading: state.loading,
        error: state.error,
      }
    : { ...demo, loading: false, error: null };

  return options;
}

/** The fixture's own actors, kinds and counts, computed the way the API does. */
function demoOptions(from?: string, to?: string) {
  const windowed = DEMO_ENTRIES.filter((entry) => inRange(entry.at, from, to));

  const actors = new Map<string, AuditActor>();
  for (const entry of windowed) {
    const key = entry.actor.id ?? "system";
    const existing = actors.get(key);
    if (existing) {
      existing.events += 1;
      if (!existing.lastAt || entry.at > existing.lastAt) existing.lastAt = entry.at;
      continue;
    }
    actors.set(key, {
      id: entry.actor.id,
      name: entry.actor.name,
      email: entry.actorEmail,
      isSystem: entry.actor.isSystem,
      events: 1,
      lastAt: entry.at,
    });
  }

  const kinds = new Map<string, { type: string; noun: string; count: number }>();
  const byAction = new Map<string, { action: string; label: string; count: number }>();
  for (const entry of windowed) {
    if (entry.isRead) continue;
    const kind = kinds.get(entry.entity.type);
    if (kind) kind.count += 1;
    else
      kinds.set(entry.entity.type, {
        type: entry.entity.type,
        noun: entry.entity.noun,
        count: 1,
      });

    const action = byAction.get(entry.action);
    if (action) action.count += 1;
    else
      byAction.set(entry.action, {
        action: entry.action,
        label: entry.actionLabel,
        count: 1,
      });
  }

  const reads = windowed.filter((entry) => entry.isRead).length;
  const first = windowed[windowed.length - 1]?.at ?? DEMO_NOW.toISOString();

  return {
    actors: [...actors.values()].sort((a, b) => b.events - a.events),
    kinds: [...kinds.values()].sort(
      (a, b) => b.count - a.count || a.type.localeCompare(b.type),
    ),
    summary: {
      from: (from ?? first).slice(0, 10),
      to: (to ?? DEMO_NOW.toISOString()).slice(0, 10),
      total: windowed.length,
      changes: windowed.length - reads,
      reads,
      actors: actors.size,
      byAction: [...byAction.values()].sort((a, b) => b.count - a.count),
      byEntityType: [...kinds.values()].sort((a, b) => b.count - a.count),
    } satisfies AuditSummary,
  };
}
