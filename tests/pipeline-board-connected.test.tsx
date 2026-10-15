import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiBoardColumn } from "@/lib/api/pipeline";
import { pipelineViewState } from "@/lib/hiring/pipeline/use-view";
import { cardOf, peopleIn, renderInToasts } from "./pipeline-workspace-helpers";

/**
 * The board against the API (faked at its edge): what it asks for and what it
 * shows. The demo tests hold the behaviour; these hold the wiring — one read for
 * the whole board, a column paged by its own cursor, a refusal that comes back as
 * the API's sentence and puts the card back.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: true,
    isLoading: false,
    user: { id: "u1" },
    organization: undefined,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));

const api = {
  board: vi.fn(),
  boardColumn: vi.fn(),
  move: vi.fn(),
  listTags: vi.fn(),
  listReasons: vi.fn(),
};
vi.mock("@/lib/api/pipeline", () => ({
  pipelineApi: new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          (api as Record<string, (...a: unknown[]) => unknown>)[name]?.(
            ...args,
          ),
    },
  ),
}));

const { PipelineWorkspace } =
  await import("@/app/(app)/hiring/requisitions/[id]/pipeline-workspace");

const card = (n: number) => ({
  id: `a${String(n).padStart(3, "0")}`,
  candidateId: `c${String(n)}`,
  name: `Candidate ${String(n)}`,
  email: `c${String(n)}@example.com`,
  source: "LinkedIn",
  appliedAt: "2026-10-01T09:00:00.000Z",
  stageEnteredAt: "2026-10-10T09:00:00.000Z",
  daysInStage: 5,
  outcome: "IN_PROGRESS" as const,
  reference: `APP-0000${String(n).padStart(4, "0")}`,
  flagged: false,
  knockoutCount: 0,
  duplicate: false,
  talentPool: false,
  tags: [],
  hasCv: false,
  rejection: null,
});

const column = (over: Partial<ApiBoardColumn>): ApiBoardColumn => ({
  key: "stage:s1",
  stageId: "s1",
  name: "Applied",
  type: "APPLIED",
  typeLabel: "Applied",
  order: 0,
  terminal: false,
  synthetic: false,
  count: 0,
  cards: [],
  hasMore: false,
  nextCursor: null,
  ...over,
});

const BOARD = () => ({
  requisition: {
    id: "r1",
    reference: "REQ-1",
    jobTitle: "Analyst",
    status: "OPEN",
    headcount: 1,
    hired: 0,
  },
  total: 70,
  limit: 25,
  columns: [
    column({
      count: 60,
      hasMore: true,
      nextCursor: "after-25",
      cards: Array.from({ length: 25 }, (_, i) => card(60 - i)),
    }),
    column({
      key: "stage:s2",
      stageId: "s2",
      name: "Interview",
      type: "INTERVIEW",
      order: 1,
      count: 10,
      cards: Array.from({ length: 10 }, (_, i) => card(100 + i)),
    }),
    column({
      key: "outcome:REJECTED",
      stageId: null,
      name: "Rejected",
      type: null,
      order: 2,
      synthetic: true,
      terminal: true,
    }),
  ],
});

beforeEach(() => {
  window.localStorage?.clear?.();
  pipelineViewState.reset();
  for (const fn of Object.values(api)) fn.mockReset();
  api.board.mockResolvedValue(BOARD());
  api.listTags.mockResolvedValue([]);
  api.listReasons.mockResolvedValue([]);
});

const open = () => renderInToasts(<PipelineWorkspace requisitionId="r1" />);
const ready = () =>
  waitFor(() =>
    expect(screen.getAllByRole("region").length).toBeGreaterThan(2),
  );

describe("reading the board", () => {
  it("asks once for the whole board, twenty-five a column, and shows the server's counts", async () => {
    open();
    await ready();
    expect(api.board).toHaveBeenCalledTimes(1);
    expect(api.board).toHaveBeenCalledWith(
      "r1",
      { limit: 25 },
      expect.anything(),
    );
    expect(
      screen.getByRole("region", { name: "Applied, 60 people" }),
    ).toBeVisible();
    expect(peopleIn("Applied")).toHaveLength(25);
    expect(
      screen.getByRole("region", { name: "Interview, 10 people" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Rejected, 0 people" }),
    ).toBeVisible();
    expect(screen.getByText("Load more (35 left)")).toBeInTheDocument();
  });

  it("pages one column by the cursor the API gave", async () => {
    const user = userEvent.setup();
    api.boardColumn.mockResolvedValue(
      column({
        count: 60,
        hasMore: false,
        nextCursor: null,
        cards: Array.from({ length: 25 }, (_, i) => card(35 - i)),
      }),
    );
    open();
    await ready();
    await user.click(
      screen.getByRole("button", { name: "Load more (35 left)" }),
    );
    await waitFor(() => expect(peopleIn("Applied")).toHaveLength(50));
    expect(api.boardColumn).toHaveBeenCalledWith(
      "r1",
      "stage:s1",
      { limit: 25, cursor: "after-25" },
      expect.anything(),
    );
    expect(api.board).toHaveBeenCalledTimes(1);
  });

  it("sends a search as a question to the API, not as a filter over what it holds", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.type(
      screen.getByRole("textbox", { name: /Find a candidate/ }),
      "ada",
    );
    await waitFor(() =>
      expect(api.board).toHaveBeenLastCalledWith(
        "r1",
        { q: "ada", limit: 25 },
        expect.anything(),
      ),
    );
  });

  it("says why when the board cannot be read, and tries again", async () => {
    const user = userEvent.setup();
    api.board.mockReset();
    api.board.mockRejectedValueOnce(
      new ApiError(
        503,
        "unavailable",
        "The server is busy. Try again in a moment.",
      ),
    );
    api.board.mockResolvedValueOnce(BOARD());
    open();
    expect(
      await screen.findByText("The server is busy. Try again in a moment."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
    expect(peopleIn("Applied")).toHaveLength(25);
  });
});

describe("moving a card", () => {
  it("moves it at once and tells the API which stage", async () => {
    const user = userEvent.setup();
    api.move.mockResolvedValue({});
    open();
    await ready();
    const person = peopleIn("Applied")[0] as string;
    await user.selectOptions(
      within(cardOf(person)).getByLabelText(`Move ${person} to…`),
      "Interview",
    );
    expect(
      await screen.findByText(`${person} moved to Interview`),
    ).toBeInTheDocument();
    expect(api.move).toHaveBeenCalledWith(expect.stringMatching(/^a0/), "s2");
    expect(peopleIn("Interview")).toContain(person);
    expect(
      screen.getByRole("region", { name: "Applied, 59 people" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Interview, 11 people" }),
    ).toBeVisible();
  });

  it("puts the card back and shows the API's own sentence when it refuses", async () => {
    const user = userEvent.setup();
    api.move.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        '"Applied" requires scorecards before anybody can move on, and nobody has interviewed this candidate yet.',
      ),
    );
    open();
    await ready();
    const person = peopleIn("Applied")[0] as string;
    await user.selectOptions(
      within(cardOf(person)).getByLabelText(`Move ${person} to…`),
      "Interview",
    );
    expect(
      await screen.findByText(`${person} was not moved`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/requires scorecards before anybody can move on/),
    ).toBeInTheDocument();
    expect(peopleIn("Applied")[0]).toBe(person);
    expect(peopleIn("Interview")).not.toContain(person);
    expect(
      screen.getByRole("region", { name: "Applied, 60 people" }),
    ).toBeVisible();
  });

  it("does not offer Hired, which an accepted offer fills, and offers Reject instead", async () => {
    open();
    await ready();
    const person = peopleIn("Applied")[0] as string;
    const menu = within(cardOf(person)).getByLabelText(
      `Move ${person} to…`,
    ) as HTMLSelectElement;
    expect([...menu.options].map((o) => o.text)).toEqual([
      "Move to…",
      "Applied",
      "Interview",
      "Reject…",
    ]);
  });
});
