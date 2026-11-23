import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiQueryDetail } from "@/lib/api/queries";
import type { ApiCitation, ApiQueryLead } from "@/lib/api/query-ties";
import { can, detail } from "./queries-fixtures";

/**
 * What a query shows of the records it is tied to, and who is offered what.
 *
 * What is proved: references are read-only copies that say whether they are a preview or frozen;
 * the controls are the server's `can` and nothing else; a drafting manager is offered the letter
 * and nothing more; typed text is text (no markup, no link made from it); a lead is a link built
 * from ids and is absent for the person; the warnings sit beside the dates they are about as plain
 * words and are read again in the confirmation; and a toast never carries a subject, a document
 * name or a reference's title.
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
  LEVEL_LABEL: { WRITTEN: "Written warning" },
}));
const options = {
  options: [{ value: "pol-1", label: "Leave policy, version 1" }],
  loading: false,
  error: null as Error | null,
  cut: false,
};
vi.mock("@/lib/store/query-citation-options", () => ({
  useCitationOptions: () => options,
}));

const publish = vi.fn();
const reload = vi.fn();
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
  addCitation: vi.fn(),
  removeCitation: vi.fn(),
  askForDocument: vi.fn(),
};
vi.mock("@/lib/store/queries", async (original) => ({
  ...(await original<typeof import("@/lib/store/queries")>()),
  useQueryDetail: () => ({
    detail: current,
    loading: false,
    error: null,
    reload,
    publish,
    unavailable: false,
  }),
  useQueryActions: () => actions,
}));
const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/queries", async (original) => {
  const real = await original<typeof import("@/lib/api/queries")>();
  return { ...real, queriesApi: { ...real.queriesApi, get } };
});

const { QueryScreen } =
  await import("@/app/(app)/people/queries/[id]/query-screen");

const mount = (read: ApiQueryDetail) => {
  current = read;
  get.mockResolvedValue(read);
  return render(
    <ToastProvider>
      <QueryScreen id={read.id} />
    </ToastProvider>,
  );
};

const citation = (over: Partial<ApiCitation> = {}): ApiCitation => ({
  id: "c-1",
  kind: "POLICY",
  title: "Leave policy, version 1",
  takenAt: "2026-11-18T09:00:00.000Z",
  frozen: true,
  asItStood: {
    kind: "POLICY",
    title: "Leave policy",
    category: "People",
    version: 1,
    publishedAt: "2026-10-01T09:00:00.000Z",
    requiresAcknowledgement: true,
    withdrawn: false,
    body: "Seven days' notice.",
    personAcknowledged: false,
    acknowledgedAt: null,
    publishedAfterIncident: null,
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  employeeId = "e-1";
  held = new Set();
  current = null;
  options.error = null;
});

describe("references", () => {
  it("are read-only for the person and for staff once the letter is issued, and say they are frozen copies", () => {
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    mount(detail({ can: can(), citations: [citation()] }));
    expect(screen.getByText("References")).toBeInTheDocument();
    /* Once on the page and once in the print-only letter, which carries the one-line titles. */
    expect(screen.getAllByText("Leave policy, version 1")).toHaveLength(2);
    expect(
      screen.getByText(/As it stood when this letter was issued, /),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add a reference/i }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
  });

  it("are drawn for the person too, who reads their own letter, with no printed copy", () => {
    mount(detail({ citations: [citation()] }));
    expect(screen.getByText("Leave policy, version 1")).toBeInTheDocument();
  });

  it("draw nothing when there are none and the reader cannot cite", () => {
    mount(detail({ can: can() }));
    expect(screen.queryByText("References")).not.toBeInTheDocument();
  });

  it("say a draft's copy is a preview that is read again at issue", () => {
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    mount(
      detail({
        status: "DRAFT",
        issuedAt: null,
        can: can({ edit: true, issue: true, cite: true }),
        citations: [citation({ frozen: false })],
      }),
    );
    expect(
      screen.getByText(/A preview of what the record says now/),
    ).toBeInTheDocument();
  });

  it("are edited only where the server says `can.cite`: add and remove", async () => {
    const user = userEvent.setup();
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    actions.removeCitation.mockResolvedValue(undefined);
    mount(
      detail({
        status: "DRAFT",
        issuedAt: null,
        can: can({ edit: true, issue: true, cite: true }),
        citations: [citation({ frozen: false })],
      }),
    );
    expect(
      screen.getByRole("button", { name: /add a reference/i }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: /remove this policy reference/i }),
    );
    await waitFor(() =>
      expect(actions.removeCitation).toHaveBeenCalledWith("q-1", "c-1"),
    );
    /* A toast says an act was done, never what was cited. */
    expect(await screen.findByText("Reference removed")).toBeInTheDocument();
    expect(
      within(document.body).getAllByText("Leave policy, version 1").length,
    ).toBe(1);
  });

  it("stop at the cap the server holds", () => {
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    const many = Array.from({ length: 20 }, (_, index) =>
      citation({
        id: `c-${index}`,
        title: `Reference ${index}`,
        frozen: false,
      }),
    );
    mount(
      detail({
        status: "DRAFT",
        issuedAt: null,
        can: can({ edit: true, issue: true, cite: true }),
        citations: many,
      }),
    );
    expect(
      screen.getByRole("button", { name: /add a reference/i }),
    ).toBeDisabled();
  });
});

