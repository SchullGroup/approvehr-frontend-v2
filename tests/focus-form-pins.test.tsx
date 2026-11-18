import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type {
  ApiFormQuestion,
  ApiRatingScale,
  ApiReviewDetail,
} from "@/lib/api/performance";
import type { ApiPin } from "@/lib/api/work-pins";
import type { Completion, WorkThisCycle } from "@/lib/projects/completions";

/**
 * Finished work pinned to an answer, in the page-by-page form.
 *
 * What is proved: "Add work" is on each question of a person's own unsent self-review where the
 * company has switched the setting on, and nowhere else (not on a manager's form, not with the setting
 * off or not said, not offline); a pin is saved to the server as it is added, not with the answer, and
 * appears on the page; a pin written while the setting was on can still be taken off and read when it
 * has since been turned off; the form leaves its keys alone while the picker is open, so a letter typed
 * on a task does not pick an answer behind it and Enter does not move on; the preview reads the pins
 * back as plain text, with no link inside a row that is a button; and a refusal is the server's own
 * sentence.
 */

const save = vi.fn(async () => undefined);
const send = vi.fn(async () => undefined);
const session = vi.hoisted(() => ({ isConnected: true }));
const api = vi.hoisted(() => ({ pin: vi.fn(), unpin: vi.fn() }));
const hook = vi.hoisted(() => ({ read: null as unknown }));

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

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
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
  useSession: () => ({ isConnected: session.isConnected }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/api/work-pins", async (original) => ({
  ...(await original<typeof import("@/lib/api/work-pins")>()),
  workPinsApi: api,
}));
vi.mock("@/lib/store/completions", () => ({
  useWorkThisCycle: () => hook.read,
}));
vi.mock("@/app/(app)/performance/self-evidence", () => ({
  SelfEvidence: () => null,
}));

import { FocusForm } from "@/app/(focus)/performance/reviews/[id]/answer/focus-form";

const wirePin = (over: Partial<ApiPin> = {}): ApiPin => ({
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
  note: "Led it",
  pinnedAt: "2026-11-05T09:00:00.000Z",
  canOpen: true,
  ...over,
});

const question = (over: Partial<ApiFormQuestion> = {}): ApiFormQuestion => ({
  id: "q1",
  competencyId: null,
  prompt: "What did you achieve?",
  kind: "TEXT",
  required: false,
  options: [],
  allowCustom: false,
  order: 1,
  answer: null,
  ...over,
});

const review = (over: Partial<ApiReviewDetail> = {}): ApiReviewDetail =>
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
    workPins: true,
    questions: [question()],
    ...over,
  }) as unknown as ApiReviewDetail;

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

const mount = (over: Partial<ApiReviewDetail> = {}) =>
  render(
    <FocusForm review={review(over)} onSent={vi.fn()} onSending={vi.fn()} />,
  );

const next = async (name: string | RegExp) =>
  userEvent.click(screen.getByRole("button", { name }));
const heading = (name: string | RegExp) =>
  screen.queryByRole("heading", { name });
const picker = () => screen.getByRole("dialog");

/** Start the form and land on the first question. */
const onFirstQuestion = async (over: Partial<ApiReviewDetail> = {}) => {
  mount(over);
  await next("Start");
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  session.isConnected = true;
  hook.read = {
    data: {
      summary: { finished: 2 },
      byProject: [],
      byObjective: [],
      items: [
        task(),
        task({ id: "i2", key: "PLT-13", title: "Fix the payslip PDF" }),
      ],
      total: 2,
      capped: false,
    } as unknown as WorkThisCycle,
    loading: false,
    error: null,
    reload: vi.fn(),
  };
  api.pin.mockResolvedValue(
    wirePin({ id: "pin9", issueId: "i2", key: "PLT-13" }),
  );
  api.unpin.mockResolvedValue(undefined);
});

