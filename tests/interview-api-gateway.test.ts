import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewView } from "@/lib/hiring/interviews/model";

/**
 * The connected side of the interview screens, with the API's answers written out.
 *
 * What these hold: what is sent says outright whether to tell anybody, the zone it was
 * typed in and only what changed; what comes back is read in the API's own words, `queued`
 * never becomes `sent`, and a server that says nothing about the panel is not made to.
 */

const rec = vi.hoisted(() => ({
  scheduleInterview: vi.fn(),
  rescheduleInterview: vi.fn(),
  cancelInterview: vi.fn(),
  notifyInterview: vi.fn(),
  completeInterview: vi.fn(),
  noShowInterview: vi.fn(),
}));
const ivs = vi.hoisted(() => ({
  staffCalendarFile: vi.fn(),
  myCalendarFile: vi.fn(),
  notices: vi.fn(),
}));
const catalog = vi.hoisted(() => ({ catalog: vi.fn() }));

vi.mock("@/lib/api/recruitment", async (original) => {
  const real = await original<typeof import("@/lib/api/recruitment")>();
  return { ...real, recruitmentApi: { ...real.recruitmentApi, ...rec } };
});
vi.mock("@/lib/api/interviews", () => ({ interviewsApi: ivs }));
vi.mock("@/lib/api/candidate-email", async (original) => {
  const real = await original<typeof import("@/lib/api/candidate-email")>();
  return {
    ...real,
    candidateEmailApi: { ...real.candidateEmailApi, ...catalog },
  };
});

const { apiInterviewsGateway } =
  await import("@/lib/hiring/interviews/api-gateway");
const { INVITE_EXPLAINER } = await import("@/lib/hiring/interviews/words");

const answer = (over: Record<string, unknown> = {}) => ({
  id: "iv-1",
  applicationId: "pa-1",
  requisitionId: "req-1",
  requisitionReference: "REQ-1",
  candidateName: "Chioma Aduba",
  kind: "TECHNICAL",
  scheduledFor: "2026-10-20T09:00:00.000Z",
  durationMins: 60,
  status: "SCHEDULED",
  location: "Boardroom",
  joinUrl: "https://meet.google.com/abc-defg-hij",
  timeZone: "Africa/Lagos",
  calendarSequence: 2,
  scorecardsSubmitted: 0,
  stageId: "s4",
  stageName: "Interview",
  panelists: [
    { employeeId: "p1", userId: null, name: "Chidi Nwosu", submitted: false },
    { employeeId: null, userId: "u9", name: "Kemi Outsider", submitted: false },
  ],
  scorecards: [],
  ...over,
});

const notified = (over: Record<string, unknown> = {}) => ({
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
      state: "queued",
      emailId: "e2",
      emailKind: "PANELIST_INVITE",
      reason: null,
      employeeId: "p1",
      userId: null,
      seat: "EMPLOYEE",
      name: "Chidi Nwosu",
      inApp: "created",
    },
  ],
  ...over,
});

const was: InterviewView = {
  id: "iv-1",
  applicationId: "pa-1",
  candidateName: "Chioma Aduba",
  role: "Payroll Analyst",
  kind: "TECHNICAL",
  scheduledFor: "2026-10-20T09:00:00.000Z",
  durationMins: 60,
  status: "SCHEDULED",
  location: "Boardroom",
  joinUrl: null,
  timeZone: "Africa/Lagos",
  stageName: "Interview",
  panelists: [],
  sequence: 0,
  notices: [
    {
      id: "old",
      kind: "INVITE",
      audience: "CANDIDATE",
      recipient: "Chioma Aduba",
      status: "SENT",
      note: null,
      at: "2026-10-12T09:00:00.000Z",
    },
  ],
  cancelReason: null,
};

const target = {
  applicationId: "pa-1",
  candidateName: "Chioma Aduba",
  role: "Payroll Analyst",
  stageName: "Interview",
  stageSeats: [],
};

beforeEach(() => {
  for (const fn of [
    ...Object.values(rec),
    ...Object.values(ivs),
    catalog.catalog,
  ])
    fn.mockReset();
});

