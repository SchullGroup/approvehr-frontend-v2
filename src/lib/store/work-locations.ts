"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import {
  GEOFENCE_ALL_OR_NOTHING,
  attendanceApi,
  type ApiWorkLocation,
  type NewWorkLocationInput,
  type WorkLocationPatch,
} from "@/lib/api/attendance";
import { WORK_LOCATIONS } from "@/lib/mock/attendance";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";

/**
 * Work locations — the offices, branches and sites people clock in at.
 *
 * Split out of `lib/store/attendance.ts` when a location became a thing you
 * edit rather than a name you pick, for the same reason the holiday calendar
 * left `leave-api.ts`. Attendance and locations share an API module because
 * they share a router; they do not share a screen, a cache or a refresh, and a
 * hook that reloaded "attendance" after a radius changed would refetch two
 * hundred clock-ins to redraw one circle.
 *
 * Structurally this follows `lib/store/shifts.ts`: the demo value is a
 * `useMemo` that never touches state, the fetch is an async IIFE inside the
 * effect behind a `cancelled` guard, and staleness is decided by comparing a
 * key during render rather than by clearing state in an effect. Any other
 * arrangement is a setState in an effect, which the lint rule catches and which
 * produces a render nobody can see.
 *
 * ## Demo mode is editable here, and that reverses an earlier decision
 *
 * The hook this replaces refused every write offline, on the grounds that "a
 * location is company configuration, and inventing one locally would have it
 * vanish on the next machine while every employee assigned to it kept pointing
 * at nothing."
 *
 * That argument does not survive contact with the rest of demo mode. **The
 * employees are in localStorage too.** A person created in demo mode vanishes on
 * the next machine exactly as a location would — the record page says so in
 * those words rather than refusing to create anybody — so the objection is an
 * argument against demo mode itself, not against this screen. And a company
 * with five branches cannot be shown five fences on a laptop with no database,
 * which is the room this product actually gets sold in.
 *
 * `lib/store/departments.ts` still refuses, and that stays right: a department
 * is a payroll reporting boundary, so a demo tree would *contradict* the demo's
 * own payroll screens. A location cannot contradict anything here — see the gap
 * below, which is the honest cost and is stated on the screen.
 *
 * ## The one honest gap, demo only
 *
 * **A demo fence is not enforced, because the demo captures no position.**
 * Clocking in offline writes a time and a location id and never asks the device
 * where it is, so a 250-metre radius on the demo's Abeokuta site refuses
 * nothing. Connected, `clockIn` in `attendance/service.ts` is the only thing
 * that judges a fence, and it judges every fence. `/settings/locations` says
 * this rather than leaving somebody to discover that a rule they configured did
 * nothing.
 */

/* ------------------------------------------------------------- the demo store */

type DemoState = { locations: ApiWorkLocation[]; archived: string[] };

/**
 * Seeded from `lib/mock/attendance.ts` so the demo picker and this screen agree
 * about which places exist. The ids differ between modes — uuids from the API,
 * `loc-hq` from the seed — which is why nothing may hardcode one.
 */
const DEMO_SEED: DemoState = {
  locations: WORK_LOCATIONS.map((location) => ({
    id: location.id,
    name: location.name,
    addressLine: location.address,
    remoteAllowed: location.remoteAllowed,
    latitude: location.latitude ?? null,
    longitude: location.longitude ?? null,
    radiusMetres: location.radiusMetres ?? null,
    /* The same derivation the API does. A fence plus remoteAllowed is a fence
       nothing applies, and the two must not disagree about that. */
    geofenceEnforced:
      location.latitude !== undefined &&
      location.longitude !== undefined &&
      location.radiusMetres !== undefined &&
      !location.remoteAllowed,
    archivedAt: null,
    /* Absent, not zero. `Employee.location` in the demo is a city ("Lagos, NG")
       and nothing joins it to a work location, so a count here would be a
       guess — and "0 people" beside a branch four people work at is the claim
       this product is sold against. The screen says the figure needs the API. */
    assigned: null,
  })),
  archived: [],
};

const demoStore = createPersistedState<DemoState>({
  key: "approvehr.work-locations.store",
  empty: DEMO_SEED,
  version: 1,
});

let demoCounter = 0;
const demoId = (): string => {
  demoCounter += 1;
  return `dl-${Date.now().toString(36)}-${demoCounter}`;
};

