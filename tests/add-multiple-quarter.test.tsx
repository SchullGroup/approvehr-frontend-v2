import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { quarterOptions } from "@/app/(app)/performance/goal-dialogs";

/**
 * "Add multiple" on KPIs starts "Due quarter" on the current quarter. It used
 * to read the demo seed's fixed August, so in October it offered Q3, which has
 * ended.
 */

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true, user: null }),
  useOrgTimezone: () => "Africa/Lagos",
}));

vi.mock("@/lib/store/employees-api", async (original) => ({
  ...(await original<typeof import("@/lib/store/employees-api")>()),
  useEmployeeDirectory: () => ({ employees: [], archivedIds: new Set() }),
}));

vi.mock("@/app/(app)/performance/kpis/import/lists", () => ({
  useObjectiveTemplateLists: () => ({
    lists: { department: [], period: [] },
  }),
}));

const { AddMultipleObjectives } =
  await import("@/app/(app)/performance/add-multiple-objectives");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T09:00:00Z"));
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the quarter list", () => {
  it("is built around the day it is given, one quarter back first", () => {
    expect(quarterOptions("2026-10-21")).toEqual([
      "2026-Q3",
      "2026-Q4",
      "2027-Q1",
      "2027-Q2",
      "2027-Q3",
    ]);
  });
});

describe("Add multiple, on 21 October 2026", () => {
  it("starts Due quarter on Q4 2026, not the ended Q3", () => {
    render(
      <ToastProvider>
        <AddMultipleObjectives
          open
          onClose={() => undefined}
          goals={[]}
          onChanged={() => undefined}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Stacked" }));
    const select = screen.getByLabelText(/Due quarter/) as HTMLSelectElement;
    expect(select.value).toBe("2026-Q4");
  });
});
