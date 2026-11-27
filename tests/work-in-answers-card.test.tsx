import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { expectLabelInName } from "./label-in-name";

/**
 * Whether people may use their own finished project work in their review answers, in Appraisal scoring
 * > Records.
 *
 * What is proved: the switch is off for a company that has not chosen, and turning it on asks first, in
 * one question with no paragraph, and changes nothing until it is confirmed; what it does and what a
 * company should do before it are behind the icon beside the switch's name; turning it off is one press
 * and says what it keeps; somebody who may look and not change gets a switch that is off; no switch is
 * offered, and nothing is drawn, for "loading", "could not be read", "this server has not been updated"
 * or "no server" (the months field above says which, once); with Projects off the switch is absent, not
 * explained, unless it is already on; and a refusal is the server's own sentence, shown where it can be
 * read.
 */

const setWorkInAnswers = vi.fn<(next: boolean) => Promise<object>>(
  async () => ({}),
);

type FeatureState = {
  workInAnswers: boolean | null;
  editable: boolean;
  loading: boolean;
  saving: string | null;
  error: unknown;
  flags: { projects: boolean };
};
let features: FeatureState;
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({ ...features, setWorkInAnswers }),
}));

import { WorkInAnswersCard } from "@/app/(app)/settings/performance/work-in-answers-card";

const mount = (connected = true, over: Partial<FeatureState> = {}) => {
  features = { ...features, ...over };
  render(
    <ToastProvider>
      <WorkInAnswersCard connected={connected} />
    </ToastProvider>,
  );
};

const THE_SWITCH = /Let people add their finished work/;
const dialog = () => screen.getByRole("dialog");
const openInfo = () =>
  userEvent.click(
    screen.getByRole("button", { name: "About work in review answers" }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  features = {
    workInAnswers: false,
    editable: true,
    loading: false,
    saving: null,
    error: null,
    flags: { projects: true },
  };
});

describe("a company that has not chosen", () => {
  it("is off", () => {
    mount();
    expect(screen.getByRole("switch", { name: THE_SWITCH })).not.toBeChecked();
  });

  it("has no line under the switch: the rule is not said twice", () => {
    mount();
    expect(screen.queryByText("It never changes a score.")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("says behind the info icon what it does, that no title is saved, what turning it off keeps, and what to do before switching it on", async () => {
    mount();
    await openInfo();
    const said = screen.getByText(/attach up to five finished tasks/);
    expect(said).toHaveTextContent(/Task titles aren't saved/);
    expect(said).toHaveTextContent(/never changes a score/);
    expect(said).toHaveTextContent(
      /Turning it off stops anything new and keeps what's there/,
    );
    expect(said).toHaveTextContent(
      /tell your staff and check with whoever handles data protection whether an assessment is needed/,
    );
  });
});

describe("turning it on", () => {
  it("asks first, and changes nothing yet", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    expect(
      within(dialog()).getByText(
        "Let people add their work to review answers?",
      ),
    ).toBeInTheDocument();
    expect(setWorkInAnswers).not.toHaveBeenCalled();
    /* The switch is the company's saved answer, not what was just pressed. */
    expect(screen.getByRole("switch", { name: THE_SWITCH })).not.toBeChecked();
  });

  it("is the question, Cancel and the action, with no paragraph, and makes no legal claim", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    const question = within(dialog());
    expect(
      question.getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
    expect(
      question.getByRole("button", { name: "Switch it on" }),
    ).toBeInTheDocument();
    const text = dialog().textContent ?? "";
    expect(text).not.toMatch(
      /attach finished tasks|Task titles|data protection|Projects/,
    );
    expect(text).not.toMatch(
      /NDPA|NDPR|GAID|Act\b|legally|required by law|compliant/i,
    );
  });

  it("is not switched on by cancelling", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Cancel" }),
    );
    expect(setWorkInAnswers).not.toHaveBeenCalled();
  });

  it("is switched on, once, by confirming, and says what it applies to", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Switch it on" }),
    );
    await waitFor(() => expect(setWorkInAnswers).toHaveBeenCalledTimes(1));
    expect(setWorkInAnswers).toHaveBeenCalledWith(true);
    expect(
      await screen.findByText("Work in review answers switched on"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "People can add their finished work to their answers from now on.",
      ),
    ).toBeInTheDocument();
  });
});

