"use client";

import { useOrgTimezone, useSession } from "@/lib/store/session";
import { workingToday } from "@/lib/today";

/**
 * Today's date, as `YYYY-MM-DD`, for the person looking at the screen.
 *
 * The company's own day when connected — in the company's zone, not the
 * browser's, so two colleagues in different countries read the same month off
 * the same payroll — and the demo dataset's day in demo mode. See
 * `lib/today.ts` for why those are two different answers and why a screen must
 * not pick between them by importing a constant.
 *
 * Read during render, never at module scope: this is the value that decides
 * which month a payroll opens on, and a constant read at import is a snapshot
 * of the moment the tab loaded.
 */
export function useToday(): string {
  const { isConnected } = useSession();
  const timeZone = useOrgTimezone();
  return workingToday(isConnected, timeZone);
}
