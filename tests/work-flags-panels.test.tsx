import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { KeptWorkRecord } from "@/lib/api/kept-work";
import type { ApiWorkFlag } from "@/lib/api/work-flags";
import type { Completion, WorkThisCycle } from "@/lib/projects/completions";

/**
 * "This is wrong", on the lists of finished work a review is read beside.
 *
 * What is proved, for the live list and for the record kept when the rating was made final: nothing about
 * flags is drawn unless the server said they are on, and a list with no flags is never read as "nothing
 * was flagged" when it did not; only the person the work is about is given the controls, and they are in the
 * row's menu, not a button on every row; a reader sees the flag and who raised it and nothing to press; a
 * flag reads as who, when and what they said; the small line counts the rows that carry one; what a flag is
 * is said once, in the list's tooltip; the dialog asks for a reason within the API's bounds, is fresh each
 * time it opens, keeps its title while it fades, keeps what was typed when the server refuses, and shows the
 * server's own sentence; changing and taking back work from the row's menu; and a panel that is not shown
 * asks for nothing.
 */

const hook = vi.hoisted(() => ({
  kept: null as unknown,
  live: null as unknown,
  projects: { enabled: true, loading: false },
  flags: null as unknown,
  flagArgs: [] as unknown[],
}));
vi.mock("@/lib/store/kept-work", () => ({ useKeptWork: () => hook.kept }));
vi.mock("@/lib/store/completions", () => ({
  useWorkThisCycle: () => hook.live,
}));
vi.mock("@/lib/store/project-session", () => ({
  useProjectsGate: () => hook.projects,
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/work-flags", () => ({
  useWorkFlags: (args: unknown) => {
    hook.flagArgs.push(args);
    return hook.flags;
  },
}));

const { WorkThisCycle } =
  await import("@/components/performance/work-this-cycle");
const { WorkBehindTheMark } =
  await import("@/components/performance/kept-work");

const flag = (over: Partial<ApiWorkFlag> = {}): ApiWorkFlag => ({
  issueId: "i2",
  key: "PRF-2",
  reason: "That was Ada's task, not mine",
  flaggedAt: "2026-11-06T09:00:00.000Z",
  ...over,
});

/** The row's menu, which holds every control that acts on a flag. There is no button of its own on a row. */
const MENU = /^More actions for /;

/** Opens a row's menu and picks one thing from it. */
const choose = async (key: string, item: string) => {
  await userEvent.click(
    screen.getByRole("button", { name: `More actions for ${key}` }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: item }));
};

/** What is in a row's menu, and then closes it. */
const itemsOf = async (key: string) => {
  await userEvent.click(
    screen.getByRole("button", { name: `More actions for ${key}` }),
  );
  const names = screen.getAllByRole("menuitem").map((one) => one.textContent);
  await userEvent.keyboard("{Escape}");
  return names;
};

/** Opens the one tooltip, where what a flag is is said. */
const readNote = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: "About this list" }),
  );
};

/** `flags: null` is a server that said nothing about flags; a list, even an empty one, is what it said. */
const flagsState = (
  over: {
    on?: boolean;
    flags?: ApiWorkFlag[] | null;
    flagFn?: ReturnType<typeof vi.fn>;
    unflagFn?: ReturnType<typeof vi.fn>;
  } = {},
) => ({
  on: over.on ?? true,
  flags:
    over.flags === null
      ? null
      : new Map((over.flags ?? []).map((one) => [one.issueId, one])),
  flag: over.flagFn ?? vi.fn(async () => undefined),
  unflag: over.unflagFn ?? vi.fn(async () => undefined),
});

const done = (over: Partial<Completion> = {}): Completion => ({
  id: "i1",
  key: "PRF-1",
  title: "Move invoices to the new ledger",
  projectId: "p1",
  projectName: "Payroll v2",
  personal: false,
  personId: "bola",
  personName: "Bola Projects",
  doneAt: "2026-10-12T10:00:00.000Z",
  doneDay: "2026-10-12",
  dueDate: null,
  onTime: null,
  objective: { state: "UNLINKED" } as never,
  ...over,
});

const liveWork = (): WorkThisCycle =>
  ({
    summary: { finished: 3, withDueDate: 0, onTime: 0, late: 0, linked: 0 },
    byProject: [{ projectId: "p1", projectName: "Payroll v2", finished: 3 }],
    byObjective: [],
    items: [
      done(),
      done({ id: "i2", key: "PRF-2", title: "Fix the payslip PDF" }),
      done({ id: "i3", key: "PRF-3", title: "Order the laptops" }),
    ],
    total: 3,
    capped: false,
  }) as unknown as WorkThisCycle;

