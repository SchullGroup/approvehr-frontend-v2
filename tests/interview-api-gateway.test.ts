import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
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
  reminders: vi.fn(),
}));
const careers = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));
const catalog = vi.hoisted(() => ({ catalog: vi.fn() }));

vi.mock("@/lib/api/recruitment", async (original) => {
  const real = await original<typeof import("@/lib/api/recruitment")>();
  return { ...real, recruitmentApi: { ...real.recruitmentApi, ...rec } };
});
vi.mock("@/lib/api/interviews", () => ({ interviewsApi: ivs }));
vi.mock("@/lib/api/careers", async (original) => {
  const real = await original<typeof import("@/lib/api/careers")>();
  return { ...real, careersApi: { ...real.careersApi, ...careers } };
});
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
    ...Object.values(careers),
    catalog.catalog,
  ])
    fn.mockReset();
  /* Most of these are about the messages: the plan is not read unless a test says it is. */
  ivs.reminders.mockRejectedValue(new Error("not asked about"));
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

/* ============================================================== reminders */

const plan = (over: Record<string, unknown> = {}) => ({
  interviewId: "iv-1",
  calendarSequence: 0,
  status: "SCHEDULED",
  candidateReminders: true,
  reminders: [
    {
      id: "r1",
      slot: "cand-early",
      slotLabel: "Reminder to the candidate (earlier)",
      kind: "INTERVIEW_REMINDER_CANDIDATE",
      audience: "CANDIDATE",
      recipient: {
        name: "Chioma Aduba",
        seat: "CANDIDATE",
        employeeId: null,
        userId: null,
      },
      dueAt: "2026-10-19T09:00:00.000Z",
      expiresAt: "2026-10-19T21:00:00.000Z",
      status: "planned",
      reason: null,
      sentAt: null,
      sequence: 0,
      current: true,
    },
    {
      id: "r2",
      slot: "pan-late",
      slotLabel: "Reminder to the panelist (shortly before)",
      kind: "INTERVIEW_REMINDER_PANELIST",
      audience: "PANELIST",
      recipient: {
        name: "Kemi Outsider",
        seat: "ACCOUNT",
        employeeId: null,
        userId: "u9",
      },
      dueAt: "2026-10-20T08:00:00.000Z",
      expiresAt: "2026-10-20T08:55:00.000Z",
      status: "planned",
      reason: null,
      sentAt: null,
      sequence: 0,
      current: true,
    },
  ],
  paused: null,
  ...over,
});

