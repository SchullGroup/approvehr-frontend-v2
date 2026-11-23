/**
 * U16 (HR-2, HR-19): the Onboarding page listed people whose status was
 * Onboarding, and the add form saves people as Active, so new starters never
 * appeared, Home counted 5 and the page showed 2, and the ticks lived in one
 * browser. Connected, the page now lists the open checklists the server keeps
 * (GET /onboarding?state=open), ticks through the API, and closes a checklist
 * through the API, which says what is still in the way.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiOnboardingRow } from "@/lib/api/onboarding";

const list = vi.fn();
const updateTask = vi.fn();
const complete = vi.fn();
vi.mock("@/lib/api/onboarding", async (original) => ({
  ...(await original<typeof import("@/lib/api/onboarding")>()),
  onboardingApi: {
    list: (...a: unknown[]) => list(...a),
    updateTask: (...a: unknown[]) => updateTask(...a),
    complete: (...a: unknown[]) => complete(...a),
  },
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: () => true,
}));

import { ServerOnboarding } from "@/app/(app)/people/onboarding/server-onboarding";

const row = (over: Partial<ApiOnboardingRow> = {}): ApiOnboardingRow => ({
  id: "ob1",
  employee: {
    id: "e1",
    name: "Tobi Adeyemi",
    employeeNo: "AHR-0012",
    jobTitle: "Accountant",
    departmentName: "Finance",
    startDate: "2026-11-20",
  },
  status: "IN_PROGRESS",
  statusLabel: "Working through the checklist",
  progress: { total: 2, done: 1, mandatory: 2, mandatoryDone: 1, percent: 50 },
  completedAt: null,
  tasks: [
    {
      id: "t1",
      label: "Laptop handed over",
      owner: "it",
      order: 1,
      dueOffsetDays: 0,
      mandatory: true,
      derivedFrom: "NONE",
      derived: false,
      completed: false,
      completedAt: null,
      completedByName: null,
      note: null,
    },
    {
      id: "t2",
      label: "Bank details on file",
      owner: "hr",
      order: 2,
      dueOffsetDays: 0,
      mandatory: true,
      derivedFrom: "BANK_AND_PENSION",
      derived: true,
      completed: true,
      completedAt: "2026-11-20T09:00:00Z",
      completedByName: null,
      note: null,
    },
  ],
  ...over,
});

beforeEach(() => {
  list.mockReset();
  list.mockResolvedValue({ data: [row()], meta: { total: 1 } });
  updateTask.mockReset().mockResolvedValue({});
  complete.mockReset();
});

const view = () =>
  render(
    <ToastProvider>
      <ServerOnboarding />
    </ToastProvider>,
  );

describe("onboarding, from the open checklists", () => {
  it("lists open checklists, whatever the person's status", async () => {
    view();
    expect(await screen.findByText("Tobi Adeyemi")).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ state: "open" }),
      expect.anything(),
    );
    expect(screen.getByText("1 of 2 done")).toBeInTheDocument();
    /* 20 Nov 2026 is before the clock these tests run on. */
    expect(
      screen.getByText(/Accountant · Finance · started /),
    ).toBeInTheDocument();
  });

  it("ticks a task through the server, and not one the record answers", async () => {
    view();
    const laptop = await screen.findByRole("checkbox", {
      name: /Laptop handed over/,
    });
    expect(
      screen.getByRole("checkbox", { name: /Bank details on file/ }),
    ).toBeDisabled();
    await userEvent.click(laptop);
    expect(updateTask).toHaveBeenCalledWith("t1", { completed: true });
  });

  it("closes a checklist through the server and says what is in the way", async () => {
    complete.mockRejectedValue(
      new ApiError(422, "unprocessable", "Laptop handed over is still to do."),
    );
    view();
    await userEvent.click(
      await screen.findByRole("button", { name: "Finish onboarding" }),
    );
    expect(complete).toHaveBeenCalledWith("ob1");
    await waitFor(() =>
      expect(
        screen.getByText("Laptop handed over is still to do."),
      ).toBeInTheDocument(),
    );
  });

  it("says nobody is onboarding when no checklist is open", async () => {
    list.mockResolvedValue({ data: [], meta: { total: 0 } });
    view();
    expect(
      await screen.findByText("Nobody is onboarding right now"),
    ).toBeInTheDocument();
  });
});
