"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { ApiError } from "@/lib/api/client";
import {
  assetsApi as api,
  kobo,
  naira,
  type ApiAsset,
  type ApiAssetCategory,
  type ApiAssetDetail,
  type ApiRepair,
  type AssetCondition,
  type AssetListParams,
  type AssetStatus,
  type RepairListParams,
  type ReturnOutcome,
  type SettableStatus,
} from "@/lib/api/assets";
import { CURRENT_USER, employeeById } from "@/lib/mock/people";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";
import { useRevalidation } from "@/lib/revalidate";

/**
 * Equipment, from whichever source is available.
 *
 * The API when it answers, a localStorage demo when it does not — the same two
 * modes as every other store. The interesting decision is **where the line is
 * drawn in demo mode**, and here the demo writes.
 *
 * `store/departments.ts` made its demo read-only because a department is a
 * payroll reporting boundary, and a tree built in browser storage would teach a
 * demo audience something false. Equipment is the opposite case: the thing
 * worth showing *is* the flow — hand a laptop to Amara, try to hand the same
 * laptop to Chidi, and be told "that is with Amara Nwachukwu (AHR-0502) since
 * 12 Apr". A read-only register shows none of that, and that refusal is the
 * whole reason the module exists.
 *
 * So the demo writes, and all of its value depends on it **refusing what the
 * API refuses, in the same words**:
 *
 *   1. a tag that is already on something, naming what wears it
 *   2. handing out something somebody already has, naming them and their staff
 *      number
 *   3. handing out something archived, written off or lost
 *   4. a handover dated in the future
 *   5. taking back something nobody has
 *   6. a return dated before the handover, naming the handover date
 *   7. a repair finished before it was started
 *   8. a status change while somebody is holding it, naming them — except
 *      `LOST`, and except `AVAILABLE` on a held-and-lost item, which means it
 *      turned up and lands on `ASSIGNED`
 *   9. archiving something somebody is holding, naming them and since when
 *  10. a kind of kit that is switched off, and a duplicate kind name
 *
 * The one deliberate divergence is the date inside those sentences: the API
 * writes `2026-04-12` and the demo writes `12 Apr 2026`, because these strings
 * are read by a person rather than parsed by anything.
 *
 * ## The two invariants the demo has to keep, because the API keeps them
 *
 * - **One item, one open assignment.** `status` is a denormalisation of "there
 *   is an open assignment", so every write that touches one touches the other.
 * - **A damaged return goes to the workshop, not the store.** Otherwise the
 *   next person is handed a broken laptop by a register that called it
 *   available.
 *
 * ## Money
 *
 * The API speaks integer kobo. `toItem`, `toRepair` and `toHeld` are the
 * boundary, and everything above them is naira. The demo state deliberately
 * holds the **wire** shapes so both modes go through the same mapper and a bug
 * cannot exist in one and not the other.
 */

/* -------------------------------------------------------------- view types */

export type {
  AssetCondition,
  AssetListParams,
  AssetStatus,
  RepairListParams,
  ReturnOutcome,
  SettableStatus,
} from "@/lib/api/assets";

/** A kind of kit: laptop, phone, SIM card. `AssetCategory` on the wire. */
export type EquipmentKind = {
  id: string;
  name: string;
  /** Whether a leaver has to hand one back. Drives the exit checklist. */
  returnRequired: boolean;
  active: boolean;
  itemCount: number;
  /** False for a switched-off kind: the picker must not offer it. */
  usable: boolean;
};

export type Holder = {
  assignmentId: string;
  employeeId: string;
  name: string;
  employeeNo: string;
  /** `YYYY-MM-DD`. */
  assignedOn: string;
  conditionOut: AssetCondition;
};

export type EquipmentItem = {
  id: string;
  tag: string;
  name: string;
  serialNumber: string | null;
  make: string | null;
  model: string | null;
  kindId: string | null;
  kind: string | null;
  /** No kind counts as returnable: chasing a mug beats losing a laptop. */
  returnRequired: boolean;
  /**
   * Where it lives, and whose budget it is on. Independent of each other and
   * of `holder` — a laptop assigned to somebody in Finance does not become
   * Finance's asset.
   */
  departmentId: string | null;
  department: string | null;
  workLocationId: string | null;
  workLocation: string | null;
  purchasedOn: string | null;
  /** Naira. `null` when nobody recorded what it cost. */
  cost: number | null;
  status: AssetStatus;
  condition: AssetCondition;
  notes: string | null;
  archived: boolean;
  holder: Holder | null;
  /** True when it can be handed to somebody today. Saves every screen a check. */
  handOutable: boolean;
};

export type HistoryEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  assignedOn: string;
  /** `null` while they still have it. */
  returnedOn: string | null;
  conditionOut: AssetCondition;
  conditionBack: AssetCondition | null;
  note: string | null;
  /** Null means not yet confirmed, never a warning — see `acknowledge` below. */
  acknowledgedAt: string | null;
};

export type Repair = {
  id: string;
  itemId: string;
  tag: string | null;
  itemName: string | null;
  description: string;
  /** Naira. */
  cost: number | null;
  startedOn: string;
  completedOn: string | null;
  vendor: string | null;
  open: boolean;
};

export type EquipmentDetail = EquipmentItem & {
  /** Newest first. Who had it when it broke. */
  history: HistoryEntry[];
  repairs: Repair[];
};

/** One thing somebody is holding, as they see it on their own page. */
export type HeldItem = {
  assignmentId: string;
  itemId: string;
  tag: string;
  name: string;
  kind: string | null;
  /** Whether they cannot leave without handing it back. */
  returnRequired: boolean;
  assignedOn: string;
  conditionOut: AssetCondition;
  /** Naira. */
  value: number | null;
  status: AssetStatus;
  note: string | null;
  /** Null means not yet confirmed, never a warning — see `acknowledge` below. */
  acknowledgedAt: string | null;
};

export type MyEquipment = {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  holding: HeldItem[];
  returned: {
    assignmentId: string;
    itemId: string;
    tag: string;
    name: string;
    assignedOn: string;
    returnedOn: string | null;
    conditionOut: AssetCondition;
    conditionBack: AssetCondition | null;
  }[];
  counts: {
    holding: number;
    /** How many an exit cannot complete without. */
    mustReturn: number;
    /** Naira. */
    value: number;
  };
};

export type EquipmentSummary = {
  byKind: {
    kindId: string | null;
    name: string;
    returnRequired: boolean;
    count: number;
    withSomebody: number;
    /** Naira. */
    value: number;
  }[];
  /** Naira. */
  totalValue: number;
  counts: {
    total: number;
    available: number;
    assigned: number;
    inRepair: number;
    retired: number;
    lost: number;
    openRepairs: number;
    peopleHolding: number;
  };
};

/* ------------------------------------------------------------------- labels */

/**
 * Plain words for the five statuses, used everywhere one is shown.
 *
 * Not the enum. "In the store" is what somebody looking for a spare laptop
 * means; `AVAILABLE` is what a database means. "Lost" stays "Lost" because
 * softening it is how a missing laptop stops being chased.
 */
export const STATUS_LABEL: Record<AssetStatus, string> = {
  AVAILABLE: "In the store",
  ASSIGNED: "With somebody",
  IN_REPAIR: "Repairing",
  RETIRED: "Written off",
  LOST: "Lost",
};

export const CONDITION_LABEL: Record<AssetCondition, string> = {
  NEW: "Brand new",
  GOOD: "Good",
  FAIR: "Fair",
  POOR: "Poor",
  DAMAGED: "Broken",
};

/** Every condition, in the order a picker should offer them. */
export const CONDITIONS: AssetCondition[] = [
  "NEW",
  "GOOD",
  "FAIR",
  "POOR",
  "DAMAGED",
];