describe("reminders after a change", () => {
  const input = {
    kind: "TECHNICAL" as const,
    scheduledFor: "2026-10-20T09:00:00.000Z",
    timeZone: "Africa/Lagos",
    durationMins: 60,
    location: null,
    joinUrl: null,
    panel: null,
    sendInvite: true,
  };

  it("sends the candidate's switch only when it is off", async () => {
    rec.scheduleInterview.mockResolvedValue(answer({ notified: notified() }));
    await apiInterviewsGateway.schedule(target, input);
    expect(rec.scheduleInterview.mock.calls[0]?.[1]).not.toHaveProperty(
      "candidateReminders",
    );
    await apiInterviewsGateway.schedule(target, {
      ...input,
      candidateReminders: false,
    });
    expect(rec.scheduleInterview.mock.calls[1]?.[1]).toMatchObject({
      candidateReminders: false,
    });
  });

  it("reads what is planned after a booking, and says how many, with no 'taken off' to say", async () => {
    rec.scheduleInterview.mockResolvedValue(
      answer({ notified: notified(), candidateReminders: true }),
    );
    ivs.reminders.mockResolvedValue(plan());
    const { interview, outcome } = await apiInterviewsGateway.schedule(
      target,
      input,
    );
    expect(ivs.reminders).toHaveBeenCalledWith("iv-1");
    expect(outcome.reminders).toEqual({
      planned: 2,
      removed: null,
      paused: null,
    });
    expect(
      interview.reminders?.items.map((i) => [i.slot, i.recipient]),
    ).toEqual([
      ["cand-early", "Chioma Aduba"],
      ["pan-late", "Kemi Outsider"],
    ]);
    expect(interview.reminders?.items[0]).toMatchObject({
      label: "Reminder to the candidate (earlier)",
      status: "planned",
      current: true,
    });
    expect(interview.candidateReminders).toBe(true);
  });

  it("says what a reschedule took off and planned again, from the plan before and the plan after", async () => {
    rec.rescheduleInterview.mockResolvedValue(
      answer({
        scheduledFor: "2026-10-21T09:00:00.000Z",
        calendarSequence: 1,
        notified: notified({ occasion: "UPDATE" }),
      }),
    );
    ivs.reminders.mockResolvedValue(
      plan({
        calendarSequence: 1,
        reminders: [
          ...plan().reminders.map((r) => ({
            ...r,
            status: "skipped",
            current: false,
            reason:
              "not sent: the interview was changed after this was planned, and the change has not been sent to them (send an update to plan new reminders)",
          })),
          { ...plan().reminders[0], id: "r3", sequence: 1 },
        ],
      }),
    );
    const before: InterviewView = {
      ...was,
      reminders: {
        items: plan().reminders.map((r) => ({
          id: r.id,
          slot: r.slot as "cand-early",
          label: r.slotLabel,
          audience: r.audience as "CANDIDATE",
          recipient: r.recipient.name,
          dueAt: r.dueAt,
          sentAt: null,
          status: "planned" as const,
          reason: null,
          current: true,
        })),
        paused: null,
      },
    };
    const { interview, outcome } = await apiInterviewsGateway.change(before, {
      scheduledFor: "2026-10-21T09:00:00.000Z",
      sendUpdate: true,
    });
    expect(outcome.reminders).toEqual({ planned: 1, removed: 2, paused: null });
    /* The old ones stay in the list, as history, marked as not for the interview as it is. */
    expect(interview.reminders?.items.filter((i) => !i.current)).toHaveLength(
      2,
    );
  });

  it("carries the API's reason when a change leaves none planned", async () => {
    rec.rescheduleInterview.mockResolvedValue(
      answer({ notified: notified({ asked: false, occasion: null }) }),
    );
    ivs.reminders.mockResolvedValue(
      plan({
        reminders: [],
        paused: {
          code: "changed_since_told",
          reason: "Send an update to plan new ones.",
        },
      }),
    );
    const { outcome } = await apiInterviewsGateway.change(was, {
      scheduledFor: "2026-10-21T09:00:00.000Z",
      sendUpdate: false,
    });
    expect(outcome.reminders).toEqual({
      planned: 0,
      removed: null,
      paused: {
        code: "changed_since_told",
        reason: "Send an update to plan new ones.",
      },
    });
  });

  it("says nothing of the plan, and shows it unknown, when it cannot be read after the change", async () => {
    rec.cancelInterview.mockResolvedValue(
      answer({
        status: "CANCELLED",
        notified: notified({ asked: false, occasion: null }),
      }),
    );
    ivs.reminders.mockRejectedValue(new Error("down"));
    const { interview, outcome } = await apiInterviewsGateway.cancel(
      { ...was, reminders: { items: [], paused: null } },
      { reason: null, sendCancellation: false },
    );
    expect(outcome.reminders).toBeUndefined();
    /* Not the plan from before the change: that would show reminders that were just taken off. */
    expect(interview.reminders).toBeNull();
  });
});

