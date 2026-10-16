import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { belowRow, fakeGateway } from "./screening-helpers";

/**
 * The list of people below the pass mark, where a person confirms.
 *
 * What these hold: it says nobody is rejected until you confirm, every row says why
 * it is there, ticking everything shown offers everyone matching with the exact
 * count and asks, rejecting needs a reason from the company's list, the decline
 * email tick starts off and only a ticked box sends it, a person can keep somebody
 * in the running with a reason that is required, and rows that were decided drop
 * off the list.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/hiring/postings/demo-advert-req-01/below-pass-mark",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: false, isLoading: false, user: null }),
  useOrgTimezone: () => "Africa/Lagos",
}));
const current = { gateway: fakeGateway() };
vi.mock("@/lib/hiring/screening/use-gateway", () => ({
  useScreeningGateway: () => current.gateway,
}));
vi.mock("@/lib/hiring/pipeline/use-pipeline", () => ({
  useRejectionReasons: () => ({
    items: [
      {
        id: "r1",
        label: "Does not meet the requirements for the role",
        active: true,
      },
      { id: "r2", label: "Not enough relevant experience", active: true },
    ],
    loading: false,
    error: null,
    reload: () => undefined,
  }),
}));
const readiness = {
  data: {
    supported: true,
    enabled: true,
    willSend: true,
    blockedBy: [] as string[],
    sender: null,
  },
};
vi.mock("@/lib/hiring/pipeline/use-comms", () => ({
  useEmailReadiness: () => ({
    data: readiness.data,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
}));

const { BelowScreen } =
  await import("@/app/(app)/hiring/postings/[id]/below-pass-mark/below-screen");

const open = () =>
  render(
    <ToastProvider>
      <BelowScreen id="demo-advert-req-01" />
    </ToastProvider>,
  );

const ready = () => screen.findByText("Applicant 1");

const bar = () =>
  screen.getByRole("region", {
    name: "Actions for the people you have selected",
  });

/** A list of 412 of which the first page of two is shown. */
function bigList() {
  const rows = [belowRow(1), belowRow(2)];
  current.gateway.below.list.mockImplementation(async () => ({
    rows,
    total: 412,
    next: "page-2",
  }));
}

beforeEach(() => {
  current.gateway = fakeGateway();
  readiness.data = {
    supported: true,
    enabled: true,
    willSend: true,
    blockedBy: [],
    sender: null,
  };
  current.gateway.below.reject.mockImplementation(async (request) => ({
    requested: request.target.kind === "ids" ? request.target.ids.length : 412,
    done: request.target.kind === "ids" ? request.target.ids.length : 412,
    skipped: 0,
    refused: [],
    emailed: request.decision.sendEmails ? 3 : null,
    emailNote: null,
  }));
});

