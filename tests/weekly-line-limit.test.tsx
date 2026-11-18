import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * The weekly line, which the server takes at 3 to 300 characters, with finished tasks offered as text.
 *
 * What is proved: the box says how long the line is once it is near the limit and by how much it is
 * over; a line that would take the box past 300 is not added and says so in words, with what to do;
 * a box that is over cannot be saved and nothing is sent; the box never cuts what is pasted into it
 * (no `maxLength`); and a refusal the server wrote about a field is the sentence that is shown, not
 * "Some fields are not valid".
 */

const request = vi.hoisted(() => vi.fn());
const submitTask = vi.hoisted(() => vi.fn());
const reload = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  request,
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/features", () => ({
  useFeatureSettings: () => ({ workAssists: true }),
}));
vi.mock("@/lib/store/performance", () => ({
  useGoalTasks: () => ({ tasks: [], loading: false, reload }),
  useTaskActions: () => ({ submitTask }),
}));

const { TaskLogPanel } = await import("@/app/(app)/performance/task-log");

/** About 110 characters: an ordinary task title. Three of them are 329 with their breaks. */
const line = (n: number) => ({
  issueId: `i${n}`,
  key: `PLT-${n}`,
  type: "TASK",
  finishedOn: "2026-11-10",
  text: `PLT-${n} Reconcile the October vendor invoices against the purchase orders and chase the three that do not match`,
});
const answer = (items: unknown[]) => ({
  on: true,
  week: { start: "2026-11-09", end: "2026-11-15" },
  items,
  total: items.length,
  truncated: false,
});

const keyResults = [] as never;
const mount = () =>
  render(<TaskLogPanel goalId="g-1" keyResults={keyResults} />);
const open = async () => {
  await userEvent.click(screen.getByRole("button", { name: /Log a task/ }));
  await userEvent.click(
    await screen.findByRole("button", { name: /Add from my finished work/ }),
  );
};
const box = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const addButton = (key: string) =>
  screen.getByRole("button", { name: new RegExp(`^(Add|Added)\\s*${key}$`) });
const save = () => screen.getByRole("button", { name: "Save it" });
const paste = async (text: string) => {
  await userEvent.click(box());
  await userEvent.paste(text);
};

beforeEach(() => {
  vi.clearAllMocks();
  request.mockResolvedValue(answer([line(1), line(2), line(3)]));
  submitTask.mockResolvedValue(undefined);
});

