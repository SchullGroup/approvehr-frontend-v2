import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { fakeGateway } from "./screening-helpers";

/**
 * The pass mark: where the line is, and what it would do before it is drawn.
 *
 * What these hold: two independent optional figures, the count of who would be
 * below is asked for what is typed and says so when it is still answering an older
 * figure, people with no score are named apart and never counted as below, saving
 * asks first with the same number in the question, and everything says it flags
 * and never rejects.
 */

const current = { gateway: fakeGateway() };
vi.mock("@/lib/hiring/screening/use-gateway", () => ({
  useScreeningGateway: () => current.gateway,
}));

const { PassMarkPanel } =
  await import("@/components/hiring/screening/pass-mark-panel");
const { useRescore } = await import("@/lib/hiring/screening/use-screening");

function Host() {
  const rescore = useRescore("p1");
  return (
    <PassMarkPanel
      postingId="p1"
      rescore={rescore}
      belowHref="/hiring/postings/p1/below-pass-mark"
    />
  );
}

const open = () =>
  render(
    <ToastProvider>
      <Host />
    </ToastProvider>,
  );

const fitBox = () =>
  screen.getByRole("textbox", { name: /Fit score, at least/ });
const assessmentBox = () =>
  screen.getByRole("textbox", { name: /Assessment score, at least/ });

/** The count on screen answers what is in the boxes. */
const settled = () =>
  waitFor(() =>
    expect(screen.getByTestId("pass-mark-count")).toHaveAttribute(
      "aria-busy",
      "false",
    ),
  );

beforeEach(() => {
  current.gateway = fakeGateway();
});

describe("the pass mark as it stands", () => {
  it("shows the saved figures, the flagged answers and what is below it now", async () => {
    open();
    await waitFor(() => expect(fitBox()).toHaveValue("50"));
    expect(assessmentBox()).toHaveValue("");
    expect(
      await screen.findByText(
        "Right now, 412 of 4,210 people are below the pass mark.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Right to work in Nigeria\?/)).toBeInTheDocument();
    expect(
      screen.getByText(/flagged when the answer is No/),
    ).toBeInTheDocument();
  });

  it("says it flags and never rejects", async () => {
    open();
    await waitFor(() => expect(fitBox()).toBeInTheDocument());
    expect(
      screen.getByText(/Below it, a person is shown to somebody to look at/),
    ).toBeInTheDocument();
    expect(screen.getByText(/It never rejects/)).toBeInTheDocument();
  });

  it("splits the count by reason, and says when they overlap", async () => {
    open();
    expect(
      await screen.findByText(/400 on fit score, 22 on a flagged answer\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/add up to more than 412/)).toBeInTheDocument();
  });

  it("names people with no score apart, and does not count them as below", async () => {
    open();
    const note = await screen.findByText(/31 have no score yet/);
    expect(note).toHaveTextContent(
      "They are not counted as below the pass mark",
    );
    expect(note).toHaveTextContent("a missing score is not a low one");
  });

  it("says plainly when there is no pass mark at all", async () => {
    current.gateway = fakeGateway({
      passMark: {
        ...fakeGateway().passMark,
        get: vi.fn(async () => ({
          fitMin: null,
          assessmentMin: null,
          assessmentMax: 100,
          knockouts: [],
          version: null,
        })),
        count: vi.fn(async () => ({
          total: 4210,
          below: 0,
          byReason: { fit: 0, assessment: 0, knockout: 0 },
          notScored: 0,
        })),
      },
    });
    open();
    expect(
      await screen.findByText(/There is no pass mark/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The application form has no knockout questions/),
    ).toBeInTheDocument();
  });
});

describe("changing it", () => {
  it("asks for the count of what is typed, once the typing pauses", async () => {
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(fitBox()).toHaveValue("50"));
    current.gateway.passMark.count.mockClear();
    await user.clear(fitBox());
    await user.type(fitBox(), "65");
    await waitFor(() =>
      expect(current.gateway.passMark.count).toHaveBeenCalledWith(
        "p1",
        { fitMin: 65, assessmentMin: null },
        expect.anything(),
      ),
    );
    /* One question for the settled figure, not one per keystroke. */
    expect(current.gateway.passMark.count).toHaveBeenCalledTimes(1);
  });

  it("takes the assessment figure on its own, and each is optional", async () => {
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(fitBox()).toHaveValue("50"));
    await user.clear(fitBox());
    await user.type(assessmentBox(), "60");
    await waitFor(() =>
      expect(current.gateway.passMark.count).toHaveBeenLastCalledWith(
        "p1",
        { fitMin: null, assessmentMin: 60 },
        expect.anything(),
      ),
    );
  });

  it("says 'if you saved this' while the boxes differ from what is saved", async () => {
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(fitBox()).toHaveValue("50"));
    await user.clear(fitBox());
    await user.type(fitBox(), "70");
    expect(
      await screen.findByText(
        "If you saved this, 412 of 4,210 people would be below the pass mark.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Not saved")).toBeInTheDocument();
  });

  it("dims a count that still answers the old figure", async () => {
    let release: (value: unknown) => void = () => undefined;
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(fitBox()).toHaveValue("50"));
    await settled();
    const answer = {
      total: 4210,
      below: 900,
      byReason: { fit: 900, assessment: 0, knockout: 0 },
      notScored: 0,
    };
    current.gateway.passMark.count.mockImplementation(
      async (_id: string, input: { fitMin: number | null }) =>
        input.fitMin === 80
          ? await new Promise<typeof answer>((resolve) => {
              release = resolve as (value: unknown) => void;
            })
          : answer,
    );
    await user.clear(fitBox());
    await user.type(fitBox(), "80");
    /* Typed, asked, and not yet answered: the old count is dimmed and says so. */
    await waitFor(() =>
      expect(current.gateway.passMark.count).toHaveBeenLastCalledWith(
        "p1",
        { fitMin: 80, assessmentMin: null },
        expect.anything(),
      ),
    );
    const count = screen.getByTestId("pass-mark-count");
    expect(count).toHaveAttribute("aria-busy", "true");
    expect(within(count).getByText("Updating the count")).toBeInTheDocument();
    release(answer);
    await waitFor(() => expect(count).toHaveAttribute("aria-busy", "false"));
    expect(count).toHaveTextContent("900 of 4,210");
  });

  it("refuses a figure outside the range and cannot be saved", async () => {
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(fitBox()).toHaveValue("50"));
    await user.clear(fitBox());
    await user.type(fitBox(), "120");
    expect(screen.getByText("A number from 0 to 100.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save pass mark" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Fix the figures above to see how many people it would flag.",
      ),
    ).toBeInTheDocument();
  });

  it("cannot be saved when nothing has changed", async () => {
    open();
    await waitFor(() => expect(fitBox()).toHaveValue("50"));
    expect(
      screen.getByRole("button", { name: "Save pass mark" }),
    ).toBeDisabled();
  });
});

