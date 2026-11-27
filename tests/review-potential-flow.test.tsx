import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRatingScale, ApiReviewDetail } from "@/lib/api/performance";

/**
 * "How far could they go?" at the end of a manager's review, as the page really
 * behaves.
 *
 * The page shows the answers as `1`, `2` and `3`, and pressing them did nothing:
 * the keys were wired for the questions and the overall rating and not for this
 * page. A manager who pressed 1 and then Skip sent the review with nothing in
 * it, and the talent map stayed empty. These cases run the real form, because
 * the fault was in how the form handled a key, not in any piece of it.
 *
 * It also covers what the form says about where the answer lives. How far they
 * could go, the overall rating and the closing note are kept in this browser
 * until the review is sent, and "Saved" in the header is about the answers to the
 * questions. A page that said both "your answers save as you go" and "Saved"
 * while those three sat in one browser was wrong.
 */

const send = vi.fn(async () => undefined);
const save = vi.fn(async () => undefined);
const push = vi.fn();

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
  useAssistantAvailable: () => ({ available: false, loading: false }),
}));
vi.mock("@/lib/store/performance", () => ({
  useRatingScale: () => ({ scale, editable: true }),
  useReviewMutations: () => ({ save, send }),
  useAppraisals: () => ({ loading: false, mine: { toComplete: [] } }),
}));
vi.mock("@/app/(app)/performance/self-evidence", () => ({
  SelfEvidence: () => null,
}));
vi.mock("@/components/performance/work-this-cycle", () => ({
  WorkThisCycle: () => null,
}));

import { FocusForm } from "@/app/(focus)/performance/reviews/[id]/answer/focus-form";

const review = (over: Partial<ApiReviewDetail> = {}): ApiReviewDetail =>
  ({
    id: "r1",
    kind: "MANAGER",
    kindLabel: "Manager review",
    cycleId: "c1",
    cycleName: "H2 2026",
    subjectId: "e1",
    subjectName: "Ngozi Eze",
    periodStart: null,
    periodEnd: null,
    dueDate: null,
    instructions: null,
    guideUrl: null,
    anonymous: false,
    mine: true,
    submitted: false,
    questions: [],
    askPotential: true,
    ...over,
  }) as unknown as ApiReviewDetail;

const mount = (over: Partial<ApiReviewDetail> = {}) =>
  render(
    <FocusForm review={review(over)} onSent={vi.fn()} onSending={vi.fn()} />,
  );

const heading = (name: string | RegExp) =>
  screen.queryByRole("heading", { name });

const press = async (name: string | RegExp) =>
  userEvent.click(screen.getByRole("button", { name }));

const radios = () =>
  Object.fromEntries(
    (screen.getAllByRole("radio") as HTMLInputElement[]).map((radio) => [
      radio.value,
      radio.checked,
    ]),
  );

/** From the introduction to "How far could Ngozi go?". */
const toPotential = async () => {
  await press("Start");
  expect(heading("How far could Ngozi go?")).toBeInTheDocument();
};

