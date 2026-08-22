"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * The equipment register — `/api/v1/assets`.
 *
 * The backend module is called `assets` because that is what the tables and the
 * offboarding seam are called. **The interface says "Equipment"**, always. A
 * Nigerian small-business owner says "the laptop", not "the asset" — "assets"
 * reads as accounting, and the person who has to hand a laptop back is not
 * doing accounting. This file is the only place in the frontend where the
 * backend's word appears, and it is the only place it should.
 *
 * ## Money
 *
 * Every amount in and out is integer **kobo**, and every field carrying one is
 * suffixed `Kobo` so a mistake is visible at the call site. `naira()` and
 * `kobo()` at the bottom are the whole boundary — the store maps wire shapes to
 * naira view models once, and nothing above it divides by 100.
 *
 * ## Two words that look interchangeable and are not
 *
 * - **status** is where the thing is: in the store, with somebody, in the
 *   workshop, written off, lost. The service owns it. `ASSIGNED` is not
 *   settable by hand — it is a fact about an open assignment, never a label
 *   somebody types — which is why `SettableStatus` is a narrower type than
 *   `AssetStatus`.
 * - **condition** is what state it is in, and a person sets it twice: on the
 *   way out and again on the way back. The difference between the two is the
 *   whole evidence trail for "it was fine when we gave it to him".
 *
 * ## Three refusals worth knowing before you build a form
 *
 * 1. **Handing out something somebody already has is refused, and the message
 *    names the holder and their staff number.** Show that message; do not
 *    replace it with "could not assign". Naming who has the laptop is the
 *    entire point of the register.
 * 2. **A status change while somebody is holding it is refused**, and names
 *    them — except `LOST` (they still owe us the thing, so the assignment stays
 *    open and it keeps appearing on their exit checklist) and except
 *    `AVAILABLE` on a held-and-lost item, which means it turned up and lands on
 *    `ASSIGNED` with the holder intact.
 * 3. **A damaged return goes to `IN_REPAIR`, not back into the pool.**
 *    Otherwise the next person is handed a broken laptop by a register that
 *    called it available. Sending `outcome: "RETURNED"` together with
 *    `condition: "DAMAGED"` is refused by the schema, so the form offers one
 *    choice, not two contradicting ones.
 *
 * Filtering `heldBy` and `unassigned` together is also refused, with a message
 * naming the contradiction. The register screen picks one at a time.
 */

/* ------------------------------------------------------------------- shapes */

/** Where the thing is. `ASSIGNED` is derived, never sent. */
export type AssetStatus =
  | "AVAILABLE"
  | "ASSIGNED"
  | "IN_REPAIR"
  | "RETIRED"
  | "LOST";

/** What a person may set directly. `ASSIGNED` is deliberately absent. */
export type SettableStatus = Exclude<AssetStatus, "ASSIGNED">;

/** What state it is in. Set on the way out, and again on the way back. */
export type AssetCondition = "NEW" | "GOOD" | "FAIR" | "POOR" | "DAMAGED";

/** How a return ended. `DAMAGED` sends it to the workshop, not to the store. */
export type ReturnOutcome = "RETURNED" | "DAMAGED";

/** Mirrors `SerializedCategory`. A "kind of kit": laptop, phone, SIM card. */
export type ApiAssetCategory = {
  id: string;
  name: string;
  /**
   * Whether a leaver has to hand one back. True for a laptop, false for a
   * branded mug — and it is the flag the exit checklist is built from.
   */
  returnRequired: boolean;
  /** Switched-off kinds stay on existing items; the picker hides them. */
  active: boolean;
  assetCount: number;
};

/** Who is holding it right now. `null` means nobody. */
export type ApiHolder = {
  assignmentId: string;
  employeeId: string;
  name: string;
  employeeNo: string;
  /** `YYYY-MM-DD`. The day of the handover, not the day it was recorded. */
  assignedOn: string;
  conditionOut: AssetCondition;
};

/** Mirrors `SerializedAsset`. */
export type ApiAsset = {
  id: string;
  /** The sticker on the case. Unique within the company. */
  tag: string;
  name: string;
  serialNumber: string | null;
  make: string | null;
  model: string | null;
  categoryId: string | null;
  categoryName: string | null;
  /** No category counts as returnable: chasing a mug beats losing a laptop. */
  returnRequired: boolean;
  purchasedOn: string | null;
  purchaseCostKobo: number | null;
  status: AssetStatus;
  condition: AssetCondition;
  notes: string | null;
  archived: boolean;
  holder: ApiHolder | null;
  createdAt: string;
};

/** One closed or open spell of somebody holding one item. */
export type ApiAssignmentEntry = {
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
};