describe("where it is offered", () => {
  it("is under a question of a person's own self-review, with the setting on", async () => {
    await onFirstQuestion();
    expect(heading("What did you achieve?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add work" }),
    ).toBeInTheDocument();
  });

  it("is not there when the setting is off", async () => {
    await onFirstQuestion({ workPins: false });
    expect(
      screen.queryByRole("button", { name: "Add work" }),
    ).not.toBeInTheDocument();
  });

  it("is not there when the server does not say: absent is off, never on", async () => {
    await onFirstQuestion({ workPins: undefined });
    expect(
      screen.queryByRole("button", { name: "Add work" }),
    ).not.toBeInTheDocument();
  });

  it("is not on a manager's form", async () => {
    await onFirstQuestion({
      kind: "MANAGER",
      subjectName: "Femi Balogun",
      mine: true,
    });
    expect(
      screen.queryByRole("button", { name: "Add work" }),
    ).not.toBeInTheDocument();
  });

  it("is not on peer feedback", async () => {
    await onFirstQuestion({ kind: "PEER" });
    expect(
      screen.queryByRole("button", { name: "Add work" }),
    ).not.toBeInTheDocument();
  });

  it("is not there with no server", async () => {
    session.isConnected = false;
    await onFirstQuestion();
    expect(
      screen.queryByRole("button", { name: "Add work" }),
    ).not.toBeInTheDocument();
  });
});