describe("what it says", () => {
  it("says nobody is rejected until you confirm", async () => {
    open();
    await ready();
    expect(
      screen.getByText(
        /These people are below the pass mark\. Nobody is rejected until you confirm\./,
      ),
    ).toBeInTheDocument();
  });

  it("says why each person is here, and which answers raised a flag", async () => {
    current.gateway.below.list.mockImplementation(async () => ({
      rows: [
        belowRow(1, {
          reasons: [
            { kind: "FIT", text: "Fit 31, and the pass mark is 50" },
            { kind: "KNOCKOUT", text: "One answer raised a flag" },
          ],
          flagged: [{ question: "Right to work in Nigeria?", answer: "No" }],
        }),
      ],
      total: 1,
      next: null,
    }));
    open();
    await ready();
    expect(
      screen.getByText("Fit 31, and the pass mark is 50"),
    ).toBeInTheDocument();
    expect(screen.getByText("One answer raised a flag")).toBeInTheDocument();
    expect(screen.getByText(/Right to work in Nigeria\?/)).toBeInTheDocument();
    expect(screen.getByText(/Answered No\./)).toBeInTheDocument();
    expect(screen.getAllByText("Below the pass mark").length).toBeGreaterThan(
      0,
    );
  });

  it("shows the score, the assessment and the count of those waiting in the header", async () => {
    current.gateway.below.list.mockImplementation(async () => ({
      rows: [
        belowRow(1, { summary: { ...belowRow(1).summary, assessment: 44 } }),
      ],
      total: 1,
      next: null,
    }));
    open();
    await ready();
    expect(screen.getByText("Fit 31")).toBeInTheDocument();
    expect(screen.getByText("Assessment 44")).toBeInTheDocument();
    expect(await screen.findByText("412 of 4,210 waiting")).toBeInTheDocument();
  });

  it("opens the explanation of a score only when asked", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    expect(current.gateway.explanation).not.toHaveBeenCalled();
    await user.click(
      screen.getAllByRole("button", {
        name: "How this score was worked out",
      })[0] as HTMLElement,
    );
    await waitFor(() =>
      expect(current.gateway.explanation).toHaveBeenCalledTimes(1),
    );
  });

  it("asks for a pass mark when there is none, rather than saying nobody is below one", async () => {
    current.gateway = fakeGateway({
      passMark: {
        ...fakeGateway().passMark,
        get: vi.fn(async () => ({
          fitMin: null,
          assessmentMin: null,
          assessmentMax: 100,
          knockouts: [],
          version: null,
        })),
      },
      below: {
        ...fakeGateway().below,
        list: vi.fn(async () => ({ rows: [], total: 0, next: null })),
      },
    });
    open();
    expect(
      await screen.findByText("There is no pass mark yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Set a pass mark" }),
    ).toHaveAttribute(
      "href",
      "/hiring/postings/demo-advert-req-01?tab=screening",
    );
  });

  it("says nobody is below it when there is a pass mark and the list is empty", async () => {
    current.gateway.below.list.mockImplementation(async () => ({
      rows: [],
      total: 0,
      next: null,
    }));
    open();
    expect(
      await screen.findByText("Nobody is below the pass mark"),
    ).toBeInTheDocument();
  });
});

describe("narrowing it", () => {
  it("asks for one reason at a time", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Below because of" }),
      "A flagged answer",
    );
    await waitFor(() =>
      expect(current.gateway.below.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ filters: { reason: "KNOCKOUT" } }),
        expect.anything(),
      ),
    );
    expect(await screen.findByText("Below because of")).toBeInTheDocument();
  });
});

describe("selecting", () => {
  it("offers everyone matching, with the exact count, only once all shown are ticked", async () => {
    bigList();
    const user = userEvent.setup();
    open();
    await ready();
    expect(
      screen.queryByRole("button", { name: /Select all 412 matching/ }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: "Select everyone shown" }),
    );
    expect(within(bar()).getByText("2 people selected")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Select all 412 matching these filters",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Select all 412 matching these filters?",
    });
    expect(dialog).toHaveTextContent(
      "That is 412 people below the pass mark here, not just the ones you can see.",
    );
    expect(dialog).toHaveTextContent(
      "If the list changes before you act, nothing is done",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Select all 412" }),
    );
    expect(
      await within(bar()).findByText("All 412 matching these filters selected"),
    ).toBeInTheDocument();
  });

  it("offers only reject and clear: there is nothing else to do to a flagged list", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", { name: "Select Applicant 1" }),
    );
    expect(
      within(bar())
        .getAllByRole("button")
        .map((b) => b.textContent?.trim()),
    ).toEqual(["Reject…", "Clear"]);
  });
});

