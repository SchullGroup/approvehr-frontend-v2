import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The New objective dialog's "Due quarter" starts on the current quarter, read
 * from the company's clock rather than the demo seed's fixed August.
 */

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ employeeId: "emp-1", isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
  useHeadedDepartmentIds: () => new Set<string>(),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], people: [] }),
}));
vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({ cycles: [] }),
}));
vi.mock("@/lib/store/ai", () => ({
  useAssistantAvailable: () => ({ available: false, loading: false }),
  useObjectiveSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));

const { NewKpiDialog } = await import("@/app/(app)/performance/goal-dialogs");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("New objective, on 21 October 2026", () => {
  it("starts Due quarter on Q4 2026, not the ended Q3", () => {
    render(
      <NewKpiDialog
        open
        mode="objective"
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    const select = screen.getByLabelText(/Due quarter/) as HTMLSelectElement;
    expect(select.value).toBe("2026-Q4");
    expect(select.value).not.toBe("2026-Q3");
  });
});
