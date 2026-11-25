import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiToday } from "@/lib/api/me";

/**
 * The birthday line on the dashboard.
 *
 * The rule that matters is the one that is easy to break by being helpful:
 * **on every day but one it draws nothing**, and so does everything that is not a
 * greeting (a company that has not switched it on, an account with no employee
 * record, an API that does not have the section, a read that failed). It must not
 * turn into an error card, a "0", or an empty row, and it must never show a date
 * or an age. The API is faked at its edge, so what is held here is the
 * translation from a section answer to the screen.
 */

const api = vi.hoisted(() => ({ today: vi.fn() }));
const session = vi.hoisted(() => ({ connected: true }));
const revalidation = vi.hoisted(() => ({ n: 0 }));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: session.connected }),
}));
vi.mock("@/lib/revalidate", () => ({
  useRevalidation: () => revalidation.n,
}));
vi.mock("@/lib/api/me", async (original) => ({
  ...(await original<typeof import("@/lib/api/me")>()),
  meApi: { today: api.today, appOpen: vi.fn() },
}));

const { BirthdayLine } = await import("@/app/(app)/dashboard/birthday-line");

const TITLE = "Happy birthday, Ada";
const MESSAGE =
  "Everyone at Schulltech wishes you a happy birthday. We hope today goes well for you.";

const answer = (birthday: unknown): ApiToday =>
  ({
    asOf: "2026-11-23T09:00:00.000Z",
    sections: birthday === undefined ? {} : { birthday },
  }) as ApiToday;

const onTheDay = () =>
  answer({
    status: "ok",
    data: { greeting: { title: TITLE, message: MESSAGE } },
  });

beforeEach(() => {
  vi.clearAllMocks();
  session.connected = true;
  revalidation.n = 0;
});

/** Settle the one read, then say whether anything at all was drawn. */
async function drawsNothing(container: HTMLElement) {
  await waitFor(() => expect(api.today).toHaveBeenCalled());
  /* Let the answer land. */
  await act(async () => {});
  expect(container).toBeEmptyDOMElement();
}

describe("on the day", () => {
  it("draws the API's title and message as they came, and nothing else", async () => {
    api.today.mockResolvedValue(onTheDay());
    const { container } = render(<BirthdayLine />);
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(container.textContent).toBe(`${TITLE}${MESSAGE}`);
  });

  it("asks for the birthday section alone, never the whole panel", async () => {
    api.today.mockResolvedValue(onTheDay());
    render(<BirthdayLine />);
    await screen.findByText(TITLE);
    expect(api.today).toHaveBeenCalledTimes(1);
    expect(api.today.mock.calls[0]?.[0]).toEqual(["birthday"]);
  });

  it("is not a control, a heading or a status: there is nothing to press or clear", async () => {
    api.today.mockResolvedValue(onTheDay());
    const { container } = render(<BirthdayLine />);
    await screen.findByText(TITLE);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelector("button, a, [role='alert']")).toBeNull();
  });

  it("shows no date, year or age, and draws nothing the API added beyond the two sentences", async () => {
    api.today.mockResolvedValue(
      answer({
        status: "ok",
        data: {
          greeting: {
            title: TITLE,
            message: MESSAGE,
            /* Not in the contract. A client must not draw what it was not given. */
            dateOfBirth: "1991-11-23",
            age: 35,
            year: 1991,
          },
          count: 3,
        },
      }),
    );
    const { container } = render(<BirthdayLine />);
    await screen.findByText(TITLE);
    expect(container.textContent).toBe(`${TITLE}${MESSAGE}`);
    expect(container.textContent).not.toMatch(/1991|\b35\b|\b3\b/);
  });
});

