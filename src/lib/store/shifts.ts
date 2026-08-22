"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { BadgeTone } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  addDays,
  crossesMidnight,
  daysBetween,
  eachDay,
  shortDay,
  shiftsApi,
  weekStart,
  type ApiAssignmentCreated,
  type ApiAssignmentRemoved,
  type ApiBulkResult,
  type ApiMyRota,
  type ApiPattern,
  type ApiPatternUpdate,
  type ApiRota,
  type ApiRotaCell,
  type ApiRotaRow,
  type ApiShift,
  type ApiSwap,
  type ApiSwapSide,
  type BulkAssignBody,
  type CreateAssignmentBody,
  type CreatePatternBody,
  type CreateShiftBody,
  type RotaParams,
  type SwapListParams,
  type SwapRequestBody,
  type SwapStatus,
  type UpdatePatternBody,
  type UpdateShiftBody,
} from "@/lib/api/shifts";
import { EMPLOYEES } from "@/lib/mock/people";
import { useEmployeeStore } from "./employees";
import { TODAY } from "@/lib/today";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";

/**
 * The rota, in both modes.
 *
 * ## Demo mode is fully editable here, and that is a decision
 *
 * `lib/store/departments.ts` refuses every write in demo mode, on the grounds
 * that a department is a payroll reporting boundary and a tree built in one
 * browser would never reach a run — so building one would teach the opposite of
 * how the product works. **That argument does not carry over to the rota, and
 * the reason is worth writing down.**
 *
 * A department disagrees with the demo's own payroll screens. A rota cannot:
 * *nothing else in the frontend reads it.* The rota's one connection to pay is
 * the divisor, and that lives entirely on the API — `workingDaysFor` counts
 * rostered days for a period and never crosses to the browser. So a demo rota
 * has nothing to contradict, and the alternative is a grid you can look at and
 * not use, which demonstrates a picture rather than a product. The badge on the
 * screen says which mode you are in; that is the rule demo mode actually has.
 *
 * The honest consequence, stated once: a demo rota does not prorate a demo
 * payslip. Connected, it does.
 *
 * ## What the demo re-implements, and what it does not
 *
 * It re-implements the things a person will hit in the first two minutes:
 *
 * - Cycle arithmetic, including the wrap — day 9 of an eight-day cycle is day 1
 *   again — and `cycleStart`, so two crews can be offset and the demo shows the
 *   nights actually being covered.
 * - Both clash refusals, by name. Two shifts on one day, **and** a night
 *   running into the next morning's early, which passes a one-shift-per-day
 *   rule cleanly and is still sixteen hours.
 * - Archiving refused while a shift is on a future rota or inside a pattern,
 *   naming both blockers.
 * - The swap state machine, including the rule that only the colleague asked
 *   may accept.
 *
 * It does **not** re-implement the closed-payroll-month invariant (a month with
 * an approved or paid run has a fixed rota), because the demo has no runs to
 * close. Connected, the API enforces it and the message it returns is shown.
 *
 * ## Approving a swap rewrites both rows and clears `patternId`
 *
 * Not "mark the giver's day swapped and write a new row for the taker" — that
 * cannot express two people exchanging shifts on the *same* date, because one
 * person can only have one row per day. So both existing rows keep their person
 * and exchange their `(date, shift)` pair. The history lives on the swap record.
 * Clearing `patternId` is what stops a routine "extend the rota by a week" from
 * silently undoing the swap, since that is the mark which makes a row
 * replaceable. Both modes do this, because it is the model rather than an
 * implementation detail.
 */

/* ------------------------------------------------------------------- labels */

export const SWAP_STATUS_LABEL: Record<SwapStatus, string> = {
  PENDING: "Waiting for them",
  ACCEPTED: "Needs approval",
  APPROVED: "Done",
  DECLINED: "Turned down",
  CANCELLED: "Withdrawn",
};

export const SWAP_STATUS_TONE: Record<SwapStatus, BadgeTone> = {
  PENDING: "warning",
  ACCEPTED: "info",
  APPROVED: "success",
  DECLINED: "danger",
  CANCELLED: "neutral",
};

/**
 * What a swap is asking for, in one line.
 *
 * "Give away" and "swap" are the same request with and without a shift on the
 * other side, and the difference matters to whoever has to answer it.
 */
export function swapAsk(swap: ApiSwap): string {
  const mine = swap.requesterShift;
  const theirs = swap.counterpartyShift;
  if (!mine) return "The shift has come off the rota.";
  if (!theirs) {
    return `${swap.counterparty.name} takes ${mine.shiftName}, ${shortDay(mine.date)}`;
  }
  return `${mine.shiftName} ${shortDay(mine.date)} for ${theirs.shiftName} ${shortDay(theirs.date)}`;
}

/* ------------------------------------------------------- the demo's own data */

type DemoAssignment = {
  id: string;
  employeeId: string;
  shiftId: string;
  date: string;
  patternId: string | null;
  note: string | null;
};

type DemoSwap = {
  id: string;
  requesterAssignmentId: string;
  counterpartyId: string;
  counterpartyAssignmentId: string | null;
  reason: string | null;
  status: SwapStatus;
  acceptedAt: string | null;
  approvedAt: string | null;
  declinedReason: string | null;
  createdAt: string;
};

type DemoState = {
  shifts: ApiShift[];
  /** Stored with the wire shape's `sequence`; `days` is derived on read. */
  patterns: { id: string; name: string; sequence: (string | null)[]; active: boolean; archived: boolean }[];
  assignments: DemoAssignment[];
  swaps: DemoSwap[];
};

const minutesOf = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** The same derivation the API does, so the two never disagree about a length. */
function shiftShape(
  input: {
    id: string;
    name: string;
    shortName: string;
    startTime: string;
    endTime: string;
    unpaidBreakMinutes: number;
    active?: boolean;
    archived?: boolean;
    timesRostered?: number;
  },
): ApiShift {
  const start = minutesOf(input.startTime);
  const end = minutesOf(input.endTime);
  const overnight = crossesMidnight(input.startTime, input.endTime);
  const length = overnight ? 1440 - start + end : end - start;
  return {
    id: input.id,
    name: input.name,
    shortName: input.shortName,
    startTime: input.startTime,
    endTime: input.endTime,
    crossesMidnight: overnight,
    unpaidBreakMinutes: input.unpaidBreakMinutes,
    paidMinutes: Math.max(0, length - input.unpaidBreakMinutes),
    active: input.active ?? true,
    archived: input.archived ?? false,
    timesRostered: input.timesRostered ?? 0,
  };
}

