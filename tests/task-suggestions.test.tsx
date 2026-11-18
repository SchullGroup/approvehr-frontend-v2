import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { formatDateShort } from "@/lib/time";

/**
 * The weekly line, with the person's own finished tasks of the week offered as text.
 *
 * What is proved: it offers text and writes nothing (choosing a task only puts its words in the box, and
 * nothing is logged until the person presses Save it with whatever they left in it); it is asked for
 * only once the box is open and only for a company that has the assists on; it says which week it
 * means and that adding is only adding words; a task already in the box is shown as added; a second
 * one is added on a new line and never replaces what was typed; a list the API cut says how many it
 * shows of how many there are; and everything that is not an answer (the assists off, an empty week, a
 * refusal, a failed read, a shape it cannot read) draws nothing, so the box is exactly what it was.
 */

const request = vi.hoisted(() => vi.fn());
const submitTask = vi.hoisted(() => vi.fn());
const reload = vi.hoisted(() => vi.fn());
const feature = vi.hoisted(() => ({ workAssists: true as boolean | null }));
const session = vi.hoisted(() => ({ isConnected: true, zone: "Africa/Lagos" }));

vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  request,
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => session,
  useOrgTimezone: () => session.zone,
}));
vi.mock("@/lib/store/features", () => ({
  useFeatureSettings: () => ({ workAssists: feature.workAssists }),
}));
vi.mock("@/lib/store/performance", () => ({
  useGoalTasks: () => ({ tasks: [], loading: false, reload }),
  useTaskActions: () => ({ submitTask }),
}));

const { TaskLogPanel } = await import("@/app/(app)/performance/task-log");

const line = (n: number, over: Record<string, unknown> = {}) => ({
  issueId: `i${n}`,
  key: `PLT-${n}`,
  type: "TASK",
  finishedOn: "2026-11-10",
  text: `PLT-${n} Ship thing ${n}`,
  ...over,
});
const answer = (items: unknown[], over: Record<string, unknown> = {}) => ({
  on: true,
  week: { start: "2026-11-09", end: "2026-11-15" },
  items,
  total: items.length,
  truncated: false,
  ...over,
});

const keyResults = [] as never;
const mount = () =>
  render(<TaskLogPanel goalId="g-1" keyResults={keyResults} />);
const openBox = async () =>
  userEvent.click(screen.getByRole("button", { name: /Log a task/ }));
const box = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const control = () =>
  screen.queryByRole("button", { name: /Add from my finished work/ });
const day = (iso: string) => formatDateShort(iso, "Africa/Lagos");

beforeEach(() => {
  vi.clearAllMocks();
  feature.workAssists = true;
  session.isConnected = true;
  session.zone = "Africa/Lagos";
  request.mockResolvedValue(answer([line(1), line(2)]));
  submitTask.mockResolvedValue(undefined);
});

describe("when it is asked for", () => {
  it("not until the box is open, so a screen of objectives opens no request per card", async () => {
    mount();
    expect(request).not.toHaveBeenCalled();
    await openBox();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledWith(
      "/performance/goals/g-1/task-suggestions",
      { signal: expect.any(AbortSignal) },
    );
  });

  it("never for a company that has not switched the assists on", async () => {
    feature.workAssists = false;
    mount();
    await openBox();
    expect(request).not.toHaveBeenCalled();
    expect(control()).toBeNull();
  });

  it("never while the setting is not known", async () => {
    feature.workAssists = null;
    mount();
    await openBox();
    expect(request).not.toHaveBeenCalled();
    expect(control()).toBeNull();
  });

  it("never with no server", async () => {
    session.isConnected = false;
    mount();
    await openBox();
    expect(request).not.toHaveBeenCalled();
    expect(control()).toBeNull();
  });
});

