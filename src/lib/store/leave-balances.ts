"use client";

import { useCallback } from "react";
import type { LeaveBalance } from "@/lib/mock/people";
import {
  balanceForRequest,
  leaveBalancesFor,
  remainingDays,
} from "@/lib/workflows/leave";
import { useCompanySettings } from "./company";
import { useLeaveStore } from "./leave";

/**
 * The only way a screen should ask for a leave balance.
 *
 * `leaveBalancesFor` takes the company leave policy as an optional third
 * argument, and optional is exactly the problem: the settings page passed it and
 * every other screen forgot to, so changing Annual leave from 20 days to 26
 * moved the preview on `/settings/leave` and nothing else. One number, two
 * answers — the precise class of bug the shared stores exist to prevent.
 *
 * The pure functions stay pure and take their inputs explicitly, because that is
 * what makes them testable. This hook is the seam: it reads both stores and
 * closes over them, so a caller cannot supply half the inputs. If you find
 * yourself importing `leaveBalancesFor` into a component, import this instead.
 */
export function useLeaveBalances() {
  const leave = useLeaveStore();
  const { settings } = useCompanySettings();

  const policies = settings.leave.types;
  const requests = leave.requests;

  const forEmployee = useCallback(
    (employeeId: string): LeaveBalance[] =>
      leaveBalancesFor(employeeId, requests, policies),
    [requests, policies],
  );

  const forType = useCallback(
    (employeeId: string, type: string): LeaveBalance | undefined =>
      balanceForRequest(employeeId, type, requests, policies),
    [requests, policies],
  );

  const remainingFor = useCallback(
    (employeeId: string, type: string): number | undefined => {
      const balance = balanceForRequest(employeeId, type, requests, policies);
      return balance ? remainingDays(balance) : undefined;
    },
    [requests, policies],
  );

  return { forEmployee, forType, remainingFor, policies };
}
