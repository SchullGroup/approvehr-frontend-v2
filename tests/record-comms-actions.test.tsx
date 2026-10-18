import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiApplicationDetail } from "@/lib/api/recruitment";

/**
 * A candidate's record, and the email, panel, score and deletion choices on it.
 *
 * The record is where a person moves, rejects, books and sends one candidate at a
 * time, so it carries the same rules as the board: nobody is emailed unless somebody
 * chose it, what the page says about an email is what the API said about it, and a
 * choice that is not offered (the server predates emails) is not faked.
 */

vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));
const who = vi.hoisted(() => ({ hasRecord: true }));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: true,
    isLoading: false,
    /* An account with no employee record (a company without Core HR). */
    ...(who.hasRecord ? {} : { employeeId: null }),
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({
    people: [
      {
        id: "p1",
        fullName: "Chidi Nwosu",
        jobTitle: "Engineer",
        department: null,
      },
      {
        id: "p2",
        fullName: "Emeka Anyanwu",
        jobTitle: "Designer",
        department: null,
      },
    ],
    loading: false,
  }),
}));

const rec = {
  listStages: vi.fn(),
  moveApplication: vi.fn(),
  scheduleInterview: vi.fn(),
  sendOffer: vi.fn(),
  submitScorecard: vi.fn(),
};
vi.mock("@/lib/api/recruitment", async (original) => {
  const real = await original<typeof import("@/lib/api/recruitment")>();
  return {
    ...real,
    recruitmentApi: new Proxy(real.recruitmentApi, {
      get: (target, name: string) =>
        name in rec
          ? (...args: unknown[]) =>
              (rec as Record<string, (...a: unknown[]) => unknown>)[name]?.(
                ...args,
              )
          : (target as Record<string, unknown>)[name],
    }),
  };
});

const pipe = { reject: vi.fn(), listReasons: vi.fn(), listTags: vi.fn() };
vi.mock("@/lib/api/pipeline", () => ({
  pipelineApi: new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          (pipe as Record<string, (...a: unknown[]) => unknown>)[name]?.(
            ...args,
          ),
    },
  ),
}));

const comms = { stages: vi.fn(), catalog: vi.fn(), readiness: vi.fn() };
vi.mock("@/lib/hiring/pipeline/api-comms", async (original) => {
  const real =
    await original<typeof import("@/lib/hiring/pipeline/api-comms")>();
  return {
    ...real,
    apiComms: {
      stages: { list: (...a: unknown[]) => comms.stages(...a) },
      emails: {
        catalog: (...a: unknown[]) => comms.catalog(...a),
        readiness: (...a: unknown[]) => comms.readiness(...a),
      },
    },
  };
});

const { RealPipeline } =
  await import("@/app/(app)/hiring/candidates/[id]/real-pipeline");

const READY = {
  supported: true,
  enabled: true,
  willSend: true,
  blockedBy: [] as string[],
  sender: null,
};

const base = {
  id: "pa-1",
  requisitionId: "req-1",
  candidateId: "cand-1",
  candidateName: "Chioma Aduba",
  candidateEmail: "chioma@example.com",
  stageId: "s1",
  stageName: "Applied",
  stageEnteredAt: "2026-10-10T09:00:00.000Z",
  rejectionReason: null,
  outcome: "IN_PROGRESS",
  requisitionReference: "REQ-1",
  requisitionJobTitle: "Payroll Analyst",
  candidate: { id: "cand-1" },
  interviews: [],
  history: [],
  offer: null,
};