describe("typed text is text", () => {
  it("shows a markup payload in a title and a wording as words, with no element and no link made from it", () => {
    employeeId = "e-9";
    held = new Set(["ISSUE_QUERIES"]);
    const payload = '<img src=x onerror="alert(1)"> https://evil.example/x';
    const { container } = mount(
      detail({
        can: can(),
        citations: [
          citation({
            title: payload,
            asItStood: {
              kind: "POLICY",
              title: payload,
              category: null,
              version: 1,
              publishedAt: null,
              requiresAcknowledgement: null,
              withdrawn: null,
              body: `See ${payload} and www.evil.example`,
              personAcknowledged: null,
              acknowledgedAt: null,
              publishedAfterIncident: null,
            },
          }),
        ],
      }),
    );
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getAllByText(payload, { exact: false }).length,
    ).toBeGreaterThan(0);
    expect(container.querySelector('a[href*="evil.example"]')).toBeNull();
  });
});

describe("documents asked for", () => {
  const asked = {
    id: "d-1",
    name: "Medical certificate",
    category: "MEDICAL",
    dueOn: "2026-11-30",
    status: "OPEN" as const,
    createdAt: "2026-11-19T09:00:00.000Z",
    fulfilledAt: null,
    waivedAt: null,
  };

  it("are listed for the person, who is sent to My documents, and who is not offered a button", () => {
    mount(detail({ documentRequests: [asked] }));
    expect(screen.getByText("Medical certificate")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open My documents" }),
    ).toHaveAttribute("href", "/documents");
    expect(
      screen.queryByRole("button", { name: /ask for a document/i }),
    ).toBeNull();
  });

  it("offer the issuer the button while the letter is waiting, and send what was typed", async () => {
    const user = userEvent.setup();
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    actions.askForDocument.mockResolvedValue({
      requestId: "d-2",
      notifiedPerson: true,
    });
    mount(detail({ can: can({ askForDocument: true }) }));
    await user.click(
      screen.getByRole("button", { name: /ask for a document/i }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        /does not name the document, give the reason or mention the letter/,
      ),
    ).toBeInTheDocument();
    await user.type(
      within(dialog).getByLabelText(/The document/),
      "  Fitness note  ",
    );
    await user.type(
      within(dialog).getByLabelText(/Why it is needed/),
      "For the file",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Ask for it" }),
    );
    await waitFor(() =>
      expect(actions.askForDocument).toHaveBeenCalledWith("q-1", {
        name: "Fitness note",
        reason: "For the file",
      }),
    );
    /* A toast says an act, never the name of the document. */
    expect(await screen.findByText("Document asked for")).toBeInTheDocument();
    expect(screen.queryByText("Fitness note")).not.toBeInTheDocument();
  });

  it("say plainly when nobody was told in the product", async () => {
    const user = userEvent.setup();
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    actions.askForDocument.mockResolvedValue({
      requestId: "d-2",
      notifiedPerson: false,
    });
    mount(detail({ can: can({ askForDocument: true }) }));
    await user.click(
      screen.getByRole("button", { name: /ask for a document/i }),
    );
    await user.type(screen.getByLabelText(/The document/), "ID card");
    await user.click(screen.getByRole("button", { name: "Ask for it" }));
    expect(
      await screen.findByText(/Nobody was told in the product/),
    ).toBeInTheDocument();
  });

  it("keep the server's refusal in the dialog, with what was typed", async () => {
    const user = userEvent.setup();
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    actions.askForDocument.mockRejectedValue(
      Object.assign(new Error("Chidi was already asked for that."), {
        name: "ApiError",
      }),
    );
    mount(detail({ can: can({ askForDocument: true }) }));
    await user.click(
      screen.getByRole("button", { name: /ask for a document/i }),
    );
    await user.type(screen.getByLabelText(/The document/), "ID card");
    await user.click(screen.getByRole("button", { name: "Ask for it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/./);
    expect(screen.getByLabelText(/The document/)).toHaveValue("ID card");
  });

  it("draw nothing at all when there is nothing asked and nothing to offer", () => {
    mount(detail({ can: can() }));
    expect(screen.queryByText("Documents asked for")).not.toBeInTheDocument();
  });
});

describe("linked records", () => {
  const leads: ApiQueryLead[] = [
    {
      kind: "WARNING",
      id: "w-1",
      subKind: "WRITTEN",
      date: "2026-11-25",
      dateMeans: "recorded",
    },
    {
      kind: "EXIT",
      id: "x-1",
      subKind: "TERMINATION",
      date: "2026-12-31",
      dateMeans: "last_working_day",
    },
    {
      kind: "EMPLOYMENT_CHANGE",
      id: "ec-1",
      subKind: "TRANSFER",
      date: "2027-01-01",
      dateMeans: "effective",
    },
  ];

  it("are links built from ids, and say a query makes none of them", () => {
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    mount(detail({ can: can(), leads }));
    expect(screen.getByText("Linked records")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Open it" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/people/e-1?tab=conduct",
      "/people/offboarding/x-1",
      "/people/e-1?tab=history",
    ]);
    expect(screen.getByText(/A query makes none of them/)).toBeInTheDocument();
    expect(
      screen.getByText(/written warning, recorded D\(2026-11-25\)/),
    ).toBeInTheDocument();
  });

  it("are not drawn for the person, whose detail carries none, nor for an empty list", () => {
    mount(detail({ can: can(), leads: null }));
    expect(screen.queryByText("Linked records")).not.toBeInTheDocument();
    mount(detail({ id: "q-2", can: can(), leads: [] }));
    expect(screen.queryByText("Linked records")).not.toBeInTheDocument();
  });

  it("are never drawn to the person even if a server sent them", () => {
    employeeId = "e-1";
    mount(detail({ can: can(), leads }));
    expect(screen.queryByText("Linked records")).not.toBeInTheDocument();
  });
});

describe("a manager drafting", () => {
  const draftAsManager = () =>
    detail({
      status: "DRAFT",
      issuedAt: null,
      reference: null,
      replyBy: null,
      issuedBy: null,
      startedByManager: true,
      draftedByName: "Adaeze Okonkwo",
      can: can({ edit: true }),
    });

  it("is offered the letter and nothing else: no files, no references, no documents, no issue", () => {
    held = new Set(["DRAFT_QUERIES"]);
    employeeId = "e-9";
    mount(draftAsManager());
    expect(
      screen.getByRole("button", { name: "Save the draft" }),
    ).toBeInTheDocument();
    /* No dead button: issuing is the issuer's, so for a manager there is none to press. */
    expect(
      screen.queryByRole("button", { name: "Issue the query" }),
    ).toBeNull();
    expect(
      screen.queryByText("Company letter or attachments"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("References")).not.toBeInTheDocument();
    expect(screen.queryByText("Documents asked for")).not.toBeInTheDocument();
    expect(screen.queryByText("Linked records")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /withdraw|extend|archive/i }),
    ).toBeNull();
    expect(
      screen.getByText(/You are writing the letter and nothing else/),
    ).toBeInTheDocument();
  });

  it("is told whose words a manager's draft are, when HR reads it", () => {
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    mount({
      ...draftAsManager(),
      can: can({ edit: true, issue: true, cite: true }),
    });
    expect(screen.getByText("Drafted by")).toBeInTheDocument();
    expect(screen.getByText("Adaeze Okonkwo")).toBeInTheDocument();
    expect(screen.getByText(/A manager wrote this draft/)).toBeInTheDocument();
    /* The issuer still has the files and the references. */
    expect(
      screen.getByText("Company letter or attachments"),
    ).toBeInTheDocument();
    expect(screen.getByText("References")).toBeInTheDocument();
  });
});

describe("warnings", () => {
  const warnings = [
    {
      code: "cited_day_on_leave",
      message:
        "12 Nov 2026 is inside approved leave. Nothing stops you sending it.",
      dates: ["2026-11-12"],
    },
    {
      code: "reply_by_on_leave",
      message:
        "The reply-by time falls inside approved leave. Nothing stops you sending it.",
      dates: [],
    },
  ];
  const draft = () =>
    detail({
      status: "DRAFT",
      issuedAt: null,
      reference: null,
      served: {
        ...detail().served,
        how: "IN_PRODUCT",
        subjectHasSignInNow: true,
      },
      warnings,
      can: can({ edit: true, issue: true, cite: true }),
    });

  it("sit beside the thing they are about, as plain words and never a banner", () => {
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    const { container } = mount(draft());
    const dayWarning = screen.getByText(/12 Nov 2026 is inside approved leave/);
    const replyWarning = screen.getByText(
      /reply-by time falls inside approved leave/,
    );
    const dateLabel = screen.getByText("Date it happened");
    const replyLabel = screen.getByText("Reply by (date)");
    /* The day warning follows the dates; the reply-by warning follows the reply-by boxes. */
    expect(
      dateLabel.compareDocumentPosition(dayWarning) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      replyLabel.compareDocumentPosition(replyWarning) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      dayWarning.compareDocumentPosition(replyLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    for (const warning of [dayWarning, replyWarning]) {
      expect(warning.tagName).toBe("P");
      expect(warning.className).toMatch(/text-warning-text/);
      expect(warning.className).not.toMatch(/\bborder\b|\bbg-/);
      expect(warning.closest("[role=alert],[role=status]")).toBeNull();
    }
    expect(container.querySelector('[class*="bg-warning"]')).toBeNull();
  });

  it("are read again in the confirmation before it goes", async () => {
    const user = userEvent.setup();
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    mount(draft());
    await user.click(screen.getByRole("button", { name: "Issue the query" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Before it goes:")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/12 Nov 2026 is inside approved leave/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/reply-by time falls inside approved leave/),
    ).toBeInTheDocument();
  });

  it("are not repeated in the toast after issuing, which only says how many were shown", async () => {
    const user = userEvent.setup();
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    const issued = detail({ reference: "Q-2026-020" });
    actions.issue.mockResolvedValue({
      detail: issued,
      warnings,
      subjectHasSignIn: true,
      toldInProduct: true,
      nobodyToldInProduct: false,
    });
    mount(draft());
    await user.click(screen.getByRole("button", { name: "Issue the query" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Issue it",
      }),
    );
    expect(await screen.findByText("Q-2026-020 issued")).toBeInTheDocument();
    expect(
      screen.getByText(/2 things to check were shown before it was sent/),
    ).toBeInTheDocument();
    /* The toast carries no warning sentence, which names dates of somebody's leave. */
    const stillThere = screen.queryAllByText(
      /12 Nov 2026 is inside approved leave/,
    );
    expect(stillThere.every((node) => !node.closest("[data-toast]"))).toBe(
      true,
    );
  });

  it("a letter with no warnings has no 'before it goes' line", async () => {
    const user = userEvent.setup();
    held = new Set(["ISSUE_QUERIES"]);
    employeeId = "e-9";
    mount({ ...draft(), warnings: [] });
    await user.click(screen.getByRole("button", { name: "Issue the query" }));
    expect(screen.queryByText("Before it goes:")).not.toBeInTheDocument();
  });
});
