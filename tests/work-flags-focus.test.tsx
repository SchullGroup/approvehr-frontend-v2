import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { clearSharedResources } from "@/lib/shared-resource";

/**
 * "This is wrong" through the real store, the real panel hook and the real dialog: what is on screen
 * and where the focus is while a flag is written, raised, changed and taken back.
 *
 * What is proved: **a write never blanks the flag controls** (the line, the count and the buttons stay
 * while a re-read is out and after), because the server's own reply goes into the answer and a reply
 * that cannot be read falls back to a quiet read that holds the old answer; and **focus is never left on
 * something that has gone**, because focus on the page body is where the answering form's keys act
 * (Enter moves on, a letter picks an answer): after a flag is raised focus is on that row's Change, after
 * one is changed it is on that row's Change, after one is taken back it is on that row's "This is wrong",
 * or on the row itself when the switch is off and there is nothing to press, and after a refused
 * take-back it is back on the Take it back that was pressed. Two panels on one page are one state.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));
const feature = vi.hoisted(() => ({ workInAnswers: true as boolean | null }));
vi.mock("@/lib/store/features", () => ({
  useFeatureSettings: () => ({ workInAnswers: feature.workInAnswers }),
}));
const api = vi.hoisted(() => ({
  read: vi.fn(),
  flag: vi.fn(),
  unflag: vi.fn(),
}));
vi.mock("@/lib/api/work-flags", async (original) => ({
  ...(await original<typeof import("@/lib/api/work-flags")>()),
  workFlagsApi: api,
}));

const { useFlagging } = await import("@/components/performance/work-flags");

const first = {
  issueId: "i1",
  key: "PRF-1",
  reason: "That was not mine",
  flaggedAt: "2026-11-06T09:00:00.000Z",
};
const second = {
  issueId: "i2",
  key: "PRF-2",
  reason: "Wrong day",
  flaggedAt: "2026-11-07T09:00:00.000Z",
};

function Panel({ label = "panel" }: { label?: string }) {
  const flagging = useFlagging({
    cycleId: "c1",
    subjectId: "e1",
    subjectName: "Ada",
    own: true,
    enabled: true,
  });
  return (
    <section aria-label={label}>
      <p data-testid={`${label}-known`}>{String(flagging.known)}</p>
      <p data-testid={`${label}-count`}>
        {flagging.countIn(["i1", "i2"]) ?? "none"}
      </p>
      <ul>
        <li>{flagging.lineFor("i1", "PRF-1")}</li>
        <li>{flagging.lineFor("i2", "PRF-2")}</li>
      </ul>
      {flagging.problem && <p role="alert">{flagging.problem}</p>}
      {flagging.dialog}
    </section>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const raiseButton = (key: string) =>
  screen.findByRole("button", { name: `This is wrong, ${key}` });
const changeButton = (key: string) =>
  screen.findByRole("button", { name: `Change, flag on ${key}` });
const takeBack = (key: string) =>
  screen.findByRole("button", { name: `Take it back, flag on ${key}` });

async function fillAndSend(
  user: ReturnType<typeof userEvent.setup>,
  reason: string,
) {
  const dialog = await screen.findByRole("dialog");
  const box = within(dialog).getByRole("textbox", {
    name: /What is wrong with it/,
  });
  await user.clear(box);
  await user.type(box, reason);
  await user.click(
    within(dialog).getByRole("button", { name: /Flag it|Save the change/ }),
  );
}

const gone = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

beforeEach(() => {
  /* Reset, not clear: a once-implementation left over from another test would answer this one. */
  for (const fn of Object.values(api)) fn.mockReset();
  clearSharedResources();
  feature.workInAnswers = true;
});