describe("turning it off", () => {
  beforeEach(() => {
    features.workInAnswers = true;
  });

  it("shows it on", () => {
    mount();
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeChecked();
  });

  it("is one press: no question, and the setting is sent as false", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(setWorkInAnswers).toHaveBeenCalledWith(false));
    expect(setWorkInAnswers).toHaveBeenCalledTimes(1);
  });

  it("says that what was written stays, and can still be read", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    expect(
      await screen.findByText("Work in review answers switched off"),
    ).toBeInTheDocument();
    expect(screen.getByText("Work already added stays.")).toBeInTheDocument();
  });
});

describe("somebody who may look and not change", () => {
  it("gets a switch that is off, and no sentence of its own: the months field says why, once for the card", () => {
    mount(true, { editable: false });
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeDisabled();
    expect(
      screen.queryByText(/Only people who manage settings/),
    ).not.toBeInTheDocument();
  });

  it("cannot press the switch while a save is running", () => {
    mount(true, { saving: "workInAnswers" });
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeDisabled();
  });

  it("is not held by a save of something else", () => {
    mount(true, { saving: "overallMark" });
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeEnabled();
  });
});

describe("Projects", () => {
  it("being off leaves the switch out, with no sentence about it", () => {
    mount(true, { flags: { projects: false } });
    expect(
      screen.queryByRole("switch", { name: THE_SWITCH }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Needs Projects/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Features" })).toBeNull();
  });

  it("being off still shows a switch that is already on, so it can be turned off", () => {
    mount(true, { flags: { projects: false }, workInAnswers: true });
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeChecked();
  });

  it("being on shows the switch with nothing said about it", () => {
    mount();
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeEnabled();
    expect(screen.queryByText(/Needs Projects/)).not.toBeInTheDocument();
  });
});

describe("what the card says when it cannot say", () => {
  /* Nothing: the months field above is the one place that says which of the four it is. */
  const NOTHING = () => {
    expect(
      screen.queryByRole("switch", { name: THE_SWITCH }),
    ).not.toBeInTheDocument();
    expect(document.body.textContent).toBe("");
  };

  it("is reading, while the setting is on its way", () => {
    mount(true, { workInAnswers: null, loading: true });
    NOTHING();
  });

  it("is a failed read, and offers no switch rather than a guess", () => {
    mount(true, { workInAnswers: null, error: new Error("boom") });
    NOTHING();
  });

  it("is a server a deploy behind: not off", () => {
    mount(true, { workInAnswers: null });
    NOTHING();
  });

  it("is no server at all", () => {
    mount(false, { workInAnswers: null });
    NOTHING();
  });

  it("offers no switch offline even where a value is somehow held", () => {
    mount(false, { workInAnswers: true });
    NOTHING();
  });
});

describe("a refusal", () => {
  it("is the server's own sentence, shown where it can be read, and the dialog is gone", async () => {
    setWorkInAnswers.mockRejectedValueOnce(
      new ApiError(
        403,
        "forbidden",
        "You need the Manage settings permission to change this.",
      ),
    );
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Switch it on" }),
    );
    expect(
      await screen.findByText(
        "You need the Manage settings permission to change this.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You need the Manage settings permission",
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    /* And it is still off: nothing was written. */
    expect(screen.getByRole("switch", { name: THE_SWITCH })).not.toBeChecked();
  });

  it("does not show a status code for a server that fell over", async () => {
    setWorkInAnswers.mockRejectedValueOnce(
      new ApiError(500, "internal", "Internal"),
    );
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Switch it on" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/500/);
    expect(alert).toHaveTextContent(/Something went wrong on our side/);
  });
});

describe("the words on its controls", () => {
  it("are the start of each control's announced name: the confirmation's buttons", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    const words = expectLabelInName(dialog());
    expect(words).toEqual(expect.arrayContaining(["Switch it on"]));
  });
});
