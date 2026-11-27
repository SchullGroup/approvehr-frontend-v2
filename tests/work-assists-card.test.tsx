import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";

/**
 * Whether the two assists are offered, in Appraisal scoring > Records: the linked tasks beside Confirm
 * on a done-or-not measure, and the finished tasks of the week for a weekly line.
 *
 * What is proved: the switch is off for a company that has not chosen, and turning it on asks first,
 * in one question with no paragraph, and changes nothing until it is confirmed; turning it off is one
 * press and says what it keeps; that won't do and acceptance are NOT behind it is behind the icon beside
 * the switch's name; somebody who may look and not change gets a switch that cannot be pressed; no switch
 * is offered, and nothing drawn, for "loading", "could not be read", "this server has not been updated"
 * or "no server" (null is not off); with Projects off the switch is absent, not explained, unless it is
 * already on; and a refusal is the server's own sentence, shown where it can be read.
 */

const setWorkAssists = vi.fn<(next: boolean) => Promise<object>>(
  async () => ({}),
);

type FeatureState = {
  workAssists: boolean | null;
  editable: boolean;
  loading: boolean;
  saving: string | null;
  error: unknown;
  flags: { projects: boolean };
};
let features: FeatureState;
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({ ...features, setWorkAssists }),
}));

import { WorkAssistsCard } from "@/app/(app)/settings/performance/work-assists-card";

const mount = (connected = true, over: Partial<FeatureState> = {}) => {
  features = { ...features, ...over };
  render(
    <ToastProvider>
      <WorkAssistsCard connected={connected} />
    </ToastProvider>,
  );
};

const THE_SWITCH = /Show linked tasks next to Confirm/;
const dialog = () => screen.getByRole("dialog");
const openInfo = () =>
  userEvent.click(
    screen.getByRole("button", { name: "About task suggestions" }),
  );
const info = () =>
  screen.getByText(/A manager confirming a done-or-not target/).textContent ??
  "";

