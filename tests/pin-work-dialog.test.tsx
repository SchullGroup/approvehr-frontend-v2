import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiPin } from "@/lib/api/work-pins";
import type { Completion, WorkThisCycle } from "@/lib/projects/completions";

/**
 * Choosing finished work to put beside an answer.
 *
 * What is proved: the list is the person's own finished work for this review's period and is asked for
 * only while the dialog is open; nothing can be added until a task is picked, and the note waits for
 * a task; the title is shown to the person and the dialog says it is not saved, and what is sent has no
 * title in it; adding keeps the dialog open for the next one, says what was added, clears the pick and
 * the note, and keeps focus inside the dialog; a task already on the answer cannot be picked again; at
 * the limit nothing can be added and it says why; a refusal is the server's own sentence and the pick
 * and the note stay; a pin that was written but could not be read back says so; a note over the limit
 * is a problem and cannot be sent; a dialog opens fresh every time and is not wiped by the list being
 * read again while somebody is choosing; and an empty list says nothing was recorded, which says
 * nothing about the work.
 *
 * And what it does not claim and does not throw away: an answer that cannot be read (a period with no
 * dates, a read that failed, the moment the dialog is going away) is never "no tasks were recorded";
 * the list is asked for as long as the dialog has been open, so closing it does not turn a list into a
 * sentence for the length of its exit; Done, the cross, Escape and the backdrop ask first when a task is
 * picked or a note is typed that has not been added (keep editing, discard, or add it and close) and
 * close at once when nothing is; and nothing closes it while a request is out, so a refusal is always
 * seen, in the server's own words, with the pick and the note still there.
 */

