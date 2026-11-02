import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmployeeAccess } from "@/lib/types";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * "Send message" on a staff record.
 *
 * Pinned here: the message goes out as a published notice for this one person
 * (`audience: PEOPLE`, their id alone), Send waits for a title and a message,
 * and somebody the API would refuse (no account, or an archived one) is told so
 * rather than sent something they cannot open. Somebody who was invited and has
 * not signed in yet is not refused, because the API takes them.
 */

const api = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/api/announcements", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/announcements")>();
  return {
    ...actual,
    announcementsApi: { ...actual.announcementsApi, create: api.create },
  };
});

const { SendMessageDialog } =
  await import("@/app/(app)/people/[id]/send-message");

const access = (state: EmployeeAccess["state"]): EmployeeAccess => ({
  state,
  expiresAt: null,
  roles: [],
});

beforeEach(() => {
  api.create.mockReset();
  api.create.mockResolvedValue({
    id: "n1",
    delivery: { notified: 1, emailing: 1 },
  });
});

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Title/), "Hello there");
  await user.type(screen.getByLabelText(/Message/), "Hi.");
}

describe("sending a staff member a message", () => {
  it("sends a published notice addressed to them alone", async () => {
    const user = userEvent.setup();
    renderInToasts(
      <SendMessageDialog
        open
        onClose={vi.fn()}
        employeeId="emp-1"
        name="Ada Okafor"
        access={access("ACCEPTED")}
      />,
    );

    const send = screen.getByRole("button", { name: "Send message" });
    expect(send).toBeDisabled();

    await user.type(screen.getByLabelText(/Title/), "Your new desk");
    await user.type(
      screen.getByLabelText(/Message/),
      "Third floor from Monday.",
    );
    expect(send).toBeEnabled();
    await user.click(send);

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create).toHaveBeenCalledWith({
      title: "Your new desk",
      body: "Third floor from Monday.",
      audience: "PEOPLE",
      employeeIds: ["emp-1"],
      publish: true,
    });
    expect(await screen.findByText("Sent to Ada Okafor")).toBeInTheDocument();
  });

  it("says nothing extra, and sends, when their access is not known", async () => {
    const user = userEvent.setup();
    renderInToasts(
      <SendMessageDialog
        open
        onClose={vi.fn()}
        employeeId="emp-1"
        name="Ada Okafor"
      />,
    );
    expect(screen.queryByText(/has not signed in yet/)).toBeNull();
    expect(screen.queryByText(/has no account yet/)).toBeNull();
    await fill(user);
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });
});

describe("somebody the API would refuse", () => {
  it("says there is no account, tells them to invite, and will not send", async () => {
    const user = userEvent.setup();
    renderInToasts(
      <SendMessageDialog
        open
        onClose={vi.fn()}
        employeeId="emp-2"
        name="Musa Bello"
        access={access("NONE")}
      />,
    );

    expect(
      screen.getByText("Musa Bello has no account yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Invite them to sign in first/),
    ).toBeInTheDocument();
    await fill(user);
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("says access is closed, does not tell them to invite, and will not send", async () => {
    const user = userEvent.setup();
    renderInToasts(
      <SendMessageDialog
        open
        onClose={vi.fn()}
        employeeId="emp-2"
        name="Musa Bello"
        access={access("DISABLED")}
      />,
    );

    expect(
      screen.getByText("Musa Bello no longer has access"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Invite them/)).toBeNull();
    await fill(user);
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });
});

describe("somebody invited who has not signed in yet", () => {
  it.each(["SENT", "EXPIRED"] as const)(
    "is told what will happen, not refused, and the message goes (%s)",
    async (state) => {
      const user = userEvent.setup();
      renderInToasts(
        <SendMessageDialog
          open
          onClose={vi.fn()}
          employeeId="emp-3"
          name="Tolu Adeyemi"
          access={access(state)}
        />,
      );

      expect(
        screen.getByText("Tolu Adeyemi has not signed in yet"),
      ).toBeInTheDocument();
      /* They were invited already: telling them to invite is wrong. */
      expect(screen.queryByText(/Invite them to sign in first/)).toBeNull();

      await fill(user);
      const send = screen.getByRole("button", { name: "Send message" });
      expect(send).toBeEnabled();
      await user.click(send);

      await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          audience: "PEOPLE",
          employeeIds: ["emp-3"],
          publish: true,
        }),
      );
    },
  );
});