describe("the candidate's switch for one interview", () => {
  it("sends only the switch: no update, no other field", async () => {
    rec.rescheduleInterview.mockResolvedValue(
      answer({ candidateReminders: false, notified: undefined }),
    );
    ivs.reminders.mockResolvedValue(plan({ candidateReminders: false }));
    const { interview } = await apiInterviewsGateway.setCandidateReminders(
      was,
      false,
    );
    expect(rec.rescheduleInterview).toHaveBeenCalledWith("iv-1", {
      candidateReminders: false,
    });
    expect(interview.candidateReminders).toBe(false);
  });

  it("turns them back on the same way", async () => {
    rec.rescheduleInterview.mockResolvedValue(
      answer({ candidateReminders: true }),
    );
    ivs.reminders.mockResolvedValue(plan());
    await apiInterviewsGateway.setCandidateReminders(
      { ...was, candidateReminders: false },
      true,
    );
    expect(rec.rescheduleInterview).toHaveBeenCalledWith("iv-1", {
      candidateReminders: true,
    });
  });

  it("leaves a refusal as the error the client threw, with the API's sentence", async () => {
    rec.rescheduleInterview.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "Only an interview that has not happened yet can be changed.",
      ),
    );
    await expect(
      apiInterviewsGateway.setCandidateReminders(was, false),
    ).rejects.toMatchObject({
      message: "Only an interview that has not happened yet can be changed.",
    });
  });
});

describe("the company's reminder settings", () => {
  const settings = (over: Record<string, unknown> = {}) => ({
    candidateEmails: {
      enabled: true,
      willSend: false,
      blockedBy: ["No reply-to address is set in Careers settings."],
      usage: {
        sentLast24Hours: 24,
        dailyLimit: 2000,
        waiting: 4,
        dueNow: 0,
        remindersPlanned: 4,
      },
    },
    interviewReminders: {
      candidate: {
        early: { enabled: true, minutesBefore: 2880 },
        late: { enabled: true, minutesBefore: 60 },
      },
      panelist: {
        early: { enabled: false, minutesBefore: 1440 },
        late: { enabled: true, minutesBefore: 60 },
      },
      scorecardNudge: {
        enabled: true,
        firstAfterHours: 24,
        secondAfterHours: null,
      },
      defaults: {
        candidate: {
          early: { enabled: true, minutesBefore: 1440 },
          late: { enabled: true, minutesBefore: 60 },
        },
        panelist: {
          early: { enabled: false, minutesBefore: 1440 },
          late: { enabled: true, minutesBefore: 60 },
        },
        scorecardNudge: {
          enabled: true,
          firstAfterHours: 24,
          secondAfterHours: 72,
        },
      },
      bounds: {
        earlyMinutes: { min: 120, max: 4320 },
        lateMinutes: { min: 15, max: 360 },
        nudgeFirstHours: { min: 1, max: 48 },
        nudgeSecondHours: { min: 2, max: 72 },
      },
    },
    ...over,
  });

  it("reads the company's choices, what it gets until it chooses, the limits, and what has gone against the day's limit", async () => {
    careers.getSettings.mockResolvedValue(settings());
    const view = await apiInterviewsGateway.reminderSettings(
      new AbortController().signal,
    );
    expect(view?.values.candidate.early.minutesBefore).toBe(2880);
    expect(view?.values.scorecardNudge.secondAfterHours).toBeNull();
    expect(view?.defaults.scorecardNudge.secondAfterHours).toBe(72);
    expect(view?.bounds.lateMinutes).toEqual({ min: 15, max: 360 });
    expect(view?.willSend).toBe(false);
    expect(view?.blockedBy).toEqual([
      "No reply-to address is set in Careers settings.",
    ]);
    expect(view?.usage).toMatchObject({
      sentLast24Hours: 24,
      dailyLimit: 2000,
    });
  });

  it("is null where the API keeps no reminder settings, rather than defaults of its own", async () => {
    careers.getSettings.mockResolvedValue(
      settings({ interviewReminders: undefined }),
    );
    expect(
      await apiInterviewsGateway.reminderSettings(new AbortController().signal),
    ).toBeNull();
  });

  it("does not claim to know whether mail would go, or a limit, when the API does not say", async () => {
    careers.getSettings.mockResolvedValue(
      settings({ candidateEmails: undefined }),
    );
    const view = await apiInterviewsGateway.reminderSettings(
      new AbortController().signal,
    );
    expect(view?.willSend).toBeNull();
    expect(view?.blockedBy).toEqual([]);
    expect(view?.usage).toBeNull();
  });

  it("saves every choice under interviewReminders and answers with what the server kept", async () => {
    careers.updateSettings.mockResolvedValue(settings());
    const view = await apiInterviewsGateway.saveReminderSettings({
      candidate: {
        early: { enabled: true, minutesBefore: 2880 },
        late: { enabled: true, minutesBefore: 60 },
      },
      panelist: {
        early: { enabled: false, minutesBefore: 1440 },
        late: { enabled: true, minutesBefore: 60 },
      },
      scorecardNudge: {
        enabled: true,
        firstAfterHours: 24,
        secondAfterHours: null,
      },
    });
    expect(careers.updateSettings).toHaveBeenCalledWith({
      interviewReminders: {
        candidate: {
          early: { enabled: true, minutesBefore: 2880 },
          late: { enabled: true, minutesBefore: 60 },
        },
        panelist: {
          early: { enabled: false, minutesBefore: 1440 },
          late: { enabled: true, minutesBefore: 60 },
        },
        scorecardNudge: {
          enabled: true,
          firstAfterHours: 24,
          secondAfterHours: null,
        },
      },
    });
    expect(view.values.candidate.early.minutesBefore).toBe(2880);
  });

  it("leaves a refusal as the error the client threw, with the box it names", async () => {
    careers.updateSettings.mockRejectedValue(
      new ApiError(400, "validation_failed", "Some fields are not valid.", [
        {
          field: "interviewReminders.scorecardNudge.secondAfterHours",
          message: "The second nudge has to come after the first.",
        },
      ]),
    );
    await expect(
      apiInterviewsGateway.saveReminderSettings({
        candidate: {
          early: { enabled: true, minutesBefore: 1440 },
          late: { enabled: true, minutesBefore: 60 },
        },
        panelist: {
          early: { enabled: false, minutesBefore: 1440 },
          late: { enabled: true, minutesBefore: 60 },
        },
        scorecardNudge: {
          enabled: true,
          firstAfterHours: 24,
          secondAfterHours: 12,
        },
      }),
    ).rejects.toMatchObject({
      fieldErrors: [
        {
          field: "interviewReminders.scorecardNudge.secondAfterHours",
          message: "The second nudge has to come after the first.",
        },
      ],
    });
  });
});

