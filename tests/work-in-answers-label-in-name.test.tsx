import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiPin } from "@/lib/api/work-pins";
import type { ApiWorkFlag } from "@/lib/api/work-flags";
import type { Completion, WorkThisCycle } from "@/lib/projects/completions";

/**
 * Label in name (WCAG 2.5.3), for every button and link the work-in-review-answers screens add.
 *
 * What is proved: the accessible name of each control **starts with the words drawn on it**. A menu item
 * that says "Change" is announced as "Change", and the row's menu, which is an icon and so draws no words,
 * is named for the row it belongs to ("More actions for PRF-2") so a list of the page's buttons still says
 * which row each belongs to. The visible words are read the way a person sees them: text that is only for
 * a screen reader, and icons, are not counted.
 */

vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));
const hook = vi.hoisted(() => ({ read: null as unknown }));
vi.mock("@/lib/store/completions", () => ({
  useWorkThisCycle: () => hook.read,
}));

import { AnswerPins, type Pinning } from "@/components/performance/answer-pins";
import { FlagDialog, FlagMenu } from "@/components/performance/work-flags";
import { PinWorkDialog } from "@/components/performance/pin-work-dialog";
import { controlsWithWords, expectLabelInName } from "./label-in-name";

const flag: ApiWorkFlag = {
  issueId: "i2",
  key: "PRF-2",
  reason: "Wrong day",
  flaggedAt: "2026-11-06T09:00:00.000Z",
};

const menu = (
  over: Partial<Parameters<typeof FlagMenu>[0]> = {},
): React.ReactElement => (
  <FlagMenu
    itemKey="PRF-2"
    flag={null}
    canRaise
    canWithdraw
    busy={false}
    rowRef={() => undefined}
    onRaise={() => undefined}
    onWithdraw={() => undefined}
    {...over}
  />
);

/** Opens the row's menu and reads what is in it, as the words each choice shows. */
const openedWords = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: "More actions for PRF-2" }),
  );
  return expectLabelInName(document.body);
};

describe("a flag on a row of finished work", () => {
  it("is on the row's menu, which is an icon announced for its row, and has no words to match", () => {
    const { container } = render(menu());
    expect(controlsWithWords(container)).toEqual([]);
    expect(
      screen.getByRole("button", { name: "More actions for PRF-2" }),
    ).toBeInTheDocument();
  });

  it("is raised with a choice that says This is wrong, announced as that", async () => {
    render(menu());
    expect(await openedWords()).toEqual(["This is wrong"]);
  });

  it("is changed or taken back with choices announced as exactly what they say", async () => {
    render(menu({ flag }));
    expect(await openedWords()).toEqual(["Change", "Take it back"]);
  });

  it("is taken back alone, once the setting is off, in the same words", async () => {
    render(menu({ flag, canRaise: false }));
    expect(await openedWords()).toEqual(["Take it back"]);
  });

  it("names nothing that is not on screen, and no control at all for a reader", () => {
    const { container } = render(
      menu({ flag, canRaise: false, canWithdraw: false }),
    );
    expect(controlsWithWords(container)).toEqual([]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("the dialog that asks why", () => {
  it("has buttons announced as the words on them", () => {
    render(
      <FlagDialog
        open
        target={{ issueId: "i2", key: "PRF-2", reason: "" }}
        onClose={() => undefined}
        onSave={async () => undefined}
      />,
    );
    const words = expectLabelInName(screen.getByRole("dialog"));
    expect(words).toEqual(expect.arrayContaining(["Cancel", "Flag it"]));
  });
});

const pin = (over: Partial<ApiPin> = {}): ApiPin => ({
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
  canOpen: true,
  ...over,
});

const pinning = (over: Partial<Pinning> = {}): Pinning => ({
  pins: [pin()],
  canAdd: true,
  canRemove: true,
  work: {
    subjectId: "e1",
    cycleId: "c1",
    periodStart: "2026-07-01",
    periodEnd: "2026-12-31",
  },
  prompt: "What did you achieve?",
  onPin: async () => null,
  onUnpin: async () => undefined,
  ...over,
});

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
  dueDate: null,
  onTime: true,
  objective: { state: "UNLINKED" } as never,
  ...over,
});

hook.read = {
  data: {
    summary: { finished: 1 },
    byProject: [],
    byObjective: [],
    items: [task()],
    total: 1,
    capped: false,
  } as unknown as WorkThisCycle,
  loading: false,
  error: null,
  reload: vi.fn(),
};

describe("pins under an answer", () => {
  it("has a link with its key, and an Unpin and a plus that are icons announced for what they do", () => {
    const { container } = render(<AnswerPins pinning={pinning()} />);
    const words = expectLabelInName(container);
    expect(words).toEqual(["PLT-12"]);
    expect(
      screen.getByRole("button", { name: "Unpin PLT-12" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add work" }),
    ).toBeInTheDocument();
  });
});

describe("the picker of finished work", () => {
  const picker = (
    <PinWorkDialog
      open
      onClose={() => undefined}
      work={{
        subjectId: "e1",
        cycleId: "c1",
        periodStart: "2026-07-01",
        periodEnd: "2026-12-31",
      }}
      prompt="What did you achieve?"
      pinned={[]}
      onPin={async () => null}
    />
  );

  it("has Cancel and Add announced as the words on them, and no third button to answer", async () => {
    render(picker);
    const dialog = screen.getByRole("dialog");
    expect(expectLabelInName(dialog)).toEqual(
      expect.arrayContaining(["Cancel", "Add"]),
    );
    await userEvent.click(
      within(dialog).getByRole("radio", { name: /PLT-12/ }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    /* Cancel closes, as it says: there is no "Keep editing / Discard" question. */
    expect(screen.queryByText("Keep editing")).not.toBeInTheDocument();
  });
});
