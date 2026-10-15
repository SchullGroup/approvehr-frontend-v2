"use client";

import { usePathname } from "next/navigation";
import { useBilling, isLockedOut } from "@/lib/billing";
import { usePermissions } from "@/lib/permissions";
import { Paywall } from "./paywall";

/**
 * Swaps a locked company's page for the paywall, in place — the sidebar and
 * sign-out stay, and `/billing/*` always renders so they can pay. Nothing is
 * redirected, and nothing happens while the paywall is switched off or billing
 * is unknown: the backend's fail-open rule, carried through.
 */
export function BillingGate({ children }: { children: React.ReactNode }) {
  const billing = useBilling();
  const pathname = usePathname() ?? "";
  const { can } = usePermissions();
  if (!billing || !isLockedOut(billing) || pathname.startsWith("/billing")) {
    return <>{children}</>;
  }
  return <Paywall billing={billing} canPay={can("MANAGE_SETTINGS")} />;
}
