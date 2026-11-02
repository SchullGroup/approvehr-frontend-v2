import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ApiKeyResult } from "@/lib/api/performance";
import { formatDateShort } from "@/lib/time";

/**
 * A measure that is done or not done, and who may say it is.
 *
 * `tsc` cannot see these: that the person whose work it is is never offered the
 * button (a yes typed by the person being judged is the weakest evidence there
 * is, and the API refuses it anyway), that a company or department objective,
 * which has no owner, is confirmed only by somebody holding the records
 * permission, and that a failed confirmation does not throw away the note that
 * was being typed.
 */

const who = vi.hoisted(() => ({
  actingId: "emp-owner" as string | null,
  records: false,
}));

vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) =>
    permission === "EDIT_RECORDS" ? who.records : false,
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ actingId: who.actingId }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const { DoneMeasureRow, MeasureConfirmProvider } =
  await import("@/app/(app)/performance/done-measure");

const measure = (over: Partial<ApiKeyResult> = {}): ApiKeyResult =>
  ({
    id: "m-1",
    goalId: "g-1",
    label: "Both engineers hired",
    kind: "DONE",
    unit: null,
    startValue: "0",
    targetValue: "1",
    currentValue: "0",
    lowerIsBetter: false,
    percent: 0,
    met: false,
    lastReadAt: "2026-10-20T09:00:00.000Z",
    confirmedAt: null,
    confirmedByName: null,
    confirmNote: null,
    updatedAt: "2026-10-20T09:00:00.000Z",
    ...over,
  }) as ApiKeyResult;

/* The second step's button is "Confirm" with the measure's name visually hidden
   after it. jsdom has no stylesheet, so it takes that hidden span for an inline
   one and drops the space before it from the computed name; a browser makes an
   absolutely positioned span a block and keeps it. Either spelling is the same
   button, so the pattern allows both. */
const CONFIRM_NAME = /^Confirm\s*Both engineers hired$/;

type Confirm = (measureId: string, note?: string) => Promise<boolean>;
type Unconfirm = (measureId: string) => Promise<boolean>;

function show(
  row: ApiKeyResult,
  goalOwnerId: string | null,
  actions: { confirm?: Mock<Confirm>; unconfirm?: Mock<Unconfirm> } | null = {},
) {
  const confirm = actions?.confirm ?? vi.fn<Confirm>().mockResolvedValue(true);
  const unconfirm =
    actions?.unconfirm ?? vi.fn<Unconfirm>().mockResolvedValue(true);
  const list = (
    <ul>
      <DoneMeasureRow measure={row} goalOwnerId={goalOwnerId} />
    </ul>
  );
  render(
    actions === null ? (
      list
    ) : (
      <MeasureConfirmProvider value={{ confirm, unconfirm }}>
        {list}
      </MeasureConfirmProvider>
    ),
  );
  return { confirm, unconfirm };
}

beforeEach(() => {
  who.actingId = "emp-manager";
  who.records = false;
});

