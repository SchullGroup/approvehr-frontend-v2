"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * Roles and permissions — `/api/v1/permissions`.
 *
 * Typed wrappers only, in the same hand-written style as `endpoints.ts`. Nothing
 * here carries money, so nothing here converts any.
 *
 * ## The copy is not in this file
 *
 * `GET /permissions/catalogue` returns every permission with a plain-English
 * label, a one-line description, its section, and whether it is sensitive. That
 * is deliberate on the API's side and has to be respected here: the labels ship
 * with the enum, so a permission added to the backend can never reach the editor
 * as `APPROVE_PAYROLL`. There is therefore **no permission copy in this file**
 * and no local section list. A screen renders what it is served.
 *
 * The one place a catalogue exists on this side is the demo mirror in
 * `lib/store/permissions.ts`, which only runs when there is no API to ask.
 *
 * ## `PermissionKey` comes from the leaf, not from `lib/permissions.ts`
 *
 * The union of keys is domain vocabulary rather than transport, so screens
 * import it from `@/lib/permissions`, which re-exports it. This file reaches for
 * `@/lib/permission-keys` directly because `lib/permissions.ts` imports this
 * one — going the other way would close a cycle, and the leaf exists to make
 * that impossible rather than merely unlikely. See its header.
 *
 * ## The gap you will hit
 *
 * There is no endpoint that lists user *accounts*. `/employees` returns employee
 * records with no `userId` on them, and adding somebody to a role needs a user
 * id. So `assignable()` below assembles its candidates from the membership of
 * every existing role, which is the only set of accounts the API will currently
 * disclose. It is honest and it works, but somebody who holds no role at all
 * cannot be listed — see the note on the function.
 */

/* ------------------------------------------------------------------- shapes */

/** The five groups the editor renders as sections. Order comes from the API. */
export type SectionKey = "money" | "people" | "timeOff" | "company" | "records";

export type CatalogueEntry = {
  key: PermissionKey;
  /** "Approve payroll", never `APPROVE_PAYROLL`. */
  label: string;
  description: string;
  section: SectionKey;
  /** Moves money, exposes pay, or hands out access. The editor marks these. */
  sensitive: boolean;
};

export type CatalogueSection = {
  key: SectionKey;
  title: string;
  permissions: CatalogueEntry[];
};

/** A pair that should not sit in one role. Advisory — the API never blocks it. */
export type SeparationRule = {
  permissions: PermissionKey[];
  labels: string[];
  message: string;
};

export type Catalogue = {
  sections: CatalogueSection[];
  /** The same entries flat, so a lookup by key need not walk the sections. */
  permissions: CatalogueEntry[];
  separationOfDuties: SeparationRule[];
};

/** Mirrors `SerializedRole` in the API's permissions service. */
export type ApiRole = {
  id: string;
  name: string;
  description: string | null;
  /** Ordered by the catalogue, so the same set always renders the same way. */
  permissions: PermissionKey[];
  /** The same list with copy attached, so a list view needs no second call. */
  labels: string[];
  /** Built-in: name and permissions are frozen, description is not. */
  isSystem: boolean;
  /** Live, and only counts accounts that can still sign in. */
  memberCount: number;
  /** Separation-of-duties notes for this role. Advisory. */
  warnings: string[];
  createdAt: string;
};

export type RoleList = {
  roles: ApiRole[];
  counts: {
    roles: number;
    /** Zero is the state the API's last-owner guard exists to prevent. */
    peopleWhoCanManageAccess: number;
  };
};

export type RoleMember = {
  userId: string;
  name: string;
  email: string;
  employeeId: string | null;
  /** Null means invited and never opened it — not the same as "no access". */
  lastSignInAt: string | null;
};

export type AddedMember = { userId: string; name: string };

/** `added` and `alreadyIn` are separate so re-adding is idempotent and honest. */
export type AddMembersResult = {
  role: ApiRole;
  added: AddedMember[];
  alreadyIn: AddedMember[];
};

/** The answer to "why can Ada approve payroll?" */
export type UserAccess = {
  userId: string;
  name: string;
  email: string;
  active: boolean;
  roles: { id: string; name: string; isSystem: boolean }[];
  permissions: PermissionKey[];
  grants: {
    permission: PermissionKey;
    label: string;
    description: string;
    /** Plural: two roles can both carry it, so removing one may not be enough. */
    viaRoles: string[];
  }[];
};

export type CreateRoleBody = {
  name: string;
  description?: string;
  permissions?: PermissionKey[];
};

