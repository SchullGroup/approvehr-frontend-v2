import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * "Send message" on a staff record.
 *
 * Pinned here: the message goes out as a published notice for this one person
 * (`audience: PEOPLE`, their id alone), Send waits for a title and a message,
 * and somebody who cannot sign in is told so rather than sent something they
 * cannot open.
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

beforeEach(() => {
  api.create.mockReset();
  api.create.mockResolvedValue({
    id: "n1",
    delivery: { notified: 1, emailing: 1 },
  });
});

describe("sending a staff member a message", () => {
  it("sends a published notice addressed to them alone", async () => {
    const user = userEvent.setup();
    renderInToasts(
      <SendMessageDialog
        open
        onClose={vi.fn()}
        employeeId="emp-1"
        name="Ada Okafor"
        canSignIn
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

  it("says so, and will not send, when they cannot sign in", async () => {
    const user = userEvent.setup();
    renderInToasts(
      <SendMessageDialog
        open
        onClose={vi.fn()}
        employeeId="emp-2"
        name="Musa Bello"
        canSignIn={false}
      />,
    );

    expect(
      screen.getByText("Musa Bello cannot sign in yet"),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Title/), "Hello there");
    await user.type(screen.getByLabelText(/Message/), "Hi.");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });
});