describe("on every other day, and for everything that is not a greeting, nothing is drawn", () => {
  it("draws nothing when the greeting is null, which is the ordinary day", async () => {
    api.today.mockResolvedValue(
      answer({ status: "ok", data: { greeting: null } }),
    );
    const { container } = render(<BirthdayLine />);
    await drawsNothing(container);
  });

  it.each(["feature_off", "no_staff_record"] as const)(
    "draws nothing when the section is unavailable (%s)",
    async (reason) => {
      api.today.mockResolvedValue(answer({ status: "unavailable", reason }));
      const { container } = render(<BirthdayLine />);
      await drawsNothing(container);
    },
  );

  it("draws nothing, and no error, when the section itself failed", async () => {
    api.today.mockResolvedValue(
      answer({
        status: "error",
        code: "section_failed",
        message: "That could not be read just now.",
      }),
    );
    const { container } = render(<BirthdayLine />);
    await drawsNothing(container);
    expect(screen.queryByText(/could not/i)).toBeNull();
  });

  it("draws nothing when an API one deploy behind sends no birthday section", async () => {
    api.today.mockResolvedValue(answer(undefined));
    const { container } = render(<BirthdayLine />);
    await drawsNothing(container);
  });

  it("draws nothing, and no error, when the route is missing or the read fails", async () => {
    api.today.mockRejectedValue(new ApiError(404, "not_found", "Not found."));
    const missing = render(<BirthdayLine />);
    await drawsNothing(missing.container);
    missing.unmount();

    api.today.mockClear();
    api.today.mockRejectedValue(new Error("network down"));
    const down = render(<BirthdayLine />);
    await drawsNothing(down.container);
    expect(screen.queryByText(/went wrong|could not|try again/i)).toBeNull();
  });

  it.each([
    ["an empty title", { title: "", message: MESSAGE }],
    ["a blank message", { title: TITLE, message: "   " }],
    ["a message that is not text", { title: TITLE, message: 42 }],
    ["no message at all", { title: TITLE }],
    ["a greeting that is not an object", "Happy birthday"],
  ])("is not a greeting with %s, so nothing is drawn", async (_, greeting) => {
    api.today.mockResolvedValue(answer({ status: "ok", data: { greeting } }));
    const { container } = render(<BirthdayLine />);
    await drawsNothing(container);
  });

  it("asks nobody and draws nothing with no server to ask", async () => {
    session.connected = false;
    const { container } = render(<BirthdayLine />);
    await act(async () => {});
    expect(api.today).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});

describe("a tab left open past midnight", () => {
  it("shows the greeting when the next read says it is the day, and clears it when the day is over", async () => {
    api.today.mockResolvedValueOnce(
      answer({ status: "ok", data: { greeting: null } }),
    );
    const view = render(<BirthdayLine />);
    await act(async () => {});
    expect(view.container).toBeEmptyDOMElement();

    /* Back to the window after midnight: the store is asked again. */
    api.today.mockResolvedValueOnce(onTheDay());
    revalidation.n = 1;
    view.rerender(<BirthdayLine />);
    expect(await screen.findByText(TITLE)).toBeInTheDocument();

    /* And the next day it is gone, even though nothing was ever dismissed. */
    api.today.mockResolvedValueOnce(
      answer({ status: "ok", data: { greeting: null } }),
    );
    revalidation.n = 2;
    view.rerender(<BirthdayLine />);
    await waitFor(() => expect(view.container).toBeEmptyDOMElement());
  });

  it("does not keep a greeting across a read that failed", async () => {
    api.today.mockResolvedValueOnce(onTheDay());
    const view = render(<BirthdayLine />);
    expect(await screen.findByText(TITLE)).toBeInTheDocument();

    api.today.mockRejectedValueOnce(new Error("network down"));
    revalidation.n = 1;
    view.rerender(<BirthdayLine />);
    await waitFor(() => expect(view.container).toBeEmptyDOMElement());
  });

  it("does not let a slow answer for an earlier read overwrite a newer one", async () => {
    let late: (value: ApiToday) => void = () => {};
    api.today.mockImplementationOnce(
      () =>
        new Promise<ApiToday>((resolve) => {
          late = resolve;
        }),
    );
    const view = render(<BirthdayLine />);

    api.today.mockResolvedValueOnce(
      answer({ status: "ok", data: { greeting: null } }),
    );
    revalidation.n = 1;
    view.rerender(<BirthdayLine />);
    await act(async () => {});

    /* The first read, answered after the second: yesterday's news. */
    await act(async () => {
      late(onTheDay());
    });
    expect(view.container).toBeEmptyDOMElement();
  });
});
