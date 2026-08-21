"use client";

import { useMemo } from "react";
import { usePermissions, useIsManager } from "@/lib/permissions";
import { useDemoRoles } from "@/lib/store/permissions";
import { useSession } from "@/lib/store/session";

/**
 * Which kind of user is signed in.
 *
 * ## Why a role needs saying out loud
 *
 * This product deliberately shows a different app to different people: the
 * sidebar is filtered by permission and by feature flag, `/performance` renders
 * your goals or your team's, `/approvals` is full or empty. That is the
 * usability argument (see `PARITY.md`), and it has a cost — nothing on screen
 * used to tell you *which* of those apps you were looking at. Somebody testing
 * a permission change, or an administrator who has just switched accounts, had
 * to infer it from what was missing.
 *
 * It is also the cheapest guard against the failure `HANDOVER.md` records twice
 * over: one person's name rendered beside another person's data. A badge that
 * says "Payroll officer" beside a payroll screen showing everything is a
 * question somebody asks out loud.
 *
 * ## Where the answer comes from
 *
 * | Mode | Roles |
 * |---|---|
 * | Loading | none, and the badge renders nothing rather than guessing |
 * | Connected | `GET /permissions/users/:id/permissions`, falling back to the names the session carries |
 * | Demo | the roles the persona holds in `lib/mock/roles.ts`, live through `/settings/roles` |
 * | Demo, previewing a role | that role, because that is genuinely what the app is rendering as |
 *
 * The connected fallback matters: the detail request takes a moment, and the
 * session already knows the names because sign-in, register and `/auth/me` all
 * return them. Showing the session's answer immediately and letting the
 * authoritative one replace it is the same pattern `usePermissions` uses for the
 * set itself — a token stays valid for minutes after the role behind it was
 * narrowed, and the interface should catch up before the token does.
 *
 * ## What this deliberately does not do
 *
 * It does not invent a role. An account in no role gets no badge, not a badge
 * reading "No role": the two states this hook cannot tell apart are "genuinely
 * holds nothing" and "an API one deploy behind did not send the field", and the
 * first is rare while the second is a wrong claim about somebody's access.
 * `/settings/roles` has a "Your access" panel, which is the screen that can be
 * definite about it.
 */

export type SessionRole = { id: string; name: string };

/**
 * The visual tier a role is rendered in.
 *
 * Four, not one per role, because a company can create as many roles as it
 * likes and a per-role palette would be a colour nobody can learn. `custom`
 * exists so a created role reads as *a* role rather than borrowing the
 * treatment of a shipped one it may share nothing with.
 */
export type RoleTier = "owner" | "admin" | "custom" | "staff";

/**
 * The shipped role names, mapped to a tier.
 *
 * Matched exactly, and that is safe: `SYSTEM_ROLES` in
 * `approvehr-api/src/modules/permissions/service.ts` seeds these four names into
 * every organisation and the API freezes a built-in role's name, so the string
 * that arrives on the wire is the string below. Anything else is a role the
 * customer made, and `custom` is the honest answer for it — guessing a tier from
 * a name like "Regional director" would be a claim about permissions nobody
 * told us.
 */
const SHIPPED_TIERS: Readonly<Record<string, RoleTier>> = {
  Owner: "owner",
  "HR manager": "admin",
  "Payroll officer": "admin",
  Employee: "staff",
};

/** Most privileged first. Custom sits above Employee: it was made to add something. */
const TIER_RANK: Readonly<Record<RoleTier, number>> = {
  owner: 0,
  admin: 1,
  custom: 2,
  staff: 3,
};

export function roleTier(name: string): RoleTier {
  return SHIPPED_TIERS[name] ?? "custom";
}

/**
 * Most privileged first, then alphabetical.
 *
 * Ranking has to be total and stable: the badge shows one name and hides the
 * rest behind it, so "which one is shown" cannot depend on the order the API
 * happened to return the join rows in.
 */
export function rankRoles(roles: readonly SessionRole[]): SessionRole[] {
  return [...roles].sort((a, b) => {
    const byTier = TIER_RANK[roleTier(a.name)] - TIER_RANK[roleTier(b.name)];
    return byTier !== 0 ? byTier : a.name.localeCompare(b.name);
  });
}

export type SessionRoles = {
  /** True while the session or its roles are still resolving. */
  loading: boolean;
  /** Ranked, most privileged first. Empty is a real answer — see the header. */
  roles: SessionRole[];
  /** The one a badge shows. */
  primary: SessionRole | null;
  /** The rest, which a badge must make discoverable rather than drop. */
  extra: SessionRole[];
  /**
   * Has direct reports. Not a role and not a permission: "approve leave for
   * their team" is a permission, *having* a team is a fact about the org chart,
   * and half the product's role-rendering turns on it.
   */
  isManager: boolean;
  /** True when these roles are real access control rather than the demo's. */
  enforced: boolean;
  /** The demo role being previewed, if any. Null is the normal state. */
  previewing: string | null;
};

export function useSessionRoles(): SessionRoles {
  const { isLoading, isConnected, employeeId, roles: fromSession } = useSession();
  const { roles: fromAccess, previewingRole } = usePermissions();
  const demo = useDemoRoles(employeeId);
  const isManager = useIsManager();

  const resolved = useMemo(() => {
    /* `usePermissions` answers for both modes once it has an answer: the
       detail endpoint when connected, the previewed role when not. Either is
       more authoritative than the fallbacks below, so it wins. */
    if (fromAccess.length > 0) return rankRoles(fromAccess);
    return rankRoles(isConnected ? fromSession : demo);
  }, [fromAccess, isConnected, fromSession, demo]);

  return {
    loading: isLoading,
    roles: resolved,
    primary: resolved[0] ?? null,
    extra: resolved.slice(1),
    isManager,
    enforced: isConnected,
    previewing: previewingRole,
  };
}
