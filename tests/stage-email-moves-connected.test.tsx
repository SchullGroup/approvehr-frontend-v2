import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiBoardColumn } from "@/lib/api/pipeline";
import { pipelineViewState } from "@/lib/hiring/pipeline/use-view";
import { cardOf, peopleIn, renderInToasts } from "./pipeline-workspace-helpers";

/**
 * Moving people into a stage that sends an email, against the API (faked at its
 * edge).
 *
 * What is held here is the wiring: the API sends a stage's message unless told not
 * to, so every move says outright whether to send it; a person is asked first when
 * the stage has one; and what comes back is worded by what the API says it did, so
 * "queued" is never "sent". If it is not known which stages send a message (the read
 * failed, or the server predates emails) nobody is asked and nothing is sent.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: true,
    isLoading: false,
    user: { id: "u1" },
    organization: undefined,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));

const api = {
  board: vi.fn(),
  boardColumn: vi.fn(),
  move: vi.fn(),
  reject: vi.fn(),
  bulk: vi.fn(),
  bulkJob: vi.fn(),
  bulkResults: vi.fn(),
  listTags: vi.fn(),
  listReasons: vi.fn(),
};
vi.mock("@/lib/api/pipeline", () => ({
  pipelineApi: new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          (api as Record<string, (...a: unknown[]) => unknown>)[name]?.(
            ...args,
          ),
    },
  ),
}));

const comms = { stages: vi.fn(), catalog: vi.fn(), readiness: vi.fn() };
vi.mock("@/lib/hiring/pipeline/api-comms", () => ({
  apiComms: {
    stages: { list: (...a: unknown[]) => comms.stages(...a) },
    emails: {
      catalog: (...a: unknown[]) => comms.catalog(...a),
      readiness: (...a: unknown[]) => comms.readiness(...a),
    },
  },
}));

const { PipelineWorkspace } =
  await import("@/app/(app)/hiring/requisitions/[id]/pipeline-workspace");

const card = (n: number) => ({
  id: `a${String(n).padStart(3, "0")}`,
  candidateId: `c${String(n)}`,
  name: `Candidate ${String(n)}`,
  email: `c${String(n)}@example.com`,
  source: "LinkedIn",
  appliedAt: "2026-10-01T09:00:00.000Z",
  stageEnteredAt: "2026-10-10T09:00:00.000Z",
  daysInStage: 5,
  outcome: "IN_PROGRESS" as const,
  reference: `APP-0000${String(n).padStart(4, "0")}`,
  flagged: false,
  knockoutCount: 0,
  duplicate: false,
  talentPool: false,
  tags: [],
  hasCv: false,
  rejection: null,
});

const column = (over: Partial<ApiBoardColumn>): ApiBoardColumn => ({
  key: "stage:s1",
  stageId: "s1",
  name: "Applied",
  type: "APPLIED",
  typeLabel: "Applied",
  order: 0,
  terminal: false,
  synthetic: false,
  count: 0,
  cards: [],
  hasMore: false,
  nextCursor: null,
  ...over,
});

const BOARD = () => ({
  requisition: {
    id: "r1",
    reference: "REQ-1",
    jobTitle: "Analyst",
    status: "OPEN",
    headcount: 1,
    hired: 0,
  },
  total: 6,
  limit: 25,
  columns: [
    column({
      count: 4,
      cards: [1, 2, 3, 4].map(card),
    }),
    column({
      key: "stage:s2",
      stageId: "s2",
      name: "Test",
      type: "TEST",
      order: 1,
    }),
    column({
      key: "stage:s3",
      stageId: "s3",
      name: "Phone screen",
      type: "SCREENING",
      order: 2,
    }),
    column({
      key: "outcome:REJECTED",
      stageId: null,
      name: "Rejected",
      type: null,
      order: 3,
      synthetic: true,
      terminal: true,
    }),
  ],
});

const READY = {
  supported: true,
  enabled: true,
  willSend: true,
  blockedBy: [] as string[],
  sender: null,
};

const STAGES = [
  {
    stageId: "s1",
    name: "Applied",
    order: 0,
    type: "APPLIED",
    emailTemplateId: null,
    panel: null,
  },
  {
    stageId: "s2",
    name: "Test",
    order: 1,
    type: "TEST",
    emailTemplateId: "t1",
    panel: null,
  },
  {
    stageId: "s3",
    name: "Phone screen",
    order: 2,
    type: "SCREENING",
    emailTemplateId: null,
    panel: null,
  },
];

const CATALOG = {
  fields: [],
  kinds: [],
  sender: null,
  templates: [
    {
      id: "t1",
      kind: "STAGE_UPDATE",
      kindLabel: "Update on their application",
      name: "Take the test",
      subject: "s",
      body: "b",
      isDefault: false,
      archived: false,
      usedByStages: 1,
    },
  ],
};

beforeEach(() => {
  window.localStorage?.clear?.();
  pipelineViewState.reset();
  for (const fn of [...Object.values(api), ...Object.values(comms)])
    fn.mockReset();
  api.board.mockResolvedValue(BOARD());
  api.listTags.mockResolvedValue([]);
  api.listReasons.mockResolvedValue([
    {
      id: "x1",
      label: "Over the band",
      order: 0,
      starter: true,
      archived: false,
    },
  ]);
  comms.stages.mockResolvedValue(STAGES);
  comms.catalog.mockResolvedValue(CATALOG);
  comms.readiness.mockResolvedValue(READY);
});

const open = () => renderInToasts(<PipelineWorkspace requisitionId="r1" />);
const ready = () =>
  waitFor(() =>
    expect(screen.getAllByRole("region").length).toBeGreaterThan(2),
  );
const knowsStages = () =>
  screen.findByRole("button", { name: /Stage emails and interview panels/ });

const menuFor = (person: string) =>
  within(cardOf(person)).getByLabelText(`Move ${person} to…`);

describe("a single move", () => {
  it("says outright not to send when the stage has no message", async () => {
    const user = userEvent.setup();
    api.move.mockResolvedValue({ email: null });
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Applied")[0] as string;
    await user.selectOptions(menuFor(person), "Phone screen");
    expect(
      await screen.findByText(`${person} moved to Phone screen`),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.move).toHaveBeenCalledWith(expect.any(String), "s3", false);
  });

  it("asks when the stage has a message, and 'without' tells the API not to send it", async () => {
    const user = userEvent.setup();
    api.move.mockResolvedValue({ email: null });
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Applied")[0] as string;
    await user.selectOptions(menuFor(person), "Test");
    const dialog = await screen.findByRole("dialog", {
      name: `Move ${person} to Test?`,
    });
    expect(dialog).toHaveTextContent("Take the test");
    expect(api.move).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Move without emailing" }),
    );
    expect(
      await screen.findByText(`${person} moved to Test`),
    ).toBeInTheDocument();
    expect(api.move).toHaveBeenCalledWith(expect.any(String), "s2", false);
  });

  it("tells the API to send it only when the person pressed 'Move and email', and says queued, not sent", async () => {
    const user = userEvent.setup();
    api.move.mockResolvedValue({
      email: {
        id: "e1",
        kind: "STAGE_UPDATE",
        status: "PENDING",
        note: null,
      },
    });
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Applied")[0] as string;
    await user.selectOptions(menuFor(person), "Test");
    await user.click(
      await screen.findByRole("button", { name: "Move and email" }),
    );
    expect(api.move).toHaveBeenCalledWith(expect.any(String), "s2", true);
    expect(
      await screen.findByText(
        `The email to ${person} is queued. It is not sent yet.`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/was sent/)).not.toBeInTheDocument();
  });

  it("says sent only when the API says it was sent", async () => {
    const user = userEvent.setup();
    api.move.mockResolvedValue({
      email: { id: "e1", kind: "STAGE_UPDATE", status: "SENT", note: null },
    });
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Applied")[0] as string;
    await user.selectOptions(menuFor(person), "Test");
    await user.click(
      await screen.findByRole("button", { name: "Move and email" }),
    );
    expect(
      await screen.findByText(`The email to ${person} was sent.`),
    ).toBeInTheDocument();
  });

  it("shows why an email was skipped, in the API's words", async () => {
    const user = userEvent.setup();
    api.move.mockResolvedValue({
      email: {
        id: "e1",
        kind: "STAGE_UPDATE",
        status: "SKIPPED",
        note: "not sent: no reply-to address is set for this company (Careers settings). We do not send an email whose replies would go nowhere",
      },
    });
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Applied")[0] as string;
    await user.selectOptions(menuFor(person), "Test");
    await user.click(
      await screen.findByRole("button", { name: "Move and email" }),
    );
    expect(
      await screen.findByText(
        /The email to .* was not sent\. No reply-to address is set for this company/,
      ),
    ).toBeInTheDocument();
  });

  it("puts what would stop an email in the question, before it is asked", async () => {
    const user = userEvent.setup();
    comms.readiness.mockResolvedValue({
      ...READY,
      willSend: false,
      blockedBy: [
        "Add a reply-to address: replies from candidates have to go somewhere.",
      ],
    });
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Applied")[0] as string;
    await user.selectOptions(menuFor(person), "Test");
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(
        "Add a reply-to address: replies from candidates have to go somewhere.",
      ),
    ).toBeInTheDocument();
  });

  it("does not ask, and sends nothing, when it is not known which stages send a message", async () => {
    const user = userEvent.setup();
    comms.stages.mockRejectedValue(
      new ApiError(503, "unavailable", "The server is busy."),
    );
    api.move.mockResolvedValue({ email: null });
    open();
    await ready();
    const person = peopleIn("Applied")[0] as string;
    await user.selectOptions(menuFor(person), "Test");
    expect(
      await screen.findByText(`${person} moved to Test`),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.move).toHaveBeenCalledWith(expect.any(String), "s2", false);
  });

  it("does not ask, and sends nothing, when the server predates emails to candidates", async () => {
    const user = userEvent.setup();
    comms.readiness.mockResolvedValue({
      ...READY,
      supported: false,
      enabled: false,
      willSend: false,
      blockedBy: ["This server does not send emails to candidates yet."],
    });
    api.move.mockResolvedValue({});
    open();
    await ready();
    /* The server has answered that it sends none, so nobody is asked. */
    await waitFor(() => expect(comms.readiness).toHaveBeenCalled());
    const person = peopleIn("Applied")[0] as string;
    await user.selectOptions(menuFor(person), "Test");
    expect(
      await screen.findByText(`${person} moved to Test`),
    ).toBeInTheDocument();
    expect(api.move).toHaveBeenCalledWith(expect.any(String), "s2", false);
  });
});