const keptItem = (id: string, key: string) => ({
  id,
  key,
  type: "TASK",
  personal: false,
  projectId: "p1",
  doneAt: "2026-10-12T10:00:00.000Z",
  finishedOn: "2026-10-12",
  dueDate: null,
  timing: "NO_DUE_DATE" as const,
  linked: false,
  setBy: null,
});

const record = (): KeptWorkRecord => ({
  state: "KEPT",
  frozenAt: "2026-11-01T09:00:00.000Z",
  retainUntil: "2027-11-01T09:00:00.000Z",
  retainMonths: 12,
  period: { start: "2026-07-01", end: "2026-12-31" },
  summary: {
    finished: 3,
    withDueDate: 0,
    onTime: 0,
    late: 0,
    noDueDate: 3,
    linked: 0,
    unlinked: 3,
  },
  items: [
    keptItem("i1", "PRF-1"),
    keptItem("i2", "PRF-2"),
    keptItem("i3", "PRF-3"),
  ],
  total: 3,
  truncated: false,
});

const read = (data: unknown) => ({
  data,
  loading: false,
  error: null,
  reload: vi.fn(),
});

type Own = { own: boolean };
const live = ({ own }: Own) =>
  render(
    <WorkThisCycle
      subjectId="bola"
      cycleId="c1"
      periodStart="2026-07-01"
      periodEnd="2026-12-31"
      subjectName="Bola Projects"
      own={own}
    />,
  );
const kept = ({ own }: Own) =>
  render(
    <WorkBehindTheMark
      reviewId="r1"
      kind="MANAGER"
      final
      disputed={false}
      subjectId="bola"
      cycleId="c1"
      periodStart="2026-07-01"
      periodEnd="2026-12-31"
      subjectName="Bola Projects"
      own={own}
    />,
  );

const PANELS = [
  ["the live list", live],
  ["the record kept with the rating", kept],
] as const;

/** The row of one task: the list item that holds its key. */
const rowOf = (key: string) =>
  within(screen.getAllByText(key)[0]!.closest("li") as HTMLElement);

beforeEach(() => {
  hook.live = read(liveWork());
  hook.kept = read(record());
  hook.projects = { enabled: true, loading: false };
  hook.flags = flagsState();
  hook.flagArgs = [];
});

