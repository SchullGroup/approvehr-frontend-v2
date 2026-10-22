import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiSmsChange, ApiSmsMe } from "@/lib/api/sms";

/**
 * The employee's own card: the one place a person says yes to a weekly text, and
 * the place they say stop.
 *
 * What is pinned is what the rules need to be true on the screen. Nobody is opted
 * in without the wording in front of them and a box ticked. Opting out is one
 * press. The card says in a sentence, not behind an icon, when what it shows
 * cannot actually reach a phone. And it is not there at all when it has nothing to
 * offer, which for most companies is always.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/api/sms", async (original) => ({
  ...(await original<typeof import("@/lib/api/sms")>()),
  smsApi: {
    me: vi.fn(),
    optIn: vi.fn(),
    optOut: vi.fn(),
  },
}));

const { smsApi } = await import("@/lib/api/sms");
const { TextMessagesCard } =
  await import("@/app/(app)/profile/text-messages-card");

const WORDING =
  "I agree that Acme Ltd may send me a weekly text message from ApproveHR " +
  "showing how many policies, shifts and notices are waiting for me.";

const me = (over: Partial<ApiSmsMe> = {}): ApiSmsMe => ({
  enabledForOrganisation: true,
  state: "NOT_SUBSCRIBED",
  phoneMasked: null,
  optedInAt: null,
  canReceive: false,
  note: "You are not receiving the weekly text. You can switch it on below.",
  consent: { version: "2026-10-v1", text: WORDING },
  numberStopped: false,
  ...over,
});

const change = (over: Partial<ApiSmsChange> = {}): ApiSmsChange => ({
  state: "OPTED_IN",
  changed: true,
  phoneMasked: "+234******4567",
  confirmationQueued: false,
  note: "Switched on. No text-message provider is connected yet, so nothing will be sent until one is.",
  ...over,
});

beforeEach(() => {
  vi.mocked(smsApi.me).mockReset();
  vi.mocked(smsApi.optIn).mockReset();
  vi.mocked(smsApi.optOut).mockReset();
});

function mount(phone: string | null = "0803 123 4567") {
  return render(<TextMessagesCard phone={phone} />);
}

describe("when it has nothing to offer", () => {
  it("is not there for a company that has not switched the weekly text on", async () => {
    vi.mocked(smsApi.me).mockResolvedValue(
      me({ enabledForOrganisation: false }),
    );
    const { container } = mount();
    await waitFor(() => expect(smsApi.me).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("is not there on an API that has no text message routes", async () => {
    vi.mocked(smsApi.me).mockRejectedValue(
      new ApiError(404, "not_found", "That is not here."),
    );
    const { container } = mount();
    await waitFor(() => expect(smsApi.me).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("stays for somebody who is opted in after the company switches it off, so they can still stop it", async () => {
    vi.mocked(smsApi.me).mockResolvedValue(
      me({
        enabledForOrganisation: false,
        state: "OPTED_IN",
        phoneMasked: "+234******4567",
        optedInAt: "2026-10-12T09:00:00.000Z",
      }),
    );
    mount();
    expect(
      await screen.findByRole("button", { name: "Opt out" }),
    ).toBeInTheDocument();
  });
});

describe("a read that failed", () => {
  it("says it did not load, and is not an offer to opt in", async () => {
    vi.mocked(smsApi.me).mockRejectedValue(
      new ApiError(500, "internal", "Something went wrong on our side."),
    );
    mount();
    expect(
      await screen.findByText("Your text message settings did not load"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Opt in" }),
    ).not.toBeInTheDocument();
  });
});

describe("opting in", () => {
  it("needs the wording read and the box ticked, and sends exactly what was shown", async () => {
    vi.mocked(smsApi.me).mockResolvedValue(me());
    vi.mocked(smsApi.optIn).mockResolvedValue(change());
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("button", { name: "Opt in" }));
    const dialog = await screen.findByRole("dialog");

    /* The wording is the label of the box, word for word. */
    expect(within(dialog).getByText(WORDING)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Opt in" });
    expect(confirm).toBeDisabled();

    /* The number on their record is offered, and is theirs to correct. */
    const number = within(dialog).getByLabelText(/your mobile number/i);
    expect(number).toHaveValue("0803 123 4567");
    await user.clear(number);
    await user.type(number, "0701 234 5678");

    await user.click(within(dialog).getByRole("checkbox"));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(smsApi.optIn).toHaveBeenCalledWith({
      phone: "0701 234 5678",
      textVersion: "2026-10-v1",
      acknowledged: true,
    });
  });

  it("is not possible without a number to confirm", async () => {
    vi.mocked(smsApi.me).mockResolvedValue(me());
    const user = userEvent.setup();
    mount(null);

    await user.click(await screen.findByRole("button", { name: "Opt in" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox"));
    expect(
      within(dialog).getByRole("button", { name: "Opt in" }),
    ).toBeDisabled();
  });

  it("puts the API's refusal in the dialog, in its own words, and does not close", async () => {
    vi.mocked(smsApi.me).mockResolvedValue(me());
    vi.mocked(smsApi.optIn).mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "That does not look like a Nigerian mobile number. Use a number like 0803 123 4567 or +234 803 123 4567.",
      ),
    );
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("button", { name: "Opt in" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Opt in" }));

    expect(
      await within(dialog).findByText(/does not look like a Nigerian mobile/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("is closed to a number that has said stop, and says so", async () => {
    vi.mocked(smsApi.me).mockResolvedValue(
      me({
        numberStopped: true,
        note: "That number has opted out of ApproveHR text messages. To receive them again, contact ApproveHR support.",
      }),
    );
    mount();

    expect(
      await screen.findByText(/contact ApproveHR support/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opt in" })).toBeDisabled();
  });
});

describe("being opted in", () => {
  const optedIn = (over: Partial<ApiSmsMe> = {}) =>
    me({
      state: "OPTED_IN",
      phoneMasked: "+234******4567",
      optedInAt: "2026-10-12T09:00:00.000Z",
      ...over,
    });

  it("says plainly that nothing is being sent when no provider is connected, and shows the number masked and the wording version", async () => {
    vi.mocked(smsApi.me).mockResolvedValue(
      optedIn({
        note: "You have opted in, but ApproveHR has no text-message provider connected yet, so nothing is being sent.",
      }),
    );
    mount();

    expect(
      await screen.findByText(/so nothing is being sent/i),
    ).toBeInTheDocument();
    expect(screen.getByText("+234******4567")).toBeInTheDocument();
    expect(screen.getByText("2026-10-v1")).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument();
    /* Opting in again is not offered to somebody who already has. */
    expect(
      screen.queryByRole("button", { name: "Opt in" }),
    ).not.toBeInTheDocument();
  });

  it("stops in one press, with no confirmation", async () => {
    vi.mocked(smsApi.me).mockResolvedValue(optedIn({ canReceive: true }));
    vi.mocked(smsApi.optOut).mockResolvedValue(
      change({
        state: "OPTED_OUT",
        note: "You will not get any more text messages.",
      }),
    );
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("button", { name: "Opt out" }));

    expect(smsApi.optOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the card on screen while it asks again after an opt-out, then shows the new state", async () => {
    let answer: (value: ApiSmsMe) => void = () => undefined;
    vi.mocked(smsApi.me)
      .mockResolvedValueOnce(optedIn({ canReceive: true }))
      .mockReturnValueOnce(
        new Promise<ApiSmsMe>((resolve) => {
          answer = resolve;
        }),
      );
    vi.mocked(smsApi.optOut).mockResolvedValue(change({ state: "OPTED_OUT" }));
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole("button", { name: "Opt out" }));
    await waitFor(() => expect(smsApi.me).toHaveBeenCalledTimes(2));

    /* The second answer is still on its way: what was there stays. */
    expect(screen.getByRole("button", { name: "Opt out" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    answer(me({ state: "OPTED_OUT", phoneMasked: "+234******4567" }));
    expect(
      await screen.findByRole("button", { name: "Opt in" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Opted out")).toBeInTheDocument();
  });
});
