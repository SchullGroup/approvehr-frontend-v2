import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";

/**
 * How long the work behind a final rating is kept, in Appraisal scoring > Records.
 *
 * What is proved: nothing is kept until a company chooses and no figure is suggested (the box is
 * empty); the card tells "none chosen" from "this server cannot say" from "no server" from "the read
 * failed"; a period is a whole number from 1 to 120 and nothing else can be sent; setting one asks
 * first and says what it will do; stopping needs no confirmation and says what it leaves; somebody
 * who may look and not change gets controls that are off; and a refusal is the server's own
 * sentence, shown where it can be read.
 */

const setWorkEvidenceMonths = vi.fn<(next: number | null) => Promise<object>>(
  async () => ({}),
);

type FeatureState = {
  workEvidenceMonths: number | null | undefined;
  editable: boolean;
  loading: boolean;
  saving: string | null;
  error: unknown;
};
let features: FeatureState;
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({ ...features, setWorkEvidenceMonths }),
}));

import { WorkRecordCard } from "@/app/(app)/settings/performance/work-record-card";

const mount = (connected = true, over: Partial<FeatureState> = {}) => {
  features = { ...features, ...over };
  render(
    <ToastProvider>
      <WorkRecordCard connected={connected} />
    </ToastProvider>,
  );
};

const box = () => screen.getByRole("textbox");
/* The button says what it will do: "Keep for 12 months" once a valid number is in, "Save" before. */
const keep = () => screen.getByRole("button", { name: /^(Save|Keep for .+)$/ });
const openInfo = () =>
  userEvent.click(
    screen.getByRole("button", { name: "About Work kept with a final rating" }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  features = {
    workEvidenceMonths: null,
    editable: true,
    loading: false,
    saving: null,
    error: null,
  };
});

describe("a company that has not chosen", () => {
  it("says nothing is kept, and leaves the box empty: no figure is suggested", async () => {
    mount();
    expect(screen.getByText("Not kept.")).toBeInTheDocument();
    expect(box()).toHaveValue("");
    expect(box()).toHaveAttribute("placeholder", "1 to 120");
    expect(keep()).toHaveTextContent("Save");
    await openInfo();
    expect(
      screen.getByText(/Check with your legal adviser how long to keep it/),
    ).toBeInTheDocument();
  });

  it("cannot be set until there is a valid number in the box", async () => {
    mount();
    expect(keep()).toBeDisabled();
    await userEvent.type(box(), "12");
    expect(keep()).toBeEnabled();
    expect(keep()).toHaveTextContent("Keep for 12 months");
  });

  it("has nothing to stop", () => {
    mount();
    expect(
      screen.queryByRole("button", { name: "Stop keeping work" }),
    ).not.toBeInTheDocument();
  });
});

describe("what can be typed", () => {
  it.each(["0", "121", "1.5", "abc", "-3", "12 months"])(
    "refuses %s, says why, and sends nothing",
    async (typed) => {
      mount();
      await userEvent.type(box(), typed);
      expect(
        screen.getByText("Enter a whole number from 1 to 120."),
      ).toBeInTheDocument();
      expect(keep()).toBeDisabled();
      expect(setWorkEvidenceMonths).not.toHaveBeenCalled();
    },
  );

  it.each(["1", "12", "84", "120"])("accepts %s", async (typed) => {
    mount();
    await userEvent.type(box(), typed);
    expect(
      screen.queryByText("Enter a whole number from 1 to 120."),
    ).not.toBeInTheDocument();
    expect(keep()).toBeEnabled();
  });
});