describe("booking", () => {
  const input = {
    kind: "TECHNICAL" as const,
    scheduledFor: "2026-10-20T09:00:00.000Z",
    timeZone: "Africa/Lagos",
    durationMins: 60,
    location: null,
    joinUrl: null,
    panel: null,
    sendInvite: false,
  };

  it("says outright not to send, names the zone, and leaves out what was not given", async () => {
    rec.scheduleInterview.mockResolvedValue(
      answer({
        notified: notified({
          asked: false,
          candidate: {
            state: "not_asked",
            emailId: null,
            emailKind: null,
            reason: null,
          },
          panelists: [],
        }),
      }),
    );
    await apiInterviewsGateway.schedule(target, input);
    expect(rec.scheduleInterview).toHaveBeenCalledWith("pa-1", {
      kind: "TECHNICAL",
      scheduledFor: "2026-10-20T09:00:00.000Z",
      timeZone: "Africa/Lagos",
      durationMins: 60,
      sendInvite: false,
    });
  });

  it("sends the link, the place and both halves of the panel when they were chosen", async () => {
    rec.scheduleInterview.mockResolvedValue(answer({ notified: notified() }));
    await apiInterviewsGateway.schedule(target, {
      ...input,
      location: "Boardroom",
      joinUrl: "https://meet.google.com/abc-defg-hij",
      panel: { employeeIds: ["p1"], userIds: ["u9"] },
      sendInvite: true,
    });
    expect(rec.scheduleInterview.mock.calls[0]?.[1]).toMatchObject({
      location: "Boardroom",
      joinUrl: "https://meet.google.com/abc-defg-hij",
      panelistIds: ["p1"],
      panelistUserIds: ["u9"],
      sendInvite: true,
    });
  });

  it("reads each recipient's answer as the API gave it, and never as sent", async () => {
    rec.scheduleInterview.mockResolvedValue(
      answer({
        notified: notified({
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
            {
              state: "queued",
              emailId: "e3",
              emailKind: "PANELIST_INVITE",
              reason: null,
              employeeId: null,
              userId: "u9",
              seat: "ACCOUNT",
              name: "Kemi Outsider",
              inApp: "no_account",
            },
          ],
        }),
      }),
    );
    const { outcome } = await apiInterviewsGateway.schedule(target, {
      ...input,
      sendInvite: true,
    });
    expect(outcome.asked).toBe(true);
    expect(
      outcome.notices.map((n) => [n.audience, n.recipient, n.kind, n.status]),
    ).toEqual([
      ["CANDIDATE", "Chioma Aduba", "INVITE", "PENDING"],
      ["PANELIST", "Chidi Nwosu", "INVITE", "SKIPPED"],
      ["PANELIST", "Kemi Outsider", "INVITE", "PENDING"],
    ]);
    expect(outcome.notices[1]?.note).toBe(
      "not sent: this panelist has no email address",
    );
    expect(outcome.notices.some((n) => n.status === "SENT")).toBe(false);
    expect(outcome.notices[1]).toMatchObject({ inApp: "created" });
  });

  it("reads 'not asked', 'already queued' and 'already sent' as what each is", async () => {
    rec.scheduleInterview.mockResolvedValue(
      answer({
        notified: notified({
          candidate: {
            state: "already_sent",
            emailId: "e1",
            emailKind: "INVITE",
            reason: null,
          },
          panelists: [
            {
              state: "already_queued",
              emailId: "e2",
              emailKind: "PANELIST_INVITE",
              reason: null,
              employeeId: "p1",
              userId: null,
              seat: "EMPLOYEE",
              name: "Chidi Nwosu",
              inApp: "not_asked",
            },
            {
              state: "not_asked",
              emailId: null,
              emailKind: null,
              reason: null,
              employeeId: null,
              userId: "u9",
              seat: "ACCOUNT",
              name: "Kemi Outsider",
              inApp: "not_asked",
            },
          ],
        }),
      }),
    );
    const { outcome } = await apiInterviewsGateway.schedule(target, input);
    expect(outcome.notices.map((n) => n.status)).toEqual([
      "SENT",
      "PENDING",
      "NOT_ASKED",
    ]);
    expect(outcome.notices[1]?.note).toBe(
      "It was already queued for this version of the interview.",
    );
  });

  it("draws the interview from what the API answered, with the zone and the sequence it kept", async () => {
    rec.scheduleInterview.mockResolvedValue(answer({ notified: notified() }));
    const { interview } = await apiInterviewsGateway.schedule(target, {
      ...input,
      sendInvite: true,
    });
    expect(interview).toMatchObject({
      id: "iv-1",
      role: "Payroll Analyst",
      timeZone: "Africa/Lagos",
      sequence: 2,
      joinUrl: "https://meet.google.com/abc-defg-hij",
    });
    expect(interview.panelists.map((p) => p.key)).toEqual(["e:p1", "u:u9"]);
    /* A new interview's log is what was just asked for, and nothing it did not ask for. */
    expect(interview.notices?.map((n) => n.status)).toEqual([
      "PENDING",
      "PENDING",
    ]);
  });

  it("says only what an older server says: the candidate's own email, and nothing about a panel", async () => {
    rec.scheduleInterview.mockResolvedValue(
      answer({
        notified: undefined,
        email: { id: "e1", kind: "INVITE", status: "PENDING", note: null },
      }),
    );
    const { outcome } = await apiInterviewsGateway.schedule(target, {
      ...input,
      sendInvite: true,
    });
    expect(outcome.notices).toHaveLength(1);
    expect(outcome.notices[0]).toMatchObject({
      audience: "CANDIDATE",
      status: "PENDING",
    });
  });
});