const hook = vi.hoisted(() => ({
  read: null as unknown,
  args: [] as unknown[],
  /** Behave like the real read: no answer at all for a dialog that is not asking. */
  honourEnabled: false,
}));
vi.mock("@/lib/store/completions", () => ({
  useWorkThisCycle: (args: unknown) => {
    hook.args.push(args);
    if (hook.honourEnabled && (args as { enabled: boolean }).enabled === false)
      return { data: null, loading: false, error: null, reload: vi.fn() };
    return hook.read;
  },
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));

import { PinWorkDialog } from "@/components/performance/pin-work-dialog";

const task = (over: Partial<Completion> = {}): Completion => ({
  id: "i1",
  key: "PLT-12",
  title: "Move invoices to the new ledger",
  projectId: "p1",
  projectName: "Payroll v2",
  personal: false,
  personId: "e1",
  personName: "Chidi Nwosu",
  doneAt: "2026-11-04T10:00:00.000Z",
  doneDay: "2026-11-04",
  dueDate: "2026-11-05",
  onTime: true,
  objective: { state: "UNLINKED" } as never,
  ...over,
});

const work = (items: Completion[], over: Partial<WorkThisCycle> = {}) =>
  ({
    summary: { finished: items.length },
    byProject: [],
    byObjective: [],
    items,
    total: items.length,
    capped: false,
    ...over,
  }) as unknown as WorkThisCycle;

const read = (
  data: WorkThisCycle | null,
  extra: Record<string, unknown> = {},
) => ({
  data,
  loading: false,
  error: null,
  reload: vi.fn(),
  ...extra,
});

const pinned = (over: Partial<ApiPin> = {}): ApiPin => ({
  id: "pin1",
  issueId: "i1",
  key: "PLT-12",
  type: "TASK",
  personal: false,
  projectId: "p1",
  doneAt: "2026-11-04T10:00:00.000Z",
  finishedOn: "2026-11-04",
  dueDate: null,
  timing: "ON_TIME",
  linked: false,
  setBy: null,
  note: null,
  pinnedAt: "2026-11-05T09:00:00.000Z",
  ...over,
});

const WORK = {
  subjectId: "e1",
  cycleId: "c1",
  periodStart: "2026-07-01",
  periodEnd: "2026-12-31",
};

const onPin =
  vi.fn<(issueId: string, note: string) => Promise<ApiPin | null>>();
const onClose = vi.fn();

const mount = (
  over: Partial<Parameters<typeof PinWorkDialog>[0]> = {},
  open = true,
) =>
  render(
    <PinWorkDialog
      open={open}
      onClose={onClose}
      work={WORK}
      prompt="What did you achieve?"
      pinned={[]}
      onPin={onPin}
      {...over}
    />,
  );

const dialog = () => screen.getByRole("dialog");
const addButton = () =>
  within(dialog()).getByRole("button", { name: "Add to this answer" });
const note = () => within(dialog()).getByRole("textbox");
const pick = (name: RegExp) =>
  userEvent.click(within(dialog()).getByRole("radio", { name }));

beforeEach(() => {
  vi.clearAllMocks();
  hook.args = [];
  hook.honourEnabled = false;
  hook.read = read(
    work([
      task(),
      task({
        id: "i2",
        key: "PLT-13",
        title: "Fix the payslip PDF",
        onTime: false,
        setBy: { id: "pat", name: "Pat Projects" },
      }),
      task({
        id: "i3",
        key: "MY-3",
        title: "Order the laptops",
        personal: true,
        onTime: null,
      }),
    ]),
  );
  onPin.mockResolvedValue(pinned());
});

describe("the list", () => {
  it("is this person's finished work for this period, asked for only while the dialog is open", () => {
    mount();
    expect(hook.args.at(-1)).toMatchObject({ ...WORK, enabled: true });
    expect(dialog()).toBeInTheDocument();
  });

  it("is not asked for while it is closed", () => {
    mount({}, false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      hook.args.every(
        (args) => (args as { enabled: boolean }).enabled === false,
      ),
    ).toBe(true);
  });

  it("says which answer it is for", () => {
    mount();
    expect(
      within(dialog()).getByText("What did you achieve?"),
    ).toBeInTheDocument();
  });

  it("shows each task's key, title and the quiet facts", () => {
    mount();
    const first = within(dialog()).getByRole("radio", { name: /PLT-12/ });
    expect(first).toHaveAccessibleName(/Move invoices to the new ledger/);
    expect(
      within(dialog()).getByText("Payroll v2 · Finished 4 Nov 2026 · On time"),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByText(
        "Payroll v2 · Finished 4 Nov 2026 · Late · Set by Pat Projects",
      ),
    ).toBeInTheDocument();
    /* A personal task is named as one, and a task with no due date says nothing about a deadline. */
    expect(
      within(dialog()).getByText("Personal · Finished 4 Nov 2026"),
    ).toBeInTheDocument();
  });

  it("says the title is shown to help choose and is not saved with the pin", () => {
    mount();
    expect(
      within(dialog()).getByText(
        /The title is shown here to help you choose and is not saved with the pin/,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByText(/It does not change your mark/),
    ).toBeInTheDocument();
  });

  it("says what readers see, and that they open the task only where they are allowed to", () => {
    mount();
    expect(
      within(dialog()).getByText(
        /Readers see the task's key, the day it was finished and your note, and can open the task to read it where they are allowed to\./,
      ),
    ).toBeInTheDocument();
    /* Nothing here promises a link that works for everybody. */
    expect(
      within(dialog()).queryByText(/anyone who reads (it )?can open/i),
    ).not.toBeInTheDocument();
  });

  it("says that what it adds is not the whole picture", () => {
    mount();
    expect(
      within(dialog()).getByText(
        /The full list of your finished work is still one press away for them/,
      ),
    ).toBeInTheDocument();
  });

  it("says when it shows the latest of more", () => {
    hook.read = read(work([task()], { capped: true, total: 80 }));
    mount();
    expect(
      within(dialog()).getByText("Showing your latest 1 of 80 finished tasks."),
    ).toBeInTheDocument();
  });

  it("shows a loading state, and nothing to pick while it loads", () => {
    hook.read = read(null, { loading: true });
    mount();
    expect(
      within(dialog()).getByLabelText("Loading your work"),
    ).toBeInTheDocument();
    expect(within(dialog()).queryByRole("radio")).not.toBeInTheDocument();
  });

  it("says plainly when it could not be read, with a way to try again, and nothing to pick", () => {
    hook.read = read(null, {
      error: new ApiError(500, "internal", "Internal"),
    });
    mount();
    expect(within(dialog()).queryByRole("radio")).not.toBeInTheDocument();
    expect(
      within(dialog()).getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
    expect(within(dialog()).queryByText(/500/)).not.toBeInTheDocument();
  });

  it("says nothing was recorded, which is nothing about the work, when there is nothing to pick", () => {
    hook.read = read(work([]));
    mount();
    expect(
      within(dialog()).getByText(
        /No finished tasks were recorded for you on the project boards in this period, so there is nothing to add\. That says nothing about the work itself/,
      ),
    ).toBeInTheDocument();
    expect(within(dialog()).queryByRole("radio")).not.toBeInTheDocument();
    expect(addButton()).toBeDisabled();
  });
});

describe("picking and adding", () => {
  it("cannot add until a task is picked, and the note waits for one", () => {
    mount();
    expect(addButton()).toBeDisabled();
    expect(note()).toBeDisabled();
  });

  it("can add once a task is picked, and then the note is for it", async () => {
    mount();
    await pick(/PLT-12/);
    expect(addButton()).toBeEnabled();
    expect(note()).toBeEnabled();
  });

  it("sends the task's id and the note, and nothing else: no title", async () => {
    mount();
    await pick(/PLT-13/);
    await userEvent.type(note(), "Led it end to end");
    await userEvent.click(addButton());
    await waitFor(() => expect(onPin).toHaveBeenCalledTimes(1));
    expect(onPin).toHaveBeenCalledWith("i2", "Led it end to end");
    expect((onPin.mock.calls[0] as unknown[]).length).toBe(2);
    expect(JSON.stringify(onPin.mock.calls)).not.toContain("payslip PDF");
  });

  it("sends an empty note for a task added alone", async () => {
    mount();
    await pick(/PLT-12/);
    await userEvent.click(addButton());
    await waitFor(() => expect(onPin).toHaveBeenCalledWith("i1", ""));
  });

  it("says what was added, clears the pick and the note, and stays open for the next", async () => {
    mount();
    await pick(/PLT-12/);
    await userEvent.type(note(), "Led it");
    await userEvent.click(addButton());
    expect(
      await within(dialog()).findByText("PLT-12 was added to this answer."),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByRole("radio", { name: /PLT-12/ }),
    ).not.toBeChecked();
    expect(note()).toHaveValue("");
    expect(addButton()).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();
  });

  it("keeps focus inside the dialog after an add, on the list heading, where the next pick is a key away", async () => {
    mount();
    await pick(/PLT-12/);
    await userEvent.click(addButton());
    await within(dialog()).findByText("PLT-12 was added to this answer.");
    /* Not left on the button that has just gone off: a disabled control drops focus to the page. */
    expect(document.activeElement).toBe(
      within(dialog()).getByRole("heading", {
        name: "Your finished work in this period",
      }),
    );
  });

  it("says a pin that was written but could not be read back, and does not say it failed", async () => {
    onPin.mockResolvedValue(null);
    mount();
    await pick(/PLT-12/);
    await userEvent.click(addButton());
    expect(
      await within(dialog()).findByText(
        "PLT-12 was saved, but this page could not read it back. Reload the review to see it.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("closes only when told to", async () => {
    mount();
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Done" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("what is already on the answer", () => {
  it("cannot be picked again, and says so", () => {
    mount({ pinned: [pinned()] });
    expect(
      within(dialog()).getByRole("radio", { name: /PLT-12/ }),
    ).toBeDisabled();
    expect(
      within(dialog()).getByText(
        "Payroll v2 · Finished 4 Nov 2026 · On time · Already on this answer",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByRole("radio", { name: /PLT-13/ }),
    ).toBeEnabled();
  });

  it("says how many are on it", () => {
    mount({ pinned: [pinned()] });
    expect(within(dialog()).getByText("1 of 5 added.")).toBeInTheDocument();
  });

  it("says the limit before anything is added", () => {
    mount();
    expect(
      within(dialog()).getByText("Up to 5 on each answer."),
    ).toBeInTheDocument();
  });
});

describe("the limit", () => {
  const five = [1, 2, 3, 4, 5].map((n) =>
    pinned({
      id: `p${String(n)}`,
      issueId: `x${String(n)}`,
      key: `PLT-${String(n)}`,
    }),
  );

  it("turns adding off at five, and says why and what to do", () => {
    mount({ pinned: five });
    expect(addButton()).toBeDisabled();
    expect(
      within(dialog()).getByText("5 of 5 added. Unpin one to add another."),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByText(
        "5 is the most one answer carries. Unpin one to add another.",
      ),
    ).toBeInTheDocument();
    for (const radio of within(dialog()).getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
  });

  it("is not claimed below five", () => {
    mount({ pinned: five.slice(0, 4) });
    expect(within(dialog()).getByText("4 of 5 added.")).toBeInTheDocument();
    expect(
      within(dialog()).queryByText(/is the most one answer carries/),
    ).not.toBeInTheDocument();
  });
});

describe("a refusal", () => {
  it("is the server's own sentence, with the pick and the note still there", async () => {
    onPin.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "You have already pinned that task to this answer.",
      ),
    );
    mount();
    await pick(/PLT-13/);
    await userEvent.type(note(), "Led it");
    await userEvent.click(addButton());
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(
      "You have already pinned that task to this answer.",
    );
    expect(
      within(dialog()).getByRole("radio", { name: /PLT-13/ }),
    ).toBeChecked();
    expect(note()).toHaveValue("Led it");
    /* And it can be tried again once something is changed. */
    expect(addButton()).toBeEnabled();
  });

  it("is the setting being off, in the server's words, when it was switched off under somebody", async () => {
    onPin.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "Using your project work in your review is not switched on for your company. An administrator can turn it on under Settings.",
      ),
    );
    mount();
    await pick(/PLT-12/);
    await userEvent.click(addButton());
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(
      "is not switched on for your company",
    );
  });

  it("is never a status code for a server that fell over", async () => {
    onPin.mockRejectedValue(new ApiError(500, "internal", "Internal"));
    mount();
    await pick(/PLT-12/);
    await userEvent.click(addButton());
    const alert = await within(dialog()).findByRole("alert");
    expect(alert.textContent).not.toMatch(/500/);
    expect(alert).toHaveTextContent(/Something went wrong on our side/);
  });

  it("clears the refusal when a different task is picked", async () => {
    onPin.mockRejectedValue(new ApiError(422, "unprocessable", "Nope."));
    mount();
    await pick(/PLT-12/);
    await userEvent.click(addButton());
    await within(dialog()).findByRole("alert");
    await pick(/PLT-13/);
    expect(within(dialog()).queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the note", () => {
  it("is a problem over 280 characters, and cannot be sent", async () => {
    mount();
    await pick(/PLT-12/);
    await userEvent.click(note());
    await userEvent.paste("x".repeat(281));
    expect(
      within(dialog()).getByText("Keep the note to 280 characters."),
    ).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
  });

  it("is fine at 280, and shows its count near the end", async () => {
    mount();
    await pick(/PLT-12/);
    await userEvent.click(note());
    await userEvent.paste("x".repeat(280));
    expect(
      within(dialog()).getByText("280 of 280 characters"),
    ).toBeInTheDocument();
    expect(addButton()).toBeEnabled();
  });

  it("shows no count while it is short", async () => {
    mount();
    await pick(/PLT-12/);
    await userEvent.type(note(), "short");
    expect(
      within(dialog()).queryByText(/of 280 characters/),
    ).not.toBeInTheDocument();
  });
});

describe("a fresh dialog every time it opens", () => {
  it("does not remember the last pick or note", async () => {
    const view = mount();
    await pick(/PLT-12/);
    await userEvent.type(note(), "half a thought");
    view.rerender(
      <PinWorkDialog
        open={false}
        onClose={onClose}
        work={WORK}
        prompt="What did you achieve?"
        pinned={[]}
        onPin={onPin}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    view.rerender(
      <PinWorkDialog
        open
        onClose={onClose}
        work={WORK}
        prompt="What did you achieve?"
        pinned={[]}
        onPin={onPin}
      />,
    );
    expect(
      within(dialog()).getByRole("radio", { name: /PLT-12/ }),
    ).not.toBeChecked();
    expect(note()).toHaveValue("");
  });

  it("is not wiped when the list is read again while somebody is choosing", async () => {
    const view = mount();
    await pick(/PLT-12/);
    await userEvent.type(note(), "half a thought");
    /* The window was focused, so the list is read again: new objects, same tasks. */
    hook.read = read(
      work([
        task(),
        task({ id: "i2", key: "PLT-13", title: "Fix the payslip PDF" }),
      ]),
    );
    view.rerender(
      <PinWorkDialog
        open
        onClose={onClose}
        work={WORK}
        prompt="What did you achieve?"
        pinned={[]}
        onPin={onPin}
      />,
    );
    expect(
      within(dialog()).getByRole("radio", { name: /PLT-12/ }),
    ).toBeChecked();
    expect(note()).toHaveValue("half a thought");
  });
});

describe("an answer that cannot be read", () => {
  it("is not 'no tasks were recorded': it says only that this period's work cannot be read here", () => {
    hook.read = read(null);
    mount();
    expect(
      within(dialog()).getByText(
        "This period's work cannot be read here, so there is nothing to choose from.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog()).queryByText(/No finished tasks were recorded/),
    ).not.toBeInTheDocument();
    expect(within(dialog()).queryByRole("radio")).not.toBeInTheDocument();
    expect(addButton()).toBeDisabled();
  });

  it("keeps the list while the dialog fades out, instead of saying anything about the work", () => {
    hook.honourEnabled = true;
    const view = mount();
    expect(within(dialog()).getAllByRole("radio")).toHaveLength(3);
    view.rerender(
      <PinWorkDialog
        open={false}
        onClose={onClose}
        work={WORK}
        prompt="What did you achieve?"
        pinned={[]}
        onPin={onPin}
      />,
    );
    /* The dialog is still on screen for the length of its exit, and is still showing the list. */
    expect(dialog()).toBeInTheDocument();
    expect(within(dialog()).getAllByRole("radio")).toHaveLength(3);
    expect(
      within(dialog()).queryByText(/No finished tasks were recorded/),
    ).not.toBeInTheDocument();
    expect(
      within(dialog()).queryByText(/cannot be read here/),
    ).not.toBeInTheDocument();
    expect(hook.args.at(-1)).toMatchObject({ enabled: true });
  });

  it("asks again, for a fresh list, when it is opened again, and never asked while it had never been opened", async () => {
    hook.honourEnabled = true;
    const element = (open: boolean) => (
      <PinWorkDialog
        open={open}
        onClose={onClose}
        work={WORK}
        prompt="What did you achieve?"
        pinned={[]}
        onPin={onPin}
      />
    );
    const view = render(element(false));
    expect(
      hook.args.every(
        (args) => (args as { enabled: boolean }).enabled === false,
      ),
    ).toBe(true);
    view.rerender(element(true));
    expect(hook.args.at(-1)).toMatchObject({ enabled: true });
    expect(within(dialog()).getAllByRole("radio")).toHaveLength(3);
    view.rerender(element(false));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    view.rerender(element(true));
    expect(hook.args.at(-1)).toMatchObject({ enabled: true });
    expect(within(dialog()).getAllByRole("radio")).toHaveLength(3);
  });
});

describe("closing with something not added", () => {
  const done = () =>
    userEvent.click(within(dialog()).getByRole("button", { name: "Done" }));
  const asked = () => within(dialog()).queryByRole("alert");

  it("closes at once when nothing is picked and nothing is typed, by every way of closing it", async () => {
    mount();
    await done();
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Close dialog" }),
    );
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.click(
      document.querySelector(
        '[aria-hidden="true"].absolute.inset-0',
      ) as Element,
    );
    expect(onClose).toHaveBeenCalledTimes(4);
    expect(asked()).not.toBeInTheDocument();
  });

  it("asks first when a task is picked, and closes nothing yet, whichever way it is closed", async () => {
    mount();
    await pick(/PLT-12/);
    await done();
    expect(asked()).toHaveTextContent(
      "You picked PLT-12 and have not added it.",
    );
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Keep editing" }),
    );
    expect(asked()).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(asked()).toHaveTextContent(
      "You picked PLT-12 and have not added it.",
    );
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Keep editing" }),
    );
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Close dialog" }),
    );
    expect(asked()).toHaveTextContent(
      "You picked PLT-12 and have not added it.",
    );
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Keep editing" }),
    );
    fireEvent.click(
      document.querySelector(
        '[aria-hidden="true"].absolute.inset-0',
      ) as Element,
    );
    expect(asked()).toHaveTextContent(
      "You picked PLT-12 and have not added it.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("offers keep editing, discard and add it and close, with the pick and the note still there", async () => {
    mount();
    await pick(/PLT-12/);
    await userEvent.type(note(), "half a thought");
    await done();
    for (const name of ["Keep editing", "Discard", "Add it and close"]) {
      expect(
        within(dialog()).getByRole("button", { name }),
      ).toBeInTheDocument();
    }
    expect(
      within(dialog()).queryByRole("button", { name: "Add to this answer" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Keep editing" }),
    );
    expect(
      within(dialog()).getByRole("radio", { name: /PLT-12/ }),
    ).toBeChecked();
    expect(note()).toHaveValue("half a thought");
    expect(
      within(dialog()).getByRole("button", { name: "Add to this answer" }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes, throwing the pick away, on Discard, and sends nothing", async () => {
    mount();
    await pick(/PLT-12/);
    await done();
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Discard" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPin).not.toHaveBeenCalled();
  });

  it("adds it, with its note, and then closes, on Add it and close", async () => {
    mount();
    await pick(/PLT-12/);
    await userEvent.type(note(), "Led it");
    await done();
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Add it and close" }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onPin).toHaveBeenCalledTimes(1);
    expect(onPin).toHaveBeenCalledWith("i1", "Led it");
  });

  it("stays open, says the server's refusal and keeps the pick and the note, when Add it and close is refused", async () => {
    onPin.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "Five pins is the most one answer carries.",
      ),
    );
    mount();
    await pick(/PLT-12/);
    await userEvent.type(note(), "Led it");
    await done();
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Add it and close" }),
    );
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(
      "Five pins is the most one answer carries.",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(
      within(dialog()).getByRole("radio", { name: /PLT-12/ }),
    ).toBeChecked();
    expect(note()).toHaveValue("Led it");
    /* The question has been answered: the dialog is back to what it was. */
    expect(
      within(dialog()).getByRole("button", { name: "Add to this answer" }),
    ).toBeInTheDocument();
  });

  it("says a note was written, and cannot be added, when what it was written for is no longer listed", async () => {
    const element = () => (
      <PinWorkDialog
        open
        onClose={onClose}
        work={WORK}
        prompt="What did you achieve?"
        pinned={[]}
        onPin={onPin}
      />
    );
    const view = mount();
    await pick(/PLT-12/);
    await userEvent.type(note(), "half a thought");
    /* The list is read again and the task is not in it any more. */
    hook.read = read(
      work([task({ id: "i2", key: "PLT-13", title: "Another" })]),
    );
    view.rerender(element());
    await done();
    expect(asked()).toHaveTextContent(
      "You wrote a note and have not added it.",
    );
    expect(
      within(dialog()).getByRole("button", { name: "Add it and close" }),
    ).toBeDisabled();
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Discard" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes at once once what was picked has been added", async () => {
    mount();
    await pick(/PLT-12/);
    await userEvent.click(addButton());
    await within(dialog()).findByText("PLT-12 was added to this answer.");
    await done();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(asked()).not.toBeInTheDocument();
  });
});

describe("while a request is out", () => {
  const pending = () => {
    let resolve: (pin: ApiPin | null) => void = () => undefined;
    let reject: (reason: unknown) => void = () => undefined;
    onPin.mockImplementation(
      () =>
        new Promise<ApiPin | null>((res, rej) => {
          resolve = res;
          reject = rej;
        }),
    );
    return {
      resolve: (pin: ApiPin | null) => resolve(pin),
      reject: (r: unknown) => reject(r),
    };
  };

  it("cannot be closed by Done, the cross, Escape or the backdrop, and asks nothing", async () => {
    const out = pending();
    mount();
    await pick(/PLT-12/);
    await userEvent.click(addButton());
    await waitFor(() => expect(onPin).toHaveBeenCalledTimes(1));
    expect(
      within(dialog()).getByRole("button", { name: "Done" }),
    ).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Close dialog" }),
    );
    fireEvent.click(
      document.querySelector(
        '[aria-hidden="true"].absolute.inset-0',
      ) as Element,
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(
      within(dialog()).queryByText(/have not added it/),
    ).not.toBeInTheDocument();
    await act(async () => {
      out.resolve(pinned());
    });
    await within(dialog()).findByText("PLT-12 was added to this answer.");
  });

  it("shows the server's own refusal in the dialog, with the pick and the note, and can be closed again after", async () => {
    const out = pending();
    mount();
    await pick(/PLT-12/);
    await userEvent.type(note(), "Led it");
    await userEvent.click(addButton());
    await waitFor(() => expect(onPin).toHaveBeenCalledTimes(1));
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      out.reject(
        new ApiError(409, "conflict", "You have already sent this review."),
      );
    });
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(
      "You have already sent this review.",
    );
    expect(
      within(dialog()).getByRole("radio", { name: /PLT-12/ }),
    ).toBeChecked();
    expect(note()).toHaveValue("Led it");
    /* The answer is in: closing is allowed again, and asks, since the pick was never added. */
    await userEvent.keyboard("{Escape}");
    expect(
      within(dialog()).getByText("You picked PLT-12 and have not added it."),
    ).toBeInTheDocument();
  });

  it("holds Add it and close too: the answer is waited for, and the dialog closes only on success", async () => {
    const out = pending();
    mount();
    await pick(/PLT-12/);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Add it and close" }),
    );
    await waitFor(() => expect(onPin).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      out.resolve(pinned());
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("where focus goes when it asks before closing", () => {
  const pressDone = async () => {
    const done = within(dialog()).getByRole("button", { name: "Done" });
    done.focus();
    await userEvent.keyboard("{Enter}");
  };

  it("is on Keep editing when the question appears, not on the page behind the open dialog", async () => {
    mount();
    await pick(/PLT-12/);
    await pressDone();
    const keep = await within(dialog()).findByRole("button", {
      name: "Keep editing",
    });
    expect(keep).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it("goes back to Done when Keep editing is pressed, since the button that was pressed has gone", async () => {
    mount();
    await pick(/PLT-12/);
    await pressDone();
    await userEvent.click(
      await within(dialog()).findByRole("button", { name: "Keep editing" }),
    );
    expect(
      within(dialog()).getByRole("button", { name: "Done" }),
    ).toHaveFocus();
  });
});

describe("where focus goes when the dialog that asked is closed", () => {
  /** A button that opens the dialog, and a dialog that really closes when asked, as the answer page's does. */
  function Opener() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open the picker
        </button>
        <PinWorkDialog
          open={open}
          onClose={() => setOpen(false)}
          work={WORK}
          prompt="What did you achieve?"
          pinned={[]}
          onPin={onPin}
        />
      </>
    );
  }

  it("is handed back to the button that opened it after Discard, and not taken back into the dialog that is leaving", async () => {
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "Open the picker" });
    await userEvent.click(opener);
    await pick(/PLT-12/);
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Done" }),
    );
    await userEvent.click(
      await within(dialog()).findByRole("button", { name: "Discard" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(opener).toHaveFocus();
  });

  it("is handed back to it after Add it and close, too", async () => {
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "Open the picker" });
    await userEvent.click(opener);
    await pick(/PLT-12/);
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Done" }),
    );
    await userEvent.click(
      await within(dialog()).findByRole("button", { name: "Add it and close" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(opener).toHaveFocus();
  });
});

describe("the list of tasks", () => {
  it("is a named group, so the radios are announced as choices of something", () => {
    mount();
    const group = within(dialog()).getByRole("group", {
      name: "Which task to add to this answer",
    });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(dialog()).getAllByRole("radio")).toHaveLength(3);
  });

  it("has no group where there is nothing to pick", () => {
    hook.read = read(work([]));
    mount();
    expect(
      within(dialog()).queryByRole("group", {
        name: "Which task to add to this answer",
      }),
    ).not.toBeInTheDocument();
  });
});

describe("when adding is answered with not found", () => {
  const add = async () => {
    await pick(/PLT-12/);
    await userEvent.click(addButton());
  };

  it("says the review is not there any more, and not that a pin is", async () => {
    onPin.mockRejectedValue(
      new ApiError(404, "not_found", "That review was not found."),
    );
    mount();
    await add();
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(
      "That review is not there any more, so nothing was changed.",
    );
    expect(within(dialog()).queryByText(/That pin/)).not.toBeInTheDocument();
    /* The pick and the note stay: nothing here says to start again. */
    expect(
      within(dialog()).getByRole("radio", { name: /PLT-12/ }),
    ).toBeChecked();
  });

  it("still names the pin for a failure that is about the pin", async () => {
    onPin.mockRejectedValue(new ApiError(500, "internal", "Internal"));
    mount();
    await add();
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(
      "Something went wrong on our side, so that pin was not saved.",
    );
  });
});
