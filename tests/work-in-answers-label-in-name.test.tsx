import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiPin } from "@/lib/api/work-pins";
import type { ApiWorkFlag } from "@/lib/api/work-flags";
import type { Completion, WorkThisCycle } from "@/lib/projects/completions";

/**
 * Label in name (WCAG 2.5.3), for every button and link the work-in-review-answers screens add.
 *
 * What is proved: the accessible name of each control **starts with the words drawn on it**. A button
 * that says "Change" and is announced as "Change why PLT-12 is wrong" cannot be reached by somebody
 * speaking its label ("click Change") to a voice-control tool, which matches what they see against what
 * is announced; the item's key stays in the name, after the visible words, so a list of the page's
 * buttons still says which row each belongs to. The visible words are read the way a person sees them:
 * text that is only for a screen reader, and icons, are not counted.
 */

vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));
const hook = vi.hoisted(() => ({ read: null as unknown }));
vi.mock("@/lib/store/completions", () => ({
  useWorkThisCycle: () => hook.read,
}));

import { AnswerPins, type Pinning } from "@/components/performance/answer-pins";
import { FlagDialog, FlagLine } from "@/components/performance/work-flags";
import { PinWorkDialog } from "@/components/performance/pin-work-dialog";
import { controlsWithWords, expectLabelInName } from "./label-in-name";

const flag: ApiWorkFlag = {
  issueId: "i2",
  key: "PRF-2",
  reason: "Wrong day",
  flaggedAt: "2026-11-06T09:00:00.000Z",
};

const line = (
  over: Partial<Parameters<typeof FlagLine>[0]> = {},
): React.ReactElement => (
  <FlagLine
    itemKey="PRF-2"
    flag={null}
    by="you"
    timeZone="Africa/Lagos"
    canRaise
    canWithdraw
    busy={false}
    rowRef={() => undefined}
    onRaise={() => undefined}
    onWithdraw={() => undefined}
    {...over}
  />
);

describe("a flag on a row of finished work", () => {
  it("is raised with a button that says This is wrong, announced as that and the item", () => {
    const { container } = render(line());
    expect(expectLabelInName(container)).toEqual(["This is wrong"]);
    expect(
      screen.getByRole("button", { name: "This is wrong, PRF-2" }),
    ).toBeInTheDocument();
  });

  it("is changed or taken back with buttons announced as exactly what they say, and the item", () => {
    const { container } = render(line({ flag }));
    expect(expectLabelInName(container)).toEqual(["Change", "Take it back"]);
    expect(
      screen.getByRole("button", { name: "Change, flag on PRF-2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Take it back, flag on PRF-2" }),
    ).toBeInTheDocument();
  });

  it("is taken back alone, once the setting is off, in the same words", () => {
    const { container } = render(line({ flag, canRaise: false }));
    expect(expectLabelInName(container)).toEqual(["Take it back"]);
  });

  it("names nothing that is not on screen, and no control at all for a reader", () => {
    const { container } = render(
      line({ flag, canRaise: false, canWithdraw: false }),
    );
    expect(controlsWithWords(container)).toEqual([]);
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
  it("has a link, an Unpin and Add work announced as the words on them", () => {
    const { container } = render(<AnswerPins pinning={pinning()} />);
    const words = expectLabelInName(container);
    expect(words).toEqual(
      expect.arrayContaining(["PLT-12", "Unpin", "Add work"]),
    );
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

  it("has Done and Add to this answer announced as the words on them", () => {
    render(picker);
    const words = expectLabelInName(screen.getByRole("dialog"));
    expect(words).toEqual(
      expect.arrayContaining(["Done", "Add to this answer"]),
    );
  });

  it("has the three buttons of its question announced as the words on them", async () => {
    render(picker);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("radio", { name: /PLT-12/ }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    const words = expectLabelInName(dialog);
    expect(words).toEqual(
      expect.arrayContaining(["Keep editing", "Discard", "Add it and close"]),
    );
  });
});