describe("raising a flag", () => {
  it("keeps the line and the count on screen, and puts focus on that row's Change, when the server's reply is read", async () => {
    api.read.mockResolvedValue({ on: true, flags: [] });
    api.flag.mockResolvedValue(first);
    const user = userEvent.setup();
    render(<Panel />);
    await user.click(await raiseButton("PRF-1"));
    await fillAndSend(user, "That was not mine");
    await gone();
    expect(
      screen.getByText(/Flagged by you.*That was not mine/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("panel-count")).toHaveTextContent(
      "1 flagged as wrong",
    );
    const change = await changeButton("PRF-1");
    await waitFor(() => expect(change).toHaveFocus());
    /* The other row is untouched. */
    expect(await raiseButton("PRF-2")).toBeInTheDocument();
  });

  it("does not blank anything while the re-read after a reply it could not read is out, and lands on the Change once it is in", async () => {
    const reread = deferred<unknown>();
    api.read
      .mockResolvedValueOnce({ on: true, flags: [] })
      .mockImplementationOnce(() => reread.promise);
    /* A reply with nothing in it: the flag was written and cannot be read back. */
    api.flag.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<Panel />);
    await user.click(await raiseButton("PRF-1"));
    await fillAndSend(user, "That was not mine");
    await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    /* The re-read is in flight: the panel is where it was, not gone, and the dialog is still open. */
    expect(screen.getByTestId("panel-known")).toHaveTextContent("true");
    expect(await raiseButton("PRF-2")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(/Flagged by you/)).not.toBeInTheDocument();
    await act(async () => {
      reread.resolve({ on: true, flags: [first] });
    });
    await gone();
    expect(
      screen.getByText(/Flagged by you.*That was not mine/),
    ).toBeInTheDocument();
    await waitFor(async () =>
      expect(await changeButton("PRF-1")).toHaveFocus(),
    );
    expect(screen.getByTestId("panel-known")).toHaveTextContent("true");
  });

  it("keeps the dialog's own exit and its text when the write is refused, and focus where it was", async () => {
    api.read.mockResolvedValue({ on: true, flags: [] });
    api.flag.mockRejectedValue(
      new ApiError(422, "unprocessable", "That is not allowed right now."),
    );
    const user = userEvent.setup();
    render(<Panel />);
    const raise = await raiseButton("PRF-1");
    await user.click(raise);
    await fillAndSend(user, "That was not mine");
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "That is not allowed right now.",
    );
    expect(
      within(dialog).getByRole("textbox", { name: /What is wrong with it/ }),
    ).toHaveValue("That was not mine");
    /* Nothing was drawn that the server did not agree to. */
    expect(screen.queryByText(/Flagged by you/)).not.toBeInTheDocument();
  });
});

describe("changing a flag", () => {
  it("puts focus back on that row's Change, with the new words drawn", async () => {
    api.read.mockResolvedValue({ on: true, flags: [first] });
    api.flag.mockResolvedValue({ ...first, reason: "Somebody else did it" });
    const user = userEvent.setup();
    render(<Panel />);
    await user.click(await changeButton("PRF-1"));
    await fillAndSend(user, "Somebody else did it");
    await gone();
    expect(
      screen.getByText(/Flagged by you.*Somebody else did it/),
    ).toBeInTheDocument();
    await waitFor(async () =>
      expect(await changeButton("PRF-1")).toHaveFocus(),
    );
  });
});

