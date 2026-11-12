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
 * says what it does and changes nothing until it is confirmed; turning it off is one press and says
 * what it keeps; the card says that won't do and acceptance are NOT behind it; somebody who may look
 * and not change gets a switch that cannot be pressed; the card tells "loading" from "could not be
 * read" from "this server has not been updated" from "no server", in four different sentences, and
 * offers no switch for any of them (null is not off); Projects being off is said, not hidden; and a
 * refusal is the server's own sentence, shown where it can be read.
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

const THE_SWITCH = /Offer the linked tasks beside Confirm/;
const dialog = () => screen.getByRole("dialog");

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
  it("is off, and says neither is offered and that the marks stay as recorded", () => {
    mount();
    expect(screen.getByRole("switch", { name: THE_SWITCH })).not.toBeChecked();
    expect(
      screen.getByText(
        "Off. Neither is offered. Tasks closed as won't do and accepted tasks stay as recorded.",
      ),
    ).toBeInTheDocument();
  });

  it("says won't do and acceptance are not behind the switch, before anybody turns it on", () => {
    mount();
    expect(
      screen.getByText(
        /Closing a finished task as won't do, and accepting one, are not behind this switch/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Turning this off deletes nothing/),
    ).toBeInTheDocument();
  });

  it("says on the switch itself that it is for reading and changes no mark", () => {
    mount();
    expect(
      screen.getByText(/Both are for reading\. Neither changes a mark/),
    ).toBeInTheDocument();
  });

  it("lists what it never does, including confirming a measure and saving a title", () => {
    mount();
    expect(screen.getByText("What it never does")).toBeInTheDocument();
    expect(
      screen.getByText("Confirm a measure, or say that one is done"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("File, submit, grade or score anything"),
    ).toBeInTheDocument();
    expect(screen.getByText("Save a task title anywhere")).toBeInTheDocument();
    expect(
      screen.getByText("Change a mark, a score, a band or a rank"),
    ).toBeInTheDocument();
  });
});

describe("turning it on", () => {
  it("asks first, and changes nothing yet", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    expect(
      within(dialog()).getByText(
        "Offer the linked tasks and the weekly-line suggestions?",
      ),
    ).toBeInTheDocument();
    expect(setWorkAssists).not.toHaveBeenCalled();
    /* The switch is the company's saved answer, not what was just pressed. */
    expect(screen.getByRole("switch", { name: THE_SWITCH })).not.toBeChecked();
  });

  it("says what it does, that nothing is filed, that it never recommends, that no title is saved and that it needs Projects", async () => {
    mount();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    const body = within(dialog());
    expect(
      body.getByText(/the tasks linked to that measure are listed/),
    ).toBeInTheDocument();
    expect(
      body.getByText(/Nothing is filed, submitted, graded or scored/),
    ).toBeInTheDocument();
    expect(
      body.getByText(/never says a measure is done and never recommends/),
    ).toBeInTheDocument();
    expect(body.getByText(/is not saved by this/)).toBeInTheDocument();
    expect(
      body.getByText("It only works while Projects is switched on."),
    ).toBeInTheDocument();
    expect(
      body.getByText(
        /Closing a task as won't do and accepting a finished task are not part of this/,
      ),
    ).toBeInTheDocument();
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
      await screen.findByText("The two assists are now offered"),
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
    expect(
      screen.getByText(
        /Beside Confirm on a done-or-not measure, the tasks linked/,
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: THE_SWITCH }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(setWorkAssists).toHaveBeenCalledWith(false);
    expect(
      await screen.findByText("The two assists are no longer offered"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Nothing is deleted. Tasks closed as won't do and accepted tasks stay as recorded.",
      ),
    ).toBeInTheDocument();
  });
});

describe("who may change it", () => {
  it("cannot be pressed without the permission, and says why", () => {
    mount(true, { editable: false });
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeDisabled();
    expect(
      screen.getByText(
        /Read-only: changing this needs the Manage settings permission/,
      ),
    ).toBeInTheDocument();
  });

  it("cannot be pressed while a save is out", () => {
    mount(true, { saving: "workAssists" });
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeDisabled();
  });
});

describe("when the setting is not known, which is not off", () => {
  it("says it is reading while the store loads, and offers no switch", () => {
    mount(true, { workAssists: null, loading: true });
    expect(screen.getByText("Reading the setting")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("says it could not be read, and offers no switch", () => {
    mount(true, { workAssists: null, error: new Error("boom") });
    expect(
      screen.getByText(/The setting could not be read, so no switch is shown/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("says a server that predates it has not been updated, and offers no switch", () => {
    mount(true, { workAssists: null });
    expect(
      screen.getByText(
        /This server has not been updated to offer this setting yet/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("says there is no server when there is none, and offers no switch", () => {
    mount(false, { workAssists: null });
    expect(
      screen.getByText(
        /is a company setting kept on the server, so there is nothing to switch here/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("offers no switch with no server even when a value is somehow present", () => {
    mount(false, { workAssists: false });
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});

describe("Projects", () => {
  it("is said to be off, with a link to switch it on, and the switch is still there", () => {
    mount(true, { flags: { projects: false } });
    expect(
      screen.getByText(
        /Projects is switched off, so nothing is offered yet however this is set/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Features" })).toHaveAttribute(
      "href",
      "/settings/features",
    );
    expect(
      screen.getByRole("switch", { name: THE_SWITCH }),
    ).toBeInTheDocument();
  });

  it("is not mentioned as a problem when it is on", () => {
    mount();
    expect(
      screen.queryByText(/Projects is switched off, so nothing is offered/),
    ).not.toBeInTheDocument();
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
  it("says the list beside Confirm is shown to the people who may confirm the measure, and that the person whose objective it is does not see it", () => {
    mount();
    expect(
      screen.getByText(
        /The list beside Confirm is shown to the people who may confirm the measure\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The person whose objective it is does not see it\./),
    ).toBeInTheDocument();
  });

  it("does not say the objective's owner reads the list: the screen never shows it to them", () => {
    mount();
    expect(screen.queryByText(/and by the objective's owner/)).toBeNull();
    expect(screen.queryByText(/read by the people who may confirm/)).toBeNull();
  });

  it("still says the weekly-line suggestions are read only by the owner, from their own finished tasks", () => {
    mount();
    expect(
      screen.getByText(
        /weekly-line suggestions are read only by the person who owns the objective, from their own finished tasks/,
      ),
    ).toBeInTheDocument();
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
