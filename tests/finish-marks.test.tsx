import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { formatDateShort } from "@/lib/time";

/**
 * How a finished task finished, in the drawer: won't do and acceptance.
 *
 * What is proved: a task with no mark that this reader may not mark or accept draws nothing; a button is
 * drawn for exactly what the server said the reader may do and for nothing else (the screen works out no
 * rule of its own); each of the four writes goes to the right call once and says what happened; a refusal
 * is the server's own sentence and the screen holding the task reads it again whether the write worked or
 * not; what was just answered is shown at once and dropped the moment the task holds anything else; and
 * the won't-do dialog asks for a reason of the server's length before it sends anything, sends it trimmed,
 * shows a refusal inside itself with what was typed still there, cannot be closed while the request is
 * out, and starts empty every time it opens.
 */

const api = vi.hoisted(() => ({
  markWontDo: vi.fn(),
  takeBackWontDo: vi.fn(),
  acceptTask: vi.fn(),
  withdrawAcceptance: vi.fn(),
}));
vi.mock("@/lib/api/projects", () => ({ projectsApi: api }));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));

import { FinishMarks } from "@/components/projects/finish-marks";

const WONT_DO = {
  at: "2026-11-10T09:00:00.000Z",
  byId: "p-05",
  byName: "Adaeze Okonkwo",
  reason: "The customer changed their mind",
};
const ACCEPTED = {
  at: "2026-11-11T14:30:00.000Z",
  byId: "p-05",
  byName: "Adaeze Okonkwo",
};
const task = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  key: "PLT-12",
  wontDo: null,
  accepted: null,
  ...over,
});
const read = (
  over: { wontDo?: unknown; accepted?: unknown } = {},
  flags = { canMarkWontDo: true, canAccept: true },
) => ({ issue: task(over), ...flags });

const onSettled = vi.fn();
const mount = (
  props: Partial<React.ComponentProps<typeof FinishMarks>> = {},
) => {
  const ui = (p: Partial<React.ComponentProps<typeof FinishMarks>>) => (
    <ToastProvider>
      <FinishMarks
        issue={task()}
        canMarkWontDo={false}
        canAccept={false}
        onSettled={onSettled}
        {...p}
      />
    </ToastProvider>
  );
  const view = render(ui(props));
  return {
    ...view,
    again: (p: Partial<React.ComponentProps<typeof FinishMarks>>) =>
      view.rerender(ui(p)),
  };
};

const day = (iso: string) => formatDateShort(iso, "Africa/Lagos");
const dialog = () => screen.getByRole("dialog");
/* A dialog that has been told to close stays in the page for its exit animation (250 ms), so "it is
   still there" is only a fact once that time has passed. */
const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 400)));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("when there is nothing to say", () => {
  it("draws nothing for a task with no mark that this reader may not mark or accept", () => {
    const { container } = mount();
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing when the marks are absent and the server said nothing at all", () => {
    const { container } = mount({
      issue: { id: "i1", key: "PLT-12" },
    });
    expect(container).toBeEmptyDOMElement();
  });
});