const DEMO_SHIFTS: ApiShift[] = DEMO_ENABLED ? [
  shiftShape({
    id: "ds-early",
    name: "Early",
    shortName: "E",
    startTime: "06:00",
    endTime: "14:00",
    unpaidBreakMinutes: 30,
  }),
  shiftShape({
    id: "ds-late",
    name: "Late",
    shortName: "L",
    startTime: "14:00",
    endTime: "22:00",
    unpaidBreakMinutes: 30,
  }),
  shiftShape({
    id: "ds-night",
    name: "Nights",
    shortName: "N",
    startTime: "22:00",
    endTime: "06:00",
    unpaidBreakMinutes: 45,
  }),
] : [];

const DEMO_PATTERNS: DemoState["patterns"] = DEMO_ENABLED ? [
  {
    id: "dp-nights",
    name: "Four on, four off (nights)",
    sequence: [
      "ds-night",
      "ds-night",
      "ds-night",
      "ds-night",
      null,
      null,
      null,
      null,
    ],
    active: true,
    archived: false,
  },
  {
    id: "dp-rotating",
    name: "Early / late rotating",
    sequence: [
      "ds-early",
      "ds-early",
      "ds-early",
      "ds-early",
      "ds-early",
      null,
      null,
      "ds-late",
      "ds-late",
      "ds-late",
      "ds-late",
      "ds-late",
      null,
      null,
    ],
    active: true,
    archived: false,
  },
] : [];

/** Positive modulo. `-1 % 8` is `-1` in JavaScript, which wraps the wrong way. */
const cycleIndex = (offset: number, length: number): number =>
  ((offset % length) + length) % length;

/**
 * The demo rota, generated rather than typed out.
 *
 * Generated from the same cycle arithmetic the real thing uses, anchored to
 * `TODAY` so the visible week always has something in it. Two crews are offset
 * from each other by four days on the nights pattern — which is the whole point
 * of `cycleStart`, and a demo where every crew works the same days would show
 * the nights uncovered half the month.
 */
function seedAssignments(): DemoAssignment[] {
  const anchor = weekStart(TODAY);
  const from = addDays(anchor, -7);
  const to = addDays(anchor, 34);
  const days = eachDay(from, to);
  const people = EMPLOYEES.slice(0, 8).map((employee) => employee.id);

  const crews: { ids: string[]; patternId: string; cycleStart: string }[] = [
    { ids: people.slice(0, 2), patternId: "dp-nights", cycleStart: anchor },
    {
      ids: people.slice(2, 4),
      patternId: "dp-nights",
      cycleStart: addDays(anchor, -4),
    },
    { ids: people.slice(4, 8), patternId: "dp-rotating", cycleStart: anchor },
  ];

  const out: DemoAssignment[] = [];
  let n = 0;
  for (const crew of crews) {
    const pattern = DEMO_PATTERNS.find((p) => p.id === crew.patternId);
    if (!pattern) continue;
    for (const employeeId of crew.ids) {
      for (const date of days) {
        const entry =
          pattern.sequence[
            cycleIndex(daysBetween(crew.cycleStart, date), pattern.sequence.length)
          ];
        /* A rest day writes no row. That is what makes counting rostered days a
           plain count rather than a filter on a status. */
        if (!entry) continue;
        n += 1;
        out.push({
          id: `da-${n}`,
          employeeId,
          shiftId: entry,
          date,
          patternId: pattern.id,
          note: null,
        });
      }
    }
  }
  return out;
}

/**
 * One swap already waiting, addressed to the seed sign-in.
 *
 * An inbox that is empty on the first load demonstrates nothing, and the swap
 * flow is the part of this module an ordinary employee actually uses.
 */
function seedSwaps(assignments: DemoAssignment[]): DemoSwap[] {
  const asked = EMPLOYEES[5]?.id;
  const asking = EMPLOYEES[0]?.id;
  if (!asked || !asking) return [];

  const mine = assignments
    .filter((row) => row.employeeId === asking && row.date >= addDays(TODAY, 2))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!mine) return [];

  const theirs = assignments.find(
    (row) => row.employeeId === asked && row.date === mine.date,
  );

  return [
    {
      id: "dsw-1",
      requesterAssignmentId: mine.id,
      counterpartyId: asked,
      counterpartyAssignmentId: theirs?.id ?? null,
      reason: "Family function that evening.",
      status: "PENDING",
      acceptedAt: null,
      approvedAt: null,
      declinedReason: null,
      createdAt: `${addDays(TODAY, -1)}T09:20:00.000Z`,
    },
  ];
}

const SEED_ASSIGNMENTS = seedAssignments();

const DEMO_SEED: DemoState = {
  shifts: DEMO_SHIFTS,
  patterns: DEMO_PATTERNS,
  assignments: SEED_ASSIGNMENTS,
  swaps: seedSwaps(SEED_ASSIGNMENTS),
};

const demoStore = createPersistedState<DemoState>({
  key: "approvehr.shifts.store",
  empty: DEMO_SEED,
  version: 1,
});