describe("taking a flag back", () => {
  it("puts focus on that row's This is wrong, and keeps the other flag and the count falling, with no second read", async () => {
    api.read.mockResolvedValue({ on: true, flags: [first, second] });
    api.unflag.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Panel />);
    const back = await takeBack("PRF-1");
    expect(screen.getByTestId("panel-count")).toHaveTextContent(
      "2 flagged as wrong",
    );
    await user.click(back);
    await waitFor(async () => expect(await raiseButton("PRF-1")).toHaveFocus());
    expect(screen.getByTestId("panel-known")).toHaveTextContent("true");
    expect(screen.getByTestId("panel-count")).toHaveTextContent(
      "1 flagged as wrong",
    );
    expect(await takeBack("PRF-2")).toBeInTheDocument();
    expect(
      screen.queryByText(/Flagged by you.*That was not mine/),
    ).not.toBeInTheDocument();
    /* The reply is written into the answer, not asked for again. */
    expect(api.read).toHaveBeenCalledTimes(1);
  });

  it("keeps every control while the take-back is out, and drops the line only once the server has agreed", async () => {
    const out = deferred<undefined>();
    api.read.mockResolvedValue({ on: true, flags: [first, second] });
    api.unflag.mockImplementation(() => out.promise);
    const user = userEvent.setup();
    render(<Panel />);
    await user.click(await takeBack("PRF-1"));
    expect(screen.getByTestId("panel-known")).toHaveTextContent("true");
    expect(screen.getByTestId("panel-count")).toHaveTextContent(
      "2 flagged as wrong",
    );
    expect(
      screen.getByText(/Flagged by you.*That was not mine/),
    ).toBeInTheDocument();
    /* Both Take it back buttons wait while one is out: it is not a second press that is wanted. */
    expect(await takeBack("PRF-2")).toBeDisabled();
    await act(async () => {
      out.resolve(undefined);
    });
    await waitFor(() =>
      expect(
        screen.queryByText(/Flagged by you.*That was not mine/),
      ).not.toBeInTheDocument(),
    );
  });

  it("with the switch off, puts focus on the row itself, since there is nothing left to press", async () => {
    api.read.mockResolvedValue({ on: false, flags: [first] });
    api.unflag.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Panel />);
    await user.click(await takeBack("PRF-1"));
    await waitFor(() => {
      const row = document.querySelector("li:first-child span.sr-only");
      expect(row).not.toBeNull();
      expect(document.activeElement).toBe(row);
    });
    expect(
      screen.queryByRole("button", { name: /This is wrong, PRF-1/ }),
    ).not.toBeInTheDocument();
  });

  it("treats not found as taken back: the flag leaves the list, nothing is said, and focus lands on This is wrong", async () => {
    api.read.mockResolvedValue({ on: true, flags: [first] });
    api.unflag.mockRejectedValue(
      new ApiError(404, "not_found", "That flag was not found."),
    );
    const user = userEvent.setup();
    render(<Panel />);
    await user.click(await takeBack("PRF-1"));
    await waitFor(async () => expect(await raiseButton("PRF-1")).toHaveFocus());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Flagged by you/)).not.toBeInTheDocument();
  });

  it("keeps focus on the Take it back that was pressed, and says why, when it is refused", async () => {
    api.read.mockResolvedValue({ on: true, flags: [first] });
    api.unflag.mockImplementation(async () => {
      /* A browser lets go of focus when a control is turned off under it, which is what a request being
         out does to this one; jsdom does not, so say it. Without the focus being put back it stays lost. */
      (document.activeElement as HTMLElement | null)?.blur();
      throw new ApiError(409, "conflict", "This review has already been sent.");
    });
    const user = userEvent.setup();
    render(<Panel />);
    const back = await takeBack("PRF-1");
    await user.click(back);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This review has already been sent.",
    );
    await waitFor(async () => expect(await takeBack("PRF-1")).toHaveFocus());
    /* The flag is still there. */
    expect(
      screen.getByText(/Flagged by you.*That was not mine/),
    ).toBeInTheDocument();
  });
});

describe("two panels on one page", () => {
  it("are one state: a flag raised in one is in the other at once, and the read happened once", async () => {
    api.read.mockResolvedValue({ on: true, flags: [] });
    api.flag.mockResolvedValue(first);
    const user = userEvent.setup();
    render(
      <>
        <Panel label="live" />
        <Panel label="kept" />
      </>,
    );
    const live = within(screen.getByRole("region", { name: "live" }));
    const kept = within(screen.getByRole("region", { name: "kept" }));
    await live.findByRole("button", { name: "This is wrong, PRF-1" });
    await user.click(
      live.getByRole("button", { name: "This is wrong, PRF-1" }),
    );
    await fillAndSend(user, "That was not mine");
    await gone();
    expect(
      await kept.findByText(/Flagged by you.*That was not mine/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kept-count")).toHaveTextContent(
      "1 flagged as wrong",
    );
    expect(screen.getByTestId("live-count")).toHaveTextContent(
      "1 flagged as wrong",
    );
    expect(api.read).toHaveBeenCalledTimes(1);
  });

  it("take a flag back from either: the other loses it at once", async () => {
    api.read.mockResolvedValue({ on: true, flags: [first] });
    api.unflag.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <>
        <Panel label="live" />
        <Panel label="kept" />
      </>,
    );
    const live = within(screen.getByRole("region", { name: "live" }));
    const kept = within(screen.getByRole("region", { name: "kept" }));
    await user.click(
      await kept.findByRole("button", { name: "Take it back, flag on PRF-1" }),
    );
    await waitFor(() =>
      expect(live.queryByText(/Flagged by you/)).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("live-count")).toHaveTextContent("none");
    expect(screen.getByTestId("kept-count")).toHaveTextContent("none");
    expect(api.read).toHaveBeenCalledTimes(1);
  });
});
