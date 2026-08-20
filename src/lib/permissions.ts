"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/permission-keys";
import { permissionsApi, type UserAccess } from "@/lib/api/permissions";
import { useEmployeeStore } from "@/lib/store/employees";
import { useRolePreview } from "@/lib/store/permissions";
import { useSession } from "@/lib/store/session";

/**
 * What the signed-in person is allowed to do.
 *
 * This is the primitive every role-aware screen is built on, so the surface is
 * deliberately tiny. Four things and one type:
 *
 * ```ts
 * const { permissions, can, loading } = usePermissions(); // the whole set
 * const allowed = useCan("APPROVE_PAYROLL");              // one, reactive
 * <Can permission="RUN_PAYROLL">…</Can>                   // gate a control
 * const isManager = useIsManager();                       // has direct reports
 * ```
 *
 * plus `hasPermission(set, key)` for code that is handed a set rather than a
 * hook — the nav filter is the case that matters.
 *
 * ## Why this is not security, and why it is still worth having
 *
 * A permission check in a browser is not a control: the browser belongs to the
 * user, and anything they can edit they can lie about. Enforcement lives in the
 * API, where `requirePermissions` runs against the database. What these hooks buy
 * is the thing enforcement cannot: **an interface that only offers what will
 * work.** A button that returns "You do not have permission" was a design
 * failure two clicks earlier.
 *
 * The old `/settings/roles` page said this in a `Callout`. It does not need to be
 * said on screen — a screen that never offers the impossible has already made
 * the point. It needs to be true in the code, which is what this file is for.
 *
 * ## Where the set comes from
 *
 * | Mode | Set |
 * |---|---|
 * | Loading | empty |
 * | Signed out | empty |
 * | Demo | everything — unless a role is being previewed, then that role's set |
 * | Connected | the union across the person's roles, from the API |
 *
 * Connected, the set arrives twice. The access token's claims give it instantly,
 * which is what stops the nav flashing; `GET /permissions/users/:id/permissions`
 * then confirms it from the database and adds *which role granted what*. The
 * second read is authoritative: a token stays valid for minutes after the role
 * behind it was narrowed, and the interface should catch up before the token
 * does.
 *
 * Demo mode holds everything because a demo exists to show the product, and a
 * demo where the seeded account cannot open payroll shows nothing. That is the
 * same decision `useSession().can` already made. `useRolePreview` in
 * `lib/store/permissions.ts` is the deliberate way to see less.
 */

export { PERMISSION_KEYS };
export type { PermissionKey };

/**
 * A set of permissions.
 *
 * A `Set` rather than an array so a lookup is a lookup, and so "holds
 * everything" needs no special case — it is simply a set with fifteen members.
 */
export type PermissionSet = ReadonlySet<PermissionKey>;

export const ALL_PERMISSIONS: PermissionSet = new Set(PERMISSION_KEYS);
export const NO_PERMISSIONS: PermissionSet = new Set<PermissionKey>();

/**
 * Does this set hold this permission?
 *
 * A plain function on purpose: the nav filter is given a set and a required
 * permission and has no business calling a hook per item.
 */
export function hasPermission(set: PermissionSet, permission: PermissionKey): boolean {
  return set.has(permission);
}

/** Any one of them is enough. What a nav *group* usually needs. */
export function hasAnyPermission(
  set: PermissionSet,
  permissions: readonly PermissionKey[],
): boolean {
  return permissions.some((permission) => set.has(permission));
}

/**
 * Build a set from whatever the wire gave us.
 *
 * Unknown strings are dropped rather than trusted: a backend one release ahead
 * can send a key this build has never heard of, and a permission nobody can spell
 * is a permission nobody should be granted by accident.
 */
export function toPermissionSet(keys: readonly string[]): PermissionSet {
  const known = new Set<PermissionKey>();
  for (const key of keys) {
    if ((PERMISSION_KEYS as readonly string[]).includes(key)) {
      known.add(key as PermissionKey);
    }
  }
  return known;
}

/* ------------------------------------------------------------ the snapshot */

/**
 * The last set `usePermissions` resolved.
 *
 * Exists only so `can()` can answer outside render — inside an event handler, or
 * in a helper that is not a component. It is written from an effect and read
 * without subscribing, so it does **not** cause anything to re-render, and it is
 * up to one tick behind: use `useCan` or `<Can>` for anything that appears on
 * screen.
 *
 * It starts empty, which means `can()` fails closed before the first render.
 * That is the right direction for a primitive whose job is deciding what to
 * offer: hiding something that should be there is a bug somebody reports, and
 * offering something that will fail is a bug they distrust the product for.
 */
let snapshot: PermissionSet = NO_PERMISSIONS;

/** Written from an effect in `usePermissions`, so `can()` is at most a tick behind. */
function publish(next: PermissionSet) {
  snapshot = next;
}

/** Non-reactive. Prefer `useCan` in render — see the note above. */
export function can(permission: PermissionKey): boolean {
  return snapshot.has(permission);
}

/* ---------------------------------------------------------------- the hook */

export type Access = {
  permissions: PermissionSet;
  /** Reactive, and the one to reach for inside a component. */
  can: (permission: PermissionKey) => boolean;
  /** True until the session has resolved. Nothing is granted while it is true. */
  loading: boolean;
  /**
   * True when this set is real access control. False in demo mode, where the
   * set stands in for one. A screen that needs to be honest about which it is
   * showing — this editor does — reads this.
   */
  enforced: boolean;
  /** The roles behind the set. Empty until the detail request lands. */
  roles: { id: string; name: string }[];
  /**
   * Which roles granted a permission. The answer to "why can I do this?", and
   * to "removing them from HR manager was not enough".
   */
  grantedBy: (permission: PermissionKey) => string[];
  /** The role being previewed in demo mode, if any. Null is the normal state. */
  previewingRole: string | null;
};