describe("a measure nobody has confirmed", () => {
  it("is not done yet, and says so", () => {
    show(measure(), "emp-owner");
    expect(screen.getByText("Not done yet")).toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });

  it("is not offered a Confirm button to the person whose work it is", () => {
    who.actingId = "emp-owner";
    show(measure(), "emp-owner");
    expect(
      screen.queryByRole("button", { name: /Confirm/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Your manager confirms it when it is done."),
    ).toBeInTheDocument();
  });

  it("is offered one to somebody else on a personal objective", () => {
    show(measure(), "emp-owner");
    expect(
      screen.getByRole("button", { name: /Confirm it is done/ }),
    ).toBeInTheDocument();
  });

  it("is not offered one on a company objective to somebody without the records permission", () => {
    who.records = false;
    show(measure(), null);
    expect(
      screen.queryByRole("button", { name: /Confirm/ }),
    ).not.toBeInTheDocument();
  });

  it("is offered one on a company objective to somebody who holds it", () => {
    who.records = true;
    show(measure(), null);
    expect(
      screen.getByRole("button", { name: /Confirm it is done/ }),
    ).toBeInTheDocument();
  });

  it("is offered no control at all when the screen supplied none", () => {
    show(measure(), "emp-owner", null);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("confirming it", () => {
  it("asks for an optional note or link first, and sends it", async () => {
    const user = userEvent.setup();
    const { confirm } = show(measure(), "emp-owner");

    await user.click(
      screen.getByRole("button", { name: /Confirm it is done/ }),
    );
    await user.type(
      screen.getByLabelText(/Note or link for Both engineers hired/),
      "  https://example.com/offer-letters  ",
    );
    await user.click(screen.getByRole("button", { name: CONFIRM_NAME }));

    expect(confirm).toHaveBeenCalledWith(
      "m-1",
      "https://example.com/offer-letters",
    );
  });

  it("sends no note when none was typed, rather than an empty one", async () => {
    const user = userEvent.setup();
    const { confirm } = show(measure(), "emp-owner");

    await user.click(
      screen.getByRole("button", { name: /Confirm it is done/ }),
    );
    await user.click(screen.getByRole("button", { name: CONFIRM_NAME }));

    expect(confirm).toHaveBeenCalledWith("m-1", undefined);
  });

  it("keeps the note that was typed when the confirmation did not save", async () => {
    const user = userEvent.setup();
    show(measure(), "emp-owner", {
      confirm: vi.fn<Confirm>().mockResolvedValue(false),
    });

    await user.click(
      screen.getByRole("button", { name: /Confirm it is done/ }),
    );
    const note = screen.getByLabelText(/Note or link for/);
    await user.type(note, "Signed on Friday");
    await user.click(screen.getByRole("button", { name: CONFIRM_NAME }));

    expect(note).toHaveValue("Signed on Friday");
  });

  it("closes the note box and forgets what was typed when it is cancelled", async () => {
    const user = userEvent.setup();
    const { confirm } = show(measure(), "emp-owner");

    await user.click(
      screen.getByRole("button", { name: /Confirm it is done/ }),
    );
    await user.type(screen.getByLabelText(/Note or link for/), "Never mind");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(confirm).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: /Confirm it is done/ }),
    );
    expect(screen.getByLabelText(/Note or link for/)).toHaveValue("");
  });
});

describe("a measure that has been confirmed", () => {
  const confirmed = (over: Partial<ApiKeyResult> = {}) =>
    measure({
      confirmedAt: "2026-10-22T10:30:00.000Z",
      confirmedByName: "Adaeze Okonkwo",
      confirmNote: "Offer letters at https://example.com/offers.",
      met: true,
      percent: 100,
      currentValue: "1",
      ...over,
    });

  it("is done, and says by whom and when", () => {
    show(confirmed(), "emp-owner");
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(
      screen.getByText(
        `Confirmed by Adaeze Okonkwo on ${formatDateShort("2026-10-22T10:30:00.000Z", "Africa/Lagos")}.`,
      ),
    ).toBeInTheDocument();
  });

  it("makes a link in the note a link", () => {
    show(confirmed(), "emp-owner");
    expect(
      screen.getByRole("link", { name: "https://example.com/offers" }),
    ).toHaveAttribute("href", "https://example.com/offers");
  });

  it("says nothing about who when the server did not give a name", () => {
    show(confirmed({ confirmedByName: null }), "emp-owner");
    expect(
      screen.getByText(
        `Confirmed on ${formatDateShort("2026-10-22T10:30:00.000Z", "Africa/Lagos")}.`,
      ),
    ).toBeInTheDocument();
  });

  it("can be taken back by somebody who could have confirmed it", async () => {
    const user = userEvent.setup();
    const { unconfirm } = show(confirmed(), "emp-owner");

    await user.click(screen.getByRole("button", { name: /Take it back/ }));

    expect(unconfirm).toHaveBeenCalledWith("m-1");
  });

  it("cannot be taken back by the person whose work it is", () => {
    who.actingId = "emp-owner";
    show(confirmed(), "emp-owner");
    expect(
      screen.queryByRole("button", { name: /Take it back/ }),
    ).not.toBeInTheDocument();
  });
});