describe("changing, cancelling and sending later", () => {
  it("sends only what changed, and says outright whether to send an update", async () => {
    rec.rescheduleInterview.mockResolvedValue(
      answer({
        notified: notified({
          occasion: "UPDATE",
          candidate: {
            state: "queued",
            emailId: "e1",
            emailKind: "INTERVIEW_UPDATE",
            reason: null,
          },
          panelists: [],
        }),
      }),
    );
    const { interview, outcome } = await apiInterviewsGateway.change(was, {
      scheduledFor: "2026-10-21T09:00:00.000Z",
      joinUrl: null,
      sendUpdate: true,
    });
    expect(rec.rescheduleInterview).toHaveBeenCalledWith("iv-1", {
      scheduledFor: "2026-10-21T09:00:00.000Z",
      joinUrl: null,
      sendUpdate: true,
    });
    expect(outcome.notices[0]).toMatchObject({
      kind: "UPDATE",
      status: "PENDING",
    });
    /* What was already on record stays, and what was just asked for is added. */
    expect(interview.notices?.map((n) => [n.id, n.status])).toEqual([
      ["old", "SENT"],
      ["e1", "PENDING"],
    ]);
  });

  it("reads an invitation that went where an update was asked for as the invitation it is", async () => {
    rec.rescheduleInterview.mockResolvedValue(
      answer({
        notified: notified({
          occasion: "UPDATE",
          candidate: {
            state: "queued",
            emailId: "e1",
            emailKind: "INVITE",
            reason: null,
          },
          panelists: [],
        }),
      }),
    );
    const { outcome } = await apiInterviewsGateway.change(was, {
      durationMins: 45,
      sendUpdate: true,
    });
    expect(outcome.notices[0]?.kind).toBe("INVITE");
  });

  it("does not add 'not asked' to the log, which holds only what was asked", async () => {
    rec.rescheduleInterview.mockResolvedValue(
      answer({
        notified: notified({
          asked: false,
          candidate: {
            state: "not_asked",
            emailId: null,
            emailKind: null,
            reason: null,
          },
          panelists: [],
        }),
      }),
    );
    const { interview, outcome } = await apiInterviewsGateway.change(was, {
      durationMins: 45,
      sendUpdate: false,
    });
    expect(outcome.notices[0]?.status).toBe("NOT_ASKED");
    expect(interview.notices).toHaveLength(1);
  });

  it("cancels with the choice said outright", async () => {
    rec.cancelInterview.mockResolvedValue(
      answer({
        status: "CANCELLED",
        notified: notified({
          occasion: "CANCEL",
          candidate: {
            state: "skipped",
            emailId: "e1",
            emailKind: "INTERVIEW_CANCELLED",
            reason: "not sent: mail not configured",
          },
          panelists: [],
        }),
      }),
    );
    const { interview, outcome } = await apiInterviewsGateway.cancel(was, {
      reason: "Role on hold",
      sendCancellation: true,
    });
    expect(rec.cancelInterview).toHaveBeenCalledWith("iv-1", {
      sendCancellation: true,
    });
    expect(interview.status).toBe("CANCELLED");
    expect(outcome.notices[0]).toMatchObject({
      kind: "CANCEL",
      status: "SKIPPED",
      note: "not sent: mail not configured",
    });
  });

  it("sends an invitation later only through the route that says so", async () => {
    rec.notifyInterview.mockResolvedValue(answer({ notified: notified() }));
    const { outcome } = await apiInterviewsGateway.notify(was);
    expect(rec.notifyInterview).toHaveBeenCalledWith("iv-1");
    expect(outcome.asked).toBe(true);
  });

  it("leaves a refusal as the error the client threw, with the API's sentence", async () => {
    const { ApiError } = await import("@/lib/api/client");
    rec.scheduleInterview.mockRejectedValue(
      new ApiError(400, "validation_failed", "Some fields are not valid.", [
        {
          field: "joinUrl",
          message: "A join link has to be a full https:// address.",
        },
      ]),
    );
    await expect(
      apiInterviewsGateway.schedule(target, {
        kind: "SCREEN",
        scheduledFor: "2026-10-20T09:00:00.000Z",
        timeZone: "Africa/Lagos",
        durationMins: 60,
        location: null,
        joinUrl: "https://x.co",
        panel: null,
        sendInvite: false,
      }),
    ).rejects.toMatchObject({
      status: 400,
      fieldErrors: [
        {
          field: "joinUrl",
          message: "A join link has to be a full https:// address.",
        },
      ],
    });
  });
});

