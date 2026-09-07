"use client";

import { request } from "@/lib/api/client";
import { fetchFile, type FileDownload } from "@/lib/api/download";

/**
 * Remittance schedules — what an approved payroll owes each body.
 *
 * ## What changed underneath this
 *
 * `/payroll/statutory` used to say, honestly, that `StatutorySchedule` existed
 * in the schema and nothing wrote it. Approval writes it now, so the screen can
 * stop describing the feature and show it.
 *
 * The screen's own history is the reason to be careful here: it once carried a
 * hardcoded `Lagos State IRS, ₦14,203,880, 198 staff, **Filed**`. A **Filed**
 * badge against a return nobody filed is a regulatory penalty wearing a green
 * badge, which is why `filedAt` is only ever set by somebody recording a real
 * filing with a real reference.
 */

export type StatutoryKind = "PAYE" | "PENSION" | "NHF" | "NSITF" | "ITF";

export type ApiStatutorySchedule = {
  id: string;
  kind: StatutoryKind;
  /** A state revenue service, a PFA, or the fund itself. */
  recipient: string;
  employeeCount: number;
  amountKobo: number;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  filedAt: string | null;
  reference: string | null;
  /**
   * False where the API's deadline rule is a reading rather than a section
   * number — NSITF today. Shown rather than hidden: presenting an unconfirmed
   * deadline as settled is how somebody misses one.
   */
  dueDateConfirmed: boolean;
  /** The statute the deadline comes from. Rendered, not kept in a comment. */
  dueDateBasis: string;
};

export const statutory = {
  forRun: (runId: string, signal?: AbortSignal) =>
    request<ApiStatutorySchedule[]>(`/payroll/runs/${runId}/schedules`, {
      ...(signal ? { signal } : {}),
    }),

  /** The per-person breakdown, as the file somebody uploads to a portal. */
  file: (id: string): Promise<FileDownload> =>
    fetchFile(`/payroll/schedules/${id}/file`, "schedule"),

  /**
   * Record a real filing. The reference is required by the API and is the whole
   * point — "filed" with nothing to quote is the badge this screen used to fake.
   */
  markFiled: (id: string, reference: string) =>
    request<ApiStatutorySchedule>(`/payroll/schedules/${id}/filed`, {
      method: "POST",
      body: { reference },
    }),
};

/** What each body is called on screen. The API sends the enum. */
export const KIND_LABEL: Record<StatutoryKind, string> = {
  PAYE: "PAYE",
  PENSION: "Pension",
  NHF: "National Housing Fund",
  NSITF: "NSITF",
  ITF: "ITF",
};

/**
 * How late a schedule is, in words, or how long is left.
 *
 * Written once so the table and any future reminder cannot describe the same
 * date differently.
 */
export function dueIn(dueDate: string, today = new Date()): string {
  const due = new Date(`${dueDate}T00:00:00.000Z`);
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const days = Math.round((due.getTime() - start.getTime()) / 86_400_000);
  if (days < 0) return `${String(Math.abs(days))} days overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${String(days)} days`;
}