describe("choosing a period", () => {
  it("asks first, says what it will do and what it will not, and sends the number only when confirmed", async () => {
    mount();
    await userEvent.type(box(), "12");
    await userEvent.click(keep());

    expect(
      screen.getByRole("heading", {
        name: "Keep work with final ratings for 12 months?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Task titles aren't kept/)).toBeInTheDocument();
    expect(
      screen.getByText(/Ratings already final don't change/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A disputed rating keeps it one period longer/),
    ).toBeInTheDocument();
    expect(setWorkEvidenceMonths).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(setWorkEvidenceMonths).toHaveBeenCalledTimes(1);
    expect(setWorkEvidenceMonths).toHaveBeenCalledWith(12);
    expect(
      await screen.findByText("Work is kept with final ratings for 12 months"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Applies to ratings made final from now on."),
    ).toBeInTheDocument();
  });

  it("keeps the same question on the dialog while it fades out, and does not swap it for a default", async () => {
    mount();
    await userEvent.type(box(), "12");
    await userEvent.click(keep());
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    await screen.findByText("Work is kept with final ratings for 12 months");
    /* A dialog stays on screen for a moment as it leaves, and is drawn from the props it has then:
       a title that is read from "what is being asked" would flip to a different sentence over a
       dialog that is going away. */
    expect(
      screen.queryByRole("heading", { name: "Keep work with final ratings?" }),
    ).not.toBeInTheDocument();
  });

  it("says one month, not 1 months", async () => {
    mount();
    await userEvent.type(box(), "1");
    await userEvent.click(keep());
    expect(
      screen.getByRole("heading", {
        name: "Keep work with final ratings for 1 month?",
      }),
    ).toBeInTheDocument();
  });

  it("sends nothing when the question is closed instead of answered", async () => {
    mount();
    await userEvent.type(box(), "12");
    await userEvent.click(keep());
    await userEvent.keyboard("{Escape}");
    expect(setWorkEvidenceMonths).not.toHaveBeenCalled();
  });
});

describe("a company that has chosen", () => {
  beforeEach(() => {
    features = { ...features, workEvidenceMonths: 24 };
  });

  it("says how long, from when, and fills the box with it", () => {
    mount();
    expect(
      screen.getByText("Kept for 24 months after a rating is final."),
    ).toBeInTheDocument();
    expect(box()).toHaveValue("24");
    expect(keep()).toBeDisabled();
  });

  it("can be changed, and is asked about again", async () => {
    mount();
    await userEvent.clear(box());
    await userEvent.type(box(), "36");
    await userEvent.click(keep());
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(setWorkEvidenceMonths).toHaveBeenCalledWith(36);
  });

  it("stops with one press and no question, and says what it leaves", async () => {
    mount();
    await userEvent.click(
      screen.getByRole("button", { name: "Stop keeping work" }),
    );
    expect(setWorkEvidenceMonths).toHaveBeenCalledWith(null);
    expect(
      await screen.findByText("Work is no longer kept with final ratings"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Records already kept stay until their own date."),
    ).toBeInTheDocument();
  });

  it("says one month, not 1 months", () => {
    features = { ...features, workEvidenceMonths: 1 };
    mount();
    expect(
      screen.getByText("Kept for 1 month after a rating is final."),
    ).toBeInTheDocument();
  });
});

describe("a refusal", () => {
  it("is the server's own sentence, shown beside the box, and the question closes", async () => {
    setWorkEvidenceMonths.mockRejectedValueOnce(
      new ApiError(
        403,
        "forbidden",
        "You need the Manage settings permission.",
      ),
    );
    mount();
    await userEvent.type(box(), "12");
    await userEvent.click(keep());
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You need the Manage settings permission.",
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          name: /Keep work with final ratings/,
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/Work is kept with final ratings for 12 months/),
    ).not.toBeInTheDocument();
  });
});

describe("somebody who may look and not change", () => {
  it("has controls that are off, and is told why", () => {
    features = { ...features, workEvidenceMonths: 12 };
    mount(true, { editable: false });
    expect(box()).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Stop keeping work" }),
    ).toBeDisabled();
    expect(keep()).toBeDisabled();
    expect(
      screen.getByText("Only people who manage settings can change this."),
    ).toBeInTheDocument();
  });
});

describe("the states that are not none chosen", () => {
  it("a server that has not said: no control, and the reason", () => {
    mount(true, { workEvidenceMonths: undefined });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByText("This server doesn't offer this setting yet."),
    ).toBeInTheDocument();
  });

  it("no server at all: no control, and the reason", () => {
    mount(false, { workEvidenceMonths: undefined });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByText("This setting is kept on the server."),
    ).toBeInTheDocument();
  });

  it("no server, whatever a stale value says: no control", () => {
    mount(false, { workEvidenceMonths: 12 });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("while it is read: says so, and offers nothing to change", () => {
    mount(true, { workEvidenceMonths: undefined, loading: true });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("a read that failed: no control rather than a guess", () => {
    mount(true, {
      workEvidenceMonths: undefined,
      error: new ApiError(500, "x", "boom"),
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "This setting didn't load. Reload the page to try again.",
      ),
    ).toBeInTheDocument();
  });
});

describe("what it says about what is kept", () => {
  it("says behind the info icon what is kept, what is never kept, and who reads it", async () => {
    mount();
    await openInfo();
    const said = screen.getByText(/Kept: which tasks the person finished/);
    expect(said).toHaveTextContent(
      /Never kept: task titles, descriptions, comments or files/,
    );
    expect(said).toHaveTextContent(/Only people who can read the review/);
    expect(said).toHaveTextContent(/never changes a score/);
  });
});