describe("what it offers", () => {
  it("a closed control with how many there are, and the week it means, once opened", async () => {
    mount();
    await openBox();
    const toggle = await screen.findByRole("button", {
      name: /Add from my finished work/,
    });
    expect(toggle).toHaveTextContent("2");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(
      screen.getByText(
        `Finished ${day("2026-11-09")} to ${day("2026-11-15")}, under this objective. Adding one puts its words in the box above and nothing else.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("PLT-1 Ship thing 1")).toBeInTheDocument();
    expect(screen.getByText("PLT-2 Ship thing 2")).toBeInTheDocument();
  });

  it("each line with the day it was finished", async () => {
    request.mockResolvedValue(answer([line(1, { finishedOn: "2026-11-12" })]));
    mount();
    await openBox();
    await userEvent.click(
      await screen.findByRole("button", { name: /Add from my finished work/ }),
    );
    expect(screen.getByText(day("2026-11-12"))).toBeInTheDocument();
  });

  it("says how many it shows of how many there are when the API cut the week", async () => {
    request.mockResolvedValue(
      answer([line(1)], { total: 63, truncated: true }),
    );
    mount();
    await openBox();
    const toggle = await screen.findByRole("button", {
      name: /Add from my finished work/,
    });
    expect(toggle).toHaveTextContent("63");
    await userEvent.click(toggle);
    expect(screen.getByText("Showing 1 of 63.")).toBeInTheDocument();
  });
});

describe("choosing one", () => {
  const choose = async () => {
    mount();
    await openBox();
    await userEvent.click(
      await screen.findByRole("button", { name: /Add from my finished work/ }),
    );
  };
  const addButton = (key: string) =>
    screen.getByRole("button", { name: new RegExp(`^(Add|Added)\\s*${key}$`) });

  it("puts its words in an empty box, and nothing else: nothing is logged", async () => {
    await choose();
    await userEvent.click(addButton("PLT-1"));
    expect(box().value).toBe("PLT-1 Ship thing 1");
    expect(submitTask).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("adds a second on a new line and never replaces what was typed", async () => {
    await choose();
    await userEvent.type(box(), "Finished the migration.");
    await userEvent.click(addButton("PLT-1"));
    await userEvent.click(addButton("PLT-2"));
    expect(box().value).toBe(
      "Finished the migration.\nPLT-1 Ship thing 1\nPLT-2 Ship thing 2",
    );
  });

  it("shows a task that is already in the box as added, and does not offer it twice", async () => {
    await choose();
    await userEvent.click(addButton("PLT-1"));
    const added = screen.getByRole("button", { name: /^Added\s*PLT-1$/ });
    expect(added).toBeDisabled();
    expect(addButton("PLT-2")).toBeEnabled();
    await userEvent.click(added);
    expect(box().value).toBe("PLT-1 Ship thing 1");
  });

  it("offers it again once the person has taken the words out", async () => {
    await choose();
    await userEvent.click(addButton("PLT-1"));
    await userEvent.clear(box());
    expect(addButton("PLT-1")).toBeEnabled();
    expect(addButton("PLT-1")).toHaveTextContent(/^Add/);
  });

  it("is saved as whatever the person left in the box, and by them", async () => {
    await choose();
    await userEvent.click(addButton("PLT-1"));
    await userEvent.type(box(), " and I reviewed it");
    await userEvent.click(screen.getByRole("button", { name: "Save it" }));
    await waitFor(() => expect(submitTask).toHaveBeenCalledTimes(1));
    expect(submitTask).toHaveBeenCalledWith("g-1", {
      description: "PLT-1 Ship thing 1 and I reviewed it",
    });
  });

  it("is gone with the box when the person cancels, and nothing was sent", async () => {
    await choose();
    await userEvent.click(addButton("PLT-1"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(submitTask).not.toHaveBeenCalled();
    await openBox();
    expect(box().value).toBe("");
  });
});

describe("everything that is not an answer draws nothing", () => {
  it.each([
    ["the assists are off", { on: false }],
    [
      "a week with nothing finished under this objective",
      answer([], { total: 0 }),
    ],
    ["the server answered something it cannot read", { surprise: true }],
    [
      "the week is not days",
      {
        on: true,
        week: { start: "Monday", end: "Sunday" },
        items: [],
        total: 0,
      },
    ],
  ])("when %s", async (_why, back) => {
    request.mockResolvedValue(back);
    mount();
    await openBox();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();
    expect(control()).toBeNull();
    expect(within(document.body).queryByText(/nothing finished/i)).toBeNull();
  });

  it("when the reader is refused or the request fails, and the box still works", async () => {
    request.mockRejectedValue(new ApiError(404, "not_found", "That objective"));
    mount();
    await openBox();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(control()).toBeNull();
    await userEvent.type(box(), "Did a thing");
    expect(box().value).toBe("Did a thing");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("dates: the company's days", () => {
  it("reads the week and each day as those days in a zone west of Greenwich, and not the day before", async () => {
    session.zone = "America/New_York";
    mount();
    await openBox();
    await userEvent.click(
      await screen.findByRole("button", { name: /Add from my finished work/ }),
    );
    /* Mon 9 to Sun 15 November, and a task finished on the 10th. In New York a bare date read as an
       instant is the evening before: 8, 14 and 9. */
    expect(
      screen.getByText(/^Finished 9 Nov 2026 to 15 Nov 2026,/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("10 Nov 2026").length).toBeGreaterThan(0);
    expect(screen.queryByText(/8 Nov|14 Nov/)).toBeNull();
    session.zone = "Africa/Lagos";
  });
});
