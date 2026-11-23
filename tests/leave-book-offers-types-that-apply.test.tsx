/**
 * U55 (HR-26), web part: the booking form offered Maternity to a man booking
 * his own leave. It filtered on the gender in the directory, and an employee
 * reading the directory gets name-only rows with no gender, so nothing was
 * filtered. Their own record carries it, and that is what is read now.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "@/components/ui";
import type { LeaveTypeRow } from "@/lib/api/leave";

const base: LeaveTypeRow = {
  id: "t-annual",
  name: "Annual",
  entitledDays: 20,
  accrual: "ANNUAL_UPFRONT",
  carryOverMax: 0,
  carryOverExpiresMonths: 0,
  requiresEvidence: false,
  minNoticeDays: 0,
  isPaid: true,
  eligibleGender: null,
  attachmentPolicy: "OPTIONAL",
  attachmentRequiredOverDays: null,
  reasonRequired: null,
};

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: () => false,
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ employeeId: "chidi", isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/employees-api", async (original) => ({
  ...(await original<typeof import("@/lib/store/employees-api")>()),
  useEmployee: () => ({
    employee: { id: "chidi", managerId: "mgr-1", gender: "male" },
  }),
  /* An employee's directory read: no full rows, so no gender. */
  useEmployeeDirectory: () => ({ employees: [] }),
}));
vi.mock("@/lib/store/attendance", async (original) => ({
  ...(await original<typeof import("@/lib/store/attendance")>()),
  useAttendancePolicy: () => ({ policy: { workingWeekdays: [1, 2, 3, 4, 5] } }),
}));
vi.mock("@/lib/store/holidays", () => ({
  usePublicHolidays: () => ({ holidays: [] }),
}));
vi.mock("@/lib/store/leave-api", () => ({
  useLeaveTypes: () => ({
    types: [
      base,
      { ...base, id: "t-mat", name: "Maternity", eligibleGender: "female" },
      { ...base, id: "t-pat", name: "Paternity", eligibleGender: "male" },
    ],
  }),
  useLeaveBalancesFor: () => ({ of: () => undefined }),
  useLeaveMutations: () => ({ create: vi.fn(), connected: true }),
}));
vi.mock("@/lib/store/leave-files", () => ({
  useLeaveFileLimits: () => ({ limits: null, storage: false }),
  useAttachmentRule: () => ({ rule: null }),
}));

const { BookLeaveDialog } = await import("@/app/(app)/people/leave/book-leave");

describe("booking your own leave", () => {
  it("offers only the types that apply to you", () => {
    render(
      <ToastProvider>
        <BookLeaveDialog
          open
          onClose={vi.fn()}
          onCreated={vi.fn()}
          requests={[]}
        />
      </ToastProvider>,
    );
    const options = Array.from(
      (screen.getByLabelText(/^Type/) as HTMLSelectElement).options,
    ).map((o) => o.textContent);
    expect(options.join(" ")).toContain("Paternity");
    expect(options.join(" ")).not.toContain("Maternity");
  });
});