describe.each(PANELS)("%s", (_name, mount) => {
  describe("where the server said nothing about flags", () => {
    it.each([
      ["a server one deploy behind, which sends no list", false],
      ["an answer with no list", true],
    ])(
      "draws nothing for %s: no menu, no line, no explanation, no count",
      async (_why, on) => {
        hook.flags = flagsState({ on, flags: null });
        mount({ own: true });
        expect(
          screen.queryByRole("button", { name: MENU }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/Flagged by/)).not.toBeInTheDocument();
        expect(screen.queryByText(/flagged as wrong/)).not.toBeInTheDocument();
        await readNote();
        expect(screen.queryByText(/say so on its row/)).not.toBeInTheDocument();
        expect(
          screen.queryByText(/not available at the moment/),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText(/A flag is the person's own word/),
        ).not.toBeInTheDocument();
      },
    );
  });

  describe("where the switch has been turned off and flags were written", () => {
    beforeEach(() => {
      hook.flags = flagsState({
        on: false,
        flags: [
          flag(),
          flag({ issueId: "i3", key: "PRF-3", reason: "Wrong day" }),
        ],
      });
    });

    it("still draws every flag that was written, and the count in the small line, to the person", () => {
      mount({ own: true });
      expect(
        screen.getByText(
          "Flagged by you on 6 Nov 2026: That was Ada's task, not mine",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Flagged by you on 6 Nov 2026: Wrong day"),
      ).toBeInTheDocument();
      expect(screen.getByText(/2 flagged as wrong/)).toBeInTheDocument();
    });

    it("still draws them to a reader, by the person's name, with nothing to press", async () => {
      mount({ own: false });
      expect(
        screen.getByText(
          "Flagged by Bola Projects on 6 Nov 2026: That was Ada's task, not mine",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(/2 flagged as wrong/)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: MENU }),
      ).not.toBeInTheDocument();
      await readNote();
      expect(
        screen.getByText(
          /A flag is the person's own word that an item is not right\. It does not remove the item or change the score\./,
        ),
      ).toBeInTheDocument();
    });

    it("offers the person no way to raise or change one, and a way to take each back, and no menu on a row with nothing to offer", async () => {
      mount({ own: true });
      expect(await itemsOf("PRF-2")).toEqual(["Take it back"]);
      expect(await itemsOf("PRF-3")).toEqual(["Take it back"]);
      /* Not flagged, and nothing can be raised: there is nothing to press, so there is no menu. */
      expect(
        screen.queryByRole("button", { name: "More actions for PRF-1" }),
      ).not.toBeInTheDocument();
    });

    it("says what can and cannot be done, to the person, in the tooltip, and not the sentence about saying so on a row", async () => {
      mount({ own: true });
      await readNote();
      expect(
        screen.getByText(
          /Raising or changing a flag is not available at the moment\. A flag you raised stays on the list, and you can still take it back\./,
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/say so on its row/)).not.toBeInTheDocument();
    });

    it("takes one back, for that task only", async () => {
      const unflagFn = vi.fn(async () => undefined);
      hook.flags = flagsState({
        on: false,
        flags: [flag()],
        unflagFn,
      });
      mount({ own: true });
      await choose("PRF-2", "Take it back");
      await waitFor(() => expect(unflagFn).toHaveBeenCalledTimes(1));
      expect(unflagFn).toHaveBeenCalledWith("i2");
    });

    it("draws nothing at all when it is off and there is no flag to read", async () => {
      hook.flags = flagsState({ on: false, flags: [] });
      mount({ own: true });
      expect(screen.queryByText(/Flagged by/)).not.toBeInTheDocument();
      expect(screen.queryByText(/flagged as wrong/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: MENU }),
      ).not.toBeInTheDocument();
      await readNote();
      expect(
        screen.queryByText(/not available at the moment/),
      ).not.toBeInTheDocument();
    });
  });

  describe("for the person the work is about", () => {
    it("offers a menu on every row, with the one thing in it, and says what it does and does not do in the tooltip", async () => {
      mount({ own: true });
      expect(
        screen.getAllByRole("button", { name: /^More actions for PRF-\d$/ }),
      ).toHaveLength(3);
      /* No button of its own on a row: the words are in the menu. */
      expect(
        screen.queryByRole("button", { name: /This is wrong/ }),
      ).not.toBeInTheDocument();
      expect(await itemsOf("PRF-1")).toEqual(["This is wrong"]);
      await readNote();
      expect(
        screen.getByText(
          /If something here is not right, say so on its row\. It tells whoever reads your work\. It does not remove the item or change your score\./,
        ),
      ).toBeInTheDocument();
    });

    it("speaks to 'you' in a flag that is theirs", () => {
      hook.flags = flagsState({ flags: [flag()] });
      mount({ own: true });
      expect(
        screen.getByText(
          "Flagged by you on 6 Nov 2026: That was Ada's task, not mine",
        ),
      ).toBeInTheDocument();
    });

    it("counts the flagged rows in the small line, and says nothing for none", () => {
      hook.flags = flagsState({
        flags: [
          flag(),
          flag({ issueId: "i3", key: "PRF-3", reason: "Wrong day" }),
        ],
      });
      const view = mount({ own: true });
      expect(
        screen.getByText(/3 finished · 2 flagged as wrong/),
      ).toBeInTheDocument();
      view.unmount();
      hook.flags = flagsState();
      mount({ own: true });
      expect(screen.getByText(/3 finished/)).toBeInTheDocument();
      expect(screen.queryByText(/flagged as wrong/)).not.toBeInTheDocument();
    });

    it("counts only the flags on rows that are in the panel", () => {
      hook.flags = flagsState({
        flags: [flag({ issueId: "gone", key: "OLD-1" })],
      });
      mount({ own: true });
      expect(screen.queryByText(/flagged as wrong/)).not.toBeInTheDocument();
    });

    it("has Change and Take it back in the menu of a row that is flagged, and This is wrong in one that is not", async () => {
      hook.flags = flagsState({ flags: [flag()] });
      mount({ own: true });
      expect(await itemsOf("PRF-2")).toEqual(["Change", "Take it back"]);
      expect(await itemsOf("PRF-1")).toEqual(["This is wrong"]);
    });
  });

  describe("for somebody who reads it", () => {
    it("sees the flag, and who raised it, by name, and has nothing to press", async () => {
      hook.flags = flagsState({ flags: [flag()] });
      mount({ own: false });
      expect(
        screen.getByText(
          "Flagged by Bola Projects on 6 Nov 2026: That was Ada's task, not mine",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: MENU }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/1 flagged as wrong/)).toBeInTheDocument();
      await readNote();
      expect(
        screen.getByText(
          /A flag is the person's own word that an item is not right\. It does not remove the item or change the score\./,
        ),
      ).toBeInTheDocument();
    });

    it("draws the rows of a list nobody flagged exactly as it was", () => {
      mount({ own: false });
      expect(screen.queryByText(/Flagged by/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: MENU }),
      ).not.toBeInTheDocument();
    });

    it("keeps the flag's paragraphs and does not let a long word run out of its row", () => {
      hook.flags = flagsState({
        flags: [
          flag({ reason: "Line one\n\nhttps://example.com/a/very/long/link" }),
        ],
      });
      mount({ own: false });
      const line = screen.getByText(/Flagged by Bola Projects/);
      expect(line.className).toMatch(/whitespace-pre-line/);
      expect(line.className).toMatch(/break-words/);
    });
  });

  describe("raising one", () => {
    const open = async (key = "PRF-1") => {
      await choose(key, "This is wrong");
      return screen.getByRole("dialog");
    };

    it("opens a dialog for that task, that asks one thing and explains nothing", async () => {
      mount({ own: true });
      const dialog = await open("PRF-3");
      expect(
        within(dialog).getByText("Why is PRF-3 wrong?"),
      ).toBeInTheDocument();
      /* What a flag is, is in the list's tooltip, not above the field. */
      expect(
        within(dialog).queryByText(/does not change your score/),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByText(/characters\. Whoever reads/),
      ).not.toBeInTheDocument();
    });

    it("cannot be sent until the reason is within the API's bounds", async () => {
      mount({ own: true });
      const dialog = await open();
      const send = within(dialog).getByRole("button", { name: "Flag it" });
      expect(send).toBeDisabled();
      await userEvent.type(within(dialog).getByRole("textbox"), "ab");
      expect(
        within(dialog).getByText("Say a little more, at least 3 characters."),
      ).toBeInTheDocument();
      expect(send).toBeDisabled();
      await userEvent.type(within(dialog).getByRole("textbox"), "c");
      expect(send).toBeEnabled();
    });

    it("refuses a reason over 280 and says so", async () => {
      mount({ own: true });
      const dialog = await open();
      await userEvent.click(within(dialog).getByRole("textbox"));
      await userEvent.paste("x".repeat(281));
      expect(
        within(dialog).getByText("Keep it to 280 characters."),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: "Flag it" }),
      ).toBeDisabled();
    });

    it("sends the task and the reason, once, and closes", async () => {
      const flagFn = vi.fn(async () => undefined);
      hook.flags = flagsState({ flagFn });
      mount({ own: true });
      const dialog = await open("PRF-2");
      await userEvent.type(within(dialog).getByRole("textbox"), "Wrong day");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Flag it" }),
      );
      await waitFor(() => expect(flagFn).toHaveBeenCalledTimes(1));
      expect(flagFn).toHaveBeenCalledWith("i2", "Wrong day");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    });

    it("cannot be closed while the request is out, and shows the server's refusal in the dialog when it comes", async () => {
      let refuse: (reason: unknown) => void = () => undefined;
      const flagFn = vi.fn(
        () =>
          new Promise<void>((_resolve, reject) => {
            refuse = reject;
          }),
      );
      hook.flags = flagsState({ flagFn });
      mount({ own: true });
      const dialog = await open();
      await userEvent.type(within(dialog).getByRole("textbox"), "Not mine");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Flag it" }),
      );
      await waitFor(() => expect(flagFn).toHaveBeenCalledTimes(1));

      /* Escape, the cancel button and the backdrop all wait: the answer must not be lost behind a
         dialog that has gone. */
      await userEvent.keyboard("{Escape}");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Close dialog" }),
      );
      expect(
        within(dialog).getByRole("button", { name: "Cancel" }),
      ).toBeDisabled();
      /* The dialog stays for the length of its own exit when it is asked to go, so wait longer than that:
         one that was told to close is gone by now. */
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      refuse(
        new ApiError(422, "unprocessable", "That is not allowed right now."),
      );
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "That is not allowed right now.",
      );
      expect(within(dialog).getByRole("textbox")).toHaveValue("Not mine");
      /* And once it has answered, it can be closed again. */
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    });

    it("shows the server's own sentence when it refuses, and keeps what was typed", async () => {
      const flagFn = vi.fn(async () => {
        throw new ApiError(
          422,
          "unprocessable",
          "Using your project work in your review is not switched on for your company.",
        );
      });
      hook.flags = flagsState({ flagFn });
      mount({ own: true });
      const dialog = await open();
      await userEvent.type(within(dialog).getByRole("textbox"), "Not mine");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Flag it" }),
      );
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "is not switched on for your company",
      );
      expect(within(dialog).getByRole("textbox")).toHaveValue("Not mine");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("never shows a status code for a server that fell over", async () => {
      hook.flags = flagsState({
        flagFn: vi.fn(async () => {
          throw new ApiError(500, "internal", "Internal");
        }),
      });
      mount({ own: true });
      const dialog = await open();
      await userEvent.type(within(dialog).getByRole("textbox"), "Not mine");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Flag it" }),
      );
      const alert = await within(dialog).findByRole("alert");
      expect(alert.textContent).not.toMatch(/500/);
    });

    it("is a fresh form each time: what was typed before is not there", async () => {
      mount({ own: true });
      let dialog = await open("PRF-1");
      await userEvent.type(
        within(dialog).getByRole("textbox"),
        "half a thought",
      );
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Cancel" }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      dialog = await open("PRF-3");
      expect(within(dialog).getByRole("textbox")).toHaveValue("");
      expect(
        within(dialog).getByText("Why is PRF-3 wrong?"),
      ).toBeInTheDocument();
    });

    it("keeps its title while it fades out, and does not flip to a default sentence", async () => {
      mount({ own: true });
      const dialog = await open("PRF-1");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Cancel" }),
      );
      /* Still on screen for a moment as it leaves, and still about the same task. */
      const leaving = screen.queryByRole("dialog");
      if (leaving) {
        expect(
          within(leaving).queryByText("Why is this wrong?"),
        ).not.toBeInTheDocument();
        expect(
          within(leaving).getByText("Why is PRF-1 wrong?"),
        ).toBeInTheDocument();
      }
    });
  });

  describe("changing and taking one back", () => {
    it("changes it in a dialog that starts from what is there, and says it is a change", async () => {
      const flagFn = vi.fn(async () => undefined);
      hook.flags = flagsState({ flags: [flag()], flagFn });
      mount({ own: true });
      await choose("PRF-2", "Change");
      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).getByText("Change why PRF-2 is wrong"),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("textbox")).toHaveValue(
        "That was Ada's task, not mine",
      );
      await userEvent.clear(within(dialog).getByRole("textbox"));
      await userEvent.type(
        within(dialog).getByRole("textbox"),
        "Finished on a different day",
      );
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Save the change" }),
      );
      await waitFor(() =>
        expect(flagFn).toHaveBeenCalledWith(
          "i2",
          "Finished on a different day",
        ),
      );
    });

    it("takes it back in one press, for that task only", async () => {
      const unflagFn = vi.fn(async () => undefined);
      hook.flags = flagsState({ flags: [flag()], unflagFn });
      mount({ own: true });
      await choose("PRF-2", "Take it back");
      await waitFor(() => expect(unflagFn).toHaveBeenCalledTimes(1));
      expect(unflagFn).toHaveBeenCalledWith("i2");
    });

    it("says the server's own sentence when taking it back is refused, and keeps the flag on screen", async () => {
      const unflagFn = vi.fn(async () => {
        throw new ApiError(
          422,
          "unprocessable",
          "Only the person whose work this is can take a flag back.",
        );
      });
      hook.flags = flagsState({ flags: [flag()], unflagFn });
      mount({ own: true });
      await choose("PRF-2", "Take it back");
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Only the person whose work this is can take a flag back.",
      );
      expect(screen.getByText(/Flagged by you/)).toBeInTheDocument();
    });
  });

  describe("rows are untouched", () => {
    it("still link to the task and show no flag text on a row without one", () => {
      hook.flags = flagsState({ flags: [flag()] });
      mount({ own: false });
      expect(rowOf("PRF-1").queryByText(/Flagged by/)).not.toBeInTheDocument();
      expect(rowOf("PRF-2").getByText(/Flagged by/)).toBeInTheDocument();
    });
  });
});

describe("what is asked of the server", () => {
  it("is this person's flags for this cycle, from the live list, while it is shown", () => {
    live({ own: true });
    expect(hook.flagArgs.at(-1)).toEqual({
      cycleId: "c1",
      subjectId: "bola",
      enabled: true,
    });
  });

  it("is nothing while Projects is off: a panel that is not shown asks for nothing", () => {
    hook.projects = { enabled: false, loading: false };
    live({ own: true });
    expect((hook.flagArgs.at(-1) as { enabled: boolean }).enabled).toBe(false);
    expect(screen.queryByText(/finished/)).not.toBeInTheDocument();
  });

  it("is this person's flags for this cycle, from the kept record", () => {
    kept({ own: true });
    expect(hook.flagArgs.at(-1)).toEqual({
      cycleId: "c1",
      subjectId: "bola",
      enabled: true,
    });
  });
});