/**
 * Same shape the API refuses with, so a screen renders one message either way.
 *
 * A `function` declaration rather than a const arrow, for the reason
 * `store/shifts.ts` gives: only a declaration returning `never` narrows the code
 * after the call, and the callers below rely on that.
 */
function refuse(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

const byName = (a: ApiWorkLocation, b: ApiWorkLocation): number => {
  /* Switched-off ones last, then alphabetical. Matches the API's order clause so
     the two modes present the same list in the same sequence. */
  if ((a.archivedAt === null) !== (b.archivedAt === null)) {
    return a.archivedAt === null ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
};

/**
 * The fence, recomputed after every write.
 *
 * One function so `create`, `update` and the seed cannot come to disagree about
 * what "enforced" means. The rule is the API's, stated on `WorkLocation.latitude`
 * in the schema: all three parts present, and staff not allowed to clock in from
 * anywhere.
 */
function enforced(row: {
  latitude: number | null;
  longitude: number | null;
  radiusMetres: number | null;
  remoteAllowed: boolean;
}): boolean {
  const whole =
    row.latitude !== null && row.longitude !== null && row.radiusMetres !== null;
  return whole && !row.remoteAllowed;
}

/** The all-or-nothing rule, in the API's own words. Used by every demo write. */
function assertWholeFence(row: {
  latitude: number | null;
  longitude: number | null;
  radiusMetres: number | null;
}): void {
  const parts = [row.latitude, row.longitude, row.radiusMetres].filter(
    (part) => part !== null,
  );
  if (parts.length !== 0 && parts.length !== 3) {
    refuse(422, "unprocessable", GEOFENCE_ALL_OR_NOTHING);
  }
}

/* -------------------------------------------------------------------- reading */

export type LocationSource = "api" | "demo";

export type WorkLocationsState = {
  /** On ones first, then switched-off ones, alphabetical within each. */
  locations: ApiWorkLocation[];
  loading: boolean;
  error: ApiError | null;
  source: LocationSource;
  reload: () => void;
};

const NO_LOCATIONS: ApiWorkLocation[] = [];

/**
 * A fixed timestamp for a demo archive.
 *
 * `new Date().toISOString()` inside a `useMemo` would produce a different string
 * on every recompute, which makes an object identity change on every render and
 * is how a dependency array starts looping. Nothing renders this value — only
 * whether it is null — so a constant is honest as well as stable.
 */
const DEMO_ARCHIVED_AT = "1970-01-01T00:00:00.000Z";


/**
 * Every location, for the screen that manages them.
 *
 * `includeArchived` is a required argument rather than a default because the two
 * answers are for different callers and getting it wrong is invisible: a picker
 * that quietly offered a closed branch would let somebody clock in at a place
 * that no longer exists.
 */
export function useWorkLocationList(includeArchived: boolean): WorkLocationsState {
  const { isConnected } = useSession();
  const demo = useSyncExternalStore(
    demoStore.subscribe,
    demoStore.read,
    demoStore.getServerSnapshot,
  );

  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    locations: ApiWorkLocation[];
    error: ApiError | null;
  } | null>(null);

  const key = `${includeArchived ? "all" : "on"}|${tick}`;

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const locations = await attendanceApi.locations(
          includeArchived ? { includeArchived: true } : {},
          controller.signal,
        );
        if (!cancelled) setFetched({ key, locations, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            locations: NO_LOCATIONS,
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

  /* The demo answer, derived and never written to state. */
  const demoLocations = useMemo<ApiWorkLocation[]>(() => {
    const rows = demo.locations.map((location) =>
      demo.archived.includes(location.id)
        ? { ...location, archivedAt: DEMO_ARCHIVED_AT }
        : location,
    );
    return (includeArchived ? rows : rows.filter((row) => row.archivedAt === null))
      .slice()
      .sort(byName);
  }, [demo, includeArchived]);

  /* Staleness decided by comparing the key during render, not by clearing state
     in an effect — which would be a synchronous setState and a cascaded render. */
  const matched = fetched !== null && fetched.key === key;

  if (!isConnected) {
    return {
      locations: demoLocations,
      loading: false,
      error: null,
      source: "demo",
      reload,
    };
  }

  return {
    locations: matched ? fetched.locations : NO_LOCATIONS,
    loading: !matched,
    error: matched ? fetched.error : null,
    source: "api",
    reload,
  };
}

/**
 * The demo rows, without ever touching the network.
 *
 * For `lib/store/setup-checklist.ts`, which needs a location count in demo mode
 * and must not fire a request in connected mode — where the count arrives inside
 * the one checklist response instead. `useWorkLocationList` cannot serve that:
 * it fetches whenever a session is connected, which is right for a screen and
 * wrong for a summary that already has the figure.
 *
 * Returns switched-on locations only, which is what a count of "your offices"
 * means.
 */
export function useDemoWorkLocations(): ApiWorkLocation[] {
  const demo = useSyncExternalStore(
    demoStore.subscribe,
    demoStore.read,
    demoStore.getServerSnapshot,
  );
  return useMemo(
    () =>
      demo.locations
        .filter((location) => !demo.archived.includes(location.id))
        .slice()
        .sort(byName),
    [demo],
  );
}

/* -------------------------------------------------- reading, for a picker */

export type LocationsState = {
  locations: ApiWorkLocation[];
  loading: boolean;
  error: ApiError | null;
  source: LocationSource;
  /**
   * Adds one and returns it, so a caller can select what it just made.
   *
   * The point of returning the row rather than void: a picker that offers
   * "create a new location" has to leave the new location *chosen*. Making
   * somebody create a thing and then find it in the list they were already
   * looking at is the kind of small insult that makes a form feel hostile.
   */
  create: (input: NewWorkLocationInput) => Promise<ApiWorkLocation>;
};

/**
 * Where people clock in — the picker's view. Switched-off branches are excluded.
 *
 * Kept as its own hook rather than folded into `useWorkLocationList` because the
 * employee wizard and the clock-in screen want exactly this and nothing else:
 * the places somebody may be assigned to today, plus a way to add one inline.
 */
export function useWorkLocations(): LocationsState {
  const { locations, loading, error, source, reload } = useWorkLocationList(false);
  const { create } = useWorkLocationMutations();

  /* `reload` rather than folding the new row into local state: the API answers a
     create with the whole row, but the list this hook holds is the *server's*
     order and the caller is about to select from it. Depending on `reload` — a
     stable `useCallback` — rather than on the state object keeps this identity
     steady across renders. */
  const createAndReload = useCallback(
    async (input: NewWorkLocationInput): Promise<ApiWorkLocation> => {
      const made = await create(input);
      reload();
      return made;
    },
    [create, reload],
  );

  return { locations, loading, error, source, create: createAndReload };
}

/* -------------------------------------------------------------------- writing */

export type WorkLocationMutations = {
  create: (input: NewWorkLocationInput) => Promise<ApiWorkLocation>;
  update: (id: string, patch: WorkLocationPatch) => Promise<ApiWorkLocation>;
  /** Off, not gone. Reports how many people are still assigned there. */
  archive: (id: string) => Promise<{ name: string; assigned?: number }>;
  restore: (id: string) => Promise<{ id: string; name: string; alreadyOn: boolean }>;
};

/**
 * Every write, in one hook.
 *
 * Connected these need `MANAGE_SETTINGS`; gate the controls with
 * `useCan("MANAGE_SETTINGS")` rather than letting somebody press a button that
 * answers 403. Demo mode grants everything, which is what a demo is for.
 *
 * The demo refusals mirror the API's, message for message: the duplicate name,
 * the archived name that says it is switched off rather than taken, and the
 * half-filled fence. A screen that only behaves correctly against the real thing
 * is a screen nobody tested.
 */
export function useWorkLocationMutations(): WorkLocationMutations {
  const { isConnected } = useSession();

  const create = useCallback(
    async (input: NewWorkLocationInput): Promise<ApiWorkLocation> => {
      if (isConnected) return attendanceApi.createLocation(input);

      /* `current()`, not `read()`. A write computed from the seed silently
         discards everything already in storage — the bug that cost two exits for
         one person. See the header of `persisted.ts`. */
      const state = demoStore.current();
      const name = input.name.trim();
      const clash = state.locations.find(
        (location) => location.name.toLowerCase() === name.toLowerCase(),
      );
      if (clash) {
        refuse(
          409,
          "conflict",
          state.archived.includes(clash.id)
            ? `"${clash.name}" exists but is switched off. Turn it back on rather than making a second one.`
            : `"${clash.name}" already exists.`,
        );
      }

      const fence = {
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        radiusMetres: input.radiusMetres ?? null,
        remoteAllowed: input.remoteAllowed ?? false,
      };
      assertWholeFence(fence);

      const row: ApiWorkLocation = {
        id: demoId(),
        name,
        addressLine: input.addressLine?.trim() ? input.addressLine.trim() : null,
        ...fence,
        geofenceEnforced: enforced(fence),
        archivedAt: null,
        /* Absent, not zero — see the seed above. */
        assigned: null,
      };

      demoStore.commit({ ...state, locations: [...state.locations, row] });
      return row;
    },
    [isConnected],
  );

  const update = useCallback(
    async (id: string, patch: WorkLocationPatch): Promise<ApiWorkLocation> => {
      if (isConnected) return attendanceApi.updateLocation(id, patch);

      const state = demoStore.current();
      const existing = state.locations.find((location) => location.id === id);
      if (!existing) refuse(404, "not_found", "That work location was not found.");

      const name = patch.name === undefined ? existing.name : patch.name.trim();
      if (name.toLowerCase() !== existing.name.toLowerCase()) {
        const clash = state.locations.find(
          (location) =>
            location.id !== id && location.name.toLowerCase() === name.toLowerCase(),
        );
        if (clash) {
          refuse(
            409,
            "conflict",
            state.archived.includes(clash.id)
              ? `"${clash.name}" exists but is switched off. Turn it back on rather than renaming this one to match.`
              : `"${clash.name}" already exists.`,
          );
        }
      }

      /* Merged, then checked — the same rule as the API's `update`. Validating
         the patch alone would let a latitude with no radius into the row, and a
         fence that cannot decide anything refuses nothing with no visible cause. */
      const merged: ApiWorkLocation = {
        ...existing,
        name,
        addressLine:
          patch.addressLine === undefined
            ? existing.addressLine
            : patch.addressLine === null || patch.addressLine.trim() === ""
              ? null
              : patch.addressLine.trim(),
        remoteAllowed:
          patch.remoteAllowed === undefined
            ? existing.remoteAllowed
            : patch.remoteAllowed,
        latitude: patch.latitude === undefined ? existing.latitude : patch.latitude,
        longitude:
          patch.longitude === undefined ? existing.longitude : patch.longitude,
        radiusMetres:
          patch.radiusMetres === undefined
            ? existing.radiusMetres
            : patch.radiusMetres,
      };
      assertWholeFence(merged);
      const next: ApiWorkLocation = { ...merged, geofenceEnforced: enforced(merged) };

      demoStore.commit({
        ...state,
        locations: state.locations.map((location) =>
          location.id === id ? next : location,
        ),
      });
      return next;
    },
    [isConnected],
  );

  const archive = useCallback(
    async (id: string): Promise<{ name: string; assigned?: number }> => {
      if (isConnected) return attendanceApi.archiveLocation(id);

      const state = demoStore.current();
      const existing = state.locations.find((location) => location.id === id);
      if (!existing) refuse(404, "not_found", "That work location was not found.");
      if (state.archived.includes(id)) return { name: existing.name };

      /* Archived, never deleted, in both modes: an attendance entry and an
         employee record both point at this row, and a delete would either
         strand a timesheet or fail on the constraint. */
      demoStore.commit({ ...state, archived: [...state.archived, id] });
      /* No `assigned` offline: the API's DELETE reports who is still pointed at
         a switched-off location, and the demo cannot know. Omitted rather than
         sent as 0, so the dialog says nothing rather than saying nobody. */
      return { name: existing.name };
    },
    [isConnected],
  );

  const restore = useCallback(
    async (id: string): Promise<{ id: string; name: string; alreadyOn: boolean }> => {
      if (isConnected) return attendanceApi.restoreLocation(id);

      const state = demoStore.current();
      const existing = state.locations.find((location) => location.id === id);
      if (!existing) refuse(404, "not_found", "That work location was not found.");
      if (!state.archived.includes(id)) {
        return { id, name: existing.name, alreadyOn: true };
      }
      demoStore.commit({
        ...state,
        archived: state.archived.filter((archived) => archived !== id),
      });
      return { id, name: existing.name, alreadyOn: false };
    },
    [isConnected],
  );

  return { create, update, archive, restore };
}
