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
 * What is proved: the switch is off for a company that has not chosen, and turning it on asks first,
 * says what it does and what a company should do before it, and changes nothing until it is confirmed;
 * turning it off is one press and says what it keeps; somebody who may look and not change gets a switch
 * that is off; the card tells "loading" from "could not be read" from "this server has not been updated"
 * from "no server", in four different sentences, and offers no switch for any of them; Projects being
 * off is said, not hidden; and a refusal is the server's own sentence, shown where it can be read.
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

const THE_SWITCH = /Let people use their own project work/;
const dialog = () => screen.getByRole("dialog");

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
  it("is off, and says nothing can be attached and that what exists stays", () => {
    mount();
    expect(screen.getByRole("switch", { name: THE_SWITCH })).not.toBeChecked();
    expect(
      screen.getByText(
        "Off. Nobody can attach project work to an answer. Work already attached stays where it is.",
      ),
    ).toBeInTheDocument();
  });

  it("says it is evidence to read and never changes a mark, on the switch itself", () => {
    mount();
    expect(
      screen.getByText(/It is evidence to read and never changes a mark/),
    ).toBeInTheDocument();
  });

  it("says what turning it off keeps, before anybody turns it on", () => {
    mount();
    expect(
      screen.getByText(
        /Turning it off stops anything new\. Everything already written stays/,
      ),
    ).toBeInTheDocument();
  });

  it("lists what it never does, and says no title is saved", () => {
    mount();
    expect(screen.getByText("What it never does")).toBeInTheDocument();
    expect(
      screen.getByText("Save a task title with an attached task"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Change a mark, a score, a band or a rank"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Choose anybody for anybody: a person still picks"),
    ).toBeInTheDocument();
  });
});

describe("turning it on", () => {
  it("asks first, and changes nothing yet", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    expect(
      within(dialog()).getByText(
        "Let people use their own work in their review answers?",
      ),
    ).toBeInTheDocument();
    expect(setWorkInAnswers).not.toHaveBeenCalled();
    /* The switch is the company's saved answer, not what was just pressed. */
    expect(screen.getByRole("switch", { name: THE_SWITCH })).not.toBeChecked();
  });

  it("says what it does, what to do before it, that it needs Projects, and that off keeps everything", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    const body = within(dialog());
    expect(
      body.getByText(/attach finished tasks from their own list to an answer/),
    ).toBeInTheDocument();
    expect(
      body.getByText(/The task's title is not saved with it/),
    ).toBeInTheDocument();
    expect(
      body.getByText(/flag an item on their list as wrong/),
    ).toBeInTheDocument();
    expect(
      body.getByText(
        /colleagues who shared a project with the person are listed/,
      ),
    ).toBeInTheDocument();
    expect(
      body.getByText("It only works while Projects is switched on."),
    ).toBeInTheDocument();
    expect(
      body.getByText(
        /tell your staff, and check with whoever looks after data protection at your company whether an assessment should be filed first/,
      ),
    ).toBeInTheDocument();
    expect(
      body.getByText(
        "Turning it off later stops anything new and keeps everything already written.",
      ),
    ).toBeInTheDocument();
  });

  it("makes no legal claim of its own: it names no law and does not say a company must file", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    const text = dialog().textContent ?? "";
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
      await screen.findByText(
        "People can now use their own work in their review answers",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "It applies to the next thing anybody does. Nothing already written is touched.",
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
    expect(
      screen.getByText(
        "People can attach their own finished project work to the answers in their self-review, and flag an item on their list as wrong.",
      ),
    ).toBeInTheDocument();
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
      await screen.findByText(
        "People can no longer add work to their review answers",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Everything already written stays, and can still be read by the people who could read it.",
      ),
    ).toBeInTheDocument();
  });
});

describe("somebody who may look and not change", () => {
  it("gets a switch that is off, and the reason", () => {
    mount(true, { editable: false });
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeDisabled();
    expect(
      screen.getByText(
        "Read-only: changing this needs the Manage settings permission.",
      ),
    ).toBeInTheDocument();
  });

  it("does not offer the reason to somebody who can change it", () => {
    mount();
    expect(screen.queryByText(/Read-only/)).not.toBeInTheDocument();
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
  it("is said to be off, with a way to switch it on, and the switch is still there", () => {
    mount(true, { flags: { projects: false } });
    expect(
      screen.getByText(/Projects is switched off, so nothing is offered yet/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Features" })).toHaveAttribute(
      "href",
      "/settings/features",
    );
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeEnabled();
  });

  it("says nothing about it while Projects is on", () => {
    mount();
    expect(
      screen.queryByText(/Projects is switched off, so nothing is offered yet/),
    ).not.toBeInTheDocument();
  });
});

describe("what the card says when it cannot say", () => {
  const SWITCHLESS = () =>
    expect(
      screen.queryByRole("switch", { name: THE_SWITCH }),
    ).not.toBeInTheDocument();

  it("is reading, while the setting is on its way", () => {
    mount(true, { workInAnswers: null, loading: true });
    expect(screen.getByText("Reading the setting")).toBeInTheDocument();
    SWITCHLESS();
  });

  it("is a failed read, and offers no switch rather than a guess", () => {
    mount(true, { workInAnswers: null, error: new Error("boom") });
    expect(
      screen.getByText(/The setting could not be read, so no switch is shown/),
    ).toBeInTheDocument();
    SWITCHLESS();
  });

  it("is a server a deploy behind: not off", () => {
    mount(true, { workInAnswers: null });
    expect(
      screen.getByText(
        /This server has not been updated to offer this setting yet/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Off\./)).not.toBeInTheDocument();
    SWITCHLESS();
  });

  it("is no server at all", () => {
    mount(false, { workInAnswers: null });
    expect(
      screen.getByText(
        /a company setting kept on the server, so there is nothing to switch here/,
      ),
    ).toBeInTheDocument();
    SWITCHLESS();
  });

  it("offers no switch offline even where a value is somehow held", () => {
    mount(false, { workInAnswers: true });
    SWITCHLESS();
  });

  it("says each of the four in its own words and never two at once", () => {
    const sentences = [
      "Reading the setting",
      "could not be read",
      "has not been updated",
      "nothing to switch here",
    ];
    const states: [boolean, Partial<FeatureState>][] = [
      [true, { workInAnswers: null, loading: true }],
      [true, { workInAnswers: null, error: new Error("x") }],
      [true, { workInAnswers: null }],
      [false, { workInAnswers: null }],
    ];
    const base = { ...features };
    states.forEach(([connected, over], index) => {
      features = { ...base, ...over };
      const { unmount } = render(
        <ToastProvider>
          <WorkInAnswersCard connected={connected} />
        </ToastProvider>,
      );
      const text = document.body.textContent ?? "";
      sentences.forEach((sentence, at) => {
        expect(text.includes(sentence)).toBe(at === index);
      });
      unmount();
    });
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
  it("are the start of each control's announced name: the link and the confirmation's buttons", async () => {
    mount(true, { flags: { projects: false } });
    expect(expectLabelInName(document.body)).toEqual(
      expect.arrayContaining(["Features"]),
    );
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    const words = expectLabelInName(dialog());
    expect(words).toEqual(expect.arrayContaining(["Switch it on"]));
  });
});
