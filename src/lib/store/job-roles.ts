"use client";

import { useCallback, useEffect } from "react";
import { ApiError } from "@/lib/api/client";
import {
  jobRoles as api,
  type ApiJobRole,
  type ApiJobRoleDetail,
  type JobRoleBody,
} from "@/lib/api/job-roles";
import { createSharedResource } from "@/lib/shared-resource";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * The job role catalogue.
 *
 * ## Demo mode reads a small fixed catalogue and refuses every write
 *
 * Unlike departments — which write locally now, because a demo department
 * contradicts nothing — a job role decides **what people are judged on**. The
 * competency set it carries is read by the performance module, which in demo
 * mode is served by its own fixed figures; a locally invented role with locally
 * invented targets would put a standard on screen that no review in this
 * browser was scored against, which is the fabricated-proof rule one module
 * along.
 *
 * So the demo shows what a catalogue *is* — three roles, one with competencies
 * — and says plainly that changing it needs the API. A reader can see the
 * shape of the feature without being taught that it works offline.
 */

type Outcome<T> = { value: T; error: ApiError | null };

const catalogue = createSharedResource<Outcome<ApiJobRole[]>>(
  async (_key, signal) => {
    try {
      return { value: await api.list(signal), error: null };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      return { value: [], error: error instanceof ApiError ? error : null };
    }
  },
);

const oneRole = createSharedResource<Outcome<ApiJobRoleDetail | null>>(
  async (key, signal) => {
    try {
      return { value: await api.get(key, signal), error: null };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      return { value: null, error: error instanceof ApiError ? error : null };
    }
  },
);

export const DEMO_ROLE_HEADING = "Changing the catalogue needs the API";

/** The non-obvious half: it is not "no server", it is "these decide marks". */
export const DEMO_ROLE_REASON =
  "A role carries what people on it are judged against, and the appraisal " +
  "figures in this browser were worked out somewhere else — a role invented " +
  "here would put a standard on screen that no review was ever scored on.";

/**
 * Three roles, so the shape of a catalogue is visible offline.
 *
 * Gated on `DEMO_ENABLED` like every other seed, so a production build carries
 * none of it. Deliberately generic titles: no seed persona, nothing that could
 * be mistaken for a real company's job architecture.
 */
const DEMO_ROLES: ApiJobRole[] = DEMO_ENABLED
  ? [
      {
        id: "role-eng-1",
        title: "Software Engineer",
        family: "Engineering",
        summary: "Builds and maintains the product.",
        responsibilities: null,
        requirements: null,
        defaultGrade: null,
        headcount: 3,
        openRequisitions: 1,
        archived: false,
        archivedAt: null,
      },
      {
        id: "role-fin-1",
        title: "Payroll Analyst",
        family: "Finance",
        summary: "Prepares the monthly payroll and the statutory filings.",
        responsibilities: null,
        requirements: null,
        defaultGrade: null,
        headcount: 1,
        openRequisitions: 0,
        archived: false,
        archivedAt: null,
      },
      {
        id: "role-ops-1",
        title: "Operations Lead",
        family: "Operations",
        summary: null,
        responsibilities: null,
        requirements: null,
        defaultGrade: null,
        headcount: 2,
        openRequisitions: 0,
        archived: false,
        archivedAt: null,
      },
    ]
  : [];

export function useJobRoles() {
  const { isConnected } = useSession();
  const outcome = catalogue.use(isConnected ? "all" : null);

  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || revalidation === 0) return;
    catalogue.refresh("all");
  }, [isConnected, revalidation]);

  const reload = useCallback(() => catalogue.refresh("all"), []);

  if (!isConnected) {
    return {
      roles: DEMO_ROLES,
      loading: false,
      error: null,
      readOnly: true,
      reload: () => {},
    };
  }

  return {
    roles: outcome?.value ?? [],
    loading: outcome === undefined,
    error: outcome?.error ?? null,
    readOnly: false,
    reload,
  };
}

export function useJobRole(id: string | null) {
  const { isConnected } = useSession();
  const key = isConnected && id ? id : null;
  const outcome = oneRole.use(key);

  const demo = DEMO_ROLES.find((role) => role.id === id) ?? null;

  if (!isConnected) {
    return {
      /* The demo detail carries an empty competency list rather than an
         invented one. "This role is judged on nothing extra" is a real state
         and an honest one; inventing targets would be the thing this store's
         header refuses. */
      role: demo === null ? null : { ...demo, competencies: [] },
      loading: false,
      error: null,
      reload: () => {},
    };
  }

  return {
    role: outcome?.value ?? null,
    loading: key !== null && outcome === undefined,
    error: outcome?.error ?? null,
    reload: () => {
      if (key) oneRole.refresh(key);
    },
  };
}

/** Every write, each refreshing both reads so the list and the drawer agree. */
export function useJobRoleActions() {
  const { isConnected } = useSession();

  const refreshBoth = useCallback((id?: string) => {
    catalogue.refresh("all");
    if (id) oneRole.refresh(id);
  }, []);

  const guard = useCallback(() => {
    if (!isConnected)
      throw new Error(`${DEMO_ROLE_HEADING}. ${DEMO_ROLE_REASON}`);
  }, [isConnected]);

  return {
    readOnly: !isConnected,
    create: useCallback(
      async (body: JobRoleBody) => {
        guard();
        const role = await api.create(body);
        refreshBoth();
        return role;
      },
      [guard, refreshBoth],
    ),
    update: useCallback(
      async (id: string, body: JobRoleBody) => {
        guard();
        const role = await api.update(id, body);
        refreshBoth(id);
        return role;
      },
      [guard, refreshBoth],
    ),
    setCompetencies: useCallback(
      async (
        id: string,
        rows: { competencyId: string; targetLevel: number }[],
      ) => {
        guard();
        const role = await api.setCompetencies(id, rows);
        refreshBoth(id);
        return role;
      },
      [guard, refreshBoth],
    ),
    archive: useCallback(
      async (id: string) => {
        guard();
        const role = await api.archive(id);
        refreshBoth(id);
        return role;
      },
      [guard, refreshBoth],
    ),
    restore: useCallback(
      async (id: string) => {
        guard();
        const role = await api.restore(id);
        refreshBoth(id);
        return role;
      },
      [guard, refreshBoth],
    ),
  };
}
