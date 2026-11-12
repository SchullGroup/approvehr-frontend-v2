import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiKeyResult } from "@/lib/api/performance";
import { ApiError } from "@/lib/api/client";
import { formatDateShort } from "@/lib/time";

/**
 * The tasks linked to a done-or-not measure, beside Confirm.
 *
 * What is proved: it lists and never decides (no sentence says the measure is done, how many are left,
 * that everything is finished, or that the reader should confirm); it is drawn only where there is a
 * Confirm to look at it beside (a reader who may confirm, on a measure not yet confirmed), and for a
 * company that has the assists on, which is the only case in which a request is made at all; each task
 * is its key, a link only where the API said the reader may open it, with where it stands in words and
 * never a figure; a task the reader may not open is one plain line and shows nothing about itself; an
 * empty list says so in words and never as a zero; a list the API cut says how many it shows of how
 * many there are; and everything that is not an answer (the assists off, a refusal, a failed read, a
 * shape it cannot read) draws nothing, so the confirmation is never held up by a hint that did not
 * arrive.
 */

const who = vi.hoisted(() => ({
  actingId: "emp-manager" as string | null,
  records: false,
  connected: true,
  zone: "Africa/Lagos",
}));
const feature = vi.hoisted(() => ({ workAssists: true as boolean | null }));
const read = vi.hoisted(() => vi.fn());

vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) =>
    permission === "EDIT_RECORDS" ? who.records : false,
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ actingId: who.actingId, isConnected: who.connected }),
  useOrgTimezone: () => who.zone,
}));
vi.mock("@/lib/store/features", () => ({
  useFeatureSettings: () => ({ workAssists: feature.workAssists }),
}));
/* The request itself is what is stubbed, so every answer goes through the API module's own parser,
   exactly as it does in the app: a hint is drawn from what that parser reads and never from a raw reply. */
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  request: read,
}));

const { DoneMeasureRow, MeasureConfirmProvider } =
  await import("@/app/(app)/performance/done-measure");
const { stateWords } = await import("@/app/(app)/performance/linked-work-hint");

const measure = (over: Partial<ApiKeyResult> = {}): ApiKeyResult =>
  ({
    id: "m-1",
    goalId: "g-1",
    label: "Both engineers hired",
    kind: "DONE",
    unit: null,
    startValue: "0",
    targetValue: "1",
    currentValue: "0",
    lowerIsBetter: false,
    percent: 0,
    met: false,
    lastReadAt: "2026-10-20T09:00:00.000Z",
    confirmedAt: null,
    confirmedByName: null,
    confirmNote: null,
    updatedAt: "2026-10-20T09:00:00.000Z",
    ...over,
  }) as ApiKeyResult;

const open = (over: Record<string, unknown> = {}) => ({
  issueId: "i1",
  key: "PLT-12",
  type: "TASK",
  state: "FINISHED",
  finishedOn: "2026-11-09",
  personal: false,
  accepted: null,
  canOpen: true,
  ...over,
});
const answer = (items: unknown[], over: Record<string, unknown> = {}) => ({
  on: true,
  measure: { id: "m-1", label: "Both engineers hired", kind: "DONE" },
  items,
  total: items.length,
  truncated: false,
  ...over,
});

function show(row: ApiKeyResult, goalOwnerId: string | null = "emp-owner") {
  render(
    <MeasureConfirmProvider
      value={{
        confirm: vi.fn().mockResolvedValue(true),
        unconfirm: vi.fn().mockResolvedValue(true),
      }}
    >
      <ul>
        <DoneMeasureRow measure={row} goalOwnerId={goalOwnerId} />
      </ul>
    </MeasureConfirmProvider>,
  );
}

const hint = () =>
  screen.queryByRole("button", { name: /Tasks linked to this measure/ });
const day = (iso: string) => formatDateShort(iso, "Africa/Lagos");

beforeEach(() => {
  vi.clearAllMocks();
  who.actingId = "emp-manager";
  who.records = false;
  who.connected = true;
  who.zone = "Africa/Lagos";
  feature.workAssists = true;
  read.mockResolvedValue(answer([open()]));
});

