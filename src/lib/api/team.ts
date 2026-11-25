import { request } from "@/lib/api/client";

/**
 * A manager's own team, with no pay (U22, SELF-6, HR-13).
 *
 * `GET /employees/team` is the caller's direct reports plus anybody in a
 * department they head, A to Z. It carries no pay, bank, tax or pension field,
 * which is what lets a line manager read it: `/employees/:id` is refused to
 * them because a full record carries pay. Empty for somebody who manages
 * nobody. A server that predates it answers 404.
 *
 * The leave fields are read defensively: the doc names them and not their
 * shape, so a row shows what it is sent and claims nothing it is not.
 */
export type ApiTeamLeave = {
  leaveType?: string;
  startDate: string;
  endDate: string;
  days?: number;
};

export type ApiTeamBalance = {
  leaveType: string;
  remaining: number;
  entitled?: number;
};

export type ApiTeamMember = {
  id: string;
  employeeNo: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  status: string;
  employmentType: string | null;
  startDate: string | null;
  endDate: string | null;
  probationEndsAt: string | null;
  department: { id: string; name: string } | null;
  manager: { id: string; name: string } | null;
  workLocation: { id: string; name: string } | null;
  onLeaveToday: boolean;
  upcomingLeave: ApiTeamLeave[];
  leaveBalances: ApiTeamBalance[];
};

export const teamApi = {
  list: (signal?: AbortSignal) =>
    request<ApiTeamMember[]>("/employees/team", signal ? { signal } : {}),
};