beforeEach(() => {
  vi.clearAllMocks();
  features = {
    workAssists: false,
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

  it("says behind the info icon that won't do and acceptance are not behind the switch, and that nothing is filed", async () => {
    mount();
    await openInfo();
    expect(info()).toMatch(
      /Closing a task as won't do, and accepting one, aren't affected by this switch/,
    );
    expect(info()).toMatch(/Nothing is filed, graded or scored/);
  });
});

describe("turning it on", () => {
  it("asks first, and changes nothing yet", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    expect(
      within(dialog()).getByText("Switch on task suggestions?"),
    ).toBeInTheDocument();
    expect(setWorkAssists).not.toHaveBeenCalled();
    /* The switch is the company's saved answer, not what was just pressed. */
    expect(screen.getByRole("switch", { name: THE_SWITCH })).not.toBeChecked();
  });

  it("is the question, Cancel and the action, with no paragraph", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    const question = within(dialog());
    expect(
      question.getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
    expect(
      question.getByRole("button", { name: "Switch it on" }),
    ).toBeInTheDocument();
    expect(dialog().textContent).not.toMatch(
      /linked to a done-or-not|never says a target|titles aren't saved|Projects/i,
    );
  });

  it("sends true only when confirmed, then says what was done and closes", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Switch it on" }),
    );
    expect(setWorkAssists).toHaveBeenCalledTimes(1);
    expect(setWorkAssists).toHaveBeenCalledWith(true);
    expect(
      await screen.findByText("Task suggestions switched on"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("sends nothing when the question is dismissed", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    await userEvent.keyboard("{Escape}");
    expect(setWorkAssists).not.toHaveBeenCalled();
  });
});

describe("turning it off", () => {
  it("is one press with no question, sends false, and says nothing is deleted", async () => {
    mount(true, { workAssists: true });
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeChecked();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(setWorkAssists).toHaveBeenCalledWith(false);
    expect(
      await screen.findByText("Task suggestions switched off"),
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing is deleted.")).toBeInTheDocument();
  });
});

describe("who may change it", () => {
  it("cannot be pressed without the permission, and has no sentence of its own: the months field says why, once for the card", () => {
    mount(true, { editable: false });
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeDisabled();
    expect(
      screen.queryByText(/Only people who manage settings/),
    ).not.toBeInTheDocument();
  });

  it("cannot be pressed while a save is out", () => {
    mount(true, { saving: "workAssists" });
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeDisabled();
  });
});

describe("when the setting is not known, which is not off", () => {
  /* Nothing: the months field above is the one place that says which of the four it is. */
  const NOTHING = () => {
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(document.body.textContent).toBe("");
  };

  it("draws nothing while the store loads", () => {
    mount(true, { workAssists: null, loading: true });
    NOTHING();
  });

  it("draws nothing when it could not be read", () => {
    mount(true, { workAssists: null, error: new Error("boom") });
    NOTHING();
  });

  it("draws nothing for a server that predates it", () => {
    mount(true, { workAssists: null });
    NOTHING();
  });

  it("draws nothing when there is no server", () => {
    mount(false, { workAssists: null });
    NOTHING();
  });

  it("offers no switch with no server even when a value is somehow present", () => {
    mount(false, { workAssists: false });
    NOTHING();
  });
});

describe("Projects", () => {
  it("being off leaves the switch out, with no sentence about it", () => {
    mount(true, { flags: { projects: false } });
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText(/Needs Projects/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Features" })).toBeNull();
  });

  it("being off still shows a switch that is already on, so it can be turned off", () => {
    mount(true, { flags: { projects: false }, workAssists: true });
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeChecked();
  });

  it("being on shows the switch with nothing said about it", () => {
    mount();
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeEnabled();
    expect(screen.queryByText(/Needs Projects/)).not.toBeInTheDocument();
  });
});

describe("a refusal", () => {
  it("is the server's own sentence, shown beside the switch, and the question closes", async () => {
    setWorkAssists.mockRejectedValueOnce(
      new ApiError(
        403,
        "forbidden",
        "You do not have permission to change that.",
      ),
    );
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Switch it on" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have permission to change that.",
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("switch", { name: THE_SWITCH })).not.toBeChecked();
  });
});

describe("who is shown what", () => {
  it("says the list beside Confirm is shown only to the people who may confirm, not to the person whose objective it is", async () => {
    mount();
    await openInfo();
    expect(info()).toMatch(
      /Only people who may confirm see that list, not the person whose objective it is/,
    );
  });

  it("does not say the objective's owner reads the list: the screen never shows it to them", async () => {
    mount();
    await openInfo();
    expect(info()).not.toMatch(/and by the objective's owner/);
    expect(info()).not.toMatch(/read by the people who may confirm/);
  });

  it("says nothing about weekly lines: they are gone", async () => {
    mount();
    await openInfo();
    expect(info()).not.toMatch(/weekly line/i);
  });
});

describe("the question, while its save is out", () => {
  /* A dialog that has been told to close stays in the page for its exit animation (250 ms). */
  const settle = () =>
    act(() => new Promise<void>((resolve) => setTimeout(resolve, 400)));
  /* A new element each time: React skips a re-render for the very same element, and the card reads
     the store's answer from the mock on every render. */
  const ui = () => (
    <ToastProvider>
      <WorkAssistsCard connected />
    </ToastProvider>
  );

  it("cannot be closed by Escape or Cancel, so the answer is never lost behind a dialog that has gone", async () => {
    const view = render(ui());
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    expect(dialog()).toBeInTheDocument();
    /* The store says a save is out. */
    features = { ...features, saving: "workAssists" };
    view.rerender(ui());
    await userEvent.keyboard("{Escape}");
    await settle();
    expect(dialog()).toBeInTheDocument();
    const cancel = within(dialog()).getByRole("button", { name: "Cancel" });
    expect(cancel).toBeDisabled();
    await userEvent.click(cancel);
    await settle();
    expect(dialog()).toBeInTheDocument();
    expect(setWorkAssists).not.toHaveBeenCalled();
  });

  it("can be closed again once the save is over", async () => {
    const view = render(ui());
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    features = { ...features, saving: "workAssists" };
    view.rerender(ui());
    features = { ...features, saving: null };
    view.rerender(ui());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the confirm button as busy while it is out, and not before", async () => {
    const view = render(ui());
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    const confirm = () =>
      within(dialog()).getByRole("button", { name: /Switch it on/ });
    expect(confirm()).not.toHaveAttribute("aria-busy", "true");
    features = { ...features, saving: "workAssists" };
    view.rerender(ui());
    expect(confirm()).toBeDisabled();
  });
});