/** `2026-04-12` → `12 Apr 2026`. Every equipment screen formats a day this way. */
export function dayLabel(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
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
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/** `YYYY-MM-DD` for today, in the local calendar a date input works in. */
export function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Whole days a date is behind today. For "has had it 120 days". */
export function daysSince(iso: string): number {
  const then = new Date(`${iso.slice(0, 10)}T12:00:00`).getTime();
  const now = new Date(`${today()}T12:00:00`).getTime();
  return Math.max(0, Math.round((now - then) / 86_400_000));
}

/* ----------------------------------------------------------------- mappers */

function toKind(row: ApiAssetCategory): EquipmentKind {
  return {
    id: row.id,
    name: row.name,
    returnRequired: row.returnRequired,
    active: row.active,
    itemCount: row.assetCount,
    usable: row.active,
  };
}

function toItem(row: ApiAsset): EquipmentItem {
  return {
    id: row.id,
    tag: row.tag,
    name: row.name,
    serialNumber: row.serialNumber,
    make: row.make,
    model: row.model,
    kindId: row.categoryId,
    kind: row.categoryName,
    returnRequired: row.returnRequired,
    departmentId: row.departmentId,
    department: row.departmentName,
    workLocationId: row.workLocationId,
    workLocation: row.workLocationName,
    purchasedOn: row.purchasedOn,
    cost: row.purchaseCostKobo === null ? null : naira(row.purchaseCostKobo),
    status: row.status,
    condition: row.condition,
    notes: row.notes,
    archived: row.archived,
    holder: row.holder,
    handOutable:
      !row.archived &&
      row.holder === null &&
      row.status !== "RETIRED" &&
      row.status !== "LOST",
  };
}

function toRepair(row: ApiRepair): Repair {
  return {
    id: row.id,
    itemId: row.assetId,
    tag: row.assetTag,
    itemName: row.assetName,
    description: row.description,
    cost: row.costKobo === null ? null : naira(row.costKobo),
    startedOn: row.startedOn,
    completedOn: row.completedOn,
    vendor: row.vendor,
    open: row.open,
  };
}

function toDetail(row: ApiAssetDetail): EquipmentDetail {
  return {
    ...toItem(row),
    history: row.history,
    repairs: row.maintenance.map(toRepair),
  };
}

/* ------------------------------------------------------------- the refusals */

const conflict = (message: string) => new ApiError(409, "conflict", message);
const unprocessable = (message: string) =>
  new ApiError(422, "unprocessable_entity", message);
const missing = (what: string) =>
  new ApiError(404, "not_found", `${what} is gone.`);

/* ------------------------------------------------------------------ the demo */

/** Days back from today as `YYYY-MM-DD`. Keeps the seed plausible on any day. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const NAIRA = 100;

/** The demo holds wire shapes. The holder is derived, never stored twice. */
type DemoAsset = Omit<ApiAsset, "holder">;

type DemoAssignment = {
  id: string;
  assetId: string;
  employeeId: string;
  assignedOn: string;
  returnedOn: string | null;
  conditionOut: AssetCondition;
  conditionBack: AssetCondition | null;
  note: string | null;
  /** Optional so the seed array below did not need touching for every row. */
  acknowledgedAt?: string | null;
};

type DemoState = {
  categories: ApiAssetCategory[];
  assets: DemoAsset[];
  assignments: DemoAssignment[];
  repairs: ApiRepair[];
};

/**
 * The kinds of kit a Nigerian small business already owns on day one.
 *
 * Shipped populated rather than left to be configured — PARITY.md's Rule 3.
 * Nobody should have to define "Laptop" before they can record a laptop. Only
 * "Branded items" has `returnRequired: false`: nobody chases a leaver for a
 * T-shirt, and an exit checklist that insists on one is an exit checklist
 * people learn to tick without reading.
 */
const SEED_KINDS: ApiAssetCategory[] = DEMO_ENABLED ? [
  { id: "demo-kind-laptop", name: "Laptop", returnRequired: true, active: true, assetCount: 5 },
  { id: "demo-kind-phone", name: "Phone", returnRequired: true, active: true, assetCount: 2 },
  { id: "demo-kind-sim", name: "SIM card", returnRequired: true, active: true, assetCount: 1 },
  { id: "demo-kind-modem", name: "MiFi and modem", returnRequired: true, active: true, assetCount: 1 },
  { id: "demo-kind-power", name: "Generator and inverter", returnRequired: true, active: true, assetCount: 1 },
  { id: "demo-kind-branded", name: "Branded items", returnRequired: false, active: true, assetCount: 1 },
] : [];

function seedAsset(input: {
  id: string;
  tag: string;
  name: string;
  kindId: string;
  make?: string;
  model?: string;
  serial?: string;
  cost?: number;
  boughtDaysAgo?: number;
  status: AssetStatus;
  condition: AssetCondition;
  notes?: string;
}): DemoAsset {
  const kind = SEED_KINDS.find((row) => row.id === input.kindId);
  return {
    id: input.id,
    tag: input.tag,
    name: input.name,
    serialNumber: input.serial ?? null,
    make: input.make ?? null,
    model: input.model ?? null,
    categoryId: input.kindId,
    categoryName: kind?.name ?? null,
    returnRequired: kind?.returnRequired ?? true,
    /* The seed has no demo department/location data to draw from — honestly
       absent rather than a fabricated pick. */
    departmentId: null,
    departmentName: null,
    workLocationId: null,
    workLocationName: null,
    purchasedOn: input.boughtDaysAgo ? daysAgo(input.boughtDaysAgo) : null,
    purchaseCostKobo: input.cost === undefined ? null : input.cost * NAIRA,
    status: input.status,
    condition: input.condition,
    notes: input.notes ?? null,
    archived: false,
    createdAt: new Date(`${daysAgo(input.boughtDaysAgo ?? 400)}T09:00:00`).toISOString(),
  };
}

/**
 * Eleven things, chosen so no state on the screen is empty.
 *
 * Three deliberate ones:
 *
 * - **`AHR-LT-04` is lost while still assigned to Musa.** That combination is
 *   legal and is the one people assume is a bug: he still owes us the laptop,
 *   so the assignment stays open and it keeps appearing on his exit checklist.
 *   Marking it back to "In the store" puts it on `ASSIGNED`, because it turned
 *   up with the person who has it.
 * - **`AHR-LT-02` is in for repair while Adaeze still holds it.** It stays
 *   "With somebody" on purpose — she is on the hook for it, and a register that
 *   quietly let her off would be worse than none.
 * - **Amara — the demo account — holds two things and has handed one back.**
 *   `MyAssets` on `/profile` is otherwise a page about nothing.
 */
const SEED_ASSETS: DemoAsset[] = DEMO_ENABLED ? [
  seedAsset({
    id: "demo-item-lt1",
    tag: "AHR-LT-01",
    name: "MacBook Air",
    kindId: "demo-kind-laptop",
    make: "Apple",
    model: "Air M2 13-inch",
    serial: "C02XK4N2Q6LR",
    cost: 1_450_000,
    boughtDaysAgo: 420,
    status: "ASSIGNED",
    condition: "GOOD",
  }),
  seedAsset({
    id: "demo-item-lt2",
    tag: "AHR-LT-02",
    name: "HP ProBook 450",
    kindId: "demo-kind-laptop",
    make: "HP",
    model: "ProBook 450 G9",
    serial: "5CD1207QZK",
    cost: 780_000,
    boughtDaysAgo: 300,
    status: "ASSIGNED",
    condition: "FAIR",
  }),
  seedAsset({
    id: "demo-item-lt3",
    tag: "AHR-LT-03",
    name: "Lenovo ThinkPad E14",
    kindId: "demo-kind-laptop",
    make: "Lenovo",
    model: "ThinkPad E14 Gen 4",
    serial: "PF3JK8T1",
    cost: 690_000,
    boughtDaysAgo: 260,
    status: "IN_REPAIR",
    condition: "DAMAGED",
  }),
  seedAsset({
    id: "demo-item-lt4",
    tag: "AHR-LT-04",
    name: "Dell Latitude 5420",
    kindId: "demo-kind-laptop",
    make: "Dell",
    model: "Latitude 5420",
    cost: 540_000,
    boughtDaysAgo: 700,
    status: "LOST",
    condition: "POOR",
    notes: "Not seen since the Abuja trip. Musa still has it on his record.",
  }),
  seedAsset({
    id: "demo-item-lt5",
    tag: "AHR-LT-05",
    name: "HP 250 G8",
    kindId: "demo-kind-laptop",
    make: "HP",
    model: "250 G8",
    cost: 520_000,
    boughtDaysAgo: 900,
    status: "RETIRED",
    condition: "DAMAGED",
    notes: "Motherboard gone. Written off after the workshop quote.",
  }),
  seedAsset({
    id: "demo-item-ph1",
    tag: "AHR-PH-01",
    name: "Samsung Galaxy A15",
    kindId: "demo-kind-phone",
    make: "Samsung",
    model: "Galaxy A15",
    cost: 185_000,
    boughtDaysAgo: 150,
    status: "ASSIGNED",
    condition: "GOOD",
  }),
  seedAsset({
    id: "demo-item-ph2",
    tag: "AHR-PH-02",
    name: "Tecno Spark 20",
    kindId: "demo-kind-phone",
    make: "Tecno",
    model: "Spark 20",
    cost: 135_000,
    boughtDaysAgo: 500,
    status: "AVAILABLE",
    condition: "FAIR",
  }),
  seedAsset({
    id: "demo-item-sim1",
    tag: "AHR-SIM-01",
    name: "MTN line 0803 111 0011",
    kindId: "demo-kind-sim",
    status: "ASSIGNED",
    condition: "GOOD",
    notes: "Company line. Airtime billed to the office account.",
  }),
  seedAsset({
    id: "demo-item-mf1",
    tag: "AHR-MF-01",
    name: "MTN MiFi",
    kindId: "demo-kind-modem",
    cost: 42_000,
    boughtDaysAgo: 200,
    status: "AVAILABLE",
    condition: "GOOD",
  }),
  seedAsset({
    id: "demo-item-gen1",
    tag: "AHR-GEN-01",
    name: "Elepaq 3.5kVA generator",
    kindId: "demo-kind-power",
    cost: 620_000,
    boughtDaysAgo: 340,
    status: "AVAILABLE",
    condition: "GOOD",
    notes: "Kept at the Ikeja office. Serviced every three months.",
  }),
  seedAsset({
    id: "demo-item-br1",
    tag: "AHR-BR-01",
    name: "Branded backpack",
    kindId: "demo-kind-branded",
    cost: 18_000,
    boughtDaysAgo: 90,
    status: "ASSIGNED",
    condition: "GOOD",
  }),
] : [];

const SEED_ASSIGNMENTS: DemoAssignment[] = DEMO_ENABLED ? [
  {
    id: "demo-hand-01",
    assetId: "demo-item-lt1",
    employeeId: "p-06",
    assignedOn: daysAgo(120),
    returnedOn: null,
    conditionOut: "GOOD",
    conditionBack: null,
    note: "Collected from the store on her first day back from leave.",
  },
  {
    id: "demo-hand-02",
    assetId: "demo-item-ph1",
    employeeId: "p-06",
    assignedOn: daysAgo(60),
    returnedOn: null,
    conditionOut: "GOOD",
    conditionBack: null,
    note: null,
  },
  {
    id: "demo-hand-03",
    assetId: "demo-item-lt2",
    employeeId: "p-01",
    assignedOn: daysAgo(90),
    returnedOn: null,
    conditionOut: "GOOD",
    conditionBack: null,
    note: null,
  },
  {
    id: "demo-hand-04",
    assetId: "demo-item-sim1",
    employeeId: "p-03",
    assignedOn: daysAgo(200),
    returnedOn: null,
    conditionOut: "GOOD",
    conditionBack: null,
    note: null,
  },
  {
    id: "demo-hand-05",
    assetId: "demo-item-lt4",
    employeeId: "p-07",
    assignedOn: daysAgo(300),
    returnedOn: null,
    conditionOut: "GOOD",
    conditionBack: null,
    note: "Signed for before the Abuja trip.",
  },
  {
    id: "demo-hand-06",
    assetId: "demo-item-br1",
    employeeId: "p-10",
    assignedOn: daysAgo(80),
    returnedOn: null,
    conditionOut: "NEW",
    conditionBack: null,
    note: null,
  },
  /* Closed, so "handed back" is not an empty list on Amara's own page. */
  {
    id: "demo-hand-07",
    assetId: "demo-item-ph2",
    employeeId: "p-06",
    assignedOn: daysAgo(400),
    returnedOn: daysAgo(200),
    conditionOut: "GOOD",
    conditionBack: "FAIR",
    note: "Swapped for the Samsung.\nOn return: screen scratched, still working.",
  },
  {
    id: "demo-hand-08",
    assetId: "demo-item-lt3",
    employeeId: "p-04",
    assignedOn: daysAgo(240),
    returnedOn: daysAgo(6),
    conditionOut: "GOOD",
    conditionBack: "DAMAGED",
    note: "On return: screen cracked in the car.",
  },
] : [];

const SEED_REPAIRS: ApiRepair[] = DEMO_ENABLED ? [
  {
    id: "demo-repair-01",
    assetId: "demo-item-lt3",
    assetTag: "AHR-LT-03",
    assetName: "Lenovo ThinkPad E14",
    description: "Cracked screen — panel replacement",
    costKobo: 145_000 * NAIRA,
    startedOn: daysAgo(6),
    completedOn: null,
    vendor: "Computer Village, Ikeja",
    open: true,
  },
  {
    id: "demo-repair-02",
    assetId: "demo-item-lt2",
    assetTag: "AHR-LT-02",
    assetName: "HP ProBook 450",
    description: "Battery replacement — holds 40 minutes",
    costKobo: 38_000 * NAIRA,
    startedOn: daysAgo(3),
    completedOn: null,
    vendor: "Computer Village, Ikeja",
    open: true,
  },
  {
    id: "demo-repair-03",
    assetId: "demo-item-lt5",
    assetTag: "AHR-LT-05",
    assetName: "HP 250 G8",
    description: "Motherboard failure — quoted more than the laptop is worth",
    costKobo: 25_000 * NAIRA,
    startedOn: daysAgo(150),
    completedOn: daysAgo(140),
    vendor: "Computer Village, Ikeja",
    open: false,
  },
] : [];

const demo = createPersistedState<DemoState>({
  key: "approvehr.equipment.store",
  empty: {
    categories: SEED_KINDS,
    assets: SEED_ASSETS,
    assignments: SEED_ASSIGNMENTS,
    repairs: SEED_REPAIRS,
  },
  version: 1,
});

let demoCounter = 0;
const demoId = (prefix: string) =>
  `demo-${prefix}-${Date.now().toString(36)}-${(demoCounter += 1)}`;

/** The open assignment for one item, or undefined. The demo's `openAssignment`. */
function openFor(state: DemoState, assetId: string): DemoAssignment | undefined {
  return state.assignments.find(
    (row) => row.assetId === assetId && row.returnedOn === null,
  );
}

function personOf(employeeId: string): { name: string; employeeNo: string } {
  const person = employeeById(employeeId);
  return person
    ? { name: `${person.firstName} ${person.lastName}`, employeeNo: person.employeeNo }
    : { name: "Somebody who has left", employeeNo: "—" };
}

/** A demo row assembled into the wire shape, so it goes through `toItem`. */
function withHolder(state: DemoState, asset: DemoAsset): ApiAsset {
  const open = openFor(state, asset.id);
  if (!open) return { ...asset, holder: null };
  const person = personOf(open.employeeId);
  return {
    ...asset,
    holder: {
      assignmentId: open.id,
      employeeId: open.employeeId,
      name: person.name,
      employeeNo: person.employeeNo,
      assignedOn: open.assignedOn,
      conditionOut: open.conditionOut,
    },
  };
}

function historyOf(state: DemoState, assetId: string): HistoryEntry[] {
  return state.assignments
    .filter((row) => row.assetId === assetId)
    .sort((a, b) => b.assignedOn.localeCompare(a.assignedOn))
    .map((row) => {
      const person = personOf(row.employeeId);
      return {
        id: row.id,
        employeeId: row.employeeId,
        employeeName: person.name,
        employeeNo: person.employeeNo,
        assignedOn: row.assignedOn,
        returnedOn: row.returnedOn,
        conditionOut: row.conditionOut,
        conditionBack: row.conditionBack,
        note: row.note,
        acknowledgedAt: row.acknowledgedAt ?? null,
      };
    });
}

/**
 * Put an item's status back in step with its repair records.
 *
 * The demo's copy of `settleStatusAfterRepair`. Held, written off or lost wins:
 * finishing the last repair on a laptop somebody is holding must not quietly
 * move it back into the pool.
 */
function statusAfterRepair(
  state: DemoState,
  assetId: string,
  current: AssetStatus,
): AssetStatus {
  if (openFor(state, assetId)) return current;
  if (current === "RETIRED" || current === "LOST") return current;
  const stillOpen = state.repairs.some(
    (row) => row.assetId === assetId && row.completedOn === null,
  );
  if (stillOpen) return "IN_REPAIR";
  return current === "IN_REPAIR" ? "AVAILABLE" : current;
}

/* -------------------------------------------------------------- revision bus */

/**
 * One counter every connected read watches.
 *
 * Handing a laptop over changes four things at once: the register row, the
 * summary counts, that person's own list, and — if it came back damaged — the
 * repair queue. Each is its own request, so without a shared signal the screen
 * would show a laptop assigned to Amara *and* a "free to hand out" count that
 * still included it. Bumping this after every write re-reads all of them.
 *
 * Demo mode needs no equivalent: `createPersistedState` notifies on commit.
 */
let revision = 0;
const watchers = new Set<() => void>();

function bumpRevision(): void {
  revision += 1;
  watchers.forEach((watcher) => watcher());
}

function useRevision(): number {
  return useSyncExternalStore(
    (listener) => {
      watchers.add(listener);
      return () => {
        watchers.delete(listener);
      };
    },
    () => revision,
    () => 0,
  );
}

function useDemoState(): DemoState {
  return useSyncExternalStore(demo.subscribe, demo.read, demo.getServerSnapshot);
}

/* ---------------------------------------------------------------- the kinds */

export type KindInput = { name: string; returnRequired: boolean };

/**
 * Kinds of kit.
 *
 * Its own hook because the add-an-item form needs the picker and the kinds
 * table needs the counts, and the form must not wait on a register page to
 * render. `GET /assets/categories` needs no permission, so this renders for
 * anybody signed in.
 */
export function useEquipmentKinds(includeInactive = false) {
  const { isConnected } = useSession();
  const revisionValue = useRevision();
  const demoState = useDemoState();

  /* Every read is stamped with what was asked for, and `loading` is *derived*
     from whether the answer in hand matches. That is what keeps a setState out
     of the effect body, and it means a slow answer for a query the screen has
     moved on from can never be shown as though it were current. */
  const stamp = `${includeInactive}|${revisionValue}`;

  const [remote, setRemote] = useState<{
    stamp: string;
    kinds: EquipmentKind[];
    error: ApiError | null;
  } | null>(null);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const rows = await api.categories(includeInactive, controller.signal);
        if (!cancelled) setRemote({ stamp, kinds: rows.map(toKind), error: null });
      } catch (error) {
        if (cancelled || error instanceof DOMException) return;
        setRemote({
          stamp,
          kinds: [],
          error: error instanceof ApiError ? error : null,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, includeInactive, stamp, revalidation]);

  const answered = remote !== null && remote.stamp === stamp;

  const demoKinds = useMemo(
    () =>
      demoState.categories
        .filter((row) => includeInactive || row.active)
        .map((row) => ({
          ...toKind(row),
          itemCount: demoState.assets.filter(
            (asset) => asset.categoryId === row.id && !asset.archived,
          ).length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [demoState.categories, demoState.assets, includeInactive],
  );

  const addKind = useCallback(
    async (input: KindInput): Promise<void> => {
      if (isConnected) {
        await api.createCategory(input);
        bumpRevision();
        return;
      }
      const state = demo.current();
      const clash = state.categories.find(
        (row) => row.name.toLowerCase() === input.name.toLowerCase(),
      );
      if (clash) {
        throw conflict(
          clash.active
            ? `"${input.name}" already exists.`
            : `"${input.name}" exists but is switched off. Switch it back on instead of creating a second one.`,
        );
      }
      demo.commit({
        ...state,
        categories: [
          ...state.categories,
          {
            id: demoId("kind"),
            name: input.name,
            returnRequired: input.returnRequired,
            active: true,
            assetCount: 0,
          },
        ],
      });
    },
    [isConnected],
  );

  const editKind = useCallback(
    async (
      id: string,
      input: { name?: string; returnRequired?: boolean; active?: boolean },
    ): Promise<void> => {
      if (isConnected) {
        await api.updateCategory(id, input);
        bumpRevision();
        return;
      }
      const state = demo.current();
      const existing = state.categories.find((row) => row.id === id);
      if (!existing) throw missing("That kind of equipment");
      if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
        const clash = state.categories.find(
          (row) => row.id !== id && row.name.toLowerCase() === input.name?.toLowerCase(),
        );
        if (clash) throw conflict(`"${input.name}" already exists.`);
      }
      demo.commit({
        ...state,
        categories: state.categories.map((row) =>
          row.id === id
            ? {
                ...row,
                ...(input.name === undefined ? {} : { name: input.name }),
                ...(input.returnRequired === undefined
                  ? {}
                  : { returnRequired: input.returnRequired }),
                ...(input.active === undefined ? {} : { active: input.active }),
              }
            : row,
        ),
      });
    },
    [isConnected],
  );

  const kinds = isConnected ? (remote?.kinds ?? []) : demoKinds;

  return {
    kinds,
    /** Only the ones the add-an-item picker may offer. */
    usable: kinds.filter((kind) => kind.usable),
    loading: isConnected && !answered,
    error: isConnected ? (answered ? remote.error : null) : null,
    connected: isConnected,
    addKind,
    editKind,
  };
}

/* ------------------------------------------------------------- the register */

export type ItemInput = {
  tag: string;
  name: string;
  kindId?: string;
  departmentId?: string;
  workLocationId?: string;
  serialNumber?: string;
  make?: string;
  model?: string;
  purchasedOn?: string;
  /** Naira. */
  cost?: number;
  condition?: AssetCondition;
  notes?: string;
};

/** `null` clears a field. Absent leaves it alone. */
export type ItemPatch = {
  tag?: string;
  name?: string;
  kindId?: string | null;
  departmentId?: string | null;
  workLocationId?: string | null;
  serialNumber?: string | null;
  make?: string | null;
  model?: string | null;
  purchasedOn?: string | null;
  /** Naira. `null` removes the figure. */
  cost?: number | null;
  condition?: AssetCondition;
  status?: SettableStatus;
  notes?: string | null;
};

export type HandOverInput = {
  employeeId: string;
  /** Defaults to today. A late-recorded handover must still say when it was. */
  assignedOn?: string;
  condition?: AssetCondition;
  note?: string;
};

export type TakeBackInput = {
  returnedOn?: string;
  outcome: ReturnOutcome;
  condition?: AssetCondition;
  note?: string;
};

export type RepairInput = {
  description: string;
  startedOn?: string;
  completedOn?: string;
  /** Naira. */
  cost?: number;
  vendor?: string;
};

const EMPTY_ITEMS: EquipmentItem[] = [];

/**
 * The register, and everything that can be done to one item.
 *
 * `enabled` exists because every route here except `/categories` and
 * `/employees/:id` is gated on `EDIT_RECORDS`, and a screen that asks without
 * it collects a 403 it has no use for. Pass `can("EDIT_RECORDS")`.
 */
export function useEquipment(params: AssetListParams = {}, enabled = true) {
  const { isConnected } = useSession();
  const revisionValue = useRevision();
  const demoState = useDemoState();

  /* Serialised so a fresh object literal from a caller does not re-fire the
     read on every render. */
  const key = JSON.stringify(params);
  const stamp = `${key}|${revisionValue}`;

  const [remote, setRemote] = useState<{
    stamp: string;
    items: EquipmentItem[];
    total: number;
    error: ApiError | null;
  } | null>(null);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || !enabled) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const result = await api.list(
          JSON.parse(key) as AssetListParams,
          controller.signal,
        );
        if (cancelled) return;
        setRemote({
          stamp,
          items: result.data.map(toItem),
          total: result.meta.total,
          error: null,
        });
      } catch (error) {
        if (cancelled || error instanceof DOMException) return;
        setRemote({
          stamp,
          items: [],
          total: 0,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, enabled, key, stamp, revalidation]);

  const answered = remote !== null && remote.stamp === stamp;

  /** The demo's copy of the API's filtering and ordering. */
  const demoItems = useMemo(() => {
    if (params.heldBy && params.unassigned) {
      /* The API refuses this combination by name rather than returning nothing.
         The screen never sends both; if one ever does, an empty list would be
         the wrong answer, so the refusal is surfaced through `error` below. */
      return EMPTY_ITEMS;
    }
    const needle = params.q?.toLowerCase() ?? "";
    return demoState.assets
      .filter((asset) => {
        if (!params.includeArchived && asset.archived) return false;
        const open = openFor(demoState, asset.id);
        if (params.heldBy && open?.employeeId !== params.heldBy) return false;
        if (params.unassigned && open) return false;
        if (params.status && asset.status !== params.status) return false;
        if (params.condition && asset.condition !== params.condition) return false;
        if (params.categoryId && asset.categoryId !== params.categoryId) return false;
        if (needle) {
          const haystack = [
            asset.tag,
            asset.name,
            asset.serialNumber,
            asset.make,
            asset.model,
          ]
            .filter((value): value is string => Boolean(value))
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .map((asset) => toItem(withHolder(demoState, asset)))
      .sort(compareItems(params.sort, params.order));
  }, [
    demoState,
    params.heldBy,
    params.unassigned,
    params.includeArchived,
    params.status,
    params.condition,
    params.categoryId,
    params.q,
    params.sort,
    params.order,
  ]);

  /* The page, cut *after* the count. Same order as the API does it, and the
     reason is the same: a count taken from the page is the page. */
  const demoPage = useMemo(() => {
    const size = params.pageSize ?? 25;
    const start = ((params.page ?? 1) - 1) * size;
    return demoItems.slice(start, start + size);
  }, [demoItems, params.page, params.pageSize]);

  const contradiction =
    params.heldBy && params.unassigned
      ? new ApiError(
          422,
          "unprocessable_entity",
          "Asking for what one person holds and for what nobody holds cannot both be true. Drop one of them.",
        )
      : null;

  const items = !enabled
    ? EMPTY_ITEMS
    : isConnected
      ? (remote?.items ?? EMPTY_ITEMS)
      : demoPage;

  /* --------------------------------------------------------- mutations */

  const addItem = useCallback(
    async (input: ItemInput): Promise<string> => {
      if (isConnected) {
        const created = await api.create({
          tag: input.tag,
          name: input.name,
          ...(input.kindId ? { categoryId: input.kindId } : {}),
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
          ...(input.workLocationId
            ? { workLocationId: input.workLocationId }
            : {}),
          ...(input.serialNumber ? { serialNumber: input.serialNumber } : {}),
          ...(input.make ? { make: input.make } : {}),
          ...(input.model ? { model: input.model } : {}),
          ...(input.purchasedOn ? { purchasedOn: input.purchasedOn } : {}),
          ...(input.cost === undefined ? {} : { purchaseCostKobo: kobo(input.cost) }),
          ...(input.condition ? { condition: input.condition } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
        });
        bumpRevision();
        return created.id;
      }

      const state = demo.current();
      const clash = state.assets.find(
        (asset) => asset.tag.toLowerCase() === input.tag.toLowerCase(),
      );
      if (clash) {
        throw conflict(
          clash.archived
            ? `Tag ${input.tag} belongs to ${clash.name}, which is archived. Restore it instead of creating a second one.`
            : `Tag ${input.tag} is already on ${clash.name}.`,
        );
      }
      const kind = input.kindId
        ? state.categories.find((row) => row.id === input.kindId)
        : undefined;
      if (input.kindId && !kind) throw missing("That kind of equipment");
      if (kind && !kind.active) {
        throw unprocessable(
          `${kind.name} is switched off. Switch it back on, or pick another kind.`,
        );
      }

      const id = demoId("item");
      demo.commit({
        ...state,
        assets: [
          ...state.assets,
          {
            id,
            tag: input.tag,
            name: input.name,
            serialNumber: input.serialNumber ?? null,
            make: input.make ?? null,
            model: input.model ?? null,
            categoryId: kind?.id ?? null,
            categoryName: kind?.name ?? null,
            returnRequired: kind?.returnRequired ?? true,
            /* Demo mode doesn't track department/location — see `seedAsset`. */
            departmentId: null,
            departmentName: null,
            workLocationId: null,
            workLocationName: null,
            purchasedOn: input.purchasedOn ?? null,
            purchaseCostKobo: input.cost === undefined ? null : kobo(input.cost),
            status: "AVAILABLE",
            condition: input.condition ?? "GOOD",
            notes: input.notes ?? null,
            archived: false,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      return id;
    },
    [isConnected],
  );

  const editItem = useCallback(
    async (id: string, patch: ItemPatch): Promise<void> => {
      if (isConnected) {
        await api.update(id, {
          ...(patch.tag === undefined ? {} : { tag: patch.tag }),
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.kindId === undefined ? {} : { categoryId: patch.kindId }),
          ...(patch.departmentId === undefined
            ? {}
            : { departmentId: patch.departmentId }),
          ...(patch.workLocationId === undefined
            ? {}
            : { workLocationId: patch.workLocationId }),
          ...(patch.serialNumber === undefined
            ? {}
            : { serialNumber: patch.serialNumber }),
          ...(patch.make === undefined ? {} : { make: patch.make }),
          ...(patch.model === undefined ? {} : { model: patch.model }),
          ...(patch.purchasedOn === undefined
            ? {}
            : { purchasedOn: patch.purchasedOn }),
          ...(patch.cost === undefined
            ? {}
            : { purchaseCostKobo: patch.cost === null ? null : kobo(patch.cost) }),
          ...(patch.condition === undefined ? {} : { condition: patch.condition }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.notes === undefined ? {} : { notes: patch.notes }),
        });
        bumpRevision();
        return;
      }

      const state = demo.current();
      const existing = state.assets.find((asset) => asset.id === id);
      if (!existing) throw missing("That piece of equipment");

      if (patch.tag && patch.tag.toLowerCase() !== existing.tag.toLowerCase()) {
        const clash = state.assets.find(
          (asset) =>
            asset.id !== id && asset.tag.toLowerCase() === patch.tag?.toLowerCase(),
        );
        if (clash) throw conflict(`Tag ${patch.tag} is already on ${clash.name}.`);
      }

      /* The status rule, in full. Most changes are refused while somebody is
         holding it, and the refusal names them. `LOST` is allowed — they still
         owe us the thing. `AVAILABLE` on a held-and-lost item means it turned
         up, and it turned up *with the holder*, so it lands on `ASSIGNED`. */
      let status: AssetStatus = existing.status;
      if (patch.status && patch.status !== existing.status) {
        const open = openFor(state, id);
        if (open) {
          const person = personOf(open.employeeId);
          if (patch.status === "LOST") {
            status = "LOST";
          } else if (patch.status === "AVAILABLE" && existing.status === "LOST") {
            status = "ASSIGNED";
          } else {
            throw conflict(
              `${existing.name} is with ${person.name}. Record the return first.`,
            );
          }
        } else {
          status = patch.status;
        }
      }

      let kindId = existing.categoryId;
      let kindName = existing.categoryName;
      let returnRequired = existing.returnRequired;
      if (patch.kindId !== undefined) {
        if (patch.kindId === null) {
          kindId = null;
          kindName = null;
          returnRequired = true;
        } else {
          const kind = state.categories.find((row) => row.id === patch.kindId);
          if (!kind) throw missing("That kind of equipment");
          if (!kind.active) {
            throw unprocessable(
              `${kind.name} is switched off. Switch it back on, or pick another kind.`,
            );
          }
          kindId = kind.id;
          kindName = kind.name;
          returnRequired = kind.returnRequired;
        }
      }

      demo.commit({
        ...state,
        assets: state.assets.map((asset) =>
          asset.id === id
            ? {
                ...asset,
                tag: patch.tag ?? asset.tag,
                name: patch.name ?? asset.name,
                categoryId: kindId,
                categoryName: kindName,
                returnRequired,
                serialNumber:
                  patch.serialNumber === undefined
                    ? asset.serialNumber
                    : patch.serialNumber,
                make: patch.make === undefined ? asset.make : patch.make,
                model: patch.model === undefined ? asset.model : patch.model,
                purchasedOn:
                  patch.purchasedOn === undefined
                    ? asset.purchasedOn
                    : patch.purchasedOn,
                purchaseCostKobo:
                  patch.cost === undefined
                    ? asset.purchaseCostKobo
                    : patch.cost === null
                      ? null
                      : kobo(patch.cost),
                condition: patch.condition ?? asset.condition,
                status,
                notes: patch.notes === undefined ? asset.notes : patch.notes,
              }
            : asset,
        ),
      });
    },
    [isConnected],
  );

  /** Archive, never delete. A past assignment is the evidence for who had it. */
  const archiveItem = useCallback(
    async (id: string): Promise<string> => {
      if (isConnected) {
        const result = await api.archive(id);
        bumpRevision();
        return result.note;
      }

      const state = demo.current();
      const asset = state.assets.find((row) => row.id === id);
      if (!asset) throw missing("That piece of equipment");
      if (asset.archived) throw conflict("That is already archived.");

      const open = openFor(state, id);
      if (open) {
        const person = personOf(open.employeeId);
        throw conflict(
          `${asset.name} is with ${person.name} since ${dayLabel(
            open.assignedOn,
          )}. Record the return first.`,
        );
      }

      demo.commit({
        ...state,
        assets: state.assets.map((row) =>
          row.id === id ? { ...row, archived: true } : row,
        ),
      });
      return "Archived, not deleted. Past assignments still show who had it.";
    },
    [isConnected],
  );

  const restoreItem = useCallback(
    async (id: string): Promise<void> => {
      if (isConnected) {
        await api.restore(id);
        bumpRevision();
        return;
      }
      const state = demo.current();
      const asset = state.assets.find((row) => row.id === id);
      if (!asset) throw missing("That piece of equipment");
      if (!asset.archived) throw conflict("That is not archived.");
      demo.commit({
        ...state,
        assets: state.assets.map((row) =>
          row.id === id ? { ...row, archived: false } : row,
        ),
      });
    },
    [isConnected],
  );

  /**
   * Hand it over. Refused while it is already out, and the message names who
   * has it — that refusal is the point of the whole register.
   */
  const handOver = useCallback(
    async (id: string, input: HandOverInput): Promise<void> => {
      if (isConnected) {
        await api.assign(id, {
          employeeId: input.employeeId,
          ...(input.assignedOn ? { assignedOn: input.assignedOn } : {}),
          ...(input.condition ? { condition: input.condition } : {}),
          ...(input.note ? { note: input.note } : {}),
        });
        bumpRevision();
        return;
      }

      const state = demo.current();
      const asset = state.assets.find((row) => row.id === id);
      if (!asset) throw missing("That piece of equipment");
      if (asset.archived) {
        throw conflict(
          `${asset.name} is archived. Restore it before handing it to anybody.`,
        );
      }
      if (asset.status === "RETIRED") {
        throw unprocessable(`${asset.name} is written off.`);
      }
      if (asset.status === "LOST") {
        throw unprocessable(
          `${asset.name} is marked lost. Mark it available again if it has turned up.`,
        );
      }

      const open = openFor(state, id);
      if (open) {
        const person = personOf(open.employeeId);
        throw conflict(
          open.employeeId === input.employeeId
            ? `${asset.name} is already with ${person.name} since ${dayLabel(
                open.assignedOn,
              )}.`
            : `${asset.name} is with ${person.name} (${
                person.employeeNo
              }) since ${dayLabel(open.assignedOn)}. Take it back from them first.`,
        );
      }

      const taker = employeeById(input.employeeId);
      if (!taker) throw unprocessable("That employee does not exist, or has left.");

      const assignedOn = input.assignedOn ?? today();
      if (assignedOn > today()) {
        throw unprocessable("You cannot hand something over in the future.");
      }

      const conditionOut = input.condition ?? asset.condition;

      /* Both writes or neither: `status` is a denormalisation of "there is an
         open assignment", so it cannot be allowed to land on its own. */
      demo.commit({
        ...state,
        assets: state.assets.map((row) =>
          row.id === id
            ? { ...row, status: "ASSIGNED", condition: conditionOut }
            : row,
        ),
        assignments: [
          ...state.assignments,
          {
            id: demoId("hand"),
            assetId: id,
            employeeId: taker.id,
            assignedOn,
            returnedOn: null,
            conditionOut,
            conditionBack: null,
            note: input.note ?? null,
          },
        ],
      });
    },
    [isConnected],
  );

  /**
   * Take it back. Closes exactly one assignment and answers with which one, so
   * an exit task can tick itself off against it.
   */
  const takeBack = useCallback(
    async (id: string, input: TakeBackInput): Promise<string> => {
      if (isConnected) {
        const result = await api.returnAsset(id, {
          outcome: input.outcome,
          ...(input.returnedOn ? { returnedOn: input.returnedOn } : {}),
          ...(input.condition ? { condition: input.condition } : {}),
          ...(input.note ? { note: input.note } : {}),
        });
        bumpRevision();
        return result.closedAssignmentId;
      }

      const state = demo.current();
      const asset = state.assets.find((row) => row.id === id);
      if (!asset) throw missing("That piece of equipment");

      const open = openFor(state, id);
      if (!open) {
        throw conflict(`Nobody has ${asset.name}. There is nothing to take back.`);
      }

      const returnedOn = input.returnedOn ?? today();
      if (returnedOn > today()) {
        throw unprocessable("You cannot take something back in the future.");
      }
      if (returnedOn < open.assignedOn) {
        const person = personOf(open.employeeId);
        throw unprocessable(
          `${person.name} was given it on ${dayLabel(
            open.assignedOn,
          )}. It cannot come back before that.`,
        );
      }

      const damaged = input.outcome === "DAMAGED";
      const conditionBack =
        input.condition ?? (damaged ? "DAMAGED" : open.conditionOut);

      /* A return note is added to the handover note, not written over it. Both
         are evidence. */
      const note = input.note
        ? open.note
          ? `${open.note}\nOn return: ${input.note}`
          : `On return: ${input.note}`
        : open.note;

      demo.commit({
        ...state,
        assets: state.assets.map((row) =>
          row.id === id
            ? {
                ...row,
                /* Damaged goes to the workshop rather than back into the pool:
                   the next person would otherwise be handed a broken laptop by
                   a register that called it available. */
                status: damaged ? "IN_REPAIR" : "AVAILABLE",
                condition: conditionBack,
              }
            : row,
        ),
        assignments: state.assignments.map((row) =>
          row.id === open.id ? { ...row, returnedOn, conditionBack, note } : row,
        ),
      });

      return open.id;
    },
    [isConnected],
  );

  /**
   * Log a repair. Moves the item to the workshop **only when nobody is holding
   * it** — a laptop being fixed while still assigned stays with its holder,
   * because they are still on the hook for it.
   */
  const logRepair = useCallback(
    async (id: string, input: RepairInput): Promise<void> => {
      if (isConnected) {
        await api.addRepair(id, {
          description: input.description,
          ...(input.startedOn ? { startedOn: input.startedOn } : {}),
          ...(input.completedOn ? { completedOn: input.completedOn } : {}),
          ...(input.cost === undefined ? {} : { costKobo: kobo(input.cost) }),
          ...(input.vendor ? { vendor: input.vendor } : {}),
        });
        bumpRevision();
        return;
      }

      const state = demo.current();
      const asset = state.assets.find((row) => row.id === id);
      if (!asset) throw missing("That piece of equipment");

      const startedOn = input.startedOn ?? today();
      if (input.completedOn && input.completedOn < startedOn) {
        throw unprocessable("It cannot be finished before it was started.");
      }

      const open = openFor(state, id);
      const flip = !open && !input.completedOn && asset.status === "AVAILABLE";

      demo.commit({
        ...state,
        assets: flip
          ? state.assets.map((row) =>
              row.id === id ? { ...row, status: "IN_REPAIR" } : row,
            )
          : state.assets,
        repairs: [
          ...state.repairs,
          {
            id: demoId("repair"),
            assetId: id,
            assetTag: asset.tag,
            assetName: asset.name,
            description: input.description,
            costKobo: input.cost === undefined ? null : kobo(input.cost),
            startedOn,
            completedOn: input.completedOn ?? null,
            vendor: input.vendor ?? null,
            open: !input.completedOn,
          },
        ],
      });
    },
    [isConnected],
  );

  return {
    items,
    /**
     * How many match, from the server. **`undefined` until it answers.**
     *
     * Not `?? 0`. A zero here renders as "No equipment" over a table that is
     * still loading, and a reader has no way to tell that from a register with
     * nothing in it. `Pagination` and `FilterBar` both take `number | undefined`
     * for exactly this.
     */
    total: !enabled ? 0 : isConnected ? remote?.total : demoItems.length,
    loading: enabled && isConnected && !answered,
    error:
      contradiction ??
      (enabled && isConnected && answered ? remote.error : null),
    connected: isConnected,
    reload: bumpRevision,
    addItem,
    editItem,
    archiveItem,
    restoreItem,
    handOver,
    takeBack,
    logRepair,
  };
}

/**
 * The demo's copy of the register's order — **with a tiebreaker**.
 *
 * `tag` is unique per organisation, so it is the tiebreaker rather than `id`:
 * it is what the table shows, so a reader can see the order is total. Sorting by
 * `status` without one puts the same laptop on two pages of a long register,
 * because `Array.prototype.sort` is only stable with respect to the array it was
 * given and that array is the store's insertion order.
 */
function compareItems(
  sort: AssetListParams["sort"],
  order: AssetListParams["order"],
): (a: EquipmentItem, b: EquipmentItem) => number {
  const dir = order === "desc" ? -1 : 1;
  const value = (item: EquipmentItem): string | number =>
    sort === "name"
      ? item.name.toLowerCase()
      : sort === "status"
        ? item.status
        : sort === "purchasedOn"
          ? (item.purchasedOn ?? "")
          : sort === "purchaseCost"
            ? /* Absent is not zero. A cost nobody recorded sorts to the end in
                 either direction rather than pretending the thing was free. */
              (item.cost ?? -1)
            : item.tag.toLowerCase();

  return (a, b) => {
    const left = value(a);
    const right = value(b);
    if (left !== right) return left < right ? -dir : dir;
    return a.tag.localeCompare(b.tag) * dir;
  };
}

/* -------------------------------------------------------------- one item */

/**
 * One item in full: its facts, who has had it, and what has been fixed.
 *
 * Kept as `{ id, detail }` rather than a bare detail so the result carries the
 * id it belongs to. Two things fall out of that: a slow answer for an item the
 * drawer has already moved off cannot be shown, and there is nothing to clear
 * when `id` changes — the stale value simply stops matching. Clearing it in an
 * effect would be a setState in an effect body, which cascades a render.
 */
export function useEquipmentItem(id: string | null) {
  const { isConnected } = useSession();
  const revisionValue = useRevision();
  const demoState = useDemoState();

  const stamp = `${id ?? ""}|${revisionValue}`;

  const [fetched, setFetched] = useState<{
    stamp: string;
    detail: EquipmentDetail | null;
    error: ApiError | null;
  } | null>(null);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || !id) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const row = await api.get(id, controller.signal);
        if (!cancelled) setFetched({ stamp, detail: toDetail(row), error: null });
      } catch (error) {
        if (cancelled || error instanceof DOMException) return;
        setFetched({
          stamp,
          detail: null,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, id, stamp, revalidation]);

  const answered = fetched !== null && fetched.stamp === stamp;

  const demoDetail = useMemo<EquipmentDetail | null>(() => {
    if (!id) return null;
    const asset = demoState.assets.find((row) => row.id === id);
    if (!asset) return null;
    return {
      ...toItem(withHolder(demoState, asset)),
      history: historyOf(demoState, id),
      repairs: demoState.repairs
        .filter((row) => row.assetId === id)
        .sort((a, b) => b.startedOn.localeCompare(a.startedOn))
        .map(toRepair),
    };
  }, [demoState, id]);

  return {
    detail: id === null ? null : isConnected ? (answered ? fetched.detail : null) : demoDetail,
    loading: Boolean(id) && isConnected && !answered,
    error: isConnected && answered ? fetched.error : null,
  };
}

/* -------------------------------------------------------------- the workshop */

const EMPTY_REPAIRS: Repair[] = [];

/**
 * Repairs. `GET /assets/maintenance` is gated on `EDIT_RECORDS`, so pass
 * `enabled` from the permission rather than collecting a 403.
 */
export function useRepairs(params: RepairListParams = {}, enabled = true) {
  const { isConnected } = useSession();
  const revisionValue = useRevision();
  const demoState = useDemoState();

  const key = JSON.stringify(params);
  const stamp = `${key}|${revisionValue}`;

  const [remote, setRemote] = useState<{
    stamp: string;
    repairs: Repair[];
    total: number;
    error: ApiError | null;
  } | null>(null);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || !enabled) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const result = await api.repairs(
          JSON.parse(key) as RepairListParams,
          controller.signal,
        );
        if (cancelled) return;
        setRemote({
          stamp,
          repairs: result.data.map(toRepair),
          total: result.meta.total,
          error: null,
        });
      } catch (error) {
        if (cancelled || error instanceof DOMException) return;
        setRemote({
          stamp,
          repairs: [],
          total: 0,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, enabled, key, stamp, revalidation]);

  const answered = remote !== null && remote.stamp === stamp;

  /** Still-open work first whatever the sort — the workshop list is a queue. */
  const demoRepairs = useMemo(() => {
    const needle = params.q?.toLowerCase() ?? "";
    return demoState.repairs
      .filter((row) => {
        if (params.assetId && row.assetId !== params.assetId) return false;
        if (params.state === "open" && row.completedOn !== null) return false;
        if (params.state === "completed" && row.completedOn === null) return false;
        if (needle) {
          const haystack = [row.description, row.vendor, row.assetTag, row.assetName]
            .filter((value): value is string => Boolean(value))
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const openness = Number(b.completedOn === null) - Number(a.completedOn === null);
        return openness !== 0 ? openness : b.startedOn.localeCompare(a.startedOn);
      })
      .map(toRepair);
  }, [demoState.repairs, params.assetId, params.state, params.q]);

  /**
   * Edit or finish a repair. Finishing the last open one puts the item back in
   * the pool — unless somebody is holding it, or it has been written off.
   */
  const saveRepair = useCallback(
    async (
      id: string,
      input: {
        description?: string;
        startedOn?: string;
        /** `null` reopens it. */
        completedOn?: string | null;
        /** Naira. `null` removes the figure. */
        cost?: number | null;
        vendor?: string | null;
        condition?: AssetCondition;
      },
    ): Promise<void> => {
      if (isConnected) {
        await api.updateRepair(id, {
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.startedOn === undefined ? {} : { startedOn: input.startedOn }),
          ...(input.completedOn === undefined
            ? {}
            : { completedOn: input.completedOn }),
          ...(input.cost === undefined
            ? {}
            : { costKobo: input.cost === null ? null : kobo(input.cost) }),
          ...(input.vendor === undefined ? {} : { vendor: input.vendor }),
          ...(input.condition === undefined ? {} : { condition: input.condition }),
        });
        bumpRevision();
        return;
      }

      const state = demo.current();
      const existing = state.repairs.find((row) => row.id === id);
      if (!existing) throw missing("That repair record");

      const startedOn = input.startedOn ?? existing.startedOn;
      const completedOn =
        input.completedOn === undefined ? existing.completedOn : input.completedOn;
      if (completedOn && completedOn < startedOn) {
        throw unprocessable("It cannot be finished before it was started.");
      }

      const nextRepairs = state.repairs.map((row) =>
        row.id === id
          ? {
              ...row,
              description: input.description ?? row.description,
              startedOn,
              completedOn,
              costKobo:
                input.cost === undefined
                  ? row.costKobo
                  : input.cost === null
                    ? null
                    : kobo(input.cost),
              vendor: input.vendor === undefined ? row.vendor : input.vendor,
              open: completedOn === null,
            }
          : row,
      );

      const withRepairs: DemoState = { ...state, repairs: nextRepairs };
      const asset = state.assets.find((row) => row.id === existing.assetId);
      const nextStatus = asset
        ? statusAfterRepair(withRepairs, asset.id, asset.status)
        : undefined;

      demo.commit({
        ...withRepairs,
        assets: state.assets.map((row) =>
          row.id === existing.assetId && nextStatus
            ? {
                ...row,
                status: nextStatus,
                condition: input.condition ?? row.condition,
              }
            : row,
        ),
      });
    },
    [isConnected],
  );

  const repairs = !enabled
    ? EMPTY_REPAIRS
    : isConnected
      ? (remote?.repairs ?? EMPTY_REPAIRS)
      : demoRepairs;

  return {
    repairs,
    total: !enabled ? 0 : isConnected ? (remote?.total ?? 0) : demoRepairs.length,
    loading: enabled && isConnected && !answered,
    error: enabled && isConnected && answered ? remote.error : null,
    connected: isConnected,
    saveRepair,
  };
}

/* ------------------------------------------------------------------ summary */

const EMPTY_SUMMARY: EquipmentSummary = {
  byKind: [],
  totalValue: 0,
  counts: {
    total: 0,
    available: 0,
    assigned: 0,
    inRepair: 0,
    retired: 0,
    lost: 0,
    openRepairs: 0,
    peopleHolding: 0,
  },
};

/** What the company owns, where it is, and what it is worth. `EDIT_RECORDS`. */
export function useEquipmentSummary(enabled = true) {
  const { isConnected } = useSession();
  const revisionValue = useRevision();
  const demoState = useDemoState();

  const stamp = String(revisionValue);

  const [remote, setRemote] = useState<{
    stamp: string;
    summary: EquipmentSummary;
    error: ApiError | null;
  } | null>(null);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || !enabled) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const result = await api.summary(controller.signal);
        if (cancelled) return;
        setRemote({
          stamp,
          summary: {
            byKind: result.byCategory.map((row) => ({
              kindId: row.categoryId,
              name: row.name,
              returnRequired: row.returnRequired,
              count: row.count,
              withSomebody: row.assigned,
              value: naira(row.valueKobo),
            })),
            totalValue: naira(result.totalValueKobo),
            counts: result.counts,
          },
          error: null,
        });
      } catch (error) {
        if (cancelled || error instanceof DOMException) return;
        setRemote({
          stamp,
          summary: EMPTY_SUMMARY,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, enabled, stamp, revalidation]);

  const answered = remote !== null && remote.stamp === stamp;

  const demoSummary = useMemo<EquipmentSummary>(() => {
    const live = demoState.assets.filter((asset) => !asset.archived);
    const countOf = (status: AssetStatus) =>
      live.filter((asset) => asset.status === status).length;

    const buckets = new Map<
      string,
      {
        kindId: string | null;
        name: string;
        returnRequired: boolean;
        count: number;
        withSomebody: number;
        value: number;
      }
    >();
    for (const asset of live) {
      const bucketKey = asset.categoryId ?? "none";
      const bucket = buckets.get(bucketKey) ?? {
        kindId: asset.categoryId,
        name: asset.categoryName ?? "No category",
        returnRequired: asset.returnRequired,
        count: 0,
        withSomebody: 0,
        value: 0,
      };
      bucket.count += 1;
      if (asset.status === "ASSIGNED") bucket.withSomebody += 1;
      bucket.value += asset.purchaseCostKobo ? naira(asset.purchaseCostKobo) : 0;
      buckets.set(bucketKey, bucket);
    }

    const holders = new Set(
      demoState.assignments
        .filter((row) => row.returnedOn === null)
        .map((row) => row.employeeId),
    );

    return {
      byKind: [...buckets.values()].sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name),
      ),
      totalValue: live.reduce(
        (sum, asset) => sum + (asset.purchaseCostKobo ? naira(asset.purchaseCostKobo) : 0),
        0,
      ),
      counts: {
        total: live.length,
        available: countOf("AVAILABLE"),
        assigned: countOf("ASSIGNED"),
        inRepair: countOf("IN_REPAIR"),
        retired: countOf("RETIRED"),
        lost: countOf("LOST"),
        openRepairs: demoState.repairs.filter((row) => row.completedOn === null)
          .length,
        peopleHolding: holders.size,
      },
    };
  }, [demoState]);

  if (!enabled) {
    return { ...EMPTY_SUMMARY, loading: false, error: null, connected: isConnected };
  }

  const summary = isConnected ? (remote?.summary ?? EMPTY_SUMMARY) : demoSummary;
  return {
    ...summary,
    loading: isConnected && !answered,
    error: isConnected && answered ? remote.error : null,
    connected: isConnected,
  };
}

/* --------------------------------------------------------- one person's kit */

/**
 * What one person is holding, and what they have handed back.
 *
 * `GET /assets/employees/:id` is behind `requirePermissionOrSelf`, so somebody
 * reading **their own** id needs no permission at all. That is deliberate on the
 * API side and it is why `MyAssets` renders on `/profile` for everybody: the
 * person who has to hand the laptop back is the one who should see the list.
 *
 * Pass a different id and it needs `EDIT_RECORDS`, which is what the register's
 * "what Musa has" view uses.
 */
export function useMyEquipment(employeeId: string | null) {
  const { isConnected } = useSession();
  const revisionValue = useRevision();
  const demoState = useDemoState();

  const stamp = `${employeeId ?? ""}|${revisionValue}`;

  const [remote, setRemote] = useState<{
    stamp: string;
    kit: MyEquipment | null;
    error: ApiError | null;
  } | null>(null);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || !employeeId) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const result = await api.forEmployee(employeeId, controller.signal);
        if (cancelled) return;
        setRemote({
          stamp,
          kit: {
            employeeId: result.employeeId,
            employeeName: result.employeeName,
            employeeNo: result.employeeNo,
            holding: result.holding.map((row) => ({
              assignmentId: row.assignmentId,
              itemId: row.assetId,
              tag: row.tag,
              name: row.name,
              kind: row.categoryName,
              returnRequired: row.returnRequired,
              assignedOn: row.assignedOn,
              conditionOut: row.conditionOut,
              value: row.valueKobo === null ? null : naira(row.valueKobo),
              status: row.status,
              note: row.note,
              acknowledgedAt: row.acknowledgedAt,
            })),
            returned: result.returned.map((row) => ({
              assignmentId: row.assignmentId,
              itemId: row.assetId,
              tag: row.tag,
              name: row.name,
              assignedOn: row.assignedOn,
              returnedOn: row.returnedOn,
              conditionOut: row.conditionOut,
              conditionBack: row.conditionBack,
            })),
            counts: {
              holding: result.counts.holding,
              mustReturn: result.counts.mustReturn,
              value: naira(result.counts.valueKobo),
            },
          },
          error: null,
        });
      } catch (error) {
        if (cancelled || error instanceof DOMException) return;
        setRemote({
          stamp,
          kit: null,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, employeeId, stamp, revalidation]);

  const answered = remote !== null && remote.stamp === stamp;

  const demoKit = useMemo<MyEquipment | null>(() => {
    if (!employeeId) return null;
    const person = employeeById(employeeId) ?? CURRENT_USER;
    /* No seeded person, no demo kit. `CURRENT_USER` is undefined in a
       production build, where this whole branch is unreachable anyway. */
    if (!person) return null;
    const assetOf = (assetId: string) =>
      demoState.assets.find((row) => row.id === assetId);

    const mine = demoState.assignments.filter(
      (row) => row.employeeId === employeeId,
    );

    const holding: HeldItem[] = mine
      .filter((row) => row.returnedOn === null)
      .sort((a, b) => a.assignedOn.localeCompare(b.assignedOn))
      .flatMap((row) => {
        const asset = assetOf(row.assetId);
        if (!asset) return [];
        return [
          {
            assignmentId: row.id,
            itemId: asset.id,
            tag: asset.tag,
            name: asset.name,
            kind: asset.categoryName,
            returnRequired: asset.returnRequired,
            assignedOn: row.assignedOn,
            conditionOut: row.conditionOut,
            value:
              asset.purchaseCostKobo === null
                ? null
                : naira(asset.purchaseCostKobo),
            status: asset.status,
            note: row.note,
            acknowledgedAt: row.acknowledgedAt ?? null,
          },
        ];
      });

    const returned = mine
      .filter((row) => row.returnedOn !== null)
      .sort((a, b) => (b.returnedOn ?? "").localeCompare(a.returnedOn ?? ""))
      .flatMap((row) => {
        const asset = assetOf(row.assetId);
        if (!asset) return [];
        return [
          {
            assignmentId: row.id,
            itemId: asset.id,
            tag: asset.tag,
            name: asset.name,
            assignedOn: row.assignedOn,
            returnedOn: row.returnedOn,
            conditionOut: row.conditionOut,
            conditionBack: row.conditionBack,
          },
        ];
      });

    return {
      employeeId,
      employeeName: `${person.firstName} ${person.lastName}`,
      employeeNo: person.employeeNo,
      holding,
      returned,
      counts: {
        holding: holding.length,
        mustReturn: holding.filter((item) => item.returnRequired).length,
        value: holding.reduce((sum, item) => sum + (item.value ?? 0), 0),
      },
    };
  }, [demoState, employeeId]);

  /**
   * "I've received this." Self-only, which in practice means whichever
   * assignment is on this same person's own list — this screen never shows
   * anybody else's equipment to acknowledge.
   */
  const acknowledge = useCallback(
    async (assignmentId: string): Promise<void> => {
      if (isConnected) {
        await api.acknowledge(assignmentId);
        bumpRevision();
        return;
      }

      const state = demo.current();
      const row = state.assignments.find((entry) => entry.id === assignmentId);
      if (!row) throw missing("That assignment");
      if (row.acknowledgedAt) {
        throw conflict(
          `Already acknowledged on ${dayLabel(row.acknowledgedAt)}.`,
        );
      }
      if (row.returnedOn) {
        throw conflict(
          "This has already been returned. There is nothing left to acknowledge.",
        );
      }

      demo.commit({
        ...state,
        assignments: state.assignments.map((entry) =>
          entry.id === assignmentId
            ? { ...entry, acknowledgedAt: today() }
            : entry,
        ),
      });
    },
    [isConnected],
  );

  return {
    kit: employeeId === null ? null : isConnected ? (answered ? remote.kit : null) : demoKit,
    loading: Boolean(employeeId) && isConnected && !answered,
    error: isConnected && answered ? remote.error : null,
    connected: isConnected,
    acknowledge,
  };
}