describe("where it is drawn", () => {
  it("beside Confirm, for a reader who may confirm a measure that is not confirmed, when the assists are on", async () => {
    show(measure());
    const toggle = await screen.findByRole("button", {
      name: /Tasks linked to this measure/,
    });
    expect(toggle).toHaveTextContent("1");
    expect(
      screen.getByRole("button", { name: /Confirm it is done/ }),
    ).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(
      "/performance/key-results/m-1/linked-work",
      { signal: expect.any(AbortSignal) },
    );
  });

  it("is closed until it is opened", async () => {
    show(measure());
    const toggle = await screen.findByRole("button", {
      name: /Tasks linked to this measure/,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("PLT-12")).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText("PLT-12")).toBeInTheDocument();
  });

  it("is not drawn, and nothing is asked, for a company that has not switched the assists on", async () => {
    feature.workAssists = false;
    show(measure());
    await screen.findByRole("button", { name: /Confirm it is done/ });
    expect(hint()).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("is not drawn, and nothing is asked, while the setting is not known", async () => {
    feature.workAssists = null;
    show(measure());
    await screen.findByRole("button", { name: /Confirm it is done/ });
    expect(read).not.toHaveBeenCalled();
    expect(hint()).toBeNull();
  });

  it("is not drawn once the measure is confirmed, because there is no Confirm to look at it beside", async () => {
    show(
      measure({
        confirmedAt: "2026-11-01T10:00:00.000Z",
        confirmedByName: "Ada",
      }),
    );
    await screen.findByRole("button", { name: /Take it back/ });
    expect(hint()).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("is not drawn for the person whose objective it is, who may not confirm it", async () => {
    who.actingId = "emp-owner";
    show(measure(), "emp-owner");
    await screen.findByText("Your manager confirms it when it is done.");
    expect(hint()).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("is not drawn for a company objective to somebody without the records permission", async () => {
    show(measure(), null);
    await screen.findByText("Both engineers hired");
    expect(hint()).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("is drawn for a company objective to somebody who holds the records permission", async () => {
    who.records = true;
    show(measure(), null);
    expect(
      await screen.findByRole("button", {
        name: /Tasks linked to this measure/,
      }),
    ).toBeInTheDocument();
  });

  it("is not drawn, and nothing is asked, with no server", async () => {
    who.connected = false;
    show(measure());
    await screen.findByRole("button", { name: /Confirm it is done/ });
    expect(hint()).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});

describe("what it lists", () => {
  it("each task as its key, where it stands in words, and a link for a task the reader may open", async () => {
    read.mockResolvedValue(
      answer([
        open({ issueId: "a", key: "PLT-1", state: "OPEN", finishedOn: null }),
        open({
          issueId: "b",
          key: "PLT-2",
          state: "FINISHED",
          finishedOn: "2026-11-09",
        }),
        open({
          issueId: "c",
          key: "PLT-3",
          state: "WONT_DO",
          finishedOn: null,
        }),
      ]),
    );
    show(measure());
    await userEvent.click(
      await screen.findByRole("button", {
        name: /Tasks linked to this measure/,
      }),
    );
    expect(screen.getByRole("link", { name: "PLT-1" })).toHaveAttribute(
      "href",
      "/projects/tasks/a",
    );
    expect(screen.getByRole("link", { name: "PLT-2" })).toHaveAttribute(
      "href",
      "/projects/tasks/b",
    );
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(
      screen.getByText(`Finished ${day("2026-11-09")}`),
    ).toBeInTheDocument();
    expect(screen.getByText("Closed as won't do")).toBeInTheDocument();
  });

  it("who accepted a task, and when", async () => {
    read.mockResolvedValue(
      answer([
        open({
          accepted: { byName: "Ada Eze", at: "2026-11-11T14:30:00.000Z" },
        }),
      ]),
    );
    show(measure());
    await userEvent.click(
      await screen.findByRole("button", {
        name: /Tasks linked to this measure/,
      }),
    );
    expect(
      screen.getByText(
        `Finished ${day("2026-11-09")}, accepted by Ada Eze on ${day("2026-11-11T14:30:00.000Z")}`,
      ),
    ).toBeInTheDocument();
  });

  it("a task on somebody's own list, said once", async () => {
    read.mockResolvedValue(answer([open({ personal: true })]));
    show(measure());
    await userEvent.click(
      await screen.findByRole("button", {
        name: /Tasks linked to this measure/,
      }),
    );
    expect(screen.getByText("On a personal list")).toBeInTheDocument();
  });

  it("a task the reader may not open as one plain line, with no key, no state and no day, and no link", async () => {
    read.mockResolvedValue(
      answer([
        { issueId: "x", canOpen: false },
        open({ issueId: "y", key: "PLT-9" }),
      ]),
    );
    show(measure());
    const toggle = await screen.findByRole("button", {
      name: /Tasks linked to this measure/,
    });
    expect(toggle).toHaveTextContent("2");
    await userEvent.click(toggle);
    const hidden = screen.getByText("A task you cannot open").closest("li")!;
    expect(hidden.textContent).toBe("A task you cannot open");
    expect(within(hidden).queryByRole("link")).toBeNull();
    expect(screen.getByRole("link", { name: "PLT-9" })).toBeInTheDocument();
  });

  it("says how many it shows of how many there are when the API cut the list", async () => {
    read.mockResolvedValue(answer([open()], { total: 63, truncated: true }));
    show(measure());
    const toggle = await screen.findByRole("button", {
      name: /Tasks linked to this measure/,
    });
    expect(toggle).toHaveTextContent("63");
    await userEvent.click(toggle);
    expect(screen.getByText("Showing 1 of 63.")).toBeInTheDocument();
  });

  it("does not say the list was cut when it was not", async () => {
    show(measure());
    await userEvent.click(
      await screen.findByRole("button", {
        name: /Tasks linked to this measure/,
      }),
    );
    expect(screen.queryByText(/Showing/)).toBeNull();
  });
});

describe("what it never says", () => {
  it("that the measure is done, that everything is finished, or what the reader should do", async () => {
    read.mockResolvedValue(
      answer([
        open({ issueId: "a", key: "PLT-1" }),
        open({ issueId: "b", key: "PLT-2" }),
      ]),
    );
    show(measure());
    const toggle = await screen.findByRole("button", {
      name: /Tasks linked to this measure/,
    });
    await userEvent.click(toggle);
    const region = screen.getByRole("region", {
      name: /Tasks linked to this measure/,
    });
    const words = `${toggle.textContent} ${region.textContent}`;
    expect(words).not.toMatch(
      /all (are |of them )?(done|finished|complete)|ready|should|recommend|you can confirm|safe to|nothing left|remaining|%/i,
    );
  });

  it("no figure that reads like a mark: the only number is how many tasks are linked", async () => {
    show(measure());
    const toggle = await screen.findByRole("button", {
      name: /Tasks linked to this measure/,
    });
    expect(toggle.textContent).toMatch(/^Tasks linked to this measure\s*1$/);
  });
});

describe("an empty list", () => {
  it("says no task is linked, in words, with no count and no disclosure", async () => {
    read.mockResolvedValue(answer([], { total: 0 }));
    show(measure());
    expect(
      await screen.findByText("No task is linked to this measure."),
    ).toBeInTheDocument();
    expect(hint()).toBeNull();
    expect(document.body.textContent).not.toMatch(/\b0\b/);
  });
});

describe("everything that is not an answer draws nothing", () => {
  it.each([
    ["the assists are off", { on: false }],
    ["the server answered something it cannot read", { surprise: 1 }],
    ["the answer has no total", { on: true, items: [] }],
  ])("when %s", async (_why, answerBack) => {
    read.mockResolvedValue(answerBack);
    show(measure());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: /Confirm it is done/ });
    expect(hint()).toBeNull();
    expect(screen.queryByText(/No task is linked/)).toBeNull();
  });

  it("when the reader is refused or the request fails, and Confirm is still there", async () => {
    read.mockRejectedValue(new ApiError(404, "not_found", "That measure"));
    show(measure());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("button", { name: /Confirm it is done/ }),
    ).toBeEnabled();
    expect(hint()).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("where a task stands, in words", () => {
  const d = (iso: string) => `D(${iso})`;
  it.each([
    [{ state: "OPEN", finishedOn: null, accepted: null }, "Open"],
    [
      { state: "FINISHED", finishedOn: "2026-11-09", accepted: null },
      "Finished D(2026-11-09)",
    ],
    [{ state: "FINISHED", finishedOn: null, accepted: null }, "Finished"],
    [
      { state: "WONT_DO", finishedOn: null, accepted: null },
      "Closed as won't do",
    ],
    [
      {
        state: "FINISHED",
        finishedOn: "2026-11-09",
        accepted: { byName: "Ada", at: "2026-11-10" },
      },
      "Finished D(2026-11-09), accepted by Ada on D(2026-11-10)",
    ],
    [
      {
        state: "FINISHED",
        finishedOn: "2026-11-09",
        accepted: { byName: " ", at: "2026-11-10" },
      },
      "Finished D(2026-11-09), accepted on D(2026-11-10)",
    ],
  ] as const)("%j is %s", (item, words) => {
    expect(stateWords(item as never, { day: d, instant: d })).toBe(words);
  });

  it("reads a finished day as a calendar day and an acceptance as an instant, each by its own formatter", () => {
    expect(
      stateWords(
        {
          state: "FINISHED",
          finishedOn: "2026-11-09",
          accepted: { byName: "Ada", at: "2026-11-10T02:30:00.000Z" },
        } as never,
        {
          day: (value) => `DAY(${value})`,
          instant: (value) => `AT(${value})`,
        },
      ),
    ).toBe(
      "Finished DAY(2026-11-09), accepted by Ada on AT(2026-11-10T02:30:00.000Z)",
    );
  });
});

describe("dates: the company's days and the company's instants", () => {
  it("reads a finished day as that day in a zone west of Greenwich, and not the day before", async () => {
    who.zone = "America/New_York";
    read.mockResolvedValue(
      answer([open({ state: "FINISHED", finishedOn: "2026-11-09" })]),
    );
    show(measure());
    await userEvent.click(
      await screen.findByRole("button", {
        name: /Tasks linked to this measure/,
      }),
    );
    expect(screen.getByText("Finished 9 Nov 2026")).toBeInTheDocument();
    expect(screen.queryByText(/8 Nov/)).toBeNull();
  });

  it("reads when it was accepted, which is an instant, in the company's own zone", async () => {
    who.zone = "America/New_York";
    read.mockResolvedValue(
      answer([
        open({
          state: "FINISHED",
          finishedOn: "2026-11-09",
          /* 02:30 UTC on the 11th is 21:30 on the 10th in New York. */
          accepted: { byName: "Ada Eze", at: "2026-11-11T02:30:00.000Z" },
        }),
      ]),
    );
    show(measure());
    await userEvent.click(
      await screen.findByRole("button", {
        name: /Tasks linked to this measure/,
      }),
    );
    expect(
      screen.getByText(
        "Finished 9 Nov 2026, accepted by Ada Eze on 10 Nov 2026",
      ),
    ).toBeInTheDocument();
  });
});

describe("the order of the list", () => {
  it("lists what the reader may open first, in the server's order, and what they cannot open last, so where a line sits says nothing about it", async () => {
    read.mockResolvedValue(
      answer([
        { issueId: "x", canOpen: false },
        open({ issueId: "a", key: "PLT-1", state: "OPEN", finishedOn: null }),
        { issueId: "y", canOpen: false },
        open({ issueId: "b", key: "PLT-2" }),
        open({
          issueId: "c",
          key: "PLT-3",
          state: "WONT_DO",
          finishedOn: null,
        }),
      ]),
    );
    show(measure());
    await userEvent.click(
      await screen.findByRole("button", {
        name: /Tasks linked to this measure/,
      }),
    );
    const region = screen.getByRole("region", {
      name: /Tasks linked to this measure/,
    });
    const rows = within(region)
      .getAllByRole("listitem")
      .map((row) => row.textContent ?? "");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatch(/^PLT-1/);
    expect(rows[1]).toMatch(/^PLT-2/);
    expect(rows[2]).toMatch(/^PLT-3/);
    expect(rows[3]).toBe("A task you cannot open");
    expect(rows[4]).toBe("A task you cannot open");
  });

  it("leaves a list with nothing hidden in the order it came in", async () => {
    read.mockResolvedValue(
      answer([
        open({ issueId: "a", key: "PLT-1", state: "OPEN", finishedOn: null }),
        open({ issueId: "b", key: "PLT-2" }),
      ]),
    );
    show(measure());
    await userEvent.click(
      await screen.findByRole("button", {
        name: /Tasks linked to this measure/,
      }),
    );
    const region = screen.getByRole("region", {
      name: /Tasks linked to this measure/,
    });
    const rows = within(region)
      .getAllByRole("listitem")
      .map((r) => r.textContent ?? "");
    expect(rows[0]).toMatch(/^PLT-1/);
    expect(rows[1]).toMatch(/^PLT-2/);
  });
});