describe("the calendar file", () => {
  it("fetches a staff member's copy from the staff route, and a panelist's from their own", async () => {
    const file = { filename: "interview-x.ics", blob: new Blob(["x"]) };
    ivs.staffCalendarFile.mockResolvedValue(file);
    ivs.myCalendarFile.mockResolvedValue(file);
    expect(await apiInterviewsGateway.calendarFile(was, "staff")).toEqual({
      ...file,
      note: null,
    });
    expect(ivs.staffCalendarFile).toHaveBeenCalledWith("iv-1");
    expect(ivs.myCalendarFile).not.toHaveBeenCalled();
    await apiInterviewsGateway.calendarFile(was, "panelist");
    expect(ivs.myCalendarFile).toHaveBeenCalledWith("iv-1");
  });

  it("lets the API's refusal through, so the menu can say it", async () => {
    const { ApiError } = await import("@/lib/api/client");
    ivs.myCalendarFile.mockRejectedValue(
      new ApiError(404, "not_found", "That interview was not found."),
    );
    await expect(
      apiInterviewsGateway.calendarFile(was, "panelist"),
    ).rejects.toMatchObject({
      message: "That interview was not found.",
    });
  });
});

describe("what goes to whom", () => {
  const kind = (name: string) => ({
    kind: name,
    label: name,
    when: "x",
    audience: name.startsWith("PANELIST") ? "PANELIST" : "CANDIDATE",
    fields: [],
    builtIn: { subject: "", body: "" },
    defaultTemplateId: null,
  });

  it("is stated from the contract where the server sends the panel an email, and says nothing about pay, scores or contact details being sent", async () => {
    catalog.catalog.mockResolvedValue({
      fields: [],
      templates: [],
      sender: null,
      kinds: [kind("INVITE"), kind("PANELIST_INVITE")],
    });
    const said = await apiInterviewsGateway.explainer(
      new AbortController().signal,
    );
    expect(said).toEqual(INVITE_EXPLAINER);
    expect(said?.candidate).toContain("It names nobody but your company.");
    expect(said?.panelist).toContain("Never contact details, pay or a score.");
  });

  it("promises nothing when the server has no panel email", async () => {
    catalog.catalog.mockResolvedValue({
      fields: [],
      templates: [],
      sender: null,
      kinds: [kind("INVITE")],
    });
    expect(
      await apiInterviewsGateway.explainer(new AbortController().signal),
    ).toBeNull();
  });

  it("keeps no reason for a cancellation, so the dialog does not ask for one", () => {
    expect(apiInterviewsGateway.storesCancelReason).toBe(false);
  });
});
