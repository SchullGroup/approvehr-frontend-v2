import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiFormQuestion,
  ApiRatingScale,
  ApiReviewDetail,
} from "@/lib/api/performance";
import type { Completion, WorkThisCycle } from "@/lib/projects/completions";
import { clearSharedResources } from "@/lib/shared-resource";

/**
 * The page-by-page form's keys, while the "Your work" drawer is open on top of it, and the flag dialog
 * that opens on top of the drawer.
 *
 * What is proved, with the real form, the real drawer, the real list of finished work, the real flag
 * dialog and the real flag store (only the network and the lists' sources are stand-ins): **the form
 * leaves every key alone while the drawer is open**. Ctrl+Enter and Cmd+Enter are the form's "go on"
 * keys even from inside a text box, so a person typing the reason a task is wrong and pressing
 * Ctrl+Enter used to move the form from one question to the next behind both dialogs, and what they
 * were writing was never sent. Escape is the drawer's own (it closes), and must not also close the form
 * behind it; and once the drawer is closed the keys are the form's again.
 *
 * Tab and Escape inside the flag dialog that sits on the drawer are a separate defect, in the shared
 * focus trap and not in this form (two traps both listen for them), and are not exercised here.
 */

const save = vi.fn(async () => undefined);
const send = vi.fn(async () => undefined);
const push = vi.fn();
const hook = vi.hoisted(() => ({ read: null as unknown }));
const flagsApi = vi.hoisted(() => ({
  read: vi.fn(),
  flag: vi.fn(),
  unflag: vi.fn(),
}));

const scale: ApiRatingScale = {
  source: "default",
  max: 5,
  levels: [
    { level: 5, label: "Exceptional", meaning: "" },
    { level: 4, label: "Exceeds Expectations", meaning: "" },
    { level: 3, label: "Meets Expectations", meaning: "" },
    { level: 2, label: "Below Expectations", meaning: "" },
    { level: 1, label: "Unsatisfactory", meaning: "" },
  ],
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/store/ai", () => ({
  useDevelopmentSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock("@/lib/store/performance", () => ({
  useRatingScale: () => ({ scale, editable: true }),
  useReviewMutations: () => ({ save, send }),
  useAppraisals: () => ({ loading: false, mine: { toComplete: [] } }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/features", () => ({
  useFeatureSettings: () => ({ workInAnswers: true }),
}));
vi.mock("@/lib/store/completions", () => ({
  useWorkThisCycle: () => hook.read,
}));
vi.mock("@/lib/store/project-session", () => ({
  useProjectsGate: () => ({ enabled: true, loading: false }),
}));
vi.mock("@/app/(app)/hiring/requisitions/[id]/use-phone", () => ({
  usePhone: () => false,
}));
vi.mock("@/lib/api/work-flags", async (original) => ({
  ...(await original<typeof import("@/lib/api/work-flags")>()),
  workFlagsApi: flagsApi,
}));
vi.mock("@/app/(app)/performance/self-evidence", () => ({
  SelfEvidence: () => null,
}));

import { FocusForm } from "@/app/(focus)/performance/reviews/[id]/answer/focus-form";

const question = (over: Partial<ApiFormQuestion> = {}): ApiFormQuestion => ({
  id: "q1",
  competencyId: null,
  prompt: "First question",
  kind: "TEXT",
  required: false,
  options: [],
  allowCustom: false,
  order: 1,
  answer: null,
  ...over,
});

const review = (): ApiReviewDetail =>
  ({
    id: "r1",
    kind: "SELF",
    kindLabel: "Self-review",
    cycleId: "c1",
    cycleName: "H2 2026",
    subjectId: "e1",
    subjectName: "Chidi Nwosu",
    periodStart: "2026-07-01",
    periodEnd: "2026-12-31",
    dueDate: null,
    instructions: null,
    guideUrl: null,
    anonymous: false,
    mine: true,
    submitted: false,
    workPins: false,
    questions: [
      question(),
      question({ id: "q2", prompt: "Second question", order: 2 }),
    ],
  }) as unknown as ApiReviewDetail;

const task = (): Completion => ({
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
});

beforeEach(() => {
  for (const fn of Object.values(flagsApi)) fn.mockReset();
  vi.clearAllMocks();
  clearSharedResources();
  window.localStorage.clear();
  flagsApi.read.mockResolvedValue({ on: true, flags: [] });
  flagsApi.flag.mockResolvedValue(null);
  hook.read = {
    data: {
      summary: { finished: 1, withDueDate: 0, onTime: 0, late: 0, linked: 0 },
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
});

const heading = () => document.getElementById("focus-heading")?.textContent;

/** Start the form, open the drawer and wait for the list of finished work to be drawn in it. */
async function openDrawer() {
  render(<FocusForm review={review()} onSent={vi.fn()} onSending={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(heading()).toBe("First question");
  await userEvent.click(
    screen.getByRole("button", { name: "What you did this period" }),
  );
  const drawer = await screen.findByRole("dialog", {
    name: "What you did this period",
  });
  /* The flag controls arrive once the flags have been read. */
  await within(drawer).findByText("This is wrong");
  return drawer;
}

/** Open the flag dialog from the drawer and type a reason in it. */
async function typeAReason(drawer: HTMLElement) {
  await userEvent.click(within(drawer).getByText("This is wrong"));
  const box = await screen.findByRole("textbox", {
    name: /What is wrong with it/,
  });
  await userEvent.type(box, "That was not mine");
  return box;
}

describe("a reason typed in the flag dialog on the drawer", () => {
  it("does not move the form on when Ctrl+Enter is pressed in the reason box", async () => {
    const drawer = await openDrawer();
    await typeAReason(drawer);
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(heading()).toBe("First question");
    expect(flagsApi.flag).not.toHaveBeenCalled();
  });

  it("does not move the form on when Cmd+Enter is pressed in the reason box", async () => {
    const drawer = await openDrawer();
    await typeAReason(drawer);
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    expect(heading()).toBe("First question");
    expect(flagsApi.flag).not.toHaveBeenCalled();
  });

  it("keeps what was typed, and the dialog open, whatever was pressed", async () => {
    const drawer = await openDrawer();
    const box = await typeAReason(drawer);
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    /* What was typed is still there. (A test keyboard puts a line break in a box for Enter with a
       modifier; a browser does not always, so the words are what is asserted.) */
    expect((box as HTMLTextAreaElement).value).toContain("That was not mine");
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
  });
});

describe("the drawer on its own", () => {
  it("leaves Ctrl+Enter and Cmd+Enter alone while it is open", async () => {
    await openDrawer();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    expect(heading()).toBe("First question");
  });

  it("leaves a plain Enter alone while it is open", async () => {
    await openDrawer();
    await userEvent.keyboard("{Enter}");
    expect(heading()).toBe("First question");
  });

  it("closes on Escape without taking the form with it", async () => {
    await openDrawer();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
    expect(heading()).toBe("First question");
  });

  it("gives the keys back to the form once it is closed", async () => {
    await openDrawer();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(heading()).toBe("Second question");
  });
});
