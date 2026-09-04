"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import {
  DEVICE_SECRET_NEEDS_API,
  attendanceApi,
  type ApiAttendanceDevice,
  type ApiDeviceEnrolment,
  type ApiDeviceSecret,
  type ApiEnrolmentResult,
  type DevicePatch,
  type NewDeviceInput,
} from "@/lib/api/attendance";
import { useRevalidation } from "@/lib/revalidate";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";

/**
 * Biometric terminals — the registry, and who each one thinks its users are.
 *
 * Shaped on `lib/store/work-locations.ts`: the demo value is a `useMemo` that
 * never touches state, the fetch is an async IIFE behind a `cancelled` guard,
 * and staleness is decided by comparing a key during render rather than by
 * clearing state in an effect.
 *
 * ## What demo mode does, and the one thing it refuses
 *
 * Registering a device, naming it, putting it at an office, switching it off and
 * on, and mapping enrolment numbers to people **all work offline**. That follows
 * the same argument that opened up work locations: the employees are in
 * localStorage too, and "can you connect our biometric machines?" is a question
 * asked in a room with no database. A screen that answers it with "needs the
 * API" is the feature not existing.
 *
 * **The signing secret is the exception, and it is refused rather than faked.**
 * A `whsec_`-prefixed string generated in a browser is indistinguishable from a
 * real credential, and its only possible use is to be handed to whoever installs
 * the agent — where it would sign deliveries nothing would accept. That is the
 * green-"Paid"-over-money-nobody-moved failure wearing a different hat. So
 * `secret` is **null** offline and the screen says why, in
 * `DEVICE_SECRET_NEEDS_API`; rotation refuses in the same words.
 *
 * ## The honest gap, stated on the screen
 *
 * **No punch can ever arrive in demo mode**, because the thing that delivers one
 * is an HTTP endpoint. So `lastSeenAt` stays null, `unmappedPunches` is null
 * rather than 0, and nothing a demo device is mapped to reaches a timesheet.
 * Connected, `POST /attendance/devices/punches` is the only thing that writes a
 * punch, and it writes every one.
 */

/* ------------------------------------------------------------- the demo store */

type DemoEnrolment = {
  id: string;
  deviceId: string;
  deviceUserId: string;
  employeeId: string;
};

type DemoState = {
  devices: ApiAttendanceDevice[];
  enrolments: DemoEnrolment[];
};

/**
 * No seeded devices, deliberately.
 *
 * Every other demo store ships a seed so its screen has something on it. This
 * one does not, because a seeded terminal would show "Last seen: never" beside
 * a mapping that produces no attendance, and a reader would reasonably conclude
 * the integration was broken. An empty state that explains what a device is and
 * offers to register one is the more honest first screen — and registering one
 * is the demo.
 */
const DEMO_SEED: DemoState = { devices: [], enrolments: [] };

const demoStore = createPersistedState<DemoState>({
  key: "approvehr.attendance-devices.store",
  empty: DEMO_SEED,
  version: 1,
});

