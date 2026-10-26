import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * Three people screens on the one loading and failure rule.
 *
 * What an audit found: the incomplete-records screen drew an empty table while
 * the directory was loading; the promotions screen and the probation screen each
 * had a second card that could say "nothing agreed" or "nobody has no end date"
 * while the read was still in flight. Each is a statement about people that the
 * page did not yet know. A reload after a decision keeps what is on screen.
 */

const serverError = new ApiError(500, "internal", "Something went wrong.");

const state = vi.hoisted(() => ({
  changes: {
    rows: [] as unknown[],
    loading: false,
    error: null as unknown,
    unavailable: false,
    reload: () => {},
  },
  probation: {
    due: [] as unknown[],
    needsADate: [] as unknown[],
    loading: false,
    error: null as unknown,
    readOnly: false,
    reload: () => {},
  },
  directory: {
    employees: [] as unknown[],
    loading: false,
    error: null as unknown,
    connected: true,
    reload: () => {},
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {} }),
  usePathname: () => "/people/changes",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/permissions")>()),
  useCan: () => true,
  Can: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/store/employment-changes", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/employment-changes")>()),
  useEmploymentChanges: () => state.changes,
}));
vi.mock("@/lib/store/probation", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/probation")>()),
  useProbation: () => state.probation,
  useProbationDecision: () => ({ decide: async () => {} }),
}));
vi.mock("@/lib/store/employees-api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/employees-api")>()),
  useEmployeeDirectory: () => state.directory,
}));

beforeEach(() => {
  state.changes.rows = [];
  state.changes.loading = false;
  state.changes.error = null;
  state.probation.due = [];
  state.probation.loading = false;
  state.probation.error = null;
  state.directory.employees = [];
  state.directory.loading = false;
  state.directory.error = null;
});

const SCREENS = [
  {
    name: "promotions and transfers",
    draw: async () => {
      const { ChangesScreen } =
        await import("@/app/(app)/people/changes/changes-screen");
      return <ChangesScreen />;
    },
    set: (patch: { loading?: boolean; error?: unknown }) =>
      Object.assign(state.changes, patch),
    empty: "Nothing waiting",
    failed: "Promotions and transfers did not load",
  },
  {
    name: "probation",
    draw: async () => {
      const { ProbationScreen } =
        await import("@/app/(app)/people/probation/probation-screen");
      return <ProbationScreen />;
    },
    set: (patch: { loading?: boolean; error?: unknown }) =>
      Object.assign(state.probation, patch),
    empty: "No probations ending",
    failed: "The probation list did not load",
  },
  {
    name: "incomplete records",
    draw: async () => {
      const { IncompleteRecordsScreen } =
        await import("@/app/(app)/people/incomplete/incomplete-records-screen");
      return <IncompleteRecordsScreen />;
    },
    set: (patch: { loading?: boolean; error?: unknown }) =>
      Object.assign(state.directory, patch),
    empty: "Nothing missing",
    failed: "The incomplete records did not load",
  },
] as const;

describe.each(SCREENS)("$name", (screenCase) => {
  it("says nothing about the people while it is still asking", async () => {
    screenCase.set({ loading: true });
    render(await screenCase.draw());
    expect(screen.queryByText(screenCase.empty)).not.toBeInTheDocument();
    expect(screen.queryByText(screenCase.failed)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("shows the failure card and not the empty state after a failure", async () => {
    screenCase.set({ error: serverError });
    render(await screenCase.draw());
    expect(screen.getByText(screenCase.failed)).toBeInTheDocument();
    expect(screen.queryByText(screenCase.empty)).not.toBeInTheDocument();
  });

  it("says it is empty once it has asked and there is nothing", async () => {
    render(await screenCase.draw());
    expect(screen.getByText(screenCase.empty)).toBeInTheDocument();
    expect(screen.queryByText(screenCase.failed)).not.toBeInTheDocument();
  });
});