describe("adding", () => {
  it("pins a task to this question, saves it to the server on the spot, and shows it", async () => {
    await onFirstQuestion();
    await userEvent.click(screen.getByRole("button", { name: "Add work" }));
    await userEvent.click(
      within(picker()).getByRole("radio", { name: /PLT-13/ }),
    );
    await userEvent.type(within(picker()).getByRole("textbox"), "Fixed it");
    await userEvent.click(
      within(picker()).getByRole("button", { name: "Add to this answer" }),
    );
    await waitFor(() => expect(api.pin).toHaveBeenCalledTimes(1));
    expect(api.pin).toHaveBeenCalledWith("r1", "q1", {
      issueId: "i2",
      note: "Fixed it",
    });
    await userEvent.click(
      within(picker()).getByRole("button", { name: "Done" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText("Work you added to this answer"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /PLT-13/ })).toHaveAttribute(
      "href",
      "/projects/tasks/i2",
    );
    /* It went to the server by itself: the answers' own save was not involved. */
    expect(save).not.toHaveBeenCalled();
  });

  it("shows the server's own sentence when it refuses", async () => {
    api.pin.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "5 pins is the most one answer can carry. Take one off to add another.",
      ),
    );
    await onFirstQuestion();
    await userEvent.click(screen.getByRole("button", { name: "Add work" }));
    await userEvent.click(
      within(picker()).getByRole("radio", { name: /PLT-12/ }),
    );
    await userEvent.click(
      within(picker()).getByRole("button", { name: "Add to this answer" }),
    );
    expect(await within(picker()).findByRole("alert")).toHaveTextContent(
      "5 pins is the most one answer can carry. Take one off to add another.",
    );
  });

  it("puts the pins on the question they were added to, not on the next", async () => {
    await onFirstQuestion({
      questions: [
        question(),
        question({ id: "q2", prompt: "What was hard?", order: 2 }),
      ],
    });
    await userEvent.click(screen.getByRole("button", { name: "Add work" }));
    await userEvent.click(
      within(picker()).getByRole("radio", { name: /PLT-12/ }),
    );
    await userEvent.click(
      within(picker()).getByRole("button", { name: "Add to this answer" }),
    );
    await waitFor(() =>
      expect(api.pin).toHaveBeenCalledWith("r1", "q1", { issueId: "i1" }),
    );
    await userEvent.click(
      within(picker()).getByRole("button", { name: "Done" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await next("Skip");
    expect(heading("What was hard?")).toBeInTheDocument();
    expect(
      screen.queryByText("Work you added to this answer"),
    ).not.toBeInTheDocument();
  });
});

describe("what was already written", () => {
  const written = { questions: [question({ pins: [wirePin()] })] };

  it("is read and can be taken off, even where the setting has since been turned off", async () => {
    await onFirstQuestion({ ...written, workPins: false });
    expect(
      screen.getByText("Work you added to this answer"),
    ).toBeInTheDocument();
    expect(screen.getByText("Led it")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add work" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unpin PLT-12" }));
    await waitFor(() => expect(api.unpin).toHaveBeenCalledWith("r1", "pin1"));
    await waitFor(() =>
      expect(
        screen.queryByText("Work you added to this answer"),
      ).not.toBeInTheDocument(),
    );
  });

  it("is kept, with the server's sentence, when taking it off is refused", async () => {
    api.unpin.mockRejectedValue(
      new ApiError(409, "conflict", "You have already sent this review."),
    );
    await onFirstQuestion(written);
    await userEvent.click(screen.getByRole("button", { name: "Unpin PLT-12" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You have already sent this review.",
    );
    expect(
      screen.getByText("Work you added to this answer"),
    ).toBeInTheDocument();
  });

  it("is drawn nowhere on a manager's form even if a server sent pins on it", async () => {
    await onFirstQuestion({ ...written, kind: "MANAGER" });
    expect(
      screen.queryByText("Work you added to this answer"),
    ).not.toBeInTheDocument();
  });
});

describe("the form's keys while the picker is open", () => {
  const yesNo = {
    questions: [
      question({
        id: "qb",
        prompt: "Did you hit your goals?",
        kind: "BOOLEAN",
        required: false,
      }),
    ],
  };

  it("does not pick an answer behind the picker when a letter is typed on a task", async () => {
    await onFirstQuestion(yesNo);
    expect(heading("Did you hit your goals?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add work" }));
    const radio = within(picker()).getByRole("radio", { name: /PLT-12/ });
    await userEvent.click(radio);
    /* Focus is on a radio, which the form does not count as typing, and "Y" is the key for Yes. */
    await userEvent.keyboard("y");
    /* A task is picked and not added, so Done asks before it throws the choice away. */
    await userEvent.click(
      within(picker()).getByRole("button", { name: "Done" }),
    );
    await userEvent.click(
      within(picker()).getByRole("button", { name: "Discard" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("radio", { name: "Yes" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "No" })).not.toBeChecked();
  });

  it("does not move to the next page when Enter is pressed on the picker", async () => {
    await onFirstQuestion(yesNo);
    await userEvent.click(screen.getByRole("button", { name: "Add work" }));
    await userEvent.click(
      within(picker()).getByRole("radio", { name: /PLT-12/ }),
    );
    await userEvent.keyboard("{Enter}");
    expect(picker()).toBeInTheDocument();
    await userEvent.click(
      within(picker()).getByRole("button", { name: "Done" }),
    );
    await userEvent.click(
      within(picker()).getByRole("button", { name: "Discard" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(heading("Did you hit your goals?")).toBeInTheDocument();
    expect(heading("Preview")).not.toBeInTheDocument();
  });

  it("picks again by key once the picker is closed", async () => {
    await onFirstQuestion(yesNo);
    await userEvent.click(screen.getByRole("button", { name: "Add work" }));
    await userEvent.click(
      within(picker()).getByRole("button", { name: "Done" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await userEvent.click(document.body);
    await userEvent.keyboard("y");
    expect(screen.getByRole("radio", { name: "Yes" })).toBeChecked();
  });
});

describe("the preview", () => {
  const pinned = {
    questions: [question({ pins: [wirePin()] })],
  };

  it("reads the pins back under the answer, as plain text with no link inside the row's button", async () => {
    await onFirstQuestion(pinned);
    await next("Skip");
    await next("Skip");
    expect(heading("Preview")).toBeInTheDocument();
    const row = screen.getByRole("button", { name: /What did you achieve\?/ });
    expect(
      within(row).getByText("Work pinned to this answer"),
    ).toBeInTheDocument();
    expect(within(row).getByText("PLT-12")).toBeInTheDocument();
    expect(within(row).getByText("Led it")).toBeInTheDocument();
    expect(within(row).queryByRole("link")).not.toBeInTheDocument();
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  });

  it("includes a pin added in this visit, which the review itself does not show yet", async () => {
    await onFirstQuestion();
    await userEvent.click(screen.getByRole("button", { name: "Add work" }));
    await userEvent.click(
      within(picker()).getByRole("radio", { name: /PLT-13/ }),
    );
    await userEvent.click(
      within(picker()).getByRole("button", { name: "Add to this answer" }),
    );
    await waitFor(() => expect(api.pin).toHaveBeenCalled());
    await userEvent.click(
      within(picker()).getByRole("button", { name: "Done" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await next("Skip");
    await next("Skip");
    const row = screen.getByRole("button", { name: /What did you achieve\?/ });
    expect(within(row).getByText("PLT-13")).toBeInTheDocument();
  });

  it("says nothing of pins for a question with none", async () => {
    await onFirstQuestion();
    await next("Skip");
    await next("Skip");
    expect(heading("Preview")).toBeInTheDocument();
    expect(screen.queryByText(/pinned to this answer/)).not.toBeInTheDocument();
  });

  it("never says anything about a title", async () => {
    await onFirstQuestion({
      questions: [
        question({
          pins: [{ ...wirePin(), title: "Chemo schedule" } as ApiPin],
        }),
      ],
    });
    await next("Skip");
    await next("Skip");
    expect(heading("Preview")).toBeInTheDocument();
    expect(screen.queryByText(/Chemo/)).not.toBeInTheDocument();
  });
});

describe("the picker, when the review stops allowing pins under it", () => {
  const withPin = (over: Partial<ApiReviewDetail> = {}) => ({
    questions: [
      question({
        id: "qb",
        prompt: "Did you hit your goals?",
        kind: "BOOLEAN",
        required: false,
        pins: [wirePin()],
      }),
    ],
    ...over,
  });
  /** The review read again, as returning to the window does, with the setting as it now is. */
  const readAgain = (
    view: ReturnType<typeof mount>,
    over: Partial<ApiReviewDetail>,
  ) =>
    view.rerender(
      <FocusForm review={review(over)} onSent={vi.fn()} onSending={vi.fn()} />,
    );

  it("gives the form its keys back when the setting is turned off under the open picker", async () => {
    const view = mount(withPin());
    await next("Start");
    await userEvent.click(screen.getByRole("button", { name: "Add work" }));
    expect(picker()).toBeInTheDocument();
    readAgain(view, withPin({ workPins: false }));
    /* The picker went with the button that opens it. */
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    /* And the form's keys are the form's again: a letter picks the answer it names. */
    await userEvent.keyboard("y");
    expect(screen.getByRole("radio", { name: "Yes" })).toBeChecked();
  });

  it("does not bring the picker back when the setting is turned on again", async () => {
    const view = mount(withPin());
    await next("Start");
    await userEvent.click(screen.getByRole("button", { name: "Add work" }));
    readAgain(view, withPin({ workPins: false }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    readAgain(view, withPin({ workPins: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add work" }),
    ).toBeInTheDocument();
    /* The keys still work: the picker is not open, so the form is not holding them off. */
    await userEvent.keyboard("y");
    expect(screen.getByRole("radio", { name: "Yes" })).toBeChecked();
  });
});

describe("where focus goes when the last pin is taken off, in the real form", () => {
  /** Take off the only pin from the keyboard, as somebody who cannot use a pointer would. */
  const takeOffTheOnlyPin = async (over: Partial<ApiReviewDetail>) => {
    await onFirstQuestion({
      questions: [question({ pins: [wirePin()] })],
      ...over,
    });
    const unpin = screen.getByRole("button", { name: "Unpin PLT-12" });
    unpin.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(api.unpin).toHaveBeenCalledWith("r1", "pin1"));
    await waitFor(() =>
      expect(
        screen.queryByText("Work you added to this answer"),
      ).not.toBeInTheDocument(),
    );
  };

  it("is on the empty region that is left, and not on the page, when the setting is off", async () => {
    await takeOffTheOnlyPin({ workPins: false });
    const landing = screen.getByRole("region", {
      name: "Work added to this answer",
    });
    await waitFor(() => expect(landing).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it("is on Add work, and not on the page, when the setting is on", async () => {
    await takeOffTheOnlyPin({ workPins: true });
    const add = screen.getByRole("button", { name: "Add work" });
    await waitFor(() => expect(add).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it("is on the label over the list when pins are left and the setting is off", async () => {
    await onFirstQuestion({
      workPins: false,
      questions: [
        question({
          pins: [
            wirePin(),
            wirePin({ id: "pin2", issueId: "i2", key: "PLT-13" }),
          ],
        }),
      ],
    });
    const unpin = screen.getByRole("button", { name: "Unpin PLT-13" });
    unpin.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(api.unpin).toHaveBeenCalledWith("r1", "pin2"));
    const label = await screen.findByText("Work you added to this answer");
    await waitFor(() => expect(label).toHaveFocus());
    expect(
      screen.getByRole("button", { name: "Unpin PLT-12" }),
    ).toBeInTheDocument();
  });
});