describe("rejecting, which a person does", () => {
  it("needs a reason from the company's list, and says the decision is theirs", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", { name: "Select Applicant 1" }),
    );
    await user.click(within(bar()).getByRole("button", { name: "Reject…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reject 1 person?",
    });
    expect(dialog).toHaveTextContent(
      "The decision is yours and is recorded under your name",
    );
    const confirm = within(dialog).getByRole("button", {
      name: "Reject 1 person",
    });
    expect(confirm).toBeDisabled();
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Not enough relevant experience",
    );
    expect(confirm).toBeEnabled();
  });

  it("starts with the decline email box unticked, every time it opens", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", { name: "Select Applicant 1" }),
    );
    await user.click(within(bar()).getByRole("button", { name: "Reject…" }));
    let dialog = await screen.findByRole("dialog", {
      name: "Reject 1 person?",
    });
    const box = within(dialog).getByRole("checkbox", {
      name: /Send decline emails/,
    });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(box).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.click(within(bar()).getByRole("button", { name: "Reject…" }));
    dialog = await screen.findByRole("dialog", { name: "Reject 1 person?" });
    expect(
      within(dialog).getByRole("checkbox", { name: /Send decline emails/ }),
    ).not.toBeChecked();
  });

  it("sends nothing by email unless the box was ticked", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", { name: "Select Applicant 1" }),
    );
    await user.click(within(bar()).getByRole("button", { name: "Reject…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reject 1 person?",
    });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Does not meet the requirements for the role",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Reject 1 person" }),
    );
    await waitFor(() =>
      expect(current.gateway.below.reject).toHaveBeenCalledTimes(1),
    );
    const request = current.gateway.below.reject.mock.calls[0]?.[0];
    expect(request?.decision).toEqual({
      reasonId: "r1",
      note: null,
      sendEmails: false,
    });
    expect(request?.target).toEqual({
      kind: "ids",
      postingId: "demo-advert-req-01",
      ids: ["a1"],
    });
    expect(typeof request?.idempotencyKey).toBe("string");
  });

  it("sends decline emails only when the box was ticked in that dialog", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", { name: "Select Applicant 1" }),
    );
    await user.click(within(bar()).getByRole("button", { name: "Reject…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reject 1 person?",
    });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Not enough relevant experience",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: /Note/ }),
      "Thin CV",
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: /Send decline emails/ }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Reject 1 person" }),
    );
    await waitFor(() =>
      expect(current.gateway.below.reject).toHaveBeenCalledTimes(1),
    );
    expect(current.gateway.below.reject.mock.calls[0]?.[0]?.decision).toEqual({
      reasonId: "r2",
      note: "Thin CV",
      sendEmails: true,
    });
  });

  it("offers no email box when the server sends no emails to candidates", async () => {
    readiness.data = { ...readiness.data, supported: false };
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", { name: "Select Applicant 1" }),
    );
    await user.click(within(bar()).getByRole("button", { name: "Reject…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reject 1 person?",
    });
    expect(
      within(dialog).queryByRole("checkbox", { name: /Send decline emails/ }),
    ).not.toBeInTheDocument();
  });

  it("rejects everyone matching with the count that was confirmed, as a filter", async () => {
    bigList();
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", { name: "Select everyone shown" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Select all 412 matching these filters",
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Select all 412" }),
    );
    await user.click(within(bar()).getByRole("button", { name: "Reject…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reject 412 people?",
    });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Does not meet the requirements for the role",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Reject 412 people" }),
    );
    await waitFor(() =>
      expect(current.gateway.below.reject).toHaveBeenCalledTimes(1),
    );
    expect(current.gateway.below.reject.mock.calls[0]?.[0]?.target).toEqual({
      kind: "filter",
      postingId: "demo-advert-req-01",
      filters: {},
      expected: 412,
    });
  });

  it("says in the API's words when the list changed, and keeps the dialog open", async () => {
    current.gateway.below.reject.mockImplementation(async () => {
      throw new ApiError(
        409,
        "conflict",
        "The list changed while you were choosing: it was 412 people and is now 400. Nothing was done.",
      );
    });
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", { name: "Select Applicant 1" }),
    );
    await user.click(within(bar()).getByRole("button", { name: "Reject…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reject 1 person?",
    });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Not enough relevant experience",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Reject 1 person" }),
    );
    expect(
      await within(dialog).findByText(/it was 412 people and is now 400/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Reject 1 person?" }),
    ).toBeInTheDocument();
  });

  it("drops the people it rejected off the list, and says who could not be done", async () => {
    let rejected = false;
    current.gateway.below.list.mockImplementation(async () =>
      rejected
        ? { rows: [belowRow(2)], total: 1, next: null }
        : { rows: [belowRow(1), belowRow(2)], total: 2, next: null },
    );
    current.gateway.below.reject.mockImplementation(async () => {
      rejected = true;
      return {
        requested: 2,
        done: 1,
        skipped: 0,
        refused: [
          { id: "a2", name: "Applicant 2", reason: "An offer is out." },
        ],
        emailed: null,
      };
    });
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", { name: "Select everyone shown" }),
    );
    await user.click(within(bar()).getByRole("button", { name: "Reject…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reject 2 people?",
    });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Not enough relevant experience",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Reject 2 people" }),
    );
    expect(
      await screen.findByText(/Rejected: 1 of 2 people\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/An offer is out\./)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Applicant 1" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("says nobody was rejected when the action is refused", async () => {
    current.gateway.below.reject.mockImplementation(async () => {
      throw new ApiError(
        422,
        "unprocessable",
        "That reason has been switched off.",
      );
    });
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", { name: "Select Applicant 1" }),
    );
    await user.click(within(bar()).getByRole("button", { name: "Reject…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reject 1 person?",
    });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Not enough relevant experience",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Reject 1 person" }),
    );
    expect(await screen.findByText("Nobody was rejected")).toBeInTheDocument();
  });
});