describe("saving it", () => {
  it("asks first, with the number in the question, and says nobody is rejected", async () => {
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(fitBox()).toHaveValue("50"));
    await user.clear(fitBox());
    await user.type(fitBox(), "70");
    await screen.findByText(/If you saved this/);
    await waitFor(() =>
      expect(current.gateway.passMark.count).toHaveBeenLastCalledWith(
        "p1",
        { fitMin: 70, assessmentMin: null },
        expect.anything(),
      ),
    );
    await settled();
    await user.click(screen.getByRole("button", { name: "Save pass mark" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Set this pass mark?",
    });
    expect(dialog).toHaveTextContent(
      "412 of 4,210 would be flagged as below the pass mark.",
    );
    expect(dialog).toHaveTextContent("Nobody is rejected");
    expect(dialog).toHaveTextContent(
      "a person confirms there before anybody is turned down",
    );
    expect(current.gateway.passMark.save).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Set the pass mark" }),
    );
    await waitFor(() =>
      expect(current.gateway.passMark.save).toHaveBeenCalledWith("p1", {
        fitMin: 70,
        assessmentMin: null,
      }),
    );
    expect(await screen.findByText("Pass mark saved")).toBeInTheDocument();
  });

  it("starts watching the recompute, and shows it", async () => {
    let calls = 0;
    current.gateway = fakeGateway({
      rescore: {
        progress: vi.fn(async () => {
          calls += 1;
          return calls >= 2
            ? {
                running: true,
                done: 10,
                total: 100,
                cause: "PASS_MARK" as const,
              }
            : { running: false, done: 0, total: 0, cause: null };
        }),
      },
    });
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(fitBox()).toHaveValue("50"));
    await user.clear(fitBox());
    await user.type(fitBox(), "60");
    await user.click(screen.getByRole("button", { name: "Save pass mark" }));
    await user.click(
      await screen.findByRole("button", { name: "Set the pass mark" }),
    );
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
  });

  it("keeps the figures and says why when it is refused", async () => {
    current.gateway = fakeGateway({
      passMark: {
        ...fakeGateway().passMark,
        save: vi.fn(async () => {
          throw new ApiError(
            422,
            "unprocessable",
            "Set the criteria before the pass mark.",
          );
        }),
      },
    });
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(fitBox()).toHaveValue("50"));
    await user.clear(fitBox());
    await user.type(fitBox(), "60");
    await user.click(screen.getByRole("button", { name: "Save pass mark" }));
    await user.click(
      await screen.findByRole("button", { name: "Set the pass mark" }),
    );
    expect(
      await screen.findByText("Set the criteria before the pass mark."),
    ).toBeInTheDocument();
    expect(fitBox()).toHaveValue("60");
  });

  it("links to the people below it", async () => {
    open();
    expect(
      await screen.findByRole("link", {
        name: /See who is below the pass mark/,
      }),
    ).toHaveAttribute("href", "/hiring/postings/p1/below-pass-mark");
  });
});
