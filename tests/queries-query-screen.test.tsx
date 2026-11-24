import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiQueryDetail } from "@/lib/api/queries";
import { can, detail, SUBJECT_LINE, WHAT_HAPPENED } from "./queries-fixtures";

/**
 * One query, as each reader meets it.
 *
 * What is proved: the person reads "A letter from HR" and sees the page the server narrowed for
 * them; a reply is one box, with the sentence that a sent reply cannot be changed **on the page
 * before the button**, and a sent reply is read back frozen with no box; receipt is a button that
 * says it is not agreement; the issuer is not offered the outcome form unless the server says so,
 * and is told the rule in words instead; a server that sends no `can` offers nothing; silence is
 * never described with an accusing word; a person served on paper reads "Nobody was told in the
 * product"; and only staff get the printed letter.
 */

let employeeId: string | null = "e-1";
let held = new Set<string>();
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: true,
    employeeId,
    user: { id: "u-me" },
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: (key: string) => held.has(key),
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/store/company", () => ({
  useLiveCompanyProfile: () => ({ profile: null, reload: () => undefined }),
}));
vi.mock("@/lib/store/conduct", () => ({
  dayLabel: (day: string | null) => (day ? `D(${day})` : "—"),
}));

const publish = vi.fn();
let current: ApiQueryDetail | null = null;
const actions = {
  readOnly: false,
  create: vi.fn(),
  update: vi.fn(),
  issue: vi.fn(),
  addFile: vi.fn(),
  removeFile: vi.fn(),
  fileContent: vi.fn(),
  confirmReceipt: vi.fn(),
  saveReply: vi.fn(),
  sendReply: vi.fn(),
  replyFromPaper: vi.fn(),
  extend: vi.fn(),
  outcome: vi.fn(),
  withdraw: vi.fn(),
  archive: vi.fn(),
  updateSettings: vi.fn(),
};
vi.mock("@/lib/store/queries", async (original) => ({
  ...(await original<typeof import("@/lib/store/queries")>()),
  useQueryDetail: () => ({
    detail: current,
    loading: false,
    error: null,
    reload: vi.fn(),
    publish,
    unavailable: false,
  }),
  useQueryActions: () => actions,
}));

const { QueryScreen } =
  await import("@/app/(app)/people/queries/[id]/query-screen");

const mount = (read: ApiQueryDetail) => {
  current = read;
  return render(
    <ToastProvider>
      <QueryScreen id={read.id} />
    </ToastProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  employeeId = "e-1";
  held = new Set();
  current = null;
});

