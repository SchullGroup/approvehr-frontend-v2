"use client";
import { useSession } from "@/lib/store/session";
import type { ApiBilling } from "@/lib/api/endpoints";

/**
 * Pure billing logic plus the one hook that reads it off the session.
 *
 * Everything below is a pure function of an `ApiBilling | null` (and, for the
 * date-sensitive ones, an injectable `now`) so it can be unit-tested without a
 * session, a clock mock or a render. `constraints.md` is the source of truth
 * for the thresholds here: a 3-day trial warning window, a grace period that
 * banners for its whole length, and a lock that only ever applies while
 * `enforced` is true.
 */

export type BillingModule = ApiBilling["modules"][number];
export const CHECKOUT_MONTHS = [1, 3, 6, 12] as const;
const DAY_MS = 86_400_000;
const TRIAL_WARNING_DAYS = 3;

export function useBilling(): ApiBilling | null {
  return useSession().user?.billing ?? null;
}

export const nairaOf = (kobo: number): number => Math.round(kobo) / 100;

export function wholeDaysUntil(
  iso: string,
  now = new Date(), // reads-the-clock: injectable "now"; compared by getTime() diff only, never reduced to a locale day
): number {
  return Math.max(0, Math.floor((Date.parse(iso) - now.getTime()) / DAY_MS));
}

export function daysLabel(days: number): string {
  if (days <= 0) return "today";
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

export function bannerFor(
  billing: ApiBilling | null,
  now = new Date(), // reads-the-clock: same injectable "now" as wholeDaysUntil, passed straight through
): { kind: "trial" | "grace"; days: number } | null {
  if (!billing) return null;
  if (billing.status === "TRIALING" && billing.trialEndsAt) {
    const days = wholeDaysUntil(billing.trialEndsAt, now);
    return days <= TRIAL_WARNING_DAYS ? { kind: "trial", days } : null;
  }
  if (billing.status === "GRACE" && billing.graceEndsAt) {
    return { kind: "grace", days: wholeDaysUntil(billing.graceEndsAt, now) };
  }
  return null;
}

export function isLockedOut(billing: ApiBilling | null): boolean {
  return !!billing && billing.enforced && !billing.entitled;
}

export function moduleLocked(
  billing: ApiBilling | null,
  module: BillingModule,
): boolean {
  return !!billing && billing.enforced && !billing.modules.includes(module);
}
