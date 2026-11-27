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
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiPin } from "@/lib/api/work-pins";
import type { Completion, WorkThisCycle } from "@/lib/projects/completions";

/**
 * Choosing finished work to put beside an answer.
 *
 * What is proved: the list is the person's own finished work for this review's period and is asked for
 * only while the dialog is open; nothing can be added until a task is picked; the title is shown to the
 * person and what is sent has no title in it; every rule (who reads it, that the title is not saved, that
 * it moves no mark, the limit) is one tooltip in the footer and not a paragraph above the list; the only
 * buttons are Cancel and Add, and Add closes the dialog; a task already on the answer cannot be picked
 * again; a refusal is the server's own sentence and the pick and the note stay; a pin that was written
 * but could not be read back says so where it will be seen, since the dialog is going; a note over the
 * limit is a problem and cannot be sent; a dialog opens fresh every time and is not wiped by the list
 * being read again while somebody is choosing; and an empty list is "Not recorded", which says nothing
 * about the work.
 *
 * And what it does not claim and does not throw away: an answer that cannot be read (a period with no
 * dates, a read that failed, the moment the dialog is going away) is never "no tasks were recorded"; the
 * list is asked for as long as the dialog has been open, so closing it does not turn a list into a
 * sentence for the length of its exit; and nothing closes it while a request is out, so a refusal is always
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
    <ToastProvider>
      <PinWorkDialog
        open={open}
        onClose={onClose}
        work={WORK}
        prompt="What did you achieve?"
        pinned={[]}
        onPin={onPin}
        {...over}
      />
    </ToastProvider>,
  );

const dialog = () => screen.getByRole("dialog");
const addButton = () => within(dialog()).getByRole("button", { name: "Add" });
const cancelButton = () =>
  within(dialog()).getByRole("button", { name: "Cancel" });
const note = () => within(dialog()).getByRole("textbox");
const pick = (name: RegExp) =>
  userEvent.click(within(dialog()).getByRole("radio", { name }));

/** The same dialog, as another render of it: the list read again, or the dialog opened and closed. */
const element = (over: Partial<Parameters<typeof PinWorkDialog>[0]> = {}) => (
  <ToastProvider>
    <PinWorkDialog
      open
      onClose={onClose}
      work={WORK}
      prompt="What did you achieve?"
      pinned={[]}
      onPin={onPin}
      {...over}
    />
  </ToastProvider>
);

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

  it("says which answer it is for, under a short title", () => {
    mount();
    expect(
      within(dialog()).getByRole("heading", { name: "Add work" }),
    ).toBeInTheDocument();
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

  it("keeps every rule behind one info mark in the footer, and no paragraph above the list", async () => {
    mount();
    for (const rule of [
      /is shown here to help you choose/,
      /It does not change your score/,
      /Up to 5 on each answer/,
      /The people who read your review/,
      /one press away/,
    ]) {
      expect(within(dialog()).queryByText(rule)).not.toBeInTheDocument();
    }
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "About adding work" }),
    );
    const rules = screen.getByText(/The people who read your review/);
    expect(rules).toHaveTextContent(
      "the task's key, the day it was finished and your note",
    );
    expect(rules).toHaveTextContent(
      "The title is shown here to help you choose and is not saved",
    );
    expect(rules).toHaveTextContent("It does not change your score");
    expect(rules).toHaveTextContent("Up to 5 on each answer");
  });

  it("has no heading over the list and no count under it", () => {
    mount({ pinned: [pinned()] });
    expect(
      within(dialog()).queryByText("Your finished work in this period"),
    ).not.toBeInTheDocument();
    expect(within(dialog()).queryByText(/of 5 added/)).not.toBeInTheDocument();
  });

  it("says when it shows the latest of more", () => {
    hook.read = read(work([task()], { capped: true, total: 80 }));
    mount();
    expect(within(dialog()).getByText("Latest 1 of 80")).toBeInTheDocument();
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

  it("says Not recorded, which is nothing about the work, when there is nothing to pick", () => {
    hook.read = read(work([]));
    mount();
    expect(within(dialog()).getByText("Not recorded")).toBeInTheDocument();
    expect(
      within(dialog()).queryByText(/said nothing|No finished tasks/),
    ).not.toBeInTheDocument();
    expect(within(dialog()).queryByRole("radio")).not.toBeInTheDocument();
    expect(addButton()).toBeDisabled();
  });
});