/** Every field optional; `permissions` replaces the set whole. */
export type UpdateRoleBody = {
  name?: string;
  /** `null` clears it. Absent leaves it alone. */
  description?: string | null;
  permissions?: PermissionKey[];
};

/* -------------------------------------------------------------------- calls */

export const permissionsApi = {
  /** Static copy. Needs a session but no permission — see the router's header. */
  catalogue: (signal?: AbortSignal): Promise<Catalogue> =>
    request<Catalogue>("/permissions/catalogue", {
      ...(signal ? { signal } : {}),
    }),

  /** Not paginated: the editor renders every role at once, on purpose. */
  roles: (signal?: AbortSignal): Promise<RoleList> =>
    request<RoleList>("/permissions/roles", { ...(signal ? { signal } : {}) }),

  role: (id: string, signal?: AbortSignal): Promise<ApiRole> =>
    request<ApiRole>(`/permissions/roles/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  createRole: (body: CreateRoleBody): Promise<ApiRole> =>
    request<ApiRole>("/permissions/roles", { method: "POST", body }),

  updateRole: (id: string, body: UpdateRoleBody): Promise<ApiRole> =>
    request<ApiRole>(`/permissions/roles/${id}`, { method: "PATCH", body }),

  deleteRole: (
    id: string,
  ): Promise<{ id: string; name: string; deleted: true }> =>
    request<{ id: string; name: string; deleted: true }>(
      `/permissions/roles/${id}`,
      { method: "DELETE" },
    ),

  /** Paginated and searchable: this one can genuinely be the whole company. */
  members: (
    roleId: string,
    params: { q?: string; page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ): Promise<Paged<RoleMember>> =>
    requestPaged<RoleMember>(`/permissions/roles/${roleId}/members`, {
      query: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 25,
        q: params.q,
      },
      ...(signal ? { signal } : {}),
    }),

  addMembers: (roleId: string, userIds: string[]): Promise<AddMembersResult> =>
    request<AddMembersResult>(`/permissions/roles/${roleId}/members`, {
      method: "POST",
      body: { userIds },
    }),

  removeMember: (
    roleId: string,
    userId: string,
  ): Promise<{ roleId: string; userId: string; name: string }> =>
    request<{ roleId: string; userId: string; name: string }>(
      `/permissions/roles/${roleId}/members/${userId}`,
      { method: "DELETE" },
    ),

  /** Anybody's with `MANAGE_ROLES`; your own always. */
  userAccess: (userId: string, signal?: AbortSignal): Promise<UserAccess> =>
    request<UserAccess>(`/permissions/users/${userId}/permissions`, {
      ...(signal ? { signal } : {}),
    }),

  /**
   * Every account the API will name, gathered from the roles it already holds.
   *
   * There is no `GET /users`, so this is the whole of the available directory of
   * *accounts*. Consequences worth knowing before you rely on it:
   *
   * - Somebody who holds no role at all is invisible here. In practice every
   *   account arrives holding one (registration puts the founder in Owner), so
   *   this is a narrow gap rather than a common one — but it is a gap, and the
   *   picker says so rather than implying the list is everybody.
   * - It is one request per role. Roles are few by design and the result is
   *   cached by the caller, so this is a handful of requests once per dialog.
   *
   * The fix is a `GET /permissions/users` on the backend. Until it exists, this
   * is the honest version.
   */
  async assignable(roleIds: string[], signal?: AbortSignal): Promise<RoleMember[]> {
    const pages = await Promise.all(
      roleIds.map((roleId) =>
        permissionsApi
          .members(roleId, { pageSize: 200 }, signal)
          .then((result) => result.data)
          /* One role failing must not empty the picker. */
          .catch(() => [] as RoleMember[]),
      ),
    );

    const seen = new Map<string, RoleMember>();
    for (const person of pages.flat()) {
      if (!seen.has(person.userId)) seen.set(person.userId, person);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * How many people report to an employee. Only the count is used.
   *
   * Lives here rather than in `endpoints.ts` for two reasons: that file is not
   * mine to edit, and its `EmployeeListParams` has no `managerId`. `pageSize: 1`
   * because the answer needed is "any?", and `meta.total` carries it without
   * transferring a team.
   */
  async directReportCount(employeeId: string, signal?: AbortSignal): Promise<number> {
    const result = await requestPaged<{ id: string }>("/employees", {
      query: { managerId: employeeId, pageSize: 1 },
      ...(signal ? { signal } : {}),
    });
    return result.meta.total;
  },
};