describe("rejecting one person", () => {
  it("sends the decline only when it was ticked, and leaves it out of the request otherwise", async () => {
    const user = userEvent.setup();
    api.reject.mockResolvedValue({ email: null });
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Applied")[0] as string;
    await user.selectOptions(menuFor(person), "Reject…");
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Over the band",
    );
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(await screen.findByText(`${person} rejected`)).toBeInTheDocument();
    expect(api.reject).toHaveBeenCalledWith(expect.any(String), {
      reasonId: "x1",
      note: null,
      sendEmail: false,
    });
    expect(
      screen.getByText(
        "The reason is on their record. Nothing was sent to them.",
      ),
    ).toBeInTheDocument();
  });

  it("asks for the decline when ticked and words what the API says it did", async () => {
    const user = userEvent.setup();
    api.reject.mockResolvedValue({
      email: { id: "e1", kind: "DECLINE", status: "PENDING", note: null },
    });
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Applied")[0] as string;
    await user.selectOptions(menuFor(person), "Reject…");
    const dialog = await screen.findByRole("dialog");
    await user.click(
      await within(dialog).findByRole("checkbox", {
        name: /Send them a decline email/,
      }),
    );
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Over the band",
    );
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(await screen.findByText(`${person} rejected`)).toBeInTheDocument();
    expect(api.reject).toHaveBeenCalledWith(expect.any(String), {
      reasonId: "x1",
      note: null,
      sendEmail: true,
    });
    expect(
      await screen.findByText(
        new RegExp(`The email to ${person} is queued. It is not sent yet.`),
      ),
    ).toBeInTheDocument();
  });

  it("does not offer the decline at all when the server predates emails", async () => {
    const user = userEvent.setup();
    comms.readiness.mockResolvedValue({
      ...READY,
      supported: false,
      enabled: false,
      willSend: false,
    });
    open();
    await ready();
    const person = peopleIn("Applied")[0] as string;
    await user.selectOptions(menuFor(person), "Reject…");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("moving and rejecting many", () => {
  const bulkAnswer = (applied: number) => ({
    dryRun: false,
    replay: false,
    job: {
      id: "j1",
      action: "MOVE",
      status: "DONE",
      total: applied,
      applied,
      skipped: 0,
      refused: 0,
      pending: 0,
      progress: 1,
      requisitionId: "r1",
      subjectType: "APPLICATION",
      idempotencyKey: "k",
      createdAt: "2026-10-10T09:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      error: null,
    },
    results: Array.from({ length: applied }, (_, n) => ({
      subjectId: `a${String(n)}`,
      subjectType: "APPLICATION",
      name: `Candidate ${String(n)}`,
      status: "APPLIED" as const,
      code: null,
      message: null,
      settledAt: null,
    })),
  });

  const pick = async (user: ReturnType<typeof userEvent.setup>) => {
    open();
    await ready();
    await knowsStages();
    const [a, b] = peopleIn("Applied") as [string, string];
    for (const who of [a, b])
      await user.click(
        within(cardOf(who)).getByRole("checkbox", { name: `Select ${who}` }),
      );
  };

  it("sends sendEmails only when the stage's tick was made, and counts queued, not sent", async () => {
    const user = userEvent.setup();
    api.bulk.mockResolvedValue(bulkAnswer(2));
    await pick(user);
    await user.click(screen.getByRole("button", { name: "Move to…" }));
    const dialog = await screen.findByRole("dialog", { name: "Move 2 people" });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Move to/ }),
      "Test",
    );
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: /Send "Take the test" to everyone moved/,
      }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Move 2 people" }),
    );
    expect(
      await screen.findByText("Moved to Test: 2 people."),
    ).toBeInTheDocument();
    expect(api.bulk).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MOVE",
        stageId: "s2",
        sendEmails: true,
      }),
      expect.anything(),
    );
    expect(
      screen.getByText(/2 emails were queued to send\. Queued is not sent/),
    ).toBeInTheDocument();
  });

  it("leaves sendEmails out of the request when the tick was not made", async () => {
    const user = userEvent.setup();
    api.bulk.mockResolvedValue(bulkAnswer(2));
    await pick(user);
    await user.click(screen.getByRole("button", { name: "Move to…" }));
    const dialog = await screen.findByRole("dialog", { name: "Move 2 people" });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Move to/ }),
      "Test",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Move 2 people" }),
    );
    expect(
      await screen.findByText("Moved to Test: 2 people."),
    ).toBeInTheDocument();
    const body = api.bulk.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("sendEmails");
    expect(screen.queryByText(/queued to send/)).not.toBeInTheDocument();
  });

  it("does not offer the tick for a stage that has no message", async () => {
    const user = userEvent.setup();
    await pick(user);
    await user.click(screen.getByRole("button", { name: "Move to…" }));
    const dialog = await screen.findByRole("dialog", { name: "Move 2 people" });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Move to/ }),
      "Phone screen",
    );
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("rejects quietly unless the decline tick was made, and then says queued", async () => {
    const user = userEvent.setup();
    api.bulk.mockResolvedValue(bulkAnswer(2));
    await pick(user);
    await user.click(screen.getByRole("button", { name: "Reject…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reject 2 people?",
    });
    await user.click(
      await within(dialog).findByRole("checkbox", {
        name: /Send a decline email to each person/,
      }),
    );
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Over the band",
    );
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(await screen.findByText("Rejected: 2 people.")).toBeInTheDocument();
    expect(api.bulk).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REJECT", sendEmails: true }),
      expect.anything(),
    );
    expect(
      screen.getByText(/2 emails were queued to send/),
    ).toBeInTheDocument();
  });
});