const REASON = /What you have seen that puts them here/;
const body = () =>
  (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("answering with the number keys", () => {
  it("1 is a bigger role, 2 is some growth, 3 is happy where they are", async () => {
    mount();
    await toPotential();
    expect(radios()).toEqual({ HIGH: false, MEDIUM: false, LOW: false });

    await userEvent.keyboard("2");
    expect(radios()).toEqual({ HIGH: false, MEDIUM: true, LOW: false });
    await userEvent.keyboard("3");
    expect(radios()).toEqual({ HIGH: false, MEDIUM: false, LOW: true });
    await userEvent.keyboard("1");
    expect(radios()).toEqual({ HIGH: true, MEDIUM: false, LOW: false });
  });

  it("turns Skip into Next once something is picked", async () => {
    mount();
    await toPotential();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    await userEvent.keyboard("2");
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("does not move on by itself, because a bigger role needs a reason", async () => {
    mount();
    await toPotential();
    await userEvent.keyboard("1");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(heading("How far could Ngozi go?")).toBeInTheDocument();
  });

  it("puts the cursor in the reason box when a bigger role is picked, so the next thing typed goes there", async () => {
    mount();
    await toPotential();
    await userEvent.keyboard("1");
    expect(screen.getByPlaceholderText(REASON)).toHaveFocus();
  });

  it("does not take a digit typed into the reason for another pick", async () => {
    mount();
    await toPotential();
    await userEvent.keyboard("1");
    await userEvent.keyboard("Led 3 migrations");
    expect(screen.getByPlaceholderText(REASON)).toHaveValue("Led 3 migrations");
    expect(radios().HIGH).toBe(true);
  });

  it("says that the keys work", async () => {
    mount();
    await toPotential();
    expect(screen.getByText(/press its number/i)).toBeInTheDocument();
  });
});

describe("a bigger role has to say why", () => {
  it("draws no Next and says what is missing, without a red alarm, until the reason is written", async () => {
    mount();
    await toPotential();
    await userEvent.keyboard("1");
    /* Nothing in the footer can only refuse: with the reason missing there is no
       Next to press, and the page says why. */
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    expect(
      screen.getByText("Say why in a sentence, at least 10 characters."),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(REASON), "Led the move.");
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.queryByText(/Say why in a sentence/)).toBeNull();
  });

  it("walks a send that arrives at the preview without one back to the page, and sends nothing", async () => {
    /* A browser draft can bring somebody to the preview with a bigger role and
       no reason, which the API would refuse. They are taken to what is missing. */
    window.localStorage.setItem(
      "ahr:review-draft:r1",
      JSON.stringify({
        mark: "",
        summary: "",
        step: 3,
        potential: "HIGH",
        potentialReason: "short",
      }),
    );
    mount();
    expect(heading("Preview")).toBeInTheDocument();
    expect(screen.getByText("Say why")).toBeInTheDocument();
    await press("Send it");
    expect(heading("How far could Ngozi go?")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("the send", () => {
  it("carries the answer and, for a bigger role, the reason", async () => {
    mount();
    await toPotential();
    await userEvent.keyboard("1");
    await userEvent.type(
      screen.getByPlaceholderText(REASON),
      "Led the retry migration end to end.",
    );
    await press("Next");
    await press("Skip");
    await press("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(body()).toEqual({
      potential: "HIGH",
      potentialReason: "Led the retry migration end to end.",
    });
  });

  it("carries a plain answer with no reason", async () => {
    mount();
    await toPotential();
    await userEvent.keyboard("2");
    await press("Next");
    await press("Skip");
    await press("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(body()).toEqual({ potential: "MEDIUM" });
  });

  it("does not record the reason for a bigger role beside a different answer", async () => {
    /* Typed under "ready for a bigger role", then the answer changed. The box is
       gone, and what was in it is not what was said about this answer. */
    mount();
    await toPotential();
    await userEvent.keyboard("1");
    await userEvent.type(
      screen.getByPlaceholderText(REASON),
      "Steps up whenever asked.",
    );
    await userEvent.click(screen.getByLabelText(/Happy where they are/));
    await press("Next");
    await press("Skip");
    await press("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(body()).toEqual({ potential: "LOW" });
  });

  it("sends nothing about it when it was left blank", async () => {
    mount();
    await toPotential();
    await press("Skip");
    await press("Skip");
    await press("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(body()).toEqual({});
  });
});

describe("the preview", () => {
  it("reads the answer back, and says so when there is none", async () => {
    const first = mount();
    await toPotential();
    await press("Skip");
    await press("Skip");
    expect(heading("Preview")).toBeInTheDocument();
    expect(screen.getByText("How far could Ngozi go?")).toBeInTheDocument();
    expect(screen.getByText("Not answered")).toBeInTheDocument();
    first.unmount();
    window.localStorage.clear();

    mount();
    await toPotential();
    await userEvent.keyboard("2");
    await press("Next");
    await press("Skip");
    expect(screen.getByText("Could grow in this role")).toBeInTheDocument();
    expect(screen.queryByText("Not answered")).toBeNull();
  });

  it("reads the reason beside a bigger role", async () => {
    mount();
    await toPotential();
    await userEvent.keyboard("1");
    await userEvent.type(screen.getByPlaceholderText(REASON), "Led the move.");
    await press("Next");
    await press("Skip");
    expect(screen.getByText("Ready for a bigger role")).toBeInTheDocument();
    expect(screen.getByText("Led the move.")).toBeInTheDocument();
  });

  it("takes you back to the page when you press the row", async () => {
    mount();
    await toPotential();
    await press("Skip");
    await press("Skip");
    await userEvent.click(screen.getByText("How far could Ngozi go?"));
    expect(heading("How far could Ngozi go?")).toBeInTheDocument();
  });

  it("has no row for it where the period does not ask", async () => {
    mount({ askPotential: false });
    await press("Start");
    await press("Skip");
    expect(heading("Preview")).toBeInTheDocument();
    expect(screen.queryByText(/How far could/)).toBeNull();
  });
});

describe("coming back to it", () => {
  it("keeps the answer and the reason in this browser, as it does the note", async () => {
    const first = mount();
    await toPotential();
    await userEvent.keyboard("1");
    await userEvent.type(screen.getByPlaceholderText(REASON), "Led the move.");
    first.unmount();

    mount();
    /* It opens on the page it was left on, with the answer still there. */
    expect(heading("How far could Ngozi go?")).toBeInTheDocument();
    expect(radios().HIGH).toBe(true);
    expect(screen.getByPlaceholderText(REASON)).toHaveValue("Led the move.");
  });

  it("does not bring an answer into a form that does not ask for one", async () => {
    window.localStorage.setItem(
      "ahr:review-draft:r1",
      JSON.stringify({
        mark: "",
        summary: "",
        step: 0,
        potential: "HIGH",
        potentialReason: "Steps up whenever asked.",
      }),
    );
    mount({ askPotential: false });
    await press("Start");
    await press("Skip");
    await press("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(body()).toEqual({});
  });

  it("forgets it once the review has gone", async () => {
    mount();
    await toPotential();
    await userEvent.keyboard("2");
    await press("Next");
    await press("Skip");
    await press("Send it");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem("ahr:review-draft:r1")).toBeNull();
  });
});

/** The line a page that holds something in this browser carries. */
const KEPT = "Kept in this browser only, until you send.";

describe("what the form says about saving", () => {
  it("promises nothing about saving on the introduction, and names no list there", () => {
    mount({
      overallMark: true,
      questions: [
        {
          id: "q1",
          prompt: "How did it go?",
          kind: "TEXT",
          required: false,
        } as never,
      ],
    });
    /* The first version said "Your answers save as you go", which was true of
       the questions and false of the rest (F39). The introduction says neither
       that nor where the rest is: the pages that hold it say so themselves. */
    expect(screen.queryByText(/save as you go/i)).toBeNull();
    expect(screen.queryByText(/Kept in this browser/)).toBeNull();
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("says it on each page that holds one of them", async () => {
    mount({ overallMark: true });
    await press("Start");
    expect(heading("Is there an overall rating?")).toBeInTheDocument();
    expect(screen.getByText(KEPT)).toBeInTheDocument();
    await press("Skip");
    expect(heading("How far could Ngozi go?")).toBeInTheDocument();
    expect(screen.getByText(KEPT)).toBeInTheDocument();
    await press("Skip");
    expect(heading("Your recommendations")).toBeInTheDocument();
    expect(screen.getByText(KEPT)).toBeInTheDocument();
  });

  it("says it on the closing note of a self-review too", async () => {
    mount({ kind: "SELF", askPotential: undefined });
    await press("Start");
    expect(heading("Anything to add?")).toBeInTheDocument();
    expect(screen.getByText(KEPT)).toBeInTheDocument();
  });

  it("says it on no page that holds nothing in this browser", async () => {
    mount({
      questions: [
        { id: "q1", prompt: "First", kind: "TEXT", required: false },
      ] as never,
    });
    await press("Start");
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.queryByText(KEPT)).toBeNull();
  });

  it("says Saved about the questions, and nothing in the header on the pages that hold the rest", async () => {
    mount({
      questions: [
        { id: "q1", prompt: "First", kind: "TEXT", required: false },
        { id: "q2", prompt: "Second", kind: "TEXT", required: false },
      ] as never,
    });
    await press("Start");
    await userEvent.type(screen.getByRole("textbox"), "An answer.");
    await press("Next");
    await waitFor(() => expect(save).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());

    await press("Skip");
    expect(heading("How far could Ngozi go?")).toBeInTheDocument();
    await userEvent.keyboard("2");
    /* "Saved" is about the questions: on this page it would be a claim about
       the wrong thing, so the header says nothing and the page says where it is. */
    expect(screen.queryByText("Saved")).toBeNull();
    expect(screen.queryByText("Kept in this browser")).toBeNull();
    expect(screen.getByText(KEPT)).toBeInTheDocument();
  });

  it("says nothing in the header on a page that holds nothing yet", async () => {
    mount();
    await toPotential();
    expect(screen.queryByText("Saved")).toBeNull();
    expect(screen.queryByText("Kept in this browser")).toBeNull();
  });

  it("says where the closing note is on its page, and not in the header, once there is one", async () => {
    mount({ askPotential: false });
    await press("Start");
    expect(heading("Your recommendations")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox"), "Promote in the spring.");
    await act(async () => undefined);
    expect(screen.getByText(KEPT)).toBeInTheDocument();
    expect(screen.queryByText("Kept in this browser")).toBeNull();
    expect(screen.queryByText("Saved")).toBeNull();
  });
});

describe("how the pages lay it out", () => {
  it("gives the browser-only fact its own line on the page, not the tail of another", async () => {
    mount();
    await toPotential();
    const line = screen.getByText(KEPT);
    expect(line.tagName).toBe("P");
    expect(line.textContent).toBe(KEPT);
  });

  it("sets the browser-only line in the muted colour, so it does not read as the page's main promise", async () => {
    mount({ askPotential: false });
    await press("Start");
    expect(screen.getByText(KEPT)).toHaveClass("text-muted");
  });

  it("does not tell a touch screen to press a number on how far they could go", async () => {
    mount();
    await toPotential();
    expect(screen.getByText("Pick one, or press its number.")).toHaveClass(
      "pointer-coarse:hidden",
    );
  });

  it("shows 'Needed' for a required question as a label, which is not a keyboard hint", async () => {
    mount({
      questions: [
        { id: "q1", prompt: "First", kind: "TEXT", required: true },
      ] as never,
    });
    await press("Start");
    const label = screen.getByText("Needed");
    expect(label).not.toHaveClass("pointer-coarse:hidden");
    expect(label.closest(".pointer-coarse\\:hidden")).toBeNull();
  });

  it("labels the reason box, so what is typed in it is not a nameless paragraph", async () => {
    mount();
    await toPotential();
    await userEvent.keyboard("1");
    expect(screen.getByText("Your reason")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(REASON)).toHaveAccessibleName(
      "Your reason",
    );
  });

  it("says nothing of a reason until a bigger role is picked", async () => {
    mount();
    await toPotential();
    expect(screen.queryByText("Your reason")).toBeNull();
    await userEvent.keyboard("2");
    expect(screen.queryByText("Your reason")).toBeNull();
  });

  it("does not style the reason like the answer it explains, on the preview", async () => {
    mount();
    await toPotential();
    await userEvent.keyboard("1");
    await userEvent.type(screen.getByPlaceholderText(REASON), "Led the move.");
    await press("Next");
    await press("Skip");
    expect(screen.getByText("Ready for a bigger role")).toHaveClass("text-ink");
    expect(screen.getByText("Led the move.")).toHaveClass("text-body");
    expect(screen.getByText("Led the move.")).not.toHaveClass("text-ink");
  });
});