export function usePermissions(): Access {
  const { isLoading, isSignedIn, isConnected, user } = useSession();
  const preview = useRolePreview();

  /**
   * Keyed by the account it belongs to, not a bare value.
   *
   * Signing out and back in as somebody else must not inherit the first
   * person's permissions, and the reset on sign-out is the thing that gets
   * forgotten. Comparing the key during render is also what lets the effect
   * avoid a synchronous `setState`, which cascades a render for nothing.
   */
  const [loaded, setLoaded] = useState<{ forUser: string; access: UserAccess } | null>(
    null,
  );

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!isConnected || !userId) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const access = await permissionsApi.userAccess(userId, controller.signal);
        if (!cancelled) setLoaded({ forUser: userId, access });
      } catch {
        /* Keep the token's claims. Losing the "why" is a smaller failure than
           blanking the interface, and the claims are the same set in all but
           the minutes after a change. */
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, userId]);

  const detail =
    isConnected && loaded && userId !== null && loaded.forUser === userId
      ? loaded.access
      : null;

  const claimed = useMemo(
    () => (user ? toPermissionSet(user.permissions) : NO_PERMISSIONS),
    [user],
  );

  const fromApi = useMemo(
    () => (detail ? toPermissionSet(detail.permissions) : null),
    [detail],
  );

  const previewSet = useMemo(
    () => (preview.role ? toPermissionSet(preview.role.permissions) : null),
    [preview.role],
  );

  const permissions = useMemo<PermissionSet>(() => {
    if (isLoading || !isSignedIn) return NO_PERMISSIONS;
    if (!isConnected) return previewSet ?? ALL_PERMISSIONS;
    return fromApi ?? claimed;
  }, [isLoading, isSignedIn, isConnected, previewSet, fromApi, claimed]);

  /* Kept in step so `can()` can answer outside render. An idempotent cache
     write to a module variable, not React state — nothing subscribes to it, so
     it belongs in an effect rather than in the render pass. */
  useEffect(() => {
    publish(permissions);
  }, [permissions]);

  const roles = useMemo(() => {
    if (!isConnected) {
      return preview.role
        ? [{ id: preview.role.id, name: preview.role.name }]
        : [];
    }
    return detail ? detail.roles.map(({ id, name }) => ({ id, name })) : [];
  }, [isConnected, detail, preview.role]);

  const grantedBy = useCallback(
    (permission: PermissionKey): string[] =>
      detail?.grants.find((grant) => grant.permission === permission)?.viaRoles ??
      [],
    [detail],
  );

  return {
    permissions,
    can: useCallback(
      (permission: PermissionKey) => permissions.has(permission),
      [permissions],
    ),
    loading: isLoading,
    enforced: isConnected,
    roles,
    grantedBy,
    previewingRole: preview.role ? preview.role.name : null,
  };
}

/** One permission, reactive. The everyday form. */
export function useCan(permission: PermissionKey): boolean {
  return usePermissions().permissions.has(permission);
}

/**
 * Gate a control.
 *
 * ```tsx
 * <Can permission="APPROVE_PAYROLL">
 *   <Button variant="approve">Approve run</Button>
 * </Can>
 * ```
 *
 * An array means *any of them*, which is what a section heading usually wants.
 * `fallback` is for the rare case where the absence needs saying — most of the
 * time it should render nothing, because a control the reader cannot use is
 * better absent than present and greyed. The exception is this editor's own
 * switches, where "you cannot grant this" is the information.
 *
 * Written with no JSX so this file stays a `.ts` — the primitive is imported by
 * plain modules (the nav filter among them) and a `.tsx` in `lib/` invites the
 * next person to put a component in it.
 */
export function Can({
  permission,
  fallback = null,
  children,
}: {
  permission: PermissionKey | PermissionKey[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactNode {
  const { permissions } = usePermissions();
  const allowed = Array.isArray(permission)
    ? hasAnyPermission(permissions, permission)
    : permissions.has(permission);
  return allowed ? children : fallback;
}

/**
 * True when the signed-in person has anybody reporting to them.
 *
 * Not a permission, which is exactly why it is here. "Approve leave for their
 * team" is a permission; *having* a team is a fact about the org chart, and half
 * the product's role-rendering turns on it — one `/performance` that shows your
 * own goals or your team's, one `/approvals` that is empty or is not.
 *
 * Connected, it asks the API for the count and keeps only "any". Demo, it reads
 * the live employee store rather than the seed array, so promoting somebody into
 * a manager on `/people/[id]` is reflected here immediately — the mistake
 * `HANDOVER.md` records against `RUN_PEOPLE`.
 */
export function useIsManager(): boolean {
  const { isConnected, employeeId } = useSession();
  const local = useEmployeeStore();
  /* Keyed by the employee, for the same reason `usePermissions` keys its detail. */
  const [reports, setReports] = useState<{ forEmployee: string; count: number } | null>(
    null,
  );

  useEffect(() => {
    if (!isConnected || !employeeId) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const count = await permissionsApi.directReportCount(
          employeeId,
          controller.signal,
        );
        if (!cancelled) setReports({ forEmployee: employeeId, count });
      } catch {
        /* Treated as "not a manager" rather than crashing a layout. */
        if (!cancelled) setReports({ forEmployee: employeeId, count: 0 });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, employeeId]);

  if (!employeeId) return false;
  if (isConnected) {
    return reports !== null && reports.forEmployee === employeeId && reports.count > 0;
  }
  return local.directory.some((person) => person.managerId === employeeId);
}