describe("the count under the box", () => {
  it("says nothing while the line is short", async () => {
    mount();
    await open();
    await userEvent.type(box(), "Did a thing");
    expect(screen.queryByText(/of 300 characters/)).toBeNull();
  });

  it("says how long the line is once it is near the limit", async () => {
    mount();
    await open();
    await paste("y".repeat(260));
    expect(screen.getByText("260 of 300 characters")).toBeInTheDocument();
  });

  it("says by how much it is over, and says the server's sentence, and cannot be saved", async () => {
    mount();
    await open();
    await paste("y".repeat(329));
    expect(screen.getByText("329 of 300 characters")).toBeInTheDocument();
    expect(
      screen.getByText("Keep it short enough to read in a list."),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(box()).toHaveAttribute("aria-invalid", "true");
    expect(submitTask).not.toHaveBeenCalled();
  });

  it("does not cut what is pasted: there is no maxLength on the box", async () => {
    mount();
    await open();
    await paste("y".repeat(400));
    expect(box().value).toHaveLength(400);
    expect(box()).not.toHaveAttribute("maxlength");
  });

  it("lets the line be saved again once it is back at 300 or under", async () => {
    mount();
    await open();
    await paste("y".repeat(329));
    await userEvent.clear(box());
    await paste("y".repeat(300));
    expect(save()).toBeEnabled();
    expect(
      screen.queryByText("Keep it short enough to read in a list."),
    ).toBeNull();
  });
});

describe("adding finished tasks to the box", () => {
  it("adds as many as fit and no more: the third of three about 110 characters long is not added", async () => {
    mount();
    await open();
    await userEvent.click(addButton("PLT-1"));
    await userEvent.click(addButton("PLT-2"));
    expect(box().value.trim().length).toBeLessThanOrEqual(300);
    /* The third would make 332. It is not offered, and its row says why. */
    expect(addButton("PLT-3")).toBeDisabled();
    expect(box().value).not.toContain("PLT-3");
  });

  it("says in words on the row that would not fit that it would take the line past 300 characters", async () => {
    mount();
    await open();
    await userEvent.click(addButton("PLT-1"));
    await userEvent.click(addButton("PLT-2"));
    const row = addButton("PLT-3").closest("li")!;
    expect(row).toHaveTextContent("Would take the line past 300 characters.");
    /* And what to do about it, once, under the list and not on every row. */
    expect(
      screen.getByText(
        "A weekly line is 300 characters at most. Save this one, then log the next on its own.",
      ),
    ).toBeInTheDocument();
    expect(addButton("PLT-1").closest("li")).not.toHaveTextContent(
      "Would take the line past",
    );
  });

  it("says nothing about room while every line fits", async () => {
    request.mockResolvedValue(answer([line(1)]));
    mount();
    await open();
    expect(screen.queryByText(/Would take the line past/)).toBeNull();
    expect(screen.queryByText(/300 characters at most/)).toBeNull();
  });

  it("offers a line again once what is in the box has been cut back to make room", async () => {
    mount();
    await open();
    await userEvent.click(addButton("PLT-1"));
    await userEvent.click(addButton("PLT-2"));
    expect(addButton("PLT-3")).toBeDisabled();
    await userEvent.clear(box());
    await paste("PLT-1 short");
    expect(addButton("PLT-3")).toBeEnabled();
  });

  it("saves one line at a time: the first goes, and the next is logged on its own", async () => {
    mount();
    await open();
    await userEvent.click(addButton("PLT-1"));
    await userEvent.click(addButton("PLT-2"));
    await userEvent.click(save());
    await waitFor(() => expect(submitTask).toHaveBeenCalledTimes(1));
    const sent = submitTask.mock.calls[0]![1] as { description: string };
    expect(sent.description.length).toBeLessThanOrEqual(300);
    expect(sent.description).toContain("PLT-1");
    expect(sent.description).toContain("PLT-2");
    expect(sent.description).not.toContain("PLT-3");
  });
});

describe("a refusal from the server", () => {
  it("is the field's own sentence, not 'Some fields are not valid'", async () => {
    submitTask.mockRejectedValue(
      new ApiError(400, "validation", "Some fields are not valid.", [
        {
          field: "description",
          message: "Keep it short enough to read in a list.",
        },
      ]),
    );
    mount();
    await open();
    await userEvent.type(box(), "Did the migration");
    await userEvent.click(save());
    expect(
      await screen.findByText("Keep it short enough to read in a list."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Some fields are not valid.")).toBeNull();
  });

  it("is the server's message when there is no field sentence", async () => {
    submitTask.mockRejectedValue(
      new ApiError(
        403,
        "forbidden",
        "You can only log tasks against your own objectives.",
      ),
    );
    mount();
    await open();
    await userEvent.type(box(), "Did the migration");
    await userEvent.click(save());
    expect(
      await screen.findByText(
        "You can only log tasks against your own objectives.",
      ),
    ).toBeInTheDocument();
  });

  it("goes when the person edits the box, so a stale refusal never stands beside new words", async () => {
    submitTask.mockRejectedValue(
      new ApiError(
        403,
        "forbidden",
        "You can only log tasks against your own objectives.",
      ),
    );
    mount();
    await open();
    await userEvent.type(box(), "Did the migration");
    await userEvent.click(save());
    await screen.findByText(
      "You can only log tasks against your own objectives.",
    );
    await userEvent.type(box(), "!");
    expect(
      screen.queryByText("You can only log tasks against your own objectives."),
    ).toBeNull();
  });
});