describe("keeping somebody in the running", () => {
  it("needs a reason, and does nothing without one", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("button", { name: /Keep in the running: Applicant 1/ }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Keep Applicant 1 in the running?",
    });
    const keep = within(dialog).getByRole("button", {
      name: "Keep in the running",
    });
    expect(keep).toBeDisabled();
    await user.type(
      within(dialog).getByRole("textbox", { name: /Why they stay/ }),
      "ok",
    );
    expect(keep).toBeDisabled();
    expect(current.gateway.below.keep).not.toHaveBeenCalled();
    await user.type(
      within(dialog).getByRole("textbox", { name: /Why they stay/ }),
      " strong portfolio",
    );
    expect(keep).toBeEnabled();
  });

  it("keeps the person with the reason given, and the row leaves the list", async () => {
    let kept = false;
    current.gateway.below.list.mockImplementation(async () =>
      kept
        ? { rows: [belowRow(2)], total: 1, next: null }
        : { rows: [belowRow(1), belowRow(2)], total: 2, next: null },
    );
    current.gateway.below.keep.mockImplementation(async () => {
      kept = true;
    });
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("button", { name: /Keep in the running: Applicant 1/ }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Keep Applicant 1 in the running?",
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: /Why they stay/ }),
      "  Strong portfolio ",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Keep in the running" }),
    );
    await waitFor(() =>
      expect(current.gateway.below.keep).toHaveBeenCalledWith(
        "a1",
        "Strong portfolio",
      ),
    );
    expect(
      await screen.findByText("Applicant 1 is kept in the running"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Applicant 1" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("link", { name: "Applicant 2" }),
    ).toBeInTheDocument();
  });

  it("starts blank each time", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("button", { name: /Keep in the running: Applicant 1/ }),
    );
    let dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: /Why they stay/ }),
      "first reason",
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.click(
      screen.getByRole("button", { name: /Keep in the running: Applicant 2/ }),
    );
    dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("textbox", { name: /Why they stay/ }),
    ).toHaveValue("");
  });

  it("says why when it is refused", async () => {
    current.gateway.below.keep.mockImplementation(async () => {
      throw new ApiError(
        409,
        "conflict",
        "That person has already been decided on.",
      );
    });
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("button", { name: /Keep in the running: Applicant 1/ }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: /Why they stay/ }),
      "strong",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Keep in the running" }),
    );
    expect(
      await within(dialog).findByText(
        "That person has already been decided on.",
      ),
    ).toBeInTheDocument();
  });
});
