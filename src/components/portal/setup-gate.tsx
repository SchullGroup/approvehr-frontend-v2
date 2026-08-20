"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFeatures } from "@/lib/store/features";
import { useSession } from "@/lib/store/session";

/**
 * Sends a company that has not finished setup into the wizard.
 *
 * ## Not wired yet — one line, and it is yours
 *
 * This component is finished and unused, because `app/(app)/layout.tsx` and the
 * shell belong to the orchestrator this run. To turn it on, wrap the children of
 * the app layout (inside `AuthGate`, outside `AppShell` or in it — either works):
 *
 * ```tsx
 * <AuthGate>
 *   <SetupGate>
 *     <AppShell>{children}</AppShell>
 *   </SetupGate>
 * </AuthGate>
 * ```
 *
 * ## Why a redirect and not a banner
 *
 * Setup is the second thing a customer sees, and its whole value is that it
 * happens *before* they have formed a picture of how big the product is. A
 * banner on a thirty-item sidebar has already lost that argument.
 *
 * The redirect is survivable, which is what makes it defensible rather than a
 * trap: every question can be skipped, "Skip setup" finishes with the safe
 * defaults, and `/settings/features` changes any of it later. It fires once —
 * `router.replace`, so Back does not bounce off it.
 *
 * ## Who does not get redirected
 *
 * - Anybody already under `/setup`.
 * - Anybody on `/settings/features`, which is the other half of the same job.
 * - Accounts without `MANAGE_SETTINGS`, who cannot answer the questions. An
 *   employee signing in to check a payslip is not the person who decides
 *   whether the company runs appraisals.
 * - Anything while the session or the features row is still loading. A guess
 *   here is a redirect somebody has to click their way back out of.
 *
 * In **demo mode** this fires too, once per browser, because `setupRequired` is
 * true until the wizard is finished there as well and `can()` is permissive
 * offline. That is on purpose — the wizard is the thing worth demonstrating —
 * but it does mean a fresh browser lands on `/setup` rather than `/dashboard`.
 * Wire it knowing that.
 */
export function SetupGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn, isLoading, can } = useSession();
  const features = useFeatures();

  const exempt =
    pathname.startsWith("/setup") || pathname === "/settings/features";

  const send =
    isSignedIn &&
    !isLoading &&
    !features.loading &&
    features.error === null &&
    features.setupRequired &&
    can("MANAGE_SETTINGS") &&
    !exempt;

  useEffect(() => {
    if (send) router.replace("/setup");
  }, [send, router]);

  return <>{children}</>;
}
