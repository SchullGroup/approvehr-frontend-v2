"use client";

import { useCallback, useSyncExternalStore } from "react";
import { EMPLOYEES } from "@/lib/mock/people";
import type { Employee } from "@/lib/types";
import { createPersistedState } from "./persisted";

/*
 * Employee edits.
 *
 * Overrides are stored as a sparse patch per employee rather than a full copy
 * of the directory. Two reasons: the seed data can change under an edit
 * without stranding it, and a diff of what a user actually changed is exactly
 * what the API will need to PATCH later.
 *
 * Persists to localStorage so an edit survives navigation — the point of
 * editing is that the payroll run and the record page then agree.
 *
 * ## This store established the pattern and is now on the factory
 *
 * It used to hold its own copy of the hydration logic, kept that way
 * deliberately because it was load-bearing verified code. What ended that is
 * `current()`: the hand-rolled copy had no equivalent and no place to put one,
 * so its four write paths computed from `read()` — which is the seed until
 * something subscribes — and there was nothing to reach for instead. Rather
 * than grow a second `hydrate()` here, it moved.
 *
 * Two things the move fixed for free:
 *
 *   - the old `subscribe` set `hydrated = true` *before* the microtask and with
 *     no `typeof window` guard, so a server render that reached it would have
 *     marked the module hydrated and stopped the browser from ever loading
 *     storage. The factory checks the window first, for exactly this;
 *   - there was no version field, which is what stranded payloads when
 *     `created`/`archived` arrived.
 *
 * `legacy` carries the pre-envelope payload across. This store's shape has not
 * changed — only the wrapper — and emptying every demo browser's directory to
 * land an audit about writes that silently discard data would be its own joke.
 */

/**
 * Three kinds of local change, kept apart deliberately:
 *
 *   overrides  sparse patches against seed records
 *   created    whole records that did not exist in the seed
 *   archived   ids hidden from the directory
 *
 * Archiving rather than deleting is the right default for an employment
 * record: it is a legal document, and payroll history has to keep pointing at
 * something. Nothing here is ever destroyed.
 */
type StoreState = {
  overrides: Record<string, Partial<Employee>>;
  created: Employee[];
  archived: string[];
};

const EMPTY: StoreState = { overrides: {}, created: [], archived: [] };

const store = createPersistedState<StoreState>({
  key: "approvehr.employee.store",
  empty: EMPTY,
  version: 1,
  /* Written by this store before it used the `{ v, data }` envelope: a bare
     `StoreState`. Recognised by the three arrays rather than by "it parsed",
     so a key holding something else entirely is dropped rather than spread
     over the state. Any one of the three is enough — the oldest payloads had
     `overrides` alone, which is what the old loader's spread over EMPTY was
     for. */
  legacy: (raw) => {
    if (typeof raw !== "object" || raw === null) return null;
    const candidate = raw as Partial<StoreState>;
    const shaped =
      (candidate.overrides !== undefined && typeof candidate.overrides === "object") ||
      Array.isArray(candidate.created) ||
      Array.isArray(candidate.archived);
    return shaped ? (candidate as StoreState) : null;
  },
});

/** Merge a base record with any stored edits. */
export function applyOverrides(
  base: Employee,
  overrides: StoreState["overrides"],
): Employee {
  const patch = overrides[base.id];
  return patch ? { ...base, ...patch } : base;
}

/**
 * A new starter needs an id and an employee number before anything else can
 * reference it. Both are derived from what already exists so they stay
 * readable and do not collide with the seed.
 */
export function nextIdentity(existing: Employee[]) {
  const nums = existing
    .map((e) => Number(e.employeeNo.replace(/\D/g, "")))
    .filter((n) => Number.isFinite(n));
  const nextNo = (Math.max(0, ...nums) + 1).toString().padStart(4, "0");
  return {
    id: `p-new-${Date.now().toString(36)}`,
    employeeNo: `AHR-${nextNo}`,
  };
}