let demoCounter = 0;
const demoId = (prefix: string): string => {
  demoCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${demoCounter}`;
};

/* ------------------------------------------------- demo reads, wire-shaped */

/**
 * The people the demo grid draws, and how their names are resolved.
 *
 * Threaded in from `useEmployeeStore().directory` rather than read from the
 * `EMPLOYEES` seed, and that is not tidiness. The seed is a snapshot; the store
 * is what `/people/new` writes to. Reading the seed here would mean a person
 * created in the demo could be rostered by the wizard — which reads the live
 * directory — and then simply not appear in the grid, so the toast would say
 * "1 person on the rota" over an unchanged screen. `HANDOVER.md` records the
 * same bug against `RUN_PEOPLE`; this is the same mistake one module along.
 */
type Person = {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
};

/** Resolves an employee id to a name, or says plainly that it cannot. */
type NameLookup = (employeeId: string) => string;

const SEED_PEOPLE: Person[] = EMPLOYEES.map((row) => ({
  id: row.id,
  employeeNo: row.employeeNo,
  firstName: row.firstName,
  lastName: row.lastName,
}));

function lookupFrom(people: readonly Person[]): NameLookup {
  return (employeeId) => {
    const person = people.find((row) => row.id === employeeId);
    return person ? `${person.firstName} ${person.lastName}` : "A colleague";
  };
}

function withCounts(state: DemoState): ApiShift[] {
  return state.shifts.map((shift) => ({
    ...shift,
    timesRostered: state.assignments.filter((row) => row.shiftId === shift.id)
      .length,
  }));
}

function demoPatterns(state: DemoState): ApiPattern[] {
  const byId = new Map(state.shifts.map((shift) => [shift.id, shift]));
  return state.patterns.map((pattern) => {
    const days = pattern.sequence.map((entry, index) => {
      const shift = entry ? byId.get(entry) : undefined;
      return {
        day: index + 1,
        shiftId: shift?.id ?? null,
        name: shift?.name ?? null,
        shortName: shift?.shortName ?? null,
      };
    });
    const heads = new Set(
      state.assignments
        .filter((row) => row.patternId === pattern.id && row.date >= TODAY)
        .map((row) => row.employeeId),
    );
    return {
      id: pattern.id,
      name: pattern.name,
      sequence: days.map((day) => day.shiftId),
      cycleDays: pattern.sequence.length,
      shiftDaysPerCycle: days.filter((day) => day.shiftId !== null).length,
      days,
      active: pattern.active,
      archived: pattern.archived,
      peopleOn: heads.size,
    };
  });
}

function demoCell(state: DemoState, row: DemoAssignment): ApiRotaCell | null {
  const shift = state.shifts.find((s) => s.id === row.shiftId);
  if (!shift) return null;
  return {
    assignmentId: row.id,
    date: row.date,
    shiftId: shift.id,
    shiftName: shift.name,
    shortName: shift.shortName,
    startTime: shift.startTime,
    endTime: shift.endTime,
    crossesMidnight: shift.crossesMidnight,
    status: "SCHEDULED",
    patternId: row.patternId,
    note: row.note,
  };
}

function demoRota(
  state: DemoState,
  params: RotaParams,
  people: readonly Person[],
): ApiRota {
  const days = eachDay(params.from, params.to);
  const inRange = state.assignments.filter(
    (row) => row.date >= params.from && row.date <= params.to,
  );
  const rostered = new Set(inRange.map((row) => row.employeeId));

  const shown = people
    .filter((employee) =>
      params.includeUnrostered ? true : rostered.has(employee.id),
    )
    .sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(
        `${b.firstName} ${b.lastName}`,
      ),
    );

  const rows: ApiRotaRow[] = shown.map((employee) => {
    const cells = days.map((date) => {
      const found = inRange.find(
        (row) => row.employeeId === employee.id && row.date === date,
      );
      return found ? demoCell(state, found) : null;
    });
    return {
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      name: `${employee.firstName} ${employee.lastName}`,
      rosteredDays: cells.filter((cell) => cell !== null).length,
      days: cells,
    };
  });

  const coverage = days.map((date) => ({
    date,
    shifts: state.shifts
      .map((shift) => ({
        shiftId: shift.id,
        shortName: shift.shortName,
        people: inRange.filter(
          (row) => row.date === date && row.shiftId === shift.id,
        ).length,
      }))
      .filter((entry) => entry.people > 0),
  }));

  return {
    from: params.from,
    to: params.to,
    days,
    shifts: state.shifts.map((shift) => ({
      id: shift.id,
      name: shift.name,
      shortName: shift.shortName,
      startTime: shift.startTime,
      endTime: shift.endTime,
      crossesMidnight: shift.crossesMidnight,
    })),
    rows,
    coverage,
    totals: {
      people: rows.length,
      rosteredDays: inRange.length,
      unrostered: params.includeUnrostered
        ? rows.filter((row) => row.rosteredDays === 0).length
        : 0,
    },
  };
}

function demoSide(state: DemoState, id: string | null): ApiSwapSide | null {
  if (!id) return null;
  const row = state.assignments.find((entry) => entry.id === id);
  if (!row) return null;
  const shift = state.shifts.find((s) => s.id === row.shiftId);
  if (!shift) return null;
  return {
    assignmentId: row.id,
    date: row.date,
    shiftId: shift.id,
    shiftName: shift.name,
    shortName: shift.shortName,
    startTime: shift.startTime,
    endTime: shift.endTime,
  };
}

function demoSwap(
  state: DemoState,
  swap: DemoSwap,
  nameOf: NameLookup,
): ApiSwap {
  const requesterRow = state.assignments.find(
    (row) => row.id === swap.requesterAssignmentId,
  );
  return {
    id: swap.id,
    status: swap.status,
    reason: swap.reason,
    requester: requesterRow
      ? {
          employeeId: requesterRow.employeeId,
          name: nameOf(requesterRow.employeeId),
        }
      : null,
    requesterShift: demoSide(state, swap.requesterAssignmentId),
    counterparty: {
      employeeId: swap.counterpartyId,
      name: nameOf(swap.counterpartyId),
    },
    counterpartyShift: demoSide(state, swap.counterpartyAssignmentId),
    acceptedAt: swap.acceptedAt,
    approvedAt: swap.approvedAt,
    declinedReason: swap.declinedReason,
    createdAt: swap.createdAt,
  };
}

function demoMyRota(
  state: DemoState,
  employeeId: string,
  range: { from?: string; to?: string },
  nameOf: NameLookup,
): ApiMyRota {
  const from = range.from ?? TODAY;
  const to = range.to ?? addDays(from, 27);
  const days = state.assignments
    .filter(
      (row) => row.employeeId === employeeId && row.date >= from && row.date <= to,
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => demoCell(state, row))
    .filter((cell): cell is ApiRotaCell => cell !== null);

  return {
    employeeId,
    from,
    to,
    rosteredDays: days.length,
    days,
    next: days.find((cell) => cell.date >= TODAY) ?? null,
    awaitingMe: state.swaps
      .filter(
        (swap) => swap.counterpartyId === employeeId && swap.status === "PENDING",
      )
      .map((swap) => demoSwap(state, swap, nameOf)),
  };
}

/* ----------------------------------------------------------- demo refusals */

/**
 * Same shape the API refuses with, so a screen renders one message either way.
 *
 * A `function` declaration rather than a `const` arrow, deliberately: only a
 * function declaration (or an annotated const) returning `never` narrows the
 * code after the call, and every caller here relies on that — `if (!row)
 * refuse(...)` has to leave `row` non-null on the next line.
 */
function refuse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new ApiError(status, code, message, details);
}

type Clash = { employeeId: string; date: string; reason: string };

/**
 * Both kinds of double booking, named.
 *
 * The second one is the reason this is not just a uniqueness check: 22:00–06:00
 * followed by an 06:00 start is two shifts on two different days, so a
 * one-per-day rule passes it, and it is still sixteen hours.
 */
function clashesFor(
  state: DemoState,
  placements: { employeeId: string; date: string; shiftId: string }[],
  nameOf: NameLookup,
  ignoreIds: readonly string[] = [],
): Clash[] {
  const ignored = new Set(ignoreIds);
  const shiftById = new Map(state.shifts.map((shift) => [shift.id, shift]));
  const kept = state.assignments.filter((row) => !ignored.has(row.id));

  /* Placements are checked against each other as well as against what is
     already there — a generation can double-book somebody all on its own. */
  const proposed = new Map<string, string>();
  for (const row of kept) {
    proposed.set(`${row.employeeId}|${row.date}`, row.shiftId);
  }

  const out: Clash[] = [];
  for (const placement of placements) {
    const key = `${placement.employeeId}|${placement.date}`;
    const existing = proposed.get(key);
    if (existing) {
      const other = shiftById.get(existing);
      out.push({
        employeeId: placement.employeeId,
        date: placement.date,
        reason: `${nameOf(placement.employeeId)} is already on ${other?.name ?? "another shift"} on ${shortDay(placement.date)}.`,
      });
      continue;
    }
    proposed.set(key, placement.shiftId);
  }

  /* Overnight overlap, checked once the whole proposed rota is known. Only
     reported when the write is what causes it: a pre-existing overlap between
     two days nobody is touching is not this call's business, and refusing on
     it would make an unrelated rota impossible to extend. */
  for (const placement of placements) {
    const shift = shiftById.get(placement.shiftId);
    if (!shift) continue;
    const nextDay = proposed.get(
      `${placement.employeeId}|${addDays(placement.date, 1)}`,
    );
    const nextShift = nextDay ? shiftById.get(nextDay) : undefined;
    if (
      shift.crossesMidnight &&
      nextShift &&
      minutesOf(nextShift.startTime) < minutesOf(shift.endTime)
    ) {
      out.push({
        employeeId: placement.employeeId,
        date: placement.date,
        reason: `${nameOf(placement.employeeId)} finishes ${shift.name} at ${shift.endTime} on ${shortDay(addDays(placement.date, 1))} and would start ${nextShift.name} at ${nextShift.startTime} the same morning.`,
      });
    }
    const prevDay = proposed.get(
      `${placement.employeeId}|${addDays(placement.date, -1)}`,
    );
    const prevShift = prevDay ? shiftById.get(prevDay) : undefined;
    if (
      prevShift?.crossesMidnight &&
      minutesOf(shift.startTime) < minutesOf(prevShift.endTime)
    ) {
      out.push({
        employeeId: placement.employeeId,
        date: placement.date,
        reason: `${nameOf(placement.employeeId)} is on ${prevShift.name} overnight into ${shortDay(placement.date)} and would start ${shift.name} at ${shift.startTime}.`,
      });
    }
  }

  /* De-duplicated: a night and the early after it produce the same complaint
     from both ends, and one refusal naming a problem twice reads as two. */
  const seen = new Set<string>();
  return out.filter((clash) => {
    if (seen.has(clash.reason)) return false;
    seen.add(clash.reason);
    return true;
  });
}

function assertNoClashes(
  state: DemoState,
  placements: { employeeId: string; date: string; shiftId: string }[],
  nameOf: NameLookup,
  ignoreIds: readonly string[] = [],
): void {
  const clashes = clashesFor(state, placements, nameOf, ignoreIds);
  if (clashes.length === 0) return;
  const first = clashes[0]?.reason ?? "Somebody would be on two shifts at once.";
  refuse(
    409,
    "shift_clash",
    clashes.length === 1
      ? first
      : `${first} ${clashes.length - 1} more like it.`,
    { clashes },
  );
}

/* --------------------------------------------------------------- the reads */

/** Which source a screen is looking at, so it can badge itself honestly. */
export type ShiftSource = "api" | "demo";

function useDemoState(): DemoState {
  return useSyncExternalStore(
    demoStore.subscribe,
    demoStore.read,
    demoStore.getServerSnapshot,
  );
}

/**
 * The live directory, in the shape the demo readers want.
 *
 * `useEmployeeStore` is read unconditionally — a hook cannot be called on a
 * branch — and the result is ignored on the connected path, which costs one
 * `useSyncExternalStore` subscription and no request.
 */
function useDemoPeople(): { people: Person[]; nameOf: NameLookup } {
  const { directory } = useEmployeeStore();
  const people = useMemo(
    () =>
      directory.length > 0
        ? directory.map((row) => ({
            id: row.id,
            employeeNo: row.employeeNo,
            firstName: row.firstName,
            lastName: row.lastName,
          }))
        : /* Before hydration the store is empty, and an empty grid for one
             render reads as "nobody is on the rota". The seed is what the store
             will resolve to anyway. */
          SEED_PEOPLE,
    [directory],
  );
  const nameOf = useMemo(() => lookupFrom(people), [people]);
  return { people, nameOf };
}

export type CatalogueState = {
  shifts: ApiShift[];
  patterns: ApiPattern[];
  loading: boolean;
  error: ApiError | null;
  source: ShiftSource;
  reload: () => void;
};

/**
 * The shifts and patterns a company has defined.
 *
 * Two requests rather than one, because they are two endpoints — but one hook,
 * because no screen wants one without the other: a pattern is a sequence of
 * shift ids and renders as squares with no names until both have landed.
 */
export function useShiftCatalogue(includeArchived = false): CatalogueState {
  const { isConnected } = useSession();
  const demo = useDemoState();
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    shifts: ApiShift[];
    patterns: ApiPattern[];
    error: ApiError | null;
  } | null>(null);

  const key = `${String(includeArchived)}|${tick}`;

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const [shifts, patterns] = await Promise.all([
          shiftsApi.list(includeArchived, controller.signal),
          shiftsApi.patterns(includeArchived, controller.signal),
        ]);
        if (!cancelled) setFetched({ key, shifts, patterns, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            shifts: [],
            patterns: [],
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, includeArchived, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  /* Derived by comparing the key during render rather than cleared in an
     effect, which would be a synchronous setState and a cascaded render. */
  const matched = fetched !== null && fetched.key === key;

  if (!isConnected) {
    const shifts = withCounts(demo);
    const patterns = demoPatterns(demo);
    return {
      shifts: includeArchived
        ? shifts
        : shifts.filter((shift) => !shift.archived),
      patterns: includeArchived
        ? patterns
        : patterns.filter((pattern) => !pattern.archived),
      loading: false,
      error: null,
      source: "demo",
      reload,
    };
  }

  return {
    shifts: matched ? fetched.shifts : [],
    patterns: matched ? fetched.patterns : [],
    loading: !matched,
    error: matched ? fetched.error : null,
    source: "api",
    reload,
  };
}

export type RotaState = {
  rota: ApiRota | null;
  loading: boolean;
  error: ApiError | null;
  source: ShiftSource;
  reload: () => void;
};

/** The grid. One request per range, and the range is capped at a quarter. */
export function useRota(params: RotaParams): RotaState {
  const { isConnected } = useSession();
  const demo = useDemoState();
  const { people } = useDemoPeople();
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    rota: ApiRota | null;
    error: ApiError | null;
  } | null>(null);

  const key = `${params.from}|${params.to}|${String(params.includeUnrostered ?? false)}|${tick}`;

  /* A range change while a request is in flight must not be overwritten by the
     older answer. The key comparison below handles a stale *render*; this
     handles a stale *response*. */
  const latest = useRef(0);

  useEffect(() => {
    if (!isConnected) return;
    const ticket = latest.current + 1;
    latest.current = ticket;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const rota = await shiftsApi.rota(params, controller.signal);
        if (!cancelled && ticket === latest.current) {
          setFetched({ key, rota, error: null });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled && ticket === latest.current) {
          setFetched({
            key,
            rota: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    /* `params` is an object literal at most call sites, so depending on it
       directly would re-run every render. The key is its value. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const matched = fetched !== null && fetched.key === key;

  const derived = useMemo(
    () => (isConnected ? null : demoRota(demo, params, people)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isConnected, demo, people, key],
  );

  if (!isConnected) {
    return {
      rota: derived,
      loading: false,
      error: null,
      source: "demo",
      reload,
    };
  }

  return {
    rota: matched ? fetched.rota : null,
    loading: !matched,
    error: matched ? fetched.error : null,
    source: "api",
    reload,
  };
}

export type MyRotaState = {
  myRota: ApiMyRota | null;
  loading: boolean;
  error: ApiError | null;
  source: ShiftSource;
  /** True when this sign-in has no staff record, so there is no rota to show. */
  noRecord: boolean;
  reload: () => void;
};

/**
 * The caller's own shifts.
 *
 * The API answers 422 when the sign-in is not linked to a staff record, which is
 * a real state — an accountant with a login and no employment — and not an
 * error worth showing as one. It surfaces as `noRecord`.
 */
export function useMyRota(range: { from?: string; to?: string } = {}): MyRotaState {
  const { isConnected, employeeId } = useSession();
  const demo = useDemoState();
  const { nameOf } = useDemoPeople();
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    myRota: ApiMyRota | null;
    error: ApiError | null;
    noRecord: boolean;
  } | null>(null);

  const key = `${range.from ?? ""}|${range.to ?? ""}|${employeeId ?? ""}|${tick}`;

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const myRota = await shiftsApi.myRota(range, controller.signal);
        if (!cancelled) {
          setFetched({ key, myRota, error: null, noRecord: false });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (cancelled) return;
        const api = error instanceof ApiError ? error : null;
        setFetched({
          key,
          myRota: null,
          error: api?.status === 422 ? null : api,
          noRecord: api?.status === 422,
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const matched = fetched !== null && fetched.key === key;

  const derived = useMemo(
    () =>
      isConnected || !employeeId
        ? null
        : demoMyRota(demo, employeeId, range, nameOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isConnected, employeeId, demo, nameOf, key],
  );

  if (!isConnected) {
    return {
      myRota: derived,
      loading: false,
      error: null,
      source: "demo",
      noRecord: employeeId === null,
      reload,
    };
  }

  return {
    myRota: matched ? fetched.myRota : null,
    loading: !matched,
    error: matched ? fetched.error : null,
    source: "api",
    noRecord: matched ? fetched.noRecord : false,
    reload,
  };
}

export type SwapsState = {
  swaps: ApiSwap[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  source: ShiftSource;
  reload: () => void;
};

/**
 * The swap list.
 *
 * Scoping is the API's, not this hook's: without `EDIT_RECORDS` you are shown
 * only swaps you asked or were asked, and `mine=true` narrows it to those for
 * somebody who can see all of them. The demo branch applies the same rule
 * locally so the two do not disagree about what "mine" means.
 */
export function useSwaps(params: SwapListParams = {}): SwapsState {
  const { isConnected, employeeId } = useSession();
  const demo = useDemoState();
  const { nameOf } = useDemoPeople();
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    swaps: ApiSwap[];
    total: number;
    error: ApiError | null;
  } | null>(null);

  const key = `${params.status ?? ""}|${String(params.mine ?? false)}|${params.page ?? 1}|${params.pageSize ?? 50}|${tick}`;

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await shiftsApi.swaps(params, controller.signal);
        if (!cancelled) {
          setFetched({
            key,
            swaps: result.data,
            total: result.meta.total,
            error: null,
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            swaps: [],
            total: 0,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const matched = fetched !== null && fetched.key === key;

  const derived = useMemo(() => {
    if (isConnected) return [];
    const mineOnly = params.mine ?? false;
    return demo.swaps
      .filter((swap) => !params.status || swap.status === params.status)
      .filter((swap) => {
        if (!mineOnly || !employeeId) return true;
        const requester = demo.assignments.find(
          (row) => row.id === swap.requesterAssignmentId,
        );
        return (
          swap.counterpartyId === employeeId ||
          requester?.employeeId === employeeId
        );
      })
      .map((swap) => demoSwap(demo, swap, nameOf))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, demo, employeeId, nameOf, key]);

  if (!isConnected) {
    return {
      swaps: derived,
      total: derived.length,
      loading: false,
      error: null,
      source: "demo",
      reload,
    };
  }

  return {
    swaps: matched ? fetched.swaps : [],
    total: matched ? fetched.total : 0,
    loading: !matched,
    error: matched ? fetched.error : null,
    source: "api",
    reload,
  };
}

/* -------------------------------------------------------------- the writes */

/**
 * Every write, in one hook.
 *
 * Separate from the read hooks for the reason `employees-api.ts` separates
 * them: a screen showing the grid and the swap list has two things to refresh
 * after one approval, and a mutation that reloads "its own" data would refresh
 * one of them. So each write returns and the caller reloads what it shows.
 */
export function useShiftMutations() {
  const { isConnected, employeeId } = useSession();
  const { nameOf } = useDemoPeople();

  const createShift = useCallback(
    async (body: CreateShiftBody): Promise<ApiShift> => {
      if (isConnected) return shiftsApi.create(body);
      const state = demoStore.read();
      if (
        state.shifts.some(
          (shift) => shift.name.toLowerCase() === body.name.trim().toLowerCase(),
        )
      ) {
        refuse(409, "duplicate", `"${body.name}" already exists.`);
      }
      const shift = shiftShape({
        id: demoId("ds"),
        name: body.name.trim(),
        shortName: body.shortName.trim(),
        startTime: body.startTime,
        endTime: body.endTime,
        unpaidBreakMinutes: body.unpaidBreakMinutes ?? 0,
      });
      if (shift.paidMinutes === 0) {
        refuse(
          422,
          "no_paid_time",
          "That break is as long as the shift, so nobody would be paid for it.",
        );
      }
      demoStore.commit({ ...state, shifts: [...state.shifts, shift] });
      return shift;
    },
    [isConnected],
  );

  const updateShift = useCallback(
    async (id: string, body: UpdateShiftBody): Promise<ApiShift> => {
      if (isConnected) return shiftsApi.update(id, body);
      const state = demoStore.read();
      const existing = state.shifts.find((shift) => shift.id === id);
      if (!existing) refuse(404, "not_found", "That shift no longer exists.");
      const next = shiftShape({
        id: existing.id,
        name: body.name?.trim() ?? existing.name,
        shortName: body.shortName?.trim() ?? existing.shortName,
        startTime: body.startTime ?? existing.startTime,
        endTime: body.endTime ?? existing.endTime,
        unpaidBreakMinutes:
          body.unpaidBreakMinutes ?? existing.unpaidBreakMinutes,
        active: body.active ?? existing.active,
        archived: existing.archived,
      });
      demoStore.commit({
        ...state,
        shifts: state.shifts.map((shift) => (shift.id === id ? next : shift)),
      });
      return next;
    },
    [isConnected],
  );

  const archiveShift = useCallback(
    async (id: string): Promise<void> => {
      if (isConnected) {
        await shiftsApi.archive(id);
        return;
      }
      const state = demoStore.read();
      const shift = state.shifts.find((row) => row.id === id);
      if (!shift) refuse(404, "not_found", "That shift no longer exists.");

      const upcoming = state.assignments
        .filter((row) => row.shiftId === id && row.date >= TODAY)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (upcoming.length > 0) {
        refuse(
          409,
          "in_use",
          `${shift.name} is on the rota ${upcoming.length === 1 ? "once" : `${upcoming.length} times`} from ${shortDay(upcoming[0]?.date ?? TODAY)}. Clear those days first.`,
        );
      }
      const patterns = state.patterns.filter(
        (pattern) => !pattern.archived && pattern.sequence.includes(id),
      );
      if (patterns.length > 0) {
        refuse(
          409,
          "in_pattern",
          `${shift.name} is part of ${patterns.map((p) => p.name).join(", ")}. Take it out of the pattern first.`,
        );
      }
      demoStore.commit({
        ...state,
        shifts: state.shifts.map((row) =>
          row.id === id ? { ...row, active: false, archived: true } : row,
        ),
      });
    },
    [isConnected],
  );

  const createPattern = useCallback(
    async (body: CreatePatternBody): Promise<ApiPattern> => {
      if (isConnected) return shiftsApi.createPattern(body);
      const state = demoStore.read();
      if (
        state.patterns.some(
          (p) => p.name.toLowerCase() === body.name.trim().toLowerCase(),
        )
      ) {
        refuse(409, "duplicate", `"${body.name}" already exists.`);
      }
      const pattern = {
        id: demoId("dp"),
        name: body.name.trim(),
        sequence: body.sequence,
        active: true,
        archived: false,
      };
      const next = { ...state, patterns: [...state.patterns, pattern] };
      demoStore.commit(next);
      const serialized = demoPatterns(next).find(
        (row) => row.id === pattern.id,
      );
      if (!serialized) refuse(500, "unexpected", "Could not read that pattern back.");
      return serialized;
    },
    [isConnected],
  );

  const updatePattern = useCallback(
    async (id: string, body: UpdatePatternBody): Promise<ApiPatternUpdate> => {
      if (isConnected) return shiftsApi.updatePattern(id, body);
      const state = demoStore.read();
      const existing = state.patterns.find((row) => row.id === id);
      if (!existing) refuse(404, "not_found", "That pattern no longer exists.");
      const next: DemoState = {
        ...state,
        patterns: state.patterns.map((row) =>
          row.id === id
            ? {
                ...row,
                name: body.name?.trim() ?? row.name,
                sequence: body.sequence ?? row.sequence,
                active: body.active ?? row.active,
                archived: body.active === false ? true : row.archived,
              }
            : row,
        ),
      };
      demoStore.commit(next);
      const serialized = demoPatterns(next).find((row) => row.id === id);
      if (!serialized) refuse(500, "unexpected", "Could not read that pattern back.");
      return { ...serialized, rotaUnchanged: body.sequence !== undefined };
    },
    [isConnected],
  );

  const assign = useCallback(
    async (body: CreateAssignmentBody): Promise<ApiAssignmentCreated> => {
      if (isConnected) return shiftsApi.assign(body);
      const state = demoStore.read();
      const shift = state.shifts.find((row) => row.id === body.shiftId);
      if (!shift || shift.archived) {
        refuse(422, "unknown_shift", "That shift does not exist.");
      }
      assertNoClashes(
        state,
        [
          {
            employeeId: body.employeeId,
            date: body.onDate,
            shiftId: body.shiftId,
          },
        ],
        nameOf,
      );
      const row: DemoAssignment = {
        id: demoId("da"),
        employeeId: body.employeeId,
        shiftId: body.shiftId,
        date: body.onDate,
        patternId: null,
        note: body.note ?? null,
      };
      demoStore.commit({
        ...state,
        assignments: [...state.assignments, row],
      });
      return {
        id: row.id,
        employeeId: row.employeeId,
        employeeName: nameOf(row.employeeId),
        shiftId: shift.id,
        shiftName: shift.name,
        onDate: row.date,
        status: "SCHEDULED",
      };
    },
    [isConnected, nameOf],
  );

  const bulkAssign = useCallback(
    async (body: BulkAssignBody): Promise<ApiBulkResult> => {
      if (isConnected) return shiftsApi.bulkAssign(body);
      const state = demoStore.read();
      const days = eachDay(body.from, body.to);
      const placements: { employeeId: string; date: string; shiftId: string }[] =
        [];
      let patternName: string | null = null;
      let shiftName: string | null = null;

      if (body.patternId) {
        const pattern = state.patterns.find(
          (row) => row.id === body.patternId && !row.archived,
        );
        if (!pattern) refuse(422, "unknown_pattern", "That pattern does not exist.");
        patternName = pattern.name;
        const anchor = body.cycleStart ?? body.from;
        for (const employeeId of body.employeeIds) {
          for (const date of days) {
            const entry =
              pattern.sequence[
                cycleIndex(daysBetween(anchor, date), pattern.sequence.length)
              ];
            if (!entry) continue;
            placements.push({ employeeId, date, shiftId: entry });
          }
        }
      } else {
        const shift = state.shifts.find(
          (row) => row.id === body.shiftId && !row.archived,
        );
        if (!shift) refuse(422, "unknown_shift", "That shift does not exist.");
        shiftName = shift.name;
        for (const employeeId of body.employeeIds) {
          for (const date of days) {
            placements.push({ employeeId, date, shiftId: shift.id });
          }
        }
      }

      if (placements.length === 0) {
        refuse(
          422,
          "all_rest_days",
          "That cycle lands on rest days for the whole range, so nobody would be rostered. Check the start of the cycle.",
        );
      }

      /* Only rows this pattern wrote, and only inside the range. A single-shift
         generation owns nothing, so every existing day is a blocker. */
      const replaceable = body.patternId
        ? state.assignments.filter(
            (row) =>
              row.patternId === body.patternId &&
              body.employeeIds.includes(row.employeeId) &&
              row.date >= body.from &&
              row.date <= body.to,
          )
        : [];
      const replaceIds = replaceable.map((row) => row.id);

      assertNoClashes(state, placements, nameOf, replaceIds);

      const kept = state.assignments.filter(
        (row) => !replaceIds.includes(row.id),
      );
      let n = 0;
      const created = placements.map((placement) => {
        n += 1;
        return {
          id: `${demoId("da")}-${n}`,
          employeeId: placement.employeeId,
          shiftId: placement.shiftId,
          date: placement.date,
          patternId: body.patternId ?? null,
          note: null,
        } satisfies DemoAssignment;
      });

      demoStore.commit({ ...state, assignments: [...kept, ...created] });

      return {
        created: created.length,
        replaced: replaceIds.length,
        people: body.employeeIds.length,
        days: days.length,
        from: body.from,
        to: body.to,
        patternId: body.patternId ?? null,
        patternName,
        shiftId: body.shiftId ?? null,
        shiftName,
        rosteredDaysEach: Math.round(created.length / body.employeeIds.length),
      };
    },
    [isConnected, nameOf],
  );

  const removeAssignment = useCallback(
    async (id: string): Promise<ApiAssignmentRemoved> => {
      if (isConnected) return shiftsApi.removeAssignment(id);
      const state = demoStore.read();
      const row = state.assignments.find((entry) => entry.id === id);
      if (!row) refuse(404, "not_found", "That day is not on the rota.");

      /* Open swaps on the day go with it. There is no link from a swap back to
         an assignment, so nothing else would clear them, and approving one
         later would move a shift that no longer exists. */
      let cancelled = 0;
      const swaps = state.swaps.map((swap) => {
        const touches =
          swap.requesterAssignmentId === id ||
          swap.counterpartyAssignmentId === id;
        if (!touches) return swap;
        if (swap.status !== "PENDING" && swap.status !== "ACCEPTED") return swap;
        cancelled += 1;
        return {
          ...swap,
          status: "CANCELLED" as SwapStatus,
          declinedReason: "That shift came off the rota.",
        };
      });

      demoStore.commit({
        ...state,
        assignments: state.assignments.filter((entry) => entry.id !== id),
        swaps,
      });

      return {
        id,
        removed: true,
        employeeId: row.employeeId,
        onDate: row.date,
        swapsCancelled: cancelled,
      };
    },
    [isConnected],
  );

  const requestSwap = useCallback(
    async (body: SwapRequestBody): Promise<ApiSwap> => {
      if (isConnected) return shiftsApi.requestSwap(body);
      const state = demoStore.read();
      const mine = state.assignments.find(
        (row) => row.id === body.assignmentId,
      );
      if (!mine) refuse(404, "not_found", "That shift is not on the rota.");
      if (mine.date < TODAY) {
        refuse(422, "past", "That shift has already happened.");
      }
      if (body.counterpartyId === mine.employeeId) {
        refuse(422, "self", "Pick somebody else to cover it.");
      }
      const swap: DemoSwap = {
        id: demoId("dsw"),
        requesterAssignmentId: body.assignmentId,
        counterpartyId: body.counterpartyId,
        counterpartyAssignmentId: body.counterpartyAssignmentId ?? null,
        reason: body.reason?.trim() ?? null,
        status: "PENDING",
        acceptedAt: null,
        approvedAt: null,
        declinedReason: null,
        createdAt: new Date().toISOString(),
      };
      const next = { ...state, swaps: [...state.swaps, swap] };
      demoStore.commit(next);
      return demoSwap(next, swap, nameOf);
    },
    [isConnected, nameOf],
  );

  const acceptSwap = useCallback(
    async (id: string): Promise<ApiSwap> => {
      if (isConnected) return shiftsApi.acceptSwap(id);
      const state = demoStore.read();
      const swap = state.swaps.find((row) => row.id === id);
      if (!swap) refuse(404, "not_found", "That swap no longer exists.");
      /* Not delegable, in either mode. A swap the colleague never agreed to is
         a rota somebody else wrote for them. */
      if (swap.counterpartyId !== employeeId) {
        refuse(
          422,
          "not_yours",
          "Only the colleague asked can agree to a swap.",
        );
      }
      if (swap.status !== "PENDING") {
        refuse(409, "already_decided", `That swap is already ${SWAP_STATUS_LABEL[swap.status].toLowerCase()}.`);
      }
      const updated: DemoSwap = {
        ...swap,
        status: "ACCEPTED",
        acceptedAt: new Date().toISOString(),
      };
      const next = {
        ...state,
        swaps: state.swaps.map((row) => (row.id === id ? updated : row)),
      };
      demoStore.commit(next);
      return demoSwap(next, updated, nameOf);
    },
    [isConnected, employeeId, nameOf],
  );

  const approveSwap = useCallback(
    async (id: string): Promise<ApiSwap> => {
      if (isConnected) return shiftsApi.approveSwap(id);
      const state = demoStore.read();
      const swap = state.swaps.find((row) => row.id === id);
      if (!swap) refuse(404, "not_found", "That swap no longer exists.");
      if (swap.status === "PENDING") {
        refuse(
          409,
          "not_accepted",
          `${nameOf(swap.counterpartyId)} has not agreed to it yet.`,
        );
      }
      if (swap.status !== "ACCEPTED") {
        refuse(409, "already_decided", `That swap is already ${SWAP_STATUS_LABEL[swap.status].toLowerCase()}.`);
      }
      const mine = state.assignments.find(
        (row) => row.id === swap.requesterAssignmentId,
      );
      if (!mine) refuse(422, "gone", "That shift has come off the rota.");
      const theirs = swap.counterpartyAssignmentId
        ? state.assignments.find(
            (row) => row.id === swap.counterpartyAssignmentId,
          )
        : undefined;

      /* Both rows keep their person and exchange their (date, shift) pair, and
         both lose their pattern mark. See the header. */
      const assignments = state.assignments.map((row) => {
        if (row.id === mine.id) {
          return theirs
            ? {
                ...row,
                date: theirs.date,
                shiftId: theirs.shiftId,
                patternId: null,
              }
            : row;
        }
        if (theirs && row.id === theirs.id) {
          return {
            ...row,
            date: mine.date,
            shiftId: mine.shiftId,
            patternId: null,
          };
        }
        return row;
      });

      /* A give-away has no second row: the shift simply changes hands. */
      const handedOver = theirs
        ? assignments
        : assignments.map((row) =>
            row.id === mine.id
              ? { ...row, employeeId: swap.counterpartyId, patternId: null }
              : row,
          );

      const updated: DemoSwap = {
        ...swap,
        status: "APPROVED",
        approvedAt: new Date().toISOString(),
      };
      const next: DemoState = {
        ...state,
        assignments: handedOver,
        swaps: state.swaps.map((row) => (row.id === id ? updated : row)),
      };
      demoStore.commit(next);
      return demoSwap(next, updated, nameOf);
    },
    [isConnected, nameOf],
  );

  const declineSwap = useCallback(
    async (id: string, reason: string): Promise<ApiSwap> => {
      if (isConnected) return shiftsApi.declineSwap(id, reason);
      const state = demoStore.read();
      const swap = state.swaps.find((row) => row.id === id);
      if (!swap) refuse(404, "not_found", "That swap no longer exists.");
      if (swap.status === "APPROVED" || swap.status === "CANCELLED") {
        refuse(409, "already_decided", `That swap is already ${SWAP_STATUS_LABEL[swap.status].toLowerCase()}.`);
      }
      const updated: DemoSwap = {
        ...swap,
        status: "DECLINED",
        declinedReason: reason.trim(),
      };
      const next = {
        ...state,
        swaps: state.swaps.map((row) => (row.id === id ? updated : row)),
      };
      demoStore.commit(next);
      return demoSwap(next, updated, nameOf);
    },
    [isConnected, nameOf],
  );

  const cancelSwap = useCallback(
    async (id: string): Promise<ApiSwap> => {
      if (isConnected) return shiftsApi.cancelSwap(id);
      const state = demoStore.read();
      const swap = state.swaps.find((row) => row.id === id);
      if (!swap) refuse(404, "not_found", "That swap no longer exists.");
      if (swap.status === "APPROVED") {
        refuse(409, "already_decided", "That swap has already been approved.");
      }
      const updated: DemoSwap = { ...swap, status: "CANCELLED" };
      const next = {
        ...state,
        swaps: state.swaps.map((row) => (row.id === id ? updated : row)),
      };
      demoStore.commit(next);
      return demoSwap(next, updated, nameOf);
    },
    [isConnected, nameOf],
  );

  return {
    /** False in demo mode, where the rota lives in this browser only. */
    connected: isConnected,
    createShift,
    updateShift,
    archiveShift,
    createPattern,
    updatePattern,
    assign,
    bulkAssign,
    removeAssignment,
    requestSwap,
    acceptSwap,
    approveSwap,
    declineSwap,
    cancelSwap,
  };
}

/* ------------------------------------------------------------------ preview */

export type PreviewDay = {
  date: string;
  shiftId: string | null;
  shortName: string | null;
  name: string | null;
};

/**
 * What a pattern would actually write, day by day, before anybody confirms.
 *
 * Pure arithmetic on data already loaded — no request — and it is the same
 * `cycleIndex` the generation uses, so what the preview shows is what lands.
 * That equality is the point: a preview computed a second way is a preview that
 * can be wrong in the one case that matters, the wrap at the end of the cycle.
 */
export function previewPattern(
  pattern: Pick<ApiPattern, "days" | "cycleDays">,
  from: string,
  days: number,
  cycleStart?: string,
): PreviewDay[] {
  const anchor = cycleStart ?? from;
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const entry =
      pattern.days[cycleIndex(daysBetween(anchor, date), pattern.cycleDays)];
    return {
      date,
      shiftId: entry?.shiftId ?? null,
      shortName: entry?.shortName ?? null,
      name: entry?.name ?? null,
    };
  });
}

/** A single shift across a range, in the same shape, so one preview renders both. */
export function previewShift(
  shift: Pick<ApiShift, "id" | "name" | "shortName">,
  from: string,
  days: number,
): PreviewDay[] {
  return Array.from({ length: days }, (_, i) => ({
    date: addDays(from, i),
    shiftId: shift.id,
    shortName: shift.shortName,
    name: shift.name,
  }));
}
