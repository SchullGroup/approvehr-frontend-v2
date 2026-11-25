/**
 * U81 (PAY-13): "Who is in the pension scheme" asked the API for
 * `status=active`, which it refuses (the statuses are upper case), so the list
 * always read "Nobody to show." and nobody could be taken out of the scheme.
 * A refused read, and a reader the API sends only names to, said the same
 * thing as a company with nobody in it.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";

const directoryCalls: unknown[] = [];
let directory: Record<string, unknown> = {};

vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: (params: unknown) => {
    directoryCalls.push(params);
    return directory;
  },
  useEmployeeMutations: () => ({ update: vi.fn() }),
}));
vi.mock("@/lib/payroll/use-settings", () => ({
  usePayrollSettings: () => ({
    settings: { pension: { enabled: true } },
    loading: false,
  }),
}));
vi.mock("@/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui")>();
  return { ...actual, useToast: () => ({ push: vi.fn() }) };
});

import { PensionSchemePanel } from "@/app/(app)/payroll/pay-setup/pension-scheme-panel";

const base = {
  employees: [],
  people: [],
  lookupOnly: false,
  total: 0,
  loading: false,
  error: null,
  connected: true,
  archivedIds: new Set<string>(),
  answeredKey: "k",
  reload: vi.fn(),
};

beforeEach(() => {
  directoryCalls.length = 0;
  directory = { ...base };
});

describe("who is in the pension scheme", () => {
  it("asks for active people in the API's own word", () => {
    render(<PensionSchemePanel canEdit />);
    expect(directoryCalls[0]).toMatchObject({ status: "ACTIVE" });
  });

  it("does not call a refused read an empty company", () => {
    directory = {
      ...base,
      error: new ApiError(
        400,
        "validation_failed",
        "Some fields are not valid.",
      ),
    };
    render(<PensionSchemePanel canEdit />);
    expect(screen.queryByText("Nobody to show.")).toBeNull();
    expect(screen.getByText(/did not load/i)).toBeInTheDocument();
  });

  it("says why the list is empty for somebody sent only names", () => {
    directory = {
      ...base,
      lookupOnly: true,
      people: [
        { id: "e1", fullName: "Ada Eze", jobTitle: "Clerk", department: null },
      ],
    };
    render(<PensionSchemePanel canEdit={false} />);
    expect(screen.queryByText("Nobody to show.")).toBeNull();
    expect(
      screen.getByText(/needs the “Edit records” permission/),
    ).toBeInTheDocument();
  });
});