export function useEmployeeStore() {
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );
  const { overrides, created, archived } = state;

  /* `current()` in all four writes, never `read()`. This hook subscribes, so
     any screen holding one of these has hydrated — but `update` is also reached
     from `useEmployeeMutations`, and a screen can hold that without ever
     rendering a directory. See the note at the top of `store/persisted.ts`. */

  const update = useCallback((id: string, patch: Partial<Employee>) => {
    const s = store.current();
    /* A created record is patched in place; a seed record gets an override. */
    if (s.created.some((e) => e.id === id)) {
      store.commit({
        ...s,
        created: s.created.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      });
      return;
    }
    store.commit({
      ...s,
      overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...patch } },
    });
  }, []);

  const create = useCallback((employee: Employee) => {
    const s = store.current();
    store.commit({ ...s, created: [...s.created, employee] });
  }, []);

  const archive = useCallback((id: string) => {
    const s = store.current();
    if (s.archived.includes(id)) return;
    store.commit({ ...s, archived: [...s.archived, id] });
  }, []);

  const restore = useCallback((id: string) => {
    const s = store.current();
    store.commit({ ...s, archived: s.archived.filter((x) => x !== id) });
  }, []);

  const resetAll = useCallback(() => store.reset(), []);

  /* Seed records plus anything created here, with edits applied. Archived
     records are filtered out of the directory but still resolvable by id, so
     a payslip or an approval that points at one does not break. */
  const all = [
    ...EMPLOYEES.map((e) => applyOverrides(e, overrides)),
    ...created.map((e) => applyOverrides(e, overrides)),
  ];
  const directory = all.filter((e) => !archived.includes(e.id));

  /* `get` is a render read — `useEmployeeDetail` calls it while rendering — so
     it takes the subscribed snapshot and not the store. It used to call `read()`
     twice while memoising on `[overrides, created]`, which returned the same
     cache and needed an exhaustive-deps suppression to say so. Reading the
     snapshot it is already keyed on is the same answer with the lie removed,
     and it leaves this file with no `read()` call at all: the only reference is
     the one `useSyncExternalStore` holds. */
  const get = useCallback(
    (id: string) => {
      const base =
        EMPLOYEES.find((e) => e.id === id) ?? created.find((e) => e.id === id);
      return base ? applyOverrides(base, overrides) : undefined;
    },
    [overrides, created],
  );

  return {
    directory,
    all,
    archived,
    created,
    get,
    update,
    create,
    archive,
    restore,
    resetAll,
    isArchived: (id: string) => archived.includes(id),
  };
}

/* ------------------------------------------------------------- Validation */

export type FieldError = { field: keyof Employee; message: string };

/**
 * Validates a patch before it is committed. Rules match what the Nigerian
 * statutory bodies actually accept, so a record that passes here is one
 * payroll can file with — that is the whole point of validating at all.
 */
export function validateEmployee(patch: Partial<Employee>): FieldError[] {
  const errors: FieldError[] = [];
  const has = (k: keyof Employee) => patch[k] !== undefined;

  if (has("firstName") && !String(patch.firstName ?? "").trim()) {
    errors.push({ field: "firstName", message: "First name is required." });
  }
  if (has("lastName") && !String(patch.lastName ?? "").trim()) {
    errors.push({ field: "lastName", message: "Last name is required." });
  }

  if (has("email") && patch.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(patch.email)) {
      errors.push({ field: "email", message: "That is not a valid email address." });
    }
  }

  if (has("phone") && patch.phone) {
    /* Nigerian numbers are 11 digits locally or 13 with the country code. */
    const digits = patch.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 14) {
      errors.push({
        field: "phone",
        message: "Enter a full phone number, for example +234 803 111 0011.",
      });
    }
  }

  if (has("tin") && patch.tin) {
    if (!/^\d{10}$/.test(patch.tin.replace(/\s|-/g, ""))) {
      errors.push({
        field: "tin",
        message: "A Nigerian TIN is 10 digits.",
      });
    }
  }

  if (has("pensionPin") && patch.pensionPin) {
    if (!/^PEN\d{9,12}$/i.test(patch.pensionPin.replace(/\s/g, ""))) {
      errors.push({
        field: "pensionPin",
        message: "A RSA PIN looks like PEN followed by 9 to 12 digits.",
      });
    }
  }

  if (has("grossMonthly")) {
    const v = Number(patch.grossMonthly);
    if (!Number.isFinite(v) || v <= 0) {
      errors.push({
        field: "grossMonthly",
        message: "Gross pay must be greater than zero.",
      });
    }
  }

  if (has("dateOfBirth") && patch.dateOfBirth) {
    const dob = new Date(patch.dateOfBirth);
    const age =
      (new Date("2026-08-19").getTime() - dob.getTime()) / 31_557_600_000;
    if (Number.isNaN(age)) {
      errors.push({ field: "dateOfBirth", message: "Enter a valid date." });
    } else if (age < 15) {
      errors.push({
        field: "dateOfBirth",
        message: "Employee would be under 15. Check the date.",
      });
    } else if (age > 80) {
      errors.push({
        field: "dateOfBirth",
        message: "Employee would be over 80. Check the date.",
      });
    }
  }

  return errors;
}