describe("two buttons", () => {
  it("are Cancel and Add, and nothing asks a second question", () => {
    mount();
    const names = within(dialog())
      .getAllByRole("button")
      .map((one) => one.getAttribute("aria-label") ?? one.textContent);
    expect(names).toEqual(
      expect.arrayContaining(["Cancel", "Add", "About adding work"]),
    );
    for (const gone of [
      "Done",
      "Keep editing",
      "Discard",
      "Add it and close",
      "Add to this answer",
    ]) {
      expect(names).not.toContain(gone);
    }
  });

  it("close at once on Cancel, with a task picked and a note typed, and send nothing", async () => {
    mount();
    await pick(/PLT-12/);
    await userEvent.type(note(), "half a thought");
    await userEvent.click(cancelButton());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPin).not.toHaveBeenCalled();
  });

  it("close at once by every other way too, asking nothing", async () => {
    mount();
    await pick(/PLT-12/);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Close dialog" }),
    );
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(
      document.querySelector(
        '[aria-hidden="true"].absolute.inset-0',
      ) as Element,
    );
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(within(dialog()).queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("picking and adding", () => {
  it("cannot add until a task is picked", () => {
    mount();
    expect(addButton()).toBeDisabled();
  });

  it("can add once a task is picked", async () => {
    mount();
    await pick(/PLT-12/);
    expect(addButton()).toBeEnabled();
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

  it("closes once it is added, and says nothing about it: the chip under the question is the answer", async () => {
    mount();
    await pick(/PLT-12/);
    await userEvent.click(addButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText(/was added to this answer/),
    ).not.toBeInTheDocument();
  });

  it("says a pin that was written but could not be read back, where it will be seen, and does not say it failed", async () => {
    onPin.mockResolvedValue(null);
    mount();
    await pick(/PLT-12/);
    await userEvent.click(addButton());
    expect(await screen.findByText("PLT-12 was saved")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This page could not read it back. Reload the review to see it.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says nothing extra for a pin that was read back", async () => {
    mount();
    await pick(/PLT-12/);
    await userEvent.click(addButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/was saved/)).not.toBeInTheDocument();
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
});

describe("the limit", () => {
  const five = [1, 2, 3, 4, 5].map((n) =>
    pinned({
      id: `p${String(n)}`,
      issueId: `x${String(n)}`,
      key: `PLT-${String(n)}`,
    }),
  );

  it("turns adding off at five, without a sentence: the plus that opens this is gone by then", () => {
    mount({ pinned: five });
    expect(addButton()).toBeDisabled();
    expect(
      within(dialog()).queryByText(/Unpin one to add another/),
    ).not.toBeInTheDocument();
    for (const radio of within(dialog()).getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
  });

  it("is not claimed below five", () => {
    mount({ pinned: five.slice(0, 4) });
    expect(
      within(dialog()).getByRole("radio", { name: /PLT-13/ }),
    ).toBeEnabled();
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
    expect(onClose).not.toHaveBeenCalled();
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
  it("is optional, and is there from the start", () => {
    mount();
    expect(note()).toBeEnabled();
    expect(note()).toHaveAttribute(
      "placeholder",
      "Optional, up to 280 characters",
    );
  });

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
    view.rerender(element({ open: false }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    view.rerender(element());
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
    view.rerender(element());
    expect(
      within(dialog()).getByRole("radio", { name: /PLT-12/ }),
    ).toBeChecked();
    expect(note()).toHaveValue("half a thought");
  });
});

describe("an answer that cannot be read", () => {
  it("is not 'no tasks were recorded': it says Not recorded, and offers nothing to choose from", () => {
    hook.read = read(null);
    mount();
    expect(within(dialog()).getByText("Not recorded")).toBeInTheDocument();
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
    view.rerender(element({ open: false }));
    /* The dialog is still on screen for the length of its exit, and is still showing the list. */
    expect(dialog()).toBeInTheDocument();
    expect(within(dialog()).getAllByRole("radio")).toHaveLength(3);
    expect(
      within(dialog()).queryByText("Not recorded"),
    ).not.toBeInTheDocument();
    expect(hook.args.at(-1)).toMatchObject({ enabled: true });
  });

  it("asks again, for a fresh list, when it is opened again, and never asked while it had never been opened", async () => {
    hook.honourEnabled = true;
    const view = render(element({ open: false }));
    expect(
      hook.args.every(
        (args) => (args as { enabled: boolean }).enabled === false,
      ),
    ).toBe(true);
    view.rerender(element({ open: true }));
    expect(hook.args.at(-1)).toMatchObject({ enabled: true });
    expect(within(dialog()).getAllByRole("radio")).toHaveLength(3);
    view.rerender(element({ open: false }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    view.rerender(element({ open: true }));
    expect(hook.args.at(-1)).toMatchObject({ enabled: true });
    expect(within(dialog()).getAllByRole("radio")).toHaveLength(3);
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

  it("cannot be closed by Cancel, the cross, Escape or the backdrop, and closes when it is added", async () => {
    const out = pending();
    mount();
    await pick(/PLT-12/);
    await userEvent.click(addButton());
    await waitFor(() => expect(onPin).toHaveBeenCalledTimes(1));
    expect(cancelButton()).toBeDisabled();
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
    await act(async () => {
      out.resolve(pinned());
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
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
    /* The answer is in: closing is allowed again. */
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("where focus goes when the dialog is closed", () => {
  /** A button that opens the dialog, and a dialog that really closes when asked, as the answer page's does. */
  function Opener() {
    const [open, setOpen] = useState(false);
    return (
      <ToastProvider>
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
      </ToastProvider>
    );
  }

  it("is handed back to the button that opened it after Cancel, and not taken back into the dialog that is leaving", async () => {
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "Open the picker" });
    await userEvent.click(opener);
    await pick(/PLT-12/);
    await userEvent.click(cancelButton());
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(opener).toHaveFocus();
  });

  it("is handed back to it after Add, too", async () => {
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "Open the picker" });
    await userEvent.click(opener);
    await pick(/PLT-12/);
    await userEvent.click(addButton());
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
      name: "Which task to add",
    });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(dialog()).getAllByRole("radio")).toHaveLength(3);
  });

  it("has no group where there is nothing to pick", () => {
    hook.read = read(work([]));
    mount();
    expect(
      within(dialog()).queryByRole("group", { name: "Which task to add" }),
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