describe("the person the letter is addressed to", () => {
  it("is told it is a letter from HR, and reads the letter on the page", () => {
    mount(detail());
    expect(
      screen.getByRole("heading", { name: "A letter from HR" }),
    ).toBeInTheDocument();
    expect(screen.getByText(SUBJECT_LINE)).toBeInTheDocument();
    expect(screen.getByText(WHAT_HAPPENED)).toBeInTheDocument();
    /* Not the staff view: no row naming the person to themselves, no actions, no printed copy. */
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /print the letter/i }),
    ).not.toBeInTheDocument();
    expect(document.querySelector("article")).toBeNull();
  });

  it("says in the letter that a query changes no pay, status or exit", () => {
    mount(detail());
    expect(
      screen.getByText(/changes no pay, no employment status and no exit/),
    ).toBeInTheDocument();
  });

  it("has one box for the reply, and says before the button that it cannot be changed", () => {
    mount(detail({ can: can({ reply: true }) }));
    expect(screen.getAllByRole("textbox").length).toBe(1);
    const sentence = screen.getByText(
      "Once sent, a reply cannot be changed. Read it through first.",
    );
    const button = screen.getByRole("button", { name: "Send my reply" });
    /* On the page and before the button, not behind an icon. */
    expect(
      sentence.compareDocumentPosition(button) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("saves the words and then sends them, after a confirmation that says it again", async () => {
    const user = userEvent.setup();
    const next = detail({
      reply: {
        body: "I was ill.",
        source: "IN_PRODUCT",
        sent: true,
        sentAt: "2026-11-19T08:00:00.000Z",
        receivedOn: null,
        enteredByName: null,
        replyHash: null,
      },
    });
    actions.saveReply.mockResolvedValue(detail({ can: can({ reply: true }) }));
    actions.sendReply.mockResolvedValue(next);
    mount(detail({ can: can({ reply: true }) }));

    await user.type(screen.getByRole("textbox"), "I was ill.");
    await user.click(screen.getByRole("button", { name: "Send my reply" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/Once sent, a reply cannot be changed/),
    ).toBeInTheDocument();
    expect(actions.sendReply).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Send it" }));
    await waitFor(() => expect(actions.sendReply).toHaveBeenCalledWith("q-1"));
    expect(actions.saveReply).toHaveBeenCalledWith("q-1", "I was ill.");
    expect(publish).toHaveBeenLastCalledWith(next);
  });

  it("reads a sent reply back frozen, with no box to change it", () => {
    mount(
      detail({
        status: "REPLIED",
        replyState: "replied_on_time",
        replyStateLabel: "Replied on 19 Nov 2026, 9:00 am.",
        reply: {
          body: "I was ill.",
          source: "IN_PRODUCT",
          sent: true,
          sentAt: "2026-11-19T08:00:00.000Z",
          receivedOn: null,
          enteredByName: null,
          replyHash: null,
        },
        can: can(),
      }),
    );
    expect(screen.getByText("I was ill.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /send/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/cannot be changed/)).toBeInTheDocument();
  });

  it("confirms receipt with a button that says it is not agreement and that nothing waits on it", async () => {
    const user = userEvent.setup();
    actions.confirmReceipt.mockResolvedValue(
      detail({ receiptConfirmedAt: "2026-11-18T10:00:00.000Z" }),
    );
    mount(detail({ can: can({ confirmReceipt: true }) }));
    expect(
      screen.getByText(/not agreeing with it, and nothing waits on it/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "I received this query" }),
    );
    await waitFor(() =>
      expect(actions.confirmReceipt).toHaveBeenCalledWith("q-1"),
    );
    expect(publish).toHaveBeenCalled();
  });

  it("offers neither the outcome form nor any action when the server sends no `can`", () => {
    mount(detail({ can: can() }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Record the outcome")).not.toBeInTheDocument();
  });

  it("reads the outcome and what recording it did not do", () => {
    mount(
      detail({
        status: "CLOSED",
        outcome: {
          outcome: "WARNING",
          reasons: "Given the facts, a warning is recorded.",
          decidedByName: "Tunde Bakare",
          decidedAt: "2026-11-21T09:00:00.000Z",
        },
      }),
    );
    expect(screen.getByText("A warning")).toBeInTheDocument();
    expect(
      screen.getByText("Given the facts, a warning is recorded."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no warning is issued from here/),
    ).toBeInTheDocument();
  });
});

describe("silence is not a finding", () => {
  it("shows the server's own sentence in neutral words, with no accusing one anywhere", () => {
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    mount(
      detail({
        issuedById: "u-other",
        replyState: "no_reply_by_deadline",
        replyStateLabel: "No reply by 14 Nov 2026, 5:00 pm.",
        replyBy: "2026-11-14T16:00:00.000Z",
      }),
    );
    expect(
      screen.getAllByText("No reply by 14 Nov 2026, 5:00 pm.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("No reply in time")).toBeInTheDocument();
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const word of [
      "refused to reply",
      "ignored",
      "failed to reply",
      "defaulted",
    ]) {
      expect(text).not.toContain(word);
    }
  });
});

describe("somebody who works queries", () => {
  beforeEach(() => {
    employeeId = "e-9";
    held = new Set(["ISSUE_QUERIES", "DECIDE_QUERIES"]);
  });

  it("is shown the person, the actions and the printed letter, and not the person's draft", () => {
    mount(
      detail({
        issuedById: "u-other",
        can: can({ extend: true, withdraw: true }),
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Q-2026-014" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Chidi Nwosu" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /print the letter/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Extend the reply-by time" }),
    ).toBeInTheDocument();
    expect(document.querySelector("article")).not.toBeNull();
    expect(screen.getByText("No reply has been sent yet.")).toBeInTheDocument();
  });

  it("bounds the new reply-by date to 2000 to 2100, the same as the server", async () => {
    mount(
      detail({
        issuedById: "u-other",
        can: can({ extend: true, withdraw: true }),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Extend the reply-by time" }),
    );
    const day = screen.getByLabelText(/^New date/);
    expect(day).toHaveAttribute("min", "2000-01-01");
    expect(day).toHaveAttribute("max", "2100-12-31");
  });

  it("is not offered the outcome form when the server says it cannot decide, and is told the rule", () => {
    mount(
      detail({
        status: "REPLIED",
        issuedById: "u-me",
        reply: {
          body: "Here.",
          source: "IN_PRODUCT",
          sent: true,
          sentAt: "2026-11-19T08:00:00.000Z",
          receivedOn: null,
          enteredByName: null,
          replyHash: null,
        },
        can: can({ decide: false }),
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Record the outcome" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /You issued this query, so somebody else who can decide queries records the outcome/,
      ),
    ).toBeInTheDocument();
  });

  it("does not say the issuer rule to somebody who did not issue it", () => {
    mount(
      detail({
        status: "REPLIED",
        issuedById: "u-other",
        can: can({ decide: false }),
      }),
    );
    expect(screen.queryByText(/You issued this query/)).not.toBeInTheDocument();
  });

  it("records one outcome with written reasons, after a confirmation that says it changes nothing else", async () => {
    const user = userEvent.setup();
    const closed = detail({ status: "CLOSED" });
    actions.outcome.mockResolvedValue(closed);
    mount(
      detail({
        status: "REPLIED",
        issuedById: "u-other",
        reply: {
          body: "Here.",
          source: "IN_PRODUCT",
          sent: true,
          sentAt: "2026-11-19T08:00:00.000Z",
          receivedOn: null,
          enteredByName: null,
          replyHash: null,
        },
        can: can({ decide: true }),
      }),
    );
    const record = screen.getByRole("button", { name: "Record the outcome" });
    expect(record).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /No further action/ }));
    await user.type(
      screen.getByRole("textbox", { name: /Reasons/ }),
      "Explained, and accepted.",
    );
    await user.click(record);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        /changes no pay, no employment status and no exit/,
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Record it" }));
    await waitFor(() =>
      expect(actions.outcome).toHaveBeenCalledWith("q-1", {
        outcome: "NO_FURTHER_ACTION",
        reasons: "Explained, and accepted.",
      }),
    );
  });

  it("refuses reasons under ten characters before anything is sent", async () => {
    const user = userEvent.setup();
    mount(
      detail({
        status: "REPLIED",
        issuedById: "u-other",
        can: can({ decide: true }),
      }),
    );
    await user.click(screen.getByRole("radio", { name: /No further action/ }));
    await user.type(screen.getByRole("textbox", { name: /Reasons/ }), "Fine.");
    expect(
      screen.getByRole("button", { name: "Record the outcome" }),
    ).toBeDisabled();
  });

  it("enters a reply from paper only where the server says so", () => {
    mount(
      detail({ issuedById: "u-other", can: can({ enterPaperReply: true }) }),
    );
    expect(screen.getByText("Enter a reply from paper")).toBeInTheDocument();
    expect(
      screen.getByText(/Once entered, the reply cannot be changed/),
    ).toBeInTheDocument();
  });

  it("says nobody was told in the product for a letter served in person", () => {
    mount(
      detail({
        issuedById: "u-other",
        served: {
          ...detail().served,
          how: "IN_PERSON",
          at: "2026-11-18T09:00:00.000Z",
          handedByName: "Fatima Bello",
        },
      }),
    );
    expect(
      screen.getAllByText("Nobody was told in the product.").length,
    ).toBeGreaterThan(0);
  });

  it("says it plainly when it was marked as served in the product and nobody was", () => {
    mount(
      detail({
        issuedById: "u-other",
        served: { ...detail().served, nobodyToldInProduct: true },
      }),
    );
    expect(
      screen.getAllByText("Nobody was told in the product.").length,
    ).toBeGreaterThan(0);
  });

  it("shows no 'nobody was told' for a letter served in the product to somebody who was told", () => {
    mount(detail({ issuedById: "u-other" }));
    expect(
      screen.queryByText("Nobody was told in the product."),
    ).not.toBeInTheDocument();
  });

  it("does not draw a reply that is only a draft of the person's, because the server never sends one", () => {
    mount(detail({ issuedById: "u-other", reply: null }));
    expect(
      screen.queryByText("Their reply", { selector: "p, h2, h3" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No reply has been sent yet.")).toBeInTheDocument();
  });
});

describe("a draft", () => {
  it("is the one place a letter is written, and issuing is a deliberate step", async () => {
    const user = userEvent.setup();
    employeeId = "e-9";
    held = new Set(["ISSUE_QUERIES"]);
    mount(
      detail({
        status: "DRAFT",
        reference: null,
        issuedBy: null,
        issuedAt: null,
        issuedById: "u-me",
        can: can({ edit: true, issue: true, withdraw: true }),
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Draft query" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Subject line/ })).toHaveValue(
      SUBJECT_LINE,
    );
    await user.click(screen.getByRole("button", { name: "Issue the query" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/freezes the wording/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/says nothing about what it is/),
    ).toBeInTheDocument();
    expect(actions.issue).not.toHaveBeenCalled();
  });

  it("says nobody can be told in the product for a person with no sign-in", () => {
    employeeId = "e-9";
    held = new Set(["ISSUE_QUERIES"]);
    mount(
      detail({
        status: "DRAFT",
        issuedById: "u-me",
        served: {
          ...detail().served,
          how: "IN_PRODUCT",
          subjectHasSignInNow: false,
        },
        can: can({ edit: true, issue: true }),
      }),
    );
    expect(
      screen.getByText(
        /This person has no sign-in, so nobody can be told in the product/,
      ),
    ).toBeInTheDocument();
  });
});