describe("what is shown", () => {
  it("says who closed it as won't do, and when, and the reason in their own words", () => {
    mount({ issue: task({ wontDo: WONT_DO }) });
    expect(
      screen.getByText(
        `Closed as won't do by Adaeze Okonkwo on ${day(WONT_DO.at)}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The customer changed their mind"),
    ).toBeInTheDocument();
  });

  it("says who closed it and when, and shows no reason line at all, when the API sent none", () => {
    mount({ issue: task({ wontDo: { ...WONT_DO, reason: null } }) });
    expect(
      screen.getByText(
        `Closed as won't do by Adaeze Okonkwo on ${day(WONT_DO.at)}`,
      ),
    ).toBeInTheDocument();
    const section = screen.getByRole("region", { name: "How it finished" });
    expect(section.querySelectorAll("p")).toHaveLength(1);
    expect(section.textContent).not.toMatch(/changed their mind|reason|"/i);
  });

  it("says who accepted it, and when", () => {
    mount({ issue: task({ accepted: ACCEPTED }) });
    expect(
      screen.getByText(`Accepted by Adaeze Okonkwo on ${day(ACCEPTED.at)}`),
    ).toBeInTheDocument();
  });

  it("offers no button for a reader the server says may do nothing", () => {
    mount({ issue: task({ wontDo: WONT_DO }) });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("never puts a number, a percentage or a score beside either mark", () => {
    mount({ issue: task({ wontDo: WONT_DO, accepted: ACCEPTED }) });
    expect(document.body.textContent ?? "").not.toMatch(
      /%|score|mark of|rank/i,
    );
  });
});

describe("which buttons are drawn", () => {
  it.each([
    ["only won't do", true, false, ["Won't do…"]],
    ["only accept", false, true, ["Accept"]],
    ["both", true, true, ["Won't do…", "Accept"]],
  ])(
    "for a reader who may do %s, exactly those",
    (_name, canMarkWontDo, canAccept, names) => {
      mount({ canMarkWontDo, canAccept });
      const drawn = screen.getAllByRole("button").map((b) => b.textContent);
      expect(drawn).toEqual(names);
    },
  );

  it("offers taking a won't-do back and not closing it again, once it is closed", () => {
    mount({ issue: task({ wontDo: WONT_DO }), canMarkWontDo: true });
    expect(
      screen.getByRole("button", { name: "Take back won't do" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Won't do…" }),
    ).not.toBeInTheDocument();
  });

  it("offers taking an acceptance back and not accepting again, once it is accepted", () => {
    mount({ issue: task({ accepted: ACCEPTED }), canAccept: true });
    expect(
      screen.getByRole("button", { name: "Take back acceptance" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept" }),
    ).not.toBeInTheDocument();
  });

  it("follows the server and not the marks: a mark alone offers nothing to a reader who may not", () => {
    mount({ issue: task({ accepted: ACCEPTED }), canAccept: false });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("accepting", () => {
  it("sends one accept, says so, shows who accepted at once, and tells the screen to read it again", async () => {
    api.acceptTask.mockResolvedValue(read({ accepted: ACCEPTED }));
    mount({ canAccept: true });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(api.acceptTask).toHaveBeenCalledTimes(1);
    expect(api.acceptTask).toHaveBeenCalledWith("i1");
    expect(await screen.findByText("PLT-12 accepted")).toBeInTheDocument();
    expect(
      screen.getByText(`Accepted by Adaeze Okonkwo on ${day(ACCEPTED.at)}`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Take back acceptance" }),
    ).toBeInTheDocument();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith(read({ accepted: ACCEPTED }));
  });

  it("says a refusal in the server's own sentence, changes nothing on screen, and still tells the screen to read again", async () => {
    api.acceptTask.mockRejectedValue(
      new ApiError(
        403,
        "forbidden",
        "You are not one of this person's leaders.",
      ),
    );
    mount({ canAccept: true });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(
      await screen.findByText("You are not one of this person's leaders."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(onSettled).toHaveBeenCalledWith(null);
  });

  it("takes an acceptance back with the one call for it", async () => {
    api.withdrawAcceptance.mockResolvedValue(read({}));
    mount({ issue: task({ accepted: ACCEPTED }), canAccept: true });
    await userEvent.click(
      screen.getByRole("button", { name: "Take back acceptance" }),
    );
    expect(api.withdrawAcceptance).toHaveBeenCalledWith("i1");
    expect(api.acceptTask).not.toHaveBeenCalled();
    expect(
      await screen.findByText("The acceptance of PLT-12 is taken back"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });
});

describe("taking a won't-do back", () => {
  it("sends the one call, says the task is finished work again, and shows no mark", async () => {
    api.takeBackWontDo.mockResolvedValue(read({}));
    mount({ issue: task({ wontDo: WONT_DO }), canMarkWontDo: true });
    await userEvent.click(
      screen.getByRole("button", { name: "Take back won't do" }),
    );
    expect(api.takeBackWontDo).toHaveBeenCalledWith("i1");
    expect(
      await screen.findByText("PLT-12 is finished work again"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Closed as won't do/)).not.toBeInTheDocument();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});

describe("what was just answered", () => {
  it("is dropped the moment the task holds anything else", async () => {
    api.acceptTask.mockResolvedValue(read({ accepted: ACCEPTED }));
    const view = mount({ canAccept: true });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await screen.findByText(/Accepted by Adaeze Okonkwo/);
    /* The task now says something else: somebody took the acceptance back elsewhere. */
    view.again({
      issue: task({
        accepted: { ...ACCEPTED, at: "2026-11-12T08:00:00.000Z" },
      }),
      canAccept: true,
    });
    expect(
      screen.getByText(
        `Accepted by Adaeze Okonkwo on ${day("2026-11-12T08:00:00.000Z")}`,
      ),
    ).toBeInTheDocument();
  });

  it("is not carried to another task", async () => {
    api.acceptTask.mockResolvedValue(read({ accepted: ACCEPTED }));
    const view = mount({ canAccept: true });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await screen.findByText(/Accepted by Adaeze Okonkwo/);
    view.again({ issue: task({ id: "i2", key: "PLT-13" }), canAccept: true });
    expect(screen.queryByText(/Accepted by/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });
});

describe("closing it as won't do", () => {
  const open = async () => {
    mount({ canMarkWontDo: true });
    await userEvent.click(screen.getByRole("button", { name: "Won't do…" }));
    return within(dialog());
  };
  const field = () =>
    within(dialog()).getByRole("textbox", { name: /Why is it not being done/ });
  const submit = () =>
    within(dialog()).getByRole("button", { name: "Close as won't do" });

  it("asks why, and says the task stays in its column and is no longer counted as finished", async () => {
    const body = await open();
    expect(
      body.getByText("Close as won't do", { selector: "h2" }),
    ).toBeInTheDocument();
    expect(
      body.getByText(
        "PLT-12 stays in its column and is no longer counted as finished work.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the button off until the reason is long enough, counting the trimmed text", async () => {
    await open();
    expect(submit()).toBeDisabled();
    await userEvent.type(field(), "ab");
    expect(submit()).toBeDisabled();
    await userEvent.clear(field());
    await userEvent.type(field(), "   a  ");
    expect(submit()).toBeDisabled();
    await userEvent.clear(field());
    await userEvent.type(field(), "abc");
    expect(submit()).toBeEnabled();
  });

  it("keeps the button off past 280 characters, and does not cut a pasted reason", async () => {
    await open();
    await userEvent.click(field());
    await userEvent.paste("x".repeat(281));
    expect(submit()).toBeDisabled();
    expect((field() as HTMLTextAreaElement).value).toHaveLength(281);
    expect(within(dialog()).getByText("281 of 280")).toBeInTheDocument();
  });

  it("shows no counter on a short reason", async () => {
    await open();
    await userEvent.type(field(), "Not needed any more");
    expect(within(dialog()).queryByText(/ of 280/)).not.toBeInTheDocument();
  });

  it("sends the trimmed reason once, says it, closes, and shows the mark at once", async () => {
    api.markWontDo.mockResolvedValue(read({ wontDo: WONT_DO }));
    await open();
    await userEvent.type(field(), "  The customer changed their mind  ");
    await userEvent.click(submit());
    expect(api.markWontDo).toHaveBeenCalledTimes(1);
    expect(api.markWontDo).toHaveBeenCalledWith(
      "i1",
      "The customer changed their mind",
    );
    expect(
      await screen.findByText("PLT-12 closed as won't do"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        `Closed as won't do by Adaeze Okonkwo on ${day(WONT_DO.at)}`,
      ),
    ).toBeInTheDocument();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("shows a refusal in the server's sentence inside the dialog, which stays open with what was typed", async () => {
    api.markWontDo.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "Only a finished task can be closed as won't do.",
      ),
    );
    await open();
    await userEvent.type(field(), "The customer changed their mind");
    await userEvent.click(submit());
    expect(
      await within(dialog()).findByText(
        "Only a finished task can be closed as won't do.",
      ),
    ).toBeInTheDocument();
    await settle();
    expect(dialog()).toBeInTheDocument();
    expect((field() as HTMLTextAreaElement).value).toBe(
      "The customer changed their mind",
    );
    expect(onSettled).toHaveBeenCalledWith(null);
  });

  it("clears the refusal when the person types again", async () => {
    api.markWontDo.mockRejectedValue(
      new ApiError(409, "conflict", "That task was changed a moment ago."),
    );
    await open();
    await userEvent.type(field(), "Not needed any more");
    await userEvent.click(submit());
    await within(dialog()).findByText("That task was changed a moment ago.");
    await userEvent.type(field(), "!");
    expect(
      within(dialog()).queryByText("That task was changed a moment ago."),
    ).not.toBeInTheDocument();
  });

  it("cannot be closed while the request is out, and sends nothing twice", async () => {
    let finish: (value: unknown) => void = () => undefined;
    api.markWontDo.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await open();
    await userEvent.type(field(), "Not needed any more");
    await userEvent.click(submit());
    expect(
      within(dialog()).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await settle();
    expect(dialog()).toBeInTheDocument();
    await userEvent.click(submit());
    expect(api.markWontDo).toHaveBeenCalledTimes(1);
    finish(read({ wontDo: WONT_DO }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("is a new, empty form every time it opens", async () => {
    await open();
    await userEvent.type(field(), "Half a reason");
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Won't do…" }));
    expect((field() as HTMLTextAreaElement).value).toBe("");
    expect(submit()).toBeDisabled();
  });

  it("sends nothing when it is cancelled", async () => {
    await open();
    await userEvent.type(field(), "Not needed any more");
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Cancel" }),
    );
    expect(api.markWontDo).not.toHaveBeenCalled();
  });
});

describe("what was just answered, once the task has moved and come back", () => {
  const MARK = { ...WONT_DO, reason: "Replaced by the new import" };

  it("is not believed again when the task returns to the state it was answered over", async () => {
    api.markWontDo.mockResolvedValue({
      issue: task({ wontDo: MARK }),
      canMarkWontDo: true,
      canAccept: false,
    });
    const view = mount({ canMarkWontDo: true });
    /* t1: close it as won't do. */
    await userEvent.click(screen.getByRole("button", { name: "Won't do…" }));
    await userEvent.type(
      await screen.findByLabelText(/Why is it not being done/),
      "Replaced by the new import",
    );
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Close as won't do" }),
    );
    await waitFor(() => expect(api.markWontDo).toHaveBeenCalledTimes(1));
    /* The screen reads the task again: it now carries the mark. */
    view.again({ issue: task({ wontDo: MARK }), canMarkWontDo: true });
    expect(
      screen.getByText(/Closed as won't do by Adaeze/),
    ).toBeInTheDocument();
    /* t2: somebody moves it out of Done. The server clears the mark; there is nothing to offer. */
    view.again({ issue: task(), canMarkWontDo: false });
    expect(screen.queryByText(/Closed as won't do by/)).toBeNull();
    /* t3: it is finished again. The server holds no mark on this finish, and the section must say so. */
    view.again({ issue: task(), canMarkWontDo: true });
    expect(screen.queryByText(/Closed as won't do by/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Won't do…" }),
    ).toBeInTheDocument();
  });

  it("is not believed again either after an acceptance has come and gone", async () => {
    api.acceptTask.mockResolvedValue(read({ accepted: ACCEPTED }));
    const view = mount({ canAccept: true });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await screen.findByText(/Accepted by Adaeze Okonkwo/);
    view.again({ issue: task({ accepted: ACCEPTED }), canAccept: true });
    view.again({ issue: task(), canAccept: false });
    view.again({ issue: task(), canAccept: true });
    expect(screen.queryByText(/Accepted by Adaeze Okonkwo/)).toBeNull();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });
});

describe("what a button that writes on one press says", () => {
  const MEANS =
    "Acceptance says a leader has seen it and it stands. It changes no mark.";

  it("says what accepting means, in words on the page and not behind a hover", () => {
    mount({ canAccept: true });
    expect(screen.getByText(MEANS)).toBeVisible();
    expect(screen.getByRole("button", { name: "Accept" })).not.toHaveAttribute(
      "title",
    );
  });

  it("says it beside Take back acceptance too", () => {
    mount({ issue: task({ accepted: ACCEPTED }), canAccept: true });
    expect(screen.getByText(MEANS)).toBeVisible();
  });

  it("says what taking back a won't do does", () => {
    mount({ issue: task({ wontDo: WONT_DO }), canMarkWontDo: true });
    expect(
      screen.getByText("Taking it back puts it among finished work again."),
    ).toBeVisible();
  });

  it("says nothing about acceptance to a reader who cannot accept", () => {
    mount({ canMarkWontDo: true });
    expect(screen.queryByText(MEANS)).toBeNull();
    expect(screen.queryByText(/among finished work again/)).toBeNull();
  });

  it("says nothing extra beside Won't do…, which asks before it writes", () => {
    mount({ canMarkWontDo: true });
    expect(screen.queryByText(/Taking it back/)).toBeNull();
  });
});

describe("taking an acceptance back", () => {
  it("does not say it was the reader's own acceptance: the server lets any leader of the person take it back", async () => {
    api.withdrawAcceptance.mockResolvedValue(read({}));
    mount({
      issue: task({
        accepted: { ...ACCEPTED, byId: "p-77", byName: "Somebody Else" },
      }),
      canAccept: true,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Take back acceptance" }),
    );
    expect(
      await screen.findByText("The acceptance of PLT-12 is taken back"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Your acceptance/)).toBeNull();
  });
});

describe("where focus goes", () => {
  /* A browser lets go of focus when the control is turned off under it, which is what a request being
     out does to it; jsdom does not, so say it. */
  const letGo = () => (document.activeElement as HTMLElement | null)?.blur();

  it("is on the control that took the Accept's place, after the request that turned Accept off", async () => {
    api.acceptTask.mockImplementation(async () => {
      letGo();
      return read({ accepted: ACCEPTED });
    });
    mount({ canAccept: true });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Take back acceptance" }),
      ).toHaveFocus(),
    );
  });

  it("is back on Accept when the server refused, with the sentence said", async () => {
    api.acceptTask.mockImplementation(async () => {
      letGo();
      throw new ApiError(409, "conflict", "It was reopened a moment ago.");
    });
    mount({ canAccept: true });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(
      await screen.findByText("It was reopened a moment ago."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Accept" })).toHaveFocus(),
    );
  });

  it("is on Take back won't do after the dialog has closed on a success, even where a click does not focus a button (Safari)", async () => {
    api.markWontDo.mockResolvedValue(read({ wontDo: WONT_DO }));
    mount({ canMarkWontDo: true });
    /* A press on a button does not give it focus in Safari, so when the dialog opens there is nothing
       for it to hand focus back to. `fireEvent` presses without focusing, as that does. */
    fireEvent.click(screen.getByRole("button", { name: "Won't do…" }));
    await userEvent.type(
      await screen.findByLabelText(/Why is it not being done/),
      "Replaced by the new import",
    );
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Close as won't do" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      screen.getByRole("button", { name: "Take back won't do" }),
    ).toHaveFocus();
  });

  it("is on Won't do… after Take back won't do, which it took the place of", async () => {
    api.takeBackWontDo.mockImplementation(async () => {
      letGo();
      return read({});
    });
    mount({ issue: task({ wontDo: WONT_DO }), canMarkWontDo: true });
    await userEvent.click(
      screen.getByRole("button", { name: "Take back won't do" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Won't do…" })).toHaveFocus(),
    );
  });
});

describe("a dialog that is open when the flags go", () => {
  const typeAndSend = async () => {
    await userEvent.click(screen.getByRole("button", { name: "Won't do…" }));
    await userEvent.type(
      await screen.findByLabelText(/Why is it not being done/),
      "Replaced by the new import",
    );
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Close as won't do" }),
    );
  };

  it("stays up for the length of its own request, with what was typed", async () => {
    let release: (value: unknown) => void = () => undefined;
    api.markWontDo.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const view = mount({ canMarkWontDo: true });
    await typeAndSend();
    /* The task is read again and the server says this reader may do nothing about it now. */
    view.again({ issue: task(), canMarkWontDo: false, canAccept: false });
    expect(dialog()).toBeInTheDocument();
    expect(
      (screen.getByLabelText(/Why is it not being done/) as HTMLTextAreaElement)
        .value,
    ).toBe("Replaced by the new import");
    release(read({ wontDo: WONT_DO }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("shows the server's refusal in the dialog when the answer was no, though the section behind it has gone", async () => {
    let fail: (error: unknown) => void = () => undefined;
    api.markWontDo.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const view = mount({ canMarkWontDo: true });
    await typeAndSend();
    view.again({ issue: task(), canMarkWontDo: false, canAccept: false });
    fail(
      new ApiError(
        422,
        "unprocessable",
        "Only a finished task can be closed as won't do.",
      ),
    );
    expect(
      await within(dialog()).findByText(
        "Only a finished task can be closed as won't do.",
      ),
    ).toBeInTheDocument();
  });

  it("is the person's to close when nothing is out: it goes when they cancel, and the section with it", async () => {
    const view = mount({ canMarkWontDo: true });
    await userEvent.click(screen.getByRole("button", { name: "Won't do…" }));
    view.again({ issue: task(), canMarkWontDo: false, canAccept: false });
    expect(dialog()).toBeInTheDocument();
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(view.container).toBeEmptyDOMElement();
  });
});