/** Mirrors `SerializedMaintenance`. */
export type ApiRepair = {
  id: string;
  assetId: string;
  assetTag: string | null;
  assetName: string | null;
  description: string;
  costKobo: number | null;
  startedOn: string;
  /** `null` while it is still in the workshop. */
  completedOn: string | null;
  vendor: string | null;
  open: boolean;
};

/** `GET /:id` — one item, plus who had it when and what has been fixed. */
export type ApiAssetDetail = ApiAsset & {
  /** Newest first. The answer to "who had it when it broke". */
  history: ApiAssignmentEntry[];
  maintenance: ApiRepair[];
};

/** `POST /:id/return` answers with the item plus which assignment closed. */
export type ApiReturnResult = ApiAssetDetail & {
  /** Exactly one. An exit task ticks itself off against this. */
  closedAssignmentId: string;
  outcome: ReturnOutcome;
};

/** Mirrors `HeldAsset` — the offboarding seam's row shape. */
export type ApiHeldAsset = {
  assignmentId: string;
  assetId: string;
  tag: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  /** Whether an exit cannot complete without it. No category means yes. */
  returnRequired: boolean;
  assignedOn: string;
  conditionOut: AssetCondition;
  /** What it cost, for the conversation about an unreturned laptop. */
  valueKobo: number | null;
  status: AssetStatus;
  note: string | null;
};

/** `GET /employees/:id` — what one person has, and what they have handed back. */
export type ApiHoldings = {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  holding: ApiHeldAsset[];
  /** Newest first. Closed assignments, for "what did she have". */
  returned: {
    assignmentId: string;
    assetId: string;
    tag: string;
    name: string;
    assignedOn: string;
    returnedOn: string | null;
    conditionOut: AssetCondition;
    conditionBack: AssetCondition | null;
    note: string | null;
  }[];
  counts: {
    holding: number;
    /** How many of those an exit cannot complete without. */
    mustReturn: number;
    valueKobo: number;
  };
};

/** `GET /summary`. Archived items are excluded from every figure. */
export type ApiAssetSummary = {
  byStatus: { status: AssetStatus; count: number; valueKobo: number }[];
  byCategory: {
    categoryId: string | null;
    /** "No category" is a real bucket, not a gap to hide. */
    name: string;
    returnRequired: boolean;
    count: number;
    assigned: number;
    valueKobo: number;
  }[];
  totalValueKobo: number;
  counts: {
    total: number;
    available: number;
    assigned: number;
    inRepair: number;
    retired: number;
    lost: number;
    openRepairs: number;
    /** How many people are holding something. */
    peopleHolding: number;
  };
};

/* ------------------------------------------------------------------- params */

export type AssetListParams = {
  page?: number;
  pageSize?: number;
  status?: AssetStatus;
  condition?: AssetCondition;
  categoryId?: string;
  /** What one person holds right now. Cannot be combined with `unassigned`. */
  heldBy?: string;
  /** Only what nobody is holding — the pool you can hand out from. */
  unassigned?: boolean;
  includeArchived?: boolean;
  /** Covers tag, name, serial, make and model. */
  q?: string;
  sort?: "tag" | "name" | "status" | "purchasedOn" | "purchaseCost" | "createdAt";
  order?: "asc" | "desc";
};

export type RepairListParams = {
  page?: number;
  pageSize?: number;
  assetId?: string;
  /** `open` is the workshop queue. Open work sorts first whatever the sort. */
  state?: "open" | "completed" | "all";
  q?: string;
  sort?: "startedOn" | "completedOn" | "createdAt";
  order?: "asc" | "desc";
};

export type CreateCategoryBody = {
  name: string;
  /** Defaults to true on the API. Sent explicitly so the form is the record. */
  returnRequired?: boolean;
};

export type UpdateCategoryBody = {
  name?: string;
  returnRequired?: boolean;
  /** `false` hides it from the picker; existing items keep it. */
  active?: boolean;
};

export type CreateAssetBody = {
  tag: string;
  name: string;
  categoryId?: string;
  serialNumber?: string;
  make?: string;
  model?: string;
  purchasedOn?: string;
  purchaseCostKobo?: number;
  condition?: AssetCondition;
  notes?: string;
};

/** `null` clears a field. Absent leaves it alone. */
export type UpdateAssetBody = {
  tag?: string;
  name?: string;
  categoryId?: string | null;
  serialNumber?: string | null;
  make?: string | null;
  model?: string | null;
  purchasedOn?: string | null;
  purchaseCostKobo?: number | null;
  condition?: AssetCondition;
  status?: SettableStatus;
  notes?: string | null;
};

export type AssignBody = {
  employeeId: string;
  /** Defaults to today. A handover recorded late must still say when it was. */
  assignedOn?: string;
  condition?: AssetCondition;
  note?: string;
};

