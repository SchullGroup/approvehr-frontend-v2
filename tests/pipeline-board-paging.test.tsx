import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiApplication, ApiStage } from "@/lib/api/recruitment";

/**
 * A role's pipeline board.
 *
 * It asked for the first two hundred with no order, and this API's default for
 * the list is oldest first — so a role with more than two hundred people showed
 * the two hundred who applied first and nothing of this week, with a "hired /
 * rejected / withdrawn" toggle that counted only what it had been handed. These
 * tests stand in for the API (250 people behind a cursor) and read what the
 * board asks for and shows.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, isLoading: false }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));

const listApplications = vi.fn();
const moveApplication = vi.fn();
vi.mock("@/lib/api/recruitment", async (original) => {
  const real = await original<typeof import("@/lib/api/recruitment")>();
  return {
    ...real,
    recruitmentApi: {
      ...real.recruitmentApi,
      listApplications: (...a: unknown[]) => listApplications(...a),
      moveApplication: (...a: unknown[]) => moveApplication(...a),
    },
  };
});

const { RealRequisitionWorkspace } =
  await import("@/app/(app)/hiring/requisitions/[id]/real-workspace");

const stages: ApiStage[] = [
  {
    id: "s1",
    requisitionId: "req-1",
    name: "Screening",
    order: 0,
    requiresScorecards: false,
  },
  {
    id: "s2",
    requisitionId: "req-1",
    name: "Interview",
    order: 1,
    requiresScorecards: true,
  },
];

const person = (n: number, over: Partial<ApiApplication> = {}) =>
  ({
    id: `pa-${String(n).padStart(3, "0")}`,
    requisitionId: "req-1",
    candidateId: `c-${String(n)}`,
    candidateName: `Candidate ${String(n)}`,
    candidateEmail: `c${String(n)}@example.com`,
    stageId: "s1",
    stageName: "Screening",
    outcome: "IN_PROGRESS",
    stageEnteredAt: "2026-10-01T09:00:00.000Z",
    rejectionReason: null,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    ...over,
  }) as ApiApplication;

function serve(count: number, size = 50) {
  /* Newest first, as the board now asks for. */
  const all = Array.from({ length: count }, (_, i) => person(count - i));
  listApplications.mockImplementation(
    async (_req: string, params: { cursor?: string; pageSize?: number }) => {
      const start = params.cursor ? Number.parseInt(params.cursor, 10) : 0;
      const end = start + (params.pageSize ?? size);
      return {
        data: all.slice(start, end),
        meta: {
          total: count,
          nextCursor: end < count ? String(end) : null,
          page: 1,
          pageSize: size,
          totalPages: 1,
          hasMore: end < count,
        },
      };
    },
  );
}

const sent = (call = -1): Record<string, unknown> =>
  (listApplications.mock.calls.at(call)?.[1] ?? {}) as Record<string, unknown>;

/* The table and the phone list both render, one hidden by CSS. */
const names = (n: number) => screen.getAllByText(`Candidate ${String(n)}`);

const open = () =>
  render(<RealRequisitionWorkspace requisitionId="req-1" stages={stages} />);

beforeEach(() => {
  listApplications.mockReset();
  moveApplication.mockReset();
});

describe("the board", () => {
  it("asks for the newest first and for people still in progress, fifty at a time", async () => {
    serve(250);
    open();
    await waitFor(() => expect(names(250).length).toBeGreaterThan(0));

    expect(sent()).toMatchObject({
      order: "desc",
      pageSize: 50,
      outcome: "IN_PROGRESS",
    });
    expect(
      screen.getByText("Showing 50 of 250 candidates"),
    ).toBeInTheDocument();
  });

  it("reaches the people the first two hundred hid", async () => {
    serve(250);
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(names(250).length).toBeGreaterThan(0));

    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: "Load more" }));
      await waitFor(() =>
        expect(listApplications.mock.calls.length).toBeGreaterThan(i + 1),
      );
    }
    await waitFor(() => expect(names(1).length).toBeGreaterThan(0));
    expect(screen.getByText("All 250 candidates shown")).toBeInTheDocument();
  });

  it("sends the stage, the outcome and the search as questions — not as a filter over what it holds", async () => {
    serve(250);
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(names(250).length).toBeGreaterThan(0));

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Show candidates who are" }),
      "REJECTED",
    );
    await waitFor(() => expect(sent()).toMatchObject({ outcome: "REJECTED" }));

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.selectOptions(screen.getByLabelText("Stage"), "s2");
    await waitFor(() => expect(sent()).toMatchObject({ stageId: "s2" }));

    await user.type(
      screen.getByRole("textbox", { name: /Find a candidate/ }),
      "ada",
    );
    await waitFor(() => expect(sent()).toMatchObject({ q: "ada" }));
    expect(sent()).toMatchObject({ outcome: "REJECTED", stageId: "s2" });
  });

  it("asks for everyone, with no outcome at all, when told to", async () => {
    serve(10);
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(names(10).length).toBeGreaterThan(0));

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Show candidates who are" }),
      "ALL",
    );
    await waitFor(() => expect(sent()).not.toHaveProperty("outcome"));
  });

  it("says nobody matches rather than 'no candidates yet' when a filter is the reason", async () => {
    serve(10);
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(names(10).length).toBeGreaterThan(0));

    listApplications.mockResolvedValueOnce({
      data: [],
      meta: {
        total: 0,
        nextCursor: null,
        page: 1,
        pageSize: 50,
        totalPages: 0,
        hasMore: false,
      },
    });
    await user.type(
      screen.getByRole("textbox", { name: /Find a candidate/ }),
      "zzz",
    );

    expect(await screen.findByText("Nobody matches")).toBeInTheDocument();
    expect(screen.queryByText("No candidates yet")).not.toBeInTheDocument();
  });

  it("says 'no candidates yet' only for a role nobody has been screened into", async () => {
    listApplications.mockResolvedValue({
      data: [],
      meta: {
        total: 0,
        nextCursor: null,
        page: 1,
        pageSize: 50,
        totalPages: 0,
        hasMore: false,
      },
    });
    open();
    expect(await screen.findByText("No candidates yet")).toBeInTheDocument();
  });

  it("moves somebody to another stage and refreshes without blanking the board", async () => {
    serve(3);
    moveApplication.mockResolvedValue({});
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(names(3).length).toBeGreaterThan(0));

    const picker = screen.getAllByRole("combobox", {
      name: /Move Candidate 3 to a stage/,
    })[0]!;
    await user.selectOptions(picker, "s2");

    await waitFor(() =>
      expect(moveApplication).toHaveBeenCalledWith("pa-003", "s2"),
    );
    await waitFor(() =>
      expect(listApplications.mock.calls.length).toBeGreaterThan(1),
    );
    expect(names(3).length).toBeGreaterThan(0);
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});