const application = (over: Record<string, unknown> = {}) =>
  ({ ...base, ...over }) as unknown as ApiApplicationDetail;

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
  {
    stageId: "s4",
    name: "Interview",
    order: 3,
    type: "INTERVIEW",
    emailTemplateId: null,
    panel: [{ employeeId: "p1", name: "Chidi Nwosu", jobTitle: "Engineer" }],
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

const open = (
  app: ApiApplicationDetail = application(),
  onChanged = vi.fn(),
) => {
  render(
    <ToastProvider>
      <RealPipeline application={app} onChanged={onChanged} />
    </ToastProvider>,
  );
  return onChanged;
};

/** The stage emails have been read, so a move knows to ask. */
const knowsStages = () =>
  waitFor(() => expect(comms.catalog).toHaveBeenCalled()).then(
    () => new Promise((resolve) => setTimeout(resolve, 30)),
  );

beforeEach(() => {
  for (const fn of [
    ...Object.values(rec),
    ...Object.values(pipe),
    ...Object.values(comms),
  ])
    fn.mockReset();
  rec.listStages.mockResolvedValue([
    {
      id: "s1",
      requisitionId: "req-1",
      name: "Applied",
      order: 0,
      requiresScorecards: false,
      type: "APPLIED",
    },
    {
      id: "s2",
      requisitionId: "req-1",
      name: "Test",
      order: 1,
      requiresScorecards: false,
      type: "TEST",
      emailTemplateId: "t1",
    },
    {
      id: "s3",
      requisitionId: "req-1",
      name: "Phone screen",
      order: 2,
      requiresScorecards: false,
      type: "SCREENING",
    },
    {
      id: "s4",
      requisitionId: "req-1",
      name: "Interview",
      order: 3,
      requiresScorecards: true,
      type: "INTERVIEW",
    },
  ]);
  pipe.listReasons.mockResolvedValue([
    {
      id: "x1",
      label: "Over the band",
      order: 0,
      starter: true,
      archived: false,
    },
  ]);
  pipe.listTags.mockResolvedValue([]);
  comms.stages.mockResolvedValue(STAGES);
  comms.catalog.mockResolvedValue(CATALOG);
  comms.readiness.mockResolvedValue(READY);
});

describe("moving from the record", () => {
  it("asks first when the stage sends a message, and 'without' says outright not to send it", async () => {
    const user = userEvent.setup();
    rec.moveApplication.mockResolvedValue({ email: null });
    open();
    await knowsStages();
    await user.selectOptions(screen.getByLabelText("Move to…"), "Test");
    const dialog = await screen.findByRole("dialog", {
      name: "Move Chioma Aduba to Test?",
    });
    expect(dialog).toHaveTextContent("Take the test");
    expect(rec.moveApplication).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Move without emailing" }),
    );
    await waitFor(() =>
      expect(rec.moveApplication).toHaveBeenCalledWith("pa-1", "s2", false),
    );
    expect(await screen.findByText("Moved.")).toBeInTheDocument();
  });

  it("sends only when 'Move and email' was pressed, and says queued, not sent", async () => {
    const user = userEvent.setup();
    rec.moveApplication.mockResolvedValue({
      email: { id: "e1", kind: "STAGE_UPDATE", status: "PENDING", note: null },
    });
    open();
    await knowsStages();
    await user.selectOptions(screen.getByLabelText("Move to…"), "Test");
    await user.click(
      await screen.findByRole("button", { name: "Move and email" }),
    );
    await waitFor(() =>
      expect(rec.moveApplication).toHaveBeenCalledWith("pa-1", "s2", true),
    );
    expect(
      await screen.findByText(
        "Moved. The email to Chioma Aduba is queued. It is not sent yet.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("says, as a warning, when the email was recorded as not sent", async () => {
    const user = userEvent.setup();
    rec.moveApplication.mockResolvedValue({
      email: {
        id: "e1",
        kind: "STAGE_UPDATE",
        status: "SKIPPED",
        note: "not sent: emails to candidates are switched off for this company",
      },
    });
    open();
    await knowsStages();
    await user.selectOptions(screen.getByLabelText("Move to…"), "Test");
    await user.click(
      await screen.findByRole("button", { name: "Move and email" }),
    );
    expect(
      await screen.findByText(
        /Moved\. The email to Chioma Aduba was not sent\. Emails to candidates are switched off for this company/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Done, with a note")).toBeInTheDocument();
  });

  it("does not ask for a stage with no message, and says outright not to send", async () => {
    const user = userEvent.setup();
    rec.moveApplication.mockResolvedValue({ email: null });
    open();
    await knowsStages();
    await user.selectOptions(screen.getByLabelText("Move to…"), "Phone screen");
    await waitFor(() =>
      expect(rec.moveApplication).toHaveBeenCalledWith("pa-1", "s3", false),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not ask, and sends nothing, when the server predates emails", async () => {
    const user = userEvent.setup();
    comms.readiness.mockResolvedValue({ ...READY, supported: false });
    rec.moveApplication.mockResolvedValue({});
    open();
    await knowsStages();
    await user.selectOptions(screen.getByLabelText("Move to…"), "Test");
    await waitFor(() =>
      expect(rec.moveApplication).toHaveBeenCalledWith("pa-1", "s2", false),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("rejecting from the record", () => {
  const reject = async (
    user: ReturnType<typeof userEvent.setup>,
    tick: boolean,
  ) => {
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reject Chioma Aduba?",
    });
    if (tick)
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
  };

  it("sends nothing unless the decline was ticked, and says so", async () => {
    const user = userEvent.setup();
    pipe.reject.mockResolvedValue({ email: null });
    open();
    await knowsStages();
    await reject(user, false);
    expect(
      await screen.findByText("Rejected. Nothing was sent to them."),
    ).toBeInTheDocument();
    expect(pipe.reject).toHaveBeenCalledWith("pa-1", {
      reasonId: "x1",
      note: null,
      sendEmail: false,
    });
  });

  it("asks for the decline when ticked, and words what the API says it did", async () => {
    const user = userEvent.setup();
    pipe.reject.mockResolvedValue({
      email: { id: "e1", kind: "DECLINE", status: "PENDING", note: null },
    });
    open();
    await knowsStages();
    await reject(user, true);
    expect(
      await screen.findByText(
        "Rejected. The email to Chioma Aduba is queued. It is not sent yet.",
      ),
    ).toBeInTheDocument();
    expect(pipe.reject).toHaveBeenCalledWith("pa-1", {
      reasonId: "x1",
      note: null,
      sendEmail: true,
    });
  });
});

describe("what the record says", () => {
  it("lists the emails the application has had or is owed, and says why one was not sent", async () => {
    open(
      application({
        emails: [
          {
            id: "e1",
            kind: "STAGE_UPDATE",
            kindLabel: "Update on their application",
            trigger: "STAGE_ENTRY",
            status: "SENT",
            note: null,
            subject: "Schull: an update",
            stageName: "Test",
            templateName: "Take the test",
            sentAt: "2026-10-12T09:31:00.000Z",
            createdAt: "2026-10-12T09:30:00.000Z",
          },
          {
            id: "e2",
            kind: "DECLINE",
            kindLabel: "Not taking them forward",
            trigger: "REJECTION",
            status: "SKIPPED",
            note: "not sent: no reply-to address is set for this company (Careers settings). We do not send an email whose replies would go nowhere",
            subject: null,
            stageName: "Applied",
            templateName: "Kind decline",
            sentAt: null,
            createdAt: "2026-10-13T09:30:00.000Z",
          },
        ],
      }),
    );
    const card = (await screen.findByText("Emails to them")).closest(
      "section, div",
    ) as HTMLElement;
    expect(card).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("Not sent")).toBeInTheDocument();
    expect(
      screen.getByText(/^No reply-to address is set for this company/),
    ).toBeInTheDocument();
  });

  it("shows no email card for a server that does not send emails", () => {
    open(application());
    expect(screen.queryByText("Emails to them")).not.toBeInTheDocument();
  });

  it("shows the interview score once there is one, and not while nobody has scored", () => {
    const { rerender } = render(
      <ToastProvider>
        <RealPipeline application={application()} onChanged={() => undefined} />
      </ToastProvider>,
    );
    expect(screen.queryByText("Interview score")).not.toBeInTheDocument();
    rerender(
      <ToastProvider>
        <RealPipeline
          application={application({
            scores: {
              outOf: 5,
              composite: 4.17,
              compositeBp: 41667,
              interviews: [],
              recommendations: { STRONG_YES: 1, YES: 0, NO: 0, STRONG_NO: 0 },
              byCompetency: [],
              scorecardsSubmitted: 1,
            },
          })}
          onChanged={() => undefined}
        />
      </ToastProvider>,
    );
    expect(screen.getByText("Interview score")).toBeInTheDocument();
    expect(screen.getByText("4.17")).toBeInTheDocument();
  });

  it("says the day a rejected person is scheduled to go, and nothing for somebody still in progress", () => {
    const { unmount } = render(
      <ToastProvider>
        <RealPipeline
          application={application({
            outcome: "REJECTED",
            retention: { scheduledDeletionOn: "2027-11-03", reason: null },
          })}
          onChanged={() => undefined}
        />
      </ToastProvider>,
    );
    expect(screen.getByText(/Scheduled for deletion on/).textContent).toContain(
      "3 Nov 2027",
    );
    unmount();
    render(
      <ToastProvider>
        <RealPipeline
          application={application({
            retention: { scheduledDeletionOn: "2027-11-03", reason: null },
          })}
          onChanged={() => undefined}
        />
      </ToastProvider>,
    );
    expect(
      screen.queryByText(/Scheduled for deletion on/),
    ).not.toBeInTheDocument();
  });

  it("shows who was invited to score an interview and whose scorecard is in", () => {
    open(
      application({
        interviews: [
          {
            id: "i1",
            kind: "PANEL",
            scheduledFor: "2026-10-20T09:00:00.000Z",
            durationMins: 60,
            status: "SCHEDULED",
            location: "Lagos",
            stageName: "Interview",
            scorecards: [{ id: "sc1", interviewerId: "p1", submitted: true }],
            panelists: [
              { employeeId: "p1", name: "Chidi Nwosu", submitted: true },
              { employeeId: "p2", name: "Emeka Anyanwu", submitted: false },
            ],
          },
        ],
      }),
    );
    expect(screen.getByText(/Invited to score it:/).textContent).toContain(
      "Chidi Nwosu (scorecard in), Emeka Anyanwu (waiting)",
    );
    expect(screen.getByText("1 of 2 scorecards in")).toBeInTheDocument();
  });
});

describe("booking an interview", () => {
  /** What the API answers a booking with: the interview, and what became of each message. */
  const booked = (over: Record<string, unknown> = {}) => ({
    id: "iv-1",
    applicationId: "pa-1",
    requisitionId: "req-1",
    requisitionReference: "REQ-1",
    candidateName: "Chioma Aduba",
    kind: "SCREEN",
    scheduledFor: "2026-10-30T09:00:00.000Z",
    durationMins: 60,
    status: "SCHEDULED",
    location: null,
    joinUrl: null,
    timeZone: "Africa/Lagos",
    timeZoneLabel: "Africa/Lagos (GMT+1)",
    calendarSequence: 0,
    scorecardsSubmitted: 0,
    stageId: "s4",
    stageName: "Interview",
    panelists: [],
    scorecards: [],
    email: null,
    notified: {
      asked: false,
      occasion: null,
      sendTo: "ALL",
      candidate: {
        state: "not_asked",
        emailId: null,
        emailKind: null,
        reason: null,
      },
      panelists: [],
    },
    ...over,
  });

  const book = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Schedule an interview",
    });
    fireEvent.change(
      dialog.querySelector("input[type=date]") as HTMLInputElement,
      {
        target: { value: "2026-10-30" },
      },
    );
    fireEvent.change(
      dialog.querySelector("input[type=time]") as HTMLInputElement,
      {
        target: { value: "10:00" },
      },
    );
    return dialog;
  };

  it("invites the stage's panel by default, and says outright that no invitation is sent unless chosen", async () => {
    const user = userEvent.setup();
    rec.scheduleInterview.mockResolvedValue(booked());
    open(application({ stageId: "s4", stageName: "Interview" }));
    await knowsStages();
    const dialog = await book(user);
    expect(dialog).toHaveTextContent(
      "The stage's panel is invited: Chidi Nwosu.",
    );
    expect(
      within(dialog).getByRole("radio", { name: /^Don't send/ }),
    ).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(rec.scheduleInterview).toHaveBeenCalled());
    const [applicationId, body] = rec.scheduleInterview.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(applicationId).toBe("pa-1");
    expect(body).not.toHaveProperty("panelistIds");
    expect(body).toMatchObject({
      sendInvite: false,
      /* 10:00 on the company's clock, with the clock said outright. */
      scheduledFor: "2026-10-30T09:00:00.000Z",
      timeZone: "Africa/Lagos",
    });
    const done = await screen.findByRole("dialog", {
      name: "Interview booked",
    });
    expect(done).toHaveTextContent("Nothing was emailed.");
  });

  it("sends the join link and the place, and only when they were given", async () => {
    const user = userEvent.setup();
    rec.scheduleInterview.mockResolvedValue(booked());
    open(application({ stageId: "s4", stageName: "Interview" }));
    await knowsStages();
    const dialog = await book(user);
    await user.type(
      within(dialog).getByLabelText(/Join link/),
      "https://meet.google.com/abc-defg-hij",
    );
    await user.type(within(dialog).getByLabelText(/Location/), "Boardroom");
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(rec.scheduleInterview).toHaveBeenCalled());
    expect(rec.scheduleInterview.mock.calls[0]?.[1]).toMatchObject({
      joinUrl: "https://meet.google.com/abc-defg-hij",
      location: "Boardroom",
    });
  });

  it("names the people when they were chosen for this interview, and sends the whole set", async () => {
    const user = userEvent.setup();
    rec.scheduleInterview.mockResolvedValue(booked());
    open(application({ stageId: "s4", stageName: "Interview" }));
    await knowsStages();
    const dialog = await book(user);
    await user.click(
      within(dialog).getByRole("button", { name: "Choose who is invited" }),
    );
    await user.click(
      within(dialog).getByRole("combobox", {
        name: /Add somebody: Invited to score this interview/,
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: /Emeka Anyanwu/ }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(rec.scheduleInterview).toHaveBeenCalled());
    expect(rec.scheduleInterview.mock.calls[0]?.[1]).toMatchObject({
      panelistIds: ["p1", "p2"],
    });
  });

  it("emails an invitation only when chosen, and says what the API says it did: queued is not sent", async () => {
    const user = userEvent.setup();
    rec.scheduleInterview.mockResolvedValue(
      booked({
        notified: {
          asked: true,
          occasion: "INVITE",
          sendTo: "ALL",
          candidate: {
            state: "queued",
            emailId: "e1",
            emailKind: "INVITE",
            reason: null,
          },
          panelists: [
            {
              state: "skipped",
              emailId: "e2",
              emailKind: "PANELIST_INVITE",
              reason: "not sent: this panelist has no email address",
              employeeId: "p1",
              userId: null,
              seat: "EMPLOYEE",
              name: "Chidi Nwosu",
              inApp: "created",
            },
          ],
        },
      }),
    );
    open(application({ stageId: "s4", stageName: "Interview" }));
    await knowsStages();
    const dialog = await book(user);
    await user.click(
      within(dialog).getByRole("radio", {
        name: /^Send the invitation with a calendar file/,
      }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(rec.scheduleInterview).toHaveBeenCalled());
    expect(rec.scheduleInterview.mock.calls[0]?.[1]).toMatchObject({
      sendInvite: true,
    });
    const done = await screen.findByRole("dialog", {
      name: "Interview booked",
    });
    expect(done).toHaveTextContent("Chioma Aduba: queued.");
    expect(done).toHaveTextContent(
      "Chidi Nwosu: skipped. This panelist has no email address.",
    );
    expect(done).toHaveTextContent("so it was not sent");
    expect(done).not.toHaveTextContent("were sent");
  });

  it("falls back to the candidate's own email when the server says nothing about the panel", async () => {
    const user = userEvent.setup();
    rec.scheduleInterview.mockResolvedValue(
      booked({
        notified: undefined,
        email: { id: "e1", kind: "INVITE", status: "PENDING", note: null },
      }),
    );
    open(application({ stageId: "s4", stageName: "Interview" }));
    await knowsStages();
    const dialog = await book(user);
    await user.click(
      within(dialog).getByRole("radio", {
        name: /^Send the invitation with a calendar file/,
      }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    const done = await screen.findByRole("dialog", {
      name: "Interview booked",
    });
    expect(done).toHaveTextContent("Chioma Aduba: queued.");
  });
});

describe("sending an offer", () => {
  const approved = application({
    outcome: "IN_PROGRESS",
    offer: {
      id: "offer-1",
      applicationId: "pa-1",
      grossMonthlyKobo: 50_000_000,
      startDate: "2026-11-01",
      status: "PENDING_APPROVAL",
      outsideBand: false,
      approvedById: "u1",
      approvedAt: "2026-10-10T09:00:00.000Z",
      sentAt: null,
      respondedAt: null,
      employeeId: null,
    },
  });

  it("sends no notice unless ticked", async () => {
    const user = userEvent.setup();
    rec.sendOffer.mockResolvedValue({ email: null });
    open(approved);
    await knowsStages();
    expect(
      await screen.findByRole("checkbox", {
        name: /Also tell them an offer is on its way/,
      }),
    ).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(rec.sendOffer).toHaveBeenCalledWith("offer-1", {}),
    );
  });

  it("sends the notice when ticked, and says what happened to it", async () => {
    const user = userEvent.setup();
    rec.sendOffer.mockResolvedValue({
      email: {
        id: "e1",
        kind: "OFFER_SENT",
        status: "SKIPPED",
        note: "not sent: no reply-to address is set for this company (Careers settings). We do not send an email whose replies would go nowhere",
      },
    });
    open(approved);
    await knowsStages();
    await user.click(
      await screen.findByRole("checkbox", {
        name: /Also tell them an offer is on its way/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(rec.sendOffer).toHaveBeenCalledWith("offer-1", {
        sendEmail: true,
      }),
    );
    expect(
      await screen.findByText(
        /Offer marked as sent\. The email to Chioma Aduba was not sent\. No reply-to address/,
      ),
    ).toBeInTheDocument();
  });

  it("does not offer the notice when the server sends no emails", async () => {
    comms.readiness.mockResolvedValue({ ...READY, supported: false });
    open(approved);
    await knowsStages();
    expect(
      screen.queryByRole("checkbox", {
        name: /Also tell them an offer is on its way/,
      }),
    ).not.toBeInTheDocument();
  });
});

describe("handing in a scorecard from the record, without an employee record", () => {
  it("offers no form the API would refuse, and says where scorecards are handed in", () => {
    who.hasRecord = false;
    try {
      open(
        application({
          interviews: [
            {
              id: "i1",
              kind: "PANEL",
              scheduledFor: "2026-10-20T09:00:00.000Z",
              durationMins: 60,
              status: "COMPLETED",
              location: null,
              scorecards: [],
            },
          ],
        }),
      );
      expect(
        screen.queryByRole("button", { name: "Submit a scorecard" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          "Scorecards are handed in by the people invited to score, from My interviews.",
        ),
      ).toBeInTheDocument();
    } finally {
      who.hasRecord = true;
    }
  });
});

describe("handing in a scorecard from the record", () => {
  it("sends each rating with its weight, and a refusal stays in the dialog", async () => {
    const user = userEvent.setup();
    rec.submitScorecard.mockResolvedValue({});
    open(
      application({
        interviews: [
          {
            id: "i1",
            kind: "PANEL",
            scheduledFor: "2026-10-20T09:00:00.000Z",
            durationMins: 60,
            status: "COMPLETED",
            location: null,
            scorecards: [],
          },
        ],
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Submit a scorecard" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Submit a scorecard",
    });
    await user.selectOptions(
      within(dialog).getByRole("combobox", {
        name: "Score for Technical depth",
      }),
      "5",
    );
    await user.clear(
      within(dialog).getByRole("textbox", {
        name: "Weight for Technical depth",
      }),
    );
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Weight for Technical depth",
      }),
      "2",
    );
    await user.click(within(dialog).getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(rec.submitScorecard).toHaveBeenCalled());
    expect(rec.submitScorecard).toHaveBeenCalledWith("i1", {
      recommendation: null,
      ratings: [{ competency: "Technical depth", score: 5, weight: 2 }],
    });
  });
});