export type ReturnBody = {
  returnedOn?: string;
  outcome: ReturnOutcome;
  condition?: AssetCondition;
  /** Appended to the handover note, not written over it. Both are evidence. */
  note?: string;
};

export type CreateRepairBody = {
  description: string;
  startedOn?: string;
  /** Both dates at once logs a repair that already happened. */
  completedOn?: string;
  costKobo?: number;
  vendor?: string;
};

export type UpdateRepairBody = {
  description?: string;
  startedOn?: string;
  /** `null` reopens it. */
  completedOn?: string | null;
  costKobo?: number | null;
  vendor?: string | null;
  /** What state it is in now the work is done. */
  condition?: AssetCondition;
};

/* -------------------------------------------------------------------- calls */

export const assetsApi = {
  /* Reading the kinds needs no permission — a picker cannot be filled in
     without them, and "laptop, phone, SIM card" is not privileged. */
  categories: (includeInactive = false, signal?: AbortSignal) =>
    request<ApiAssetCategory[]>("/assets/categories", {
      query: { includeInactive: includeInactive ? "true" : undefined },
      ...(signal ? { signal } : {}),
    }),

  createCategory: (body: CreateCategoryBody) =>
    request<ApiAssetCategory>("/assets/categories", { method: "POST", body }),

  updateCategory: (id: string, body: UpdateCategoryBody) =>
    request<ApiAssetCategory>(`/assets/categories/${id}`, {
      method: "PATCH",
      body,
    }),

  /** The workshop list. Open work sorts first whatever the sort. */
  repairs: (params: RepairListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiRepair>("/assets/maintenance", {
      query: { pageSize: 100, ...params },
      ...(signal ? { signal } : {}),
    }),

  /**
   * Edit or finish a repair. Finishing the last open one puts the item back in
   * the pool — unless somebody is holding it, or it has been written off.
   */
  updateRepair: (id: string, body: UpdateRepairBody) =>
    request<ApiRepair>(`/assets/maintenance/${id}`, { method: "PATCH", body }),

  summary: (signal?: AbortSignal) =>
    request<ApiAssetSummary>("/assets/summary", {
      ...(signal ? { signal } : {}),
    }),

  /**
   * What one person holds. **Needs no permission for your own id** — the person
   * who has to hand the laptop back is the one who should see the list.
   */
  forEmployee: (employeeId: string, signal?: AbortSignal) =>
    request<ApiHoldings>(`/assets/employees/${employeeId}`, {
      ...(signal ? { signal } : {}),
    }),

  list: (params: AssetListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiAsset>("/assets", {
      query: {
        pageSize: 100,
        ...params,
        ...(params.unassigned ? { unassigned: "true" } : {}),
        ...(params.includeArchived ? { includeArchived: "true" } : {}),
      },
      ...(signal ? { signal } : {}),
    }),

  create: (body: CreateAssetBody) =>
    request<ApiAssetDetail>("/assets", { method: "POST", body }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiAssetDetail>(`/assets/${id}`, { ...(signal ? { signal } : {}) }),

  update: (id: string, body: UpdateAssetBody) =>
    request<ApiAssetDetail>(`/assets/${id}`, { method: "PATCH", body }),

  /** Archive, never delete. Refused while somebody is holding it. */
  archive: (id: string) =>
    request<{ id: string; archived: boolean; note: string }>(`/assets/${id}`, {
      method: "DELETE",
    }),

  restore: (id: string) =>
    request<ApiAssetDetail>(`/assets/${id}/restore`, { method: "POST" }),

  /** Refused while it is already out, and the message names who has it. */
  assign: (id: string, body: AssignBody) =>
    request<ApiAssetDetail>(`/assets/${id}/assign`, { method: "POST", body }),

  /** Closes exactly one assignment and says which. */
  returnAsset: (id: string, body: ReturnBody) =>
    request<ApiReturnResult>(`/assets/${id}/return`, { method: "POST", body }),

  /**
   * Log a repair. Moves the item to the workshop **only when nobody is holding
   * it** — a laptop being fixed while still assigned stays with its holder,
   * because they are still on the hook for it.
   */
  addRepair: (id: string, body: CreateRepairBody) =>
    request<ApiRepair>(`/assets/${id}/maintenance`, { method: "POST", body }),
};

/* -------------------------------------------------------------------- money */

/** Kobo from the wire to naira for a screen. */
export const naira = (value: number): number => Math.round(value) / 100;

/** Naira from a form to kobo. Rounds, so a stray float cannot ride along. */
export const kobo = (amount: number): number => Math.round(amount * 100);

export type { Paged };