let demoCounter = 0;
const demoId = (prefix: string): string => {
  demoCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${demoCounter}`;
};

/**
 * Same shape the API refuses with, so a screen renders one message either way.
 *
 * A `function` declaration rather than a const arrow: only a declaration
 * returning `never` narrows the code after the call, and the callers below rely
 * on it.
 */
function refuse(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

/** Switched-off ones last, then alphabetical — the API's own order clause. */
const byLabel = (a: ApiAttendanceDevice, b: ApiAttendanceDevice): number => {
  if ((a.archivedAt === null) !== (b.archivedAt === null)) {
    return a.archivedAt === null ? -1 : 1;
  }
  return a.label.localeCompare(b.label);
};

/** A fixed timestamp for a demo archive — see `work-locations.ts` for why. */
const DEMO_ARCHIVED_AT = "1970-01-01T00:00:00.000Z";

/* -------------------------------------------------------------------- reading */

export type DeviceSource = "api" | "demo";

export type DeviceListState = {
  devices: ApiAttendanceDevice[];
  loading: boolean;
  error: ApiError | null;
  source: DeviceSource;
  reload: () => void;
};

const NO_DEVICES: ApiAttendanceDevice[] = [];

/**
 * Every terminal, for the screen that manages them.
 *
 * `includeArchived` is a required argument rather than a default, for the same
 * reason `useWorkLocationList` makes it one: the two answers are for different
 * callers and getting it wrong is invisible.
 */
export function useAttendanceDevices(includeArchived: boolean): DeviceListState {
  const { isConnected } = useSession();
  const demo = useSyncExternalStore(
    demoStore.subscribe,
    demoStore.read,
    demoStore.getServerSnapshot,
  );

  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    devices: ApiAttendanceDevice[];
    error: ApiError | null;
  } | null>(null);

  const key = `${includeArchived ? "all" : "on"}|${tick}`;
  const revalidation = useRevalidation();

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const devices = await attendanceApi.devices(
          includeArchived ? { includeArchived: true } : {},
          controller.signal,
        );
        if (!cancelled) setFetched({ key, devices, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            devices: NO_DEVICES,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, includeArchived, key, revalidation]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const demoDevices = useMemo<ApiAttendanceDevice[]>(() => {
    const rows = demo.devices.map((device) => ({
      ...device,
      /* Recomputed on read rather than stored, so a mapping written by the
         enrolment hook cannot leave a stale count on the device row. */
      enrolments: demo.enrolments.filter((row) => row.deviceId === device.id).length,
    }));
    return (includeArchived ? rows : rows.filter((row) => row.archivedAt === null))
      .slice()
      .sort(byLabel);
  }, [demo, includeArchived]);

  const matched = fetched !== null && fetched.key === key;

  if (!isConnected) {
    return { devices: demoDevices, loading: false, error: null, source: "demo", reload };
  }

  return {
    devices: matched ? fetched.devices : NO_DEVICES,
    loading: !matched,
    error: matched ? fetched.error : null,
    source: "api",
    reload,
  };
}

export type EnrolmentListState = {
  enrolments: ApiDeviceEnrolment[];
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
};

const NO_ENROLMENTS: ApiDeviceEnrolment[] = [];

/**
 * Who a terminal's own enrolment numbers mean.
 *
 * `deviceId` is nullable so the drawer can call this unconditionally: a hook
 * behind a condition is a hook nobody can move, and the alternative is mounting
 * a second component purely to satisfy the rule.
 *
 * The demo names are resolved from the employee names passed in by the caller,
 * because this store has no directory of its own and building one would be a
 * second answer to "who works here".
 */
export function useDeviceEnrolments(
  deviceId: string | null,
  nameOf: (employeeId: string) => { name: string; employeeNo: string } | null,
): EnrolmentListState {
  const { isConnected } = useSession();
  const demo = useSyncExternalStore(
    demoStore.subscribe,
    demoStore.read,
    demoStore.getServerSnapshot,
  );

  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    enrolments: ApiDeviceEnrolment[];
    error: ApiError | null;
  } | null>(null);

  const key = `${deviceId ?? "none"}|${tick}`;

  useEffect(() => {
    if (!isConnected || deviceId === null) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const enrolments = await attendanceApi.deviceEnrolments(
          deviceId,
          controller.signal,
        );
        if (!cancelled) setFetched({ key, enrolments, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            enrolments: NO_ENROLMENTS,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, deviceId, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const demoEnrolments = useMemo<ApiDeviceEnrolment[]>(() => {
    if (deviceId === null) return NO_ENROLMENTS;
    return demo.enrolments
      .filter((row) => row.deviceId === deviceId)
      .map((row) => {
        const person = nameOf(row.employeeId);
        return {
          id: row.id,
          deviceUserId: row.deviceUserId,
          employeeId: row.employeeId,
          /* A person removed from the demo directory after being mapped. Said
             rather than rendered blank, because a blank name beside an
             enrolment number reads as a bug in the mapping. */
          employeeName: person?.name ?? "Somebody no longer on the staff list",
          employeeNo: person?.employeeNo ?? "—",
          createdAt: DEMO_ARCHIVED_AT,
        };
      })
      .sort((a, b) => a.deviceUserId.localeCompare(b.deviceUserId));
  }, [demo, deviceId, nameOf]);

  const matched = fetched !== null && fetched.key === key;

  if (!isConnected) {
    return { enrolments: demoEnrolments, loading: false, error: null, reload };
  }
  if (deviceId === null) {
    return { enrolments: NO_ENROLMENTS, loading: false, error: null, reload };
  }

  return {
    enrolments: matched ? fetched.enrolments : NO_ENROLMENTS,
    loading: !matched,
    error: matched ? fetched.error : null,
    reload,
  };
}

/* -------------------------------------------------------------------- writing */

export type DeviceMutations = {
  /** Returns the plaintext secret, once. */
  register: (input: NewDeviceInput) => Promise<ApiDeviceSecret>;
  update: (id: string, patch: DevicePatch) => Promise<ApiAttendanceDevice>;
  archive: (id: string) => Promise<ApiAttendanceDevice>;
  restore: (id: string) => Promise<ApiAttendanceDevice>;
  /** Refused offline: a locally generated secret would sign nothing. */
  rotateSecret: (id: string) => Promise<ApiDeviceSecret>;
  map: (
    deviceId: string,
    body: { deviceUserId: string; employeeId: string },
    /** Only read offline, where there is no server to resolve a name. */
    employeeName?: string,
  ) => Promise<ApiEnrolmentResult>;
  unmap: (
    deviceId: string,
    enrolmentId: string,
  ) => Promise<{ removed: string; note: string }>;
};

/**
 * Every write, in one hook.
 *
 * Connected these need `MANAGE_SETTINGS`; gate the controls with
 * `useCan("MANAGE_SETTINGS")` rather than letting somebody press a button that
 * answers 403.
 *
 * The demo refusals mirror the API's message for message — the duplicate serial
 * naming the device that holds it, and the enrolment number that already belongs
 * to somebody. A screen that only behaves correctly against the real thing is a
 * screen nobody tested.
 */
export function useDeviceMutations(): DeviceMutations {
  const { isConnected } = useSession();

  const register = useCallback(
    async (input: NewDeviceInput): Promise<ApiDeviceSecret> => {
      if (isConnected) return attendanceApi.registerDevice(input);

      /* `current()`, not `read()`. A write computed from the seed silently
         discards what is already in storage. See `persisted.ts`. */
      const state = demoStore.current();
      const serialNumber = input.serialNumber.trim();
      const clash = state.devices.find(
        (device) => device.serialNumber.toLowerCase() === serialNumber.toLowerCase(),
      );
      if (clash) {
        refuse(
          409,
          "conflict",
          clash.archivedAt
            ? `${clash.label} already has that serial number and is switched off. Turn it back on rather than registering a second one.`
            : `${clash.label} already has that serial number.`,
        );
      }

      const row: ApiAttendanceDevice = {
        id: demoId("dd"),
        serialNumber,
        label: input.label.trim(),
        workLocationId: input.workLocationId ?? null,
        /* Resolved by the screen, which holds the location list. Storing a name
           here would be a second copy of it, stale from the next rename. */
        workLocationName: null,
        active: true,
        lastSeenAt: null,
        /* Null, never a fabricated `whsec_…`. See this file's header. */
        secret: null,
        enrolments: 0,
        unmappedPunches: null,
        archivedAt: null,
        createdAt: DEMO_ARCHIVED_AT,
      };

      demoStore.commit({ ...state, devices: [...state.devices, row] });
      return { ...row, secret: "", secretNote: DEVICE_SECRET_NEEDS_API };
    },
    [isConnected],
  );

  const update = useCallback(
    async (id: string, patch: DevicePatch): Promise<ApiAttendanceDevice> => {
      if (isConnected) return attendanceApi.updateDevice(id, patch);

      const state = demoStore.current();
      const existing = state.devices.find((device) => device.id === id);
      if (!existing) refuse(404, "not_found", "That device could not be found.");

      const next: ApiAttendanceDevice = {
        ...existing,
        label: patch.label === undefined ? existing.label : patch.label.trim(),
        workLocationId:
          patch.workLocationId === undefined
            ? existing.workLocationId
            : patch.workLocationId,
        active: patch.active === undefined ? existing.active : patch.active,
      };
      demoStore.commit({
        ...state,
        devices: state.devices.map((device) => (device.id === id ? next : device)),
      });
      return next;
    },
    [isConnected],
  );

  const setArchived = useCallback(
    async (id: string, archived: boolean): Promise<ApiAttendanceDevice> => {
      const state = demoStore.current();
      const existing = state.devices.find((device) => device.id === id);
      if (!existing) refuse(404, "not_found", "That device could not be found.");
      if (archived && existing.archivedAt) {
        refuse(409, "conflict", `${existing.label} is already off.`);
      }
      if (!archived && !existing.archivedAt) {
        refuse(409, "conflict", `${existing.label} is already on.`);
      }

      /* Archived, never deleted, in both modes: the punches a device sent are
         evidence a payslip was prorated against. */
      const next: ApiAttendanceDevice = {
        ...existing,
        archivedAt: archived ? DEMO_ARCHIVED_AT : null,
        active: !archived,
      };
      demoStore.commit({
        ...state,
        devices: state.devices.map((device) => (device.id === id ? next : device)),
      });
      return next;
    },
    [],
  );

  const archive = useCallback(
    async (id: string): Promise<ApiAttendanceDevice> =>
      isConnected ? attendanceApi.archiveDevice(id) : setArchived(id, true),
    [isConnected, setArchived],
  );

  const restore = useCallback(
    async (id: string): Promise<ApiAttendanceDevice> =>
      isConnected ? attendanceApi.restoreDevice(id) : setArchived(id, false),
    [isConnected, setArchived],
  );

  const rotateSecret = useCallback(
    async (id: string): Promise<ApiDeviceSecret> => {
      if (isConnected) return attendanceApi.rotateDeviceSecret(id);
      refuse(503, "unavailable", DEVICE_SECRET_NEEDS_API);
    },
    [isConnected],
  );

  const map = useCallback(
    async (
      deviceId: string,
      body: { deviceUserId: string; employeeId: string },
      employeeName?: string,
    ): Promise<ApiEnrolmentResult> => {
      if (isConnected) return attendanceApi.mapDeviceEnrolment(deviceId, body);

      const state = demoStore.current();
      const device = state.devices.find((row) => row.id === deviceId);
      if (!device) refuse(404, "not_found", "That device could not be found.");

      const deviceUserId = body.deviceUserId.trim();
      const existing = state.enrolments.find(
        (row) => row.deviceId === deviceId && row.deviceUserId === deviceUserId,
      );
      if (existing) {
        /* The API refuses a move rather than performing one, because every punch
           that number has sent is already attributed. Same refusal here. */
        refuse(
          409,
          "conflict",
          existing.employeeId === body.employeeId
            ? `${employeeName ?? "That person"} is already user ${deviceUserId} on ${device.label}.`
            : `User ${deviceUserId} on ${device.label} is already mapped to somebody. Remove that mapping first — every punch it has sent is attributed to them.`,
        );
      }

      demoStore.commit({
        ...state,
        enrolments: [
          ...state.enrolments,
          { id: demoId("de"), deviceId, deviceUserId, employeeId: body.employeeId },
        ],
      });

      const first = employeeName?.split(" ")[0] ?? "they";
      return {
        deviceUserId,
        employeeId: body.employeeId,
        employeeName: employeeName ?? "",
        /* Zero, and it is not a placeholder: there genuinely is no backlog,
           because no tap can reach a browser. The screen says so. */
        punches: 0,
        days: 0,
        /* Worded so it is true wherever it renders. `verify-demo` bans the
           obvious phrasing for a good reason: a sentence naming a mode is a
           sentence that has to be folded out of a production build, and this
           one says the thing that actually matters instead. */
        note: `Future taps from user ${deviceUserId} would be ${first}'s. None can arrive without a server — a tap is delivered over the network.`,
      };
    },
    [isConnected],
  );

  const unmap = useCallback(
    async (
      deviceId: string,
      enrolmentId: string,
    ): Promise<{ removed: string; note: string }> => {
      if (isConnected) return attendanceApi.unmapDeviceEnrolment(deviceId, enrolmentId);

      const state = demoStore.current();
      const existing = state.enrolments.find(
        (row) => row.id === enrolmentId && row.deviceId === deviceId,
      );
      if (!existing) refuse(404, "not_found", "That mapping could not be found.");

      demoStore.commit({
        ...state,
        enrolments: state.enrolments.filter((row) => row.id !== enrolmentId),
      });
      return {
        removed: existing.deviceUserId,
        note: "Taps already collected keep the person they were attributed to. New ones from this number will have nobody until it is mapped again.",
      };
    },
    [isConnected],
  );

  return { register, update, archive, restore, rotateSecret, map, unmap };
}