describe("'not asked' says which message it was not asked for", () => {
  const notAsked = () =>
    answer({
      notified: notified({
        asked: false,
        occasion: null,
        candidate: {
          state: "not_asked",
          emailId: null,
          emailKind: null,
          reason: null,
        },
        panelists: [],
      }),
    });

  it("an updated invitation after a change, a cancellation after a cancel, an invitation when booked or sent later", async () => {
    rec.rescheduleInterview.mockResolvedValue(notAsked());
    const changed = await apiInterviewsGateway.change(was, {
      scheduledFor: "2026-10-21T09:00:00.000Z",
      sendUpdate: false,
    });
    expect(changed.outcome.notices[0]?.kind).toBe("UPDATE");

    rec.cancelInterview.mockResolvedValue(notAsked());
    const cancelled = await apiInterviewsGateway.cancel(was, {
      reason: null,
      sendCancellation: false,
    });
    expect(cancelled.outcome.notices[0]?.kind).toBe("CANCEL");

    rec.scheduleInterview.mockResolvedValue(notAsked());
    const booked = await apiInterviewsGateway.schedule(target, {
      kind: "TECHNICAL",
      scheduledFor: "2026-10-20T09:00:00.000Z",
      timeZone: "Africa/Lagos",
      durationMins: 60,
      location: null,
      joinUrl: null,
      panel: null,
      sendInvite: false,
    });
    expect(booked.outcome.notices[0]?.kind).toBe("INVITE");
  });

  it("but the API's own word wins when it names the occasion", async () => {
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
      scheduledFor: "2026-10-21T09:00:00.000Z",
      sendUpdate: true,
    });
    /* An invitation went where an update was asked for, and it is called what it is. */
    expect(outcome.notices[0]?.kind).toBe("INVITE");
  });
});
