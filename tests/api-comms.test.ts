import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The connected side of emails, panels, the panelist's door and retention: what it
 * asks the API, and what it makes of the answer.
 *
 * The API is faked at its edge, so these hold the translation. The ones that matter:
 * a preview is asked for the saved template or for a draft, never both; a panel is
 * only asked for on an interview stage; a server that predates emails reads as "not
 * supported" and not as "switched on"; and a panelist's view carries nothing the
 * wire did not give it.
 */

const mail = {
  catalog: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  preview: vi.fn(),
  getPanel: vi.fn(),
  setPanel: vi.fn(),
  retention: vi.fn(),
  myAccess: vi.fn(),
  myApplications: vi.fn(),
  myApplication: vi.fn(),
  myCv: vi.fn(),
  myInterviews: vi.fn(),
  submitMyScorecard: vi.fn(),
};
const careers = { getSettings: vi.fn(), updateSettings: vi.fn() };
const recruitment = { listStages: vi.fn(), updateStage: vi.fn() };

vi.mock("@/lib/api/candidate-email", () => ({
  candidateEmailApi: new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          (mail as Record<string, (...a: unknown[]) => unknown>)[name]?.(
            ...args,
          ),
    },
  ),
}));
vi.mock("@/lib/api/careers", () => ({
  careersApi: new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          (careers as Record<string, (...a: unknown[]) => unknown>)[name]?.(
            ...args,
          ),
    },
  ),
}));
vi.mock("@/lib/api/recruitment", async (original) => ({
  ...(await original<typeof import("@/lib/api/recruitment")>()),
  recruitmentApi: new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          (recruitment as Record<string, (...a: unknown[]) => unknown>)[name]?.(
            ...args,
          ),
    },
  ),
}));

const { apiComms, emailLogFrom, scoreFrom } =
  await import("@/lib/hiring/pipeline/api-comms");

const signal = () => new AbortController().signal;

beforeEach(() => {
  for (const fn of [
    ...Object.values(mail),
    ...Object.values(careers),
    ...Object.values(recruitment),
  ])
    fn.mockReset();
});

describe("the email editor's read", () => {
  it("turns the API's catalog into the screen's, with the sender", async () => {
    mail.catalog.mockResolvedValue({
      fields: [
        { name: "job_title", label: "The job's title", sample: "Analyst" },
      ],
      kinds: [
        {
          kind: "INVITE",
          label: "Invitation to interview",
          when: "w",
          fields: ["job_title"],
          builtIn: { subject: "s", body: "b" },
          defaultTemplateId: null,
        },
      ],
      templates: [
        {
          id: "t1",
          kind: "INVITE",
          kindLabel: "Invitation to interview",
          name: "Invite",
          subject: "s",
          body: "b",
          isDefault: true,
          archived: false,
          usedByStages: 2,
          createdAt: "x",
          updatedAt: "y",
        },
      ],
      sender: {
        name: "Schull",
        source: "registered_name",
        displayNameAccepted: false,
        registeredName: "Schull",
        replyTo: "people@schull.io",
      },
    });
    const out = await apiComms.emails.catalog(signal());
    expect(mail.catalog).toHaveBeenCalled();
    expect(out.templates[0]).toEqual({
      id: "t1",
      kind: "INVITE",
      kindLabel: "Invitation to interview",
      name: "Invite",
      subject: "s",
      body: "b",
      isDefault: true,
      archived: false,
      usedByStages: 2,
    });
    expect(out.sender).toEqual({
      name: "Schull",
      registeredName: "Schull",
      displayNameAccepted: false,
      replyTo: "people@schull.io",
    });
  });
});

describe("a preview", () => {
  it("asks for a saved template with the unsaved words over it, and says whose details", async () => {
    mail.preview.mockResolvedValue({ valid: true });
    await apiComms.emails.preview(
      {
        templateId: "t1",
        subject: "New subject",
        body: "New body",
        applicationId: "a1",
      },
      signal(),
    );
    expect(mail.preview).toHaveBeenCalledWith(
      {
        templateId: "t1",
        subject: "New subject",
        body: "New body",
        applicationId: "a1",
      },
      expect.anything(),
    );
  });

  it("asks for a draft by its kind, without a template id", async () => {
    mail.preview.mockResolvedValue({ valid: true });
    await apiComms.emails.preview(
      { kind: "DECLINE", subject: "s", body: "b" },
      signal(),
    );
    expect(mail.preview).toHaveBeenCalledWith(
      { kind: "DECLINE", subject: "s", body: "b" },
      expect.anything(),
    );
  });
});

describe("saving an email", () => {
  it("sends the default flag only when it is on", async () => {
    mail.create.mockResolvedValue({
      id: "t1",
      kind: "DECLINE",
      kindLabel: "d",
      name: "n",
      subject: "s",
      body: "b",
      isDefault: false,
      archived: false,
      usedByStages: 0,
    });
    await apiComms.emails.create({
      kind: "DECLINE",
      name: "n",
      subject: "s",
      body: "b",
      isDefault: false,
    });
    expect(mail.create).toHaveBeenLastCalledWith({
      kind: "DECLINE",
      name: "n",
      subject: "s",
      body: "b",
    });
    await apiComms.emails.create({
      kind: "DECLINE",
      name: "n",
      subject: "s",
      body: "b",
      isDefault: true,
    });
    expect(mail.create).toHaveBeenLastCalledWith({
      kind: "DECLINE",
      name: "n",
      subject: "s",
      body: "b",
      isDefault: true,
    });
  });
});

describe("whether an email would leave", () => {
  const settings = (over: Record<string, unknown> = {}) => ({
    contact: { replyToEmail: "people@schull.io" },
    candidateEmails: { enabled: true, willSend: true, blockedBy: [] },
    emailSender: {
      name: "Schull",
      source: "registered_name",
      displayNameAccepted: false,
      registeredName: "Schull",
      note: '"Access Bank" is not used in the sender line.',
    },
    retention: { months: null, setAt: null, purgeFrom: null, graceDays: 7 },
    ...over,
  });

  it("reads it from the careers settings, with the reason a display name was not used", async () => {
    careers.getSettings.mockResolvedValue(settings());
    const out = await apiComms.emails.readiness(signal());
    expect(out).toMatchObject({
      supported: true,
      enabled: true,
      willSend: true,
      blockedBy: [],
      sender: {
        name: "Schull",
        replyTo: "people@schull.io",
        note: '"Access Bank" is not used in the sender line.',
      },
    });
  });

  it("passes the API's reasons through as they were written", async () => {
    careers.getSettings.mockResolvedValue(
      settings({
        candidateEmails: {
          enabled: true,
          willSend: false,
          blockedBy: [
            "Add a reply-to address — replies from candidates have to go somewhere.",
          ],
        },
      }),
    );
    const out = await apiComms.emails.readiness(signal());
    expect(out.willSend).toBe(false);
    expect(out.blockedBy).toEqual([
      "Add a reply-to address — replies from candidates have to go somewhere.",
    ]);
  });

  it("reads a server that has never heard of emails as not supported, never as switched on", async () => {
    careers.getSettings.mockResolvedValue({
      contact: { replyToEmail: null },
    });
    const out = await apiComms.emails.readiness(signal());
    expect(out.supported).toBe(false);
    expect(out.enabled).toBe(false);
    expect(out.willSend).toBe(false);
    expect(out.blockedBy).toEqual([
      "This server does not send emails to candidates yet.",
    ]);
  });

  it("switches the company's own switch through the careers settings", async () => {
    await apiComms.emails.setEnabled(false);
    expect(careers.updateSettings).toHaveBeenCalledWith({
      candidateEmailsEnabled: false,
    });
  });
});

describe("retention", () => {
  it("sets whole months, or null to keep everybody, through the careers settings", async () => {
    await apiComms.retention.set(18);
    expect(careers.updateSettings).toHaveBeenLastCalledWith({
      retentionMonths: 18,
    });
    await apiComms.retention.set(null);
    expect(careers.updateSettings).toHaveBeenLastCalledWith({
      retentionMonths: null,
    });
  });

  it("joins the report with the grace the settings state", async () => {
    mail.retention.mockResolvedValue({
      months: 12,
      setAt: "2026-10-05T20:40:13.816Z",
      purgeFrom: "2026-10-12",
      purgeActive: true,
      mode: "delete",
      due: { candidates: 39, declinedApplications: 0 },
      dueWithin30Days: { candidates: 0, declinedApplications: 0 },
      heldInTalentPool: 1,
    });
    careers.getSettings.mockResolvedValue({
      retention: {
        months: 12,
        setAt: "x",
        purgeFrom: "2026-10-12",
        graceDays: 10,
      },
    });
    const out = await apiComms.retention.report(signal());
    expect(out).toMatchObject({
      months: 12,
      mode: "delete",
      due: { candidates: 39 },
      heldInTalentPool: 1,
      graceDays: 10,
    });
  });
});

describe("a role's stages", () => {
  it("asks for a panel only on an interview stage, and reads stages in order", async () => {
    recruitment.listStages.mockResolvedValue([
      {
        id: "s3",
        requisitionId: "r",
        name: "Offer",
        order: 2,
        requiresScorecards: false,
        type: "OFFER",
      },
      {
        id: "s1",
        requisitionId: "r",
        name: "Applied",
        order: 0,
        requiresScorecards: false,
        type: "APPLIED",
        emailTemplateId: "t1",
      },
      {
        id: "s2",
        requisitionId: "r",
        name: "Interview",
        order: 1,
        requiresScorecards: true,
        type: "INTERVIEW",
      },
    ]);
    mail.getPanel.mockResolvedValue({
      stageId: "s2",
      stageName: "Interview",
      members: [
        { employeeId: "e1", name: "Chidi", jobTitle: "Engineer" },
        {
          employeeId: null,
          userId: "u1",
          kind: "ACCOUNT",
          name: "Folasade",
          jobTitle: "",
          email: "f@example.com",
        },
      ],
    });
    const out = await apiComms.stages.list("r", signal());
    expect(out.map((s) => s.stageId)).toEqual(["s1", "s2", "s3"]);
    expect(out[0]).toMatchObject({ emailTemplateId: "t1", panel: null });
    /* A server that predates invited accounts sends staff only, and no kind. An invited
       account has no employee record, so `employeeId` is null and `userId` names them. */
    expect(out[1]?.panel).toEqual([
      {
        employeeId: "e1",
        userId: null,
        kind: "EMPLOYEE",
        name: "Chidi",
        jobTitle: "Engineer",
      },
      {
        employeeId: null,
        userId: "u1",
        kind: "ACCOUNT",
        name: "Folasade",
        jobTitle: "",
      },
    ]);
    expect(out[2]?.emailTemplateId).toBeNull();
    expect(mail.getPanel).toHaveBeenCalledTimes(1);
    expect(mail.getPanel).toHaveBeenCalledWith("r", "s2", expect.anything());
  });

  it("sets and clears a stage's email through the stage, and a panel as a whole set", async () => {
    await apiComms.stages.setEmail("r", "s1", "t1");
    expect(recruitment.updateStage).toHaveBeenLastCalledWith("r", "s1", {
      emailTemplateId: "t1",
    });
    await apiComms.stages.setEmail("r", "s1", null);
    expect(recruitment.updateStage).toHaveBeenLastCalledWith("r", "s1", {
      emailTemplateId: null,
    });
    mail.setPanel.mockResolvedValue({
      stageId: "s2",
      stageName: "i",
      members: [],
    });
    await apiComms.stages.setPanel("r", "s2", {
      employeeIds: ["e1", "e2"],
      userIds: ["u9"],
    });
    expect(mail.setPanel).toHaveBeenCalledWith("r", "s2", {
      employeeIds: ["e1", "e2"],
      userIds: ["u9"],
    });
  });
});

describe("the panelist's door", () => {
  it("reads what they can reach", async () => {
    mail.myAccess.mockResolvedValue({
      employeeId: "e1",
      hiringManagerOf: [
        {
          requisitionId: "r1",
          reference: "REQ-1",
          jobTitle: "Analyst",
          status: "OPEN",
        },
      ],
      panelOf: [
        {
          requisitionId: "r2",
          reference: "REQ-2",
          jobTitle: "Designer",
          status: "OPEN",
          stages: ["Interview"],
        },
      ],
      interviewsInvitedTo: 3,
      hasAnyAccess: true,
    });
    expect(await apiComms.mine.access(signal())).toEqual({
      hasAnyAccess: true,
      managing: [
        { requisitionId: "r1", reference: "REQ-1", jobTitle: "Analyst" },
      ],
      paneling: [
        {
          requisitionId: "r2",
          reference: "REQ-2",
          jobTitle: "Designer",
          stages: ["Interview"],
        },
      ],
      interviewsInvitedTo: 3,
    });
  });

  it("asks only for the interviews waiting on them when told to", async () => {
    mail.myInterviews.mockResolvedValue({ data: [], meta: { total: 0 } });
    await apiComms.mine.interviews(
      { awaitingMyScorecard: true, page: 1, pageSize: 100 },
      signal(),
    );
    expect(mail.myInterviews).toHaveBeenLastCalledWith(
      { awaitingMyScorecard: true, page: 1, pageSize: 100 },
      expect.anything(),
    );
    await apiComms.mine.interviews(
      { awaitingMyScorecard: false, page: 1, pageSize: 100 },
      signal(),
    );
    expect(mail.myInterviews).toHaveBeenLastCalledWith(
      { page: 1, pageSize: 100 },
      expect.anything(),
    );
  });

  it("carries the link to join, the zone and the calendar sequence the API gave a panelist, and nothing it did not", async () => {
    mail.myInterviews.mockResolvedValue({
      data: [
        {
          interviewId: "iv-1",
          applicationId: "a1",
          candidateName: "Ada Okafor",
          requisitionReference: "REQ-1",
          jobTitle: "Analyst",
          kind: "TECHNICAL",
          scheduledFor: "2026-10-20T09:00:00.000Z",
          durationMins: 60,
          status: "SCHEDULED",
          location: "Boardroom",
          joinUrl: "https://meet.google.com/abc-defg-hij",
          timeZone: "Africa/Nairobi",
          calendarSequence: 2,
          myScorecardSubmitted: false,
        },
        {
          interviewId: "iv-2",
          applicationId: "a2",
          candidateName: "Bola Ige",
          requisitionReference: "REQ-1",
          jobTitle: "Analyst",
          kind: "FINAL",
          scheduledFor: "2026-10-21T09:00:00.000Z",
          durationMins: 30,
          status: "SCHEDULED",
          location: null,
          myScorecardSubmitted: true,
        },
      ],
      meta: { total: 2 },
    });
    const page = await apiComms.mine.interviews(
      { awaitingMyScorecard: false, page: 1, pageSize: 100 },
      signal(),
    );
    expect(page.rows[0]).toMatchObject({
      kind: "Technical",
      kindCode: "TECHNICAL",
      joinUrl: "https://meet.google.com/abc-defg-hij",
      timeZone: "Africa/Nairobi",
      sequence: 2,
    });
    /* A server that says nothing of a link or a zone is not made to. */
    expect(page.rows[1]).toMatchObject({
      kindCode: "FINAL",
      joinUrl: null,
      timeZone: null,
      sequence: 0,
    });
    for (const row of page.rows)
      expect(JSON.stringify(row)).not.toMatch(/@|salary|phone/i);
  });

  it("counts the scorecards owed on a candidate, only for interviews that count and are theirs", async () => {
    mail.myApplications.mockResolvedValue({
      data: [
        {
          id: "a1",
          requisitionId: "r",
          requisitionReference: "REQ-1",
          jobTitle: "Analyst",
          candidateName: "Ada Okafor",
          stageName: "Interview",
          stageType: "INTERVIEW",
          outcome: "IN_PROGRESS",
          stageEnteredAt: "x",
          roles: ["STAGE_PANEL", "INTERVIEW_PANEL"],
          hasCv: true,
          myInterviews: [
            {
              interviewId: "i1",
              kind: "PANEL",
              scheduledFor: "x",
              durationMins: 60,
              status: "SCHEDULED",
              location: null,
              stageName: "Interview",
              iAmPanelist: true,
              myScorecardSubmitted: false,
            },
            {
              interviewId: "i2",
              kind: "PANEL",
              scheduledFor: "x",
              durationMins: 60,
              status: "COMPLETED",
              location: null,
              stageName: "Interview",
              iAmPanelist: true,
              myScorecardSubmitted: true,
            },
            {
              interviewId: "i3",
              kind: "PANEL",
              scheduledFor: "x",
              durationMins: 60,
              status: "CANCELLED",
              location: null,
              stageName: "Interview",
              iAmPanelist: true,
              myScorecardSubmitted: false,
            },
            {
              interviewId: "i4",
              kind: "PANEL",
              scheduledFor: "x",
              durationMins: 60,
              status: "SCHEDULED",
              location: null,
              stageName: "Interview",
              iAmPanelist: false,
              myScorecardSubmitted: false,
            },
          ],
        },
      ],
      meta: { total: 1 },
    });
    const out = await apiComms.mine.applications(
      { includeClosed: false, page: 1, pageSize: 100 },
      signal(),
    );
    expect(out.rows[0]).toMatchObject({
      candidateName: "Ada Okafor",
      roles: ["On the panel for this stage", "Invited to interview"],
      interviewsOfMine: 3,
      scorecardsOwed: 1,
    });
  });

  it("gives a panelist their own scorecard and nobody else's", async () => {
    mail.myApplication.mockResolvedValue({
      id: "a1",
      requisition: { id: "r", reference: "REQ-1", jobTitle: "Analyst" },
      candidate: { firstName: "Ada", lastName: "Okafor", hasCv: false },
      stage: { id: "s", name: "Interview", type: "INTERVIEW" },
      outcome: "IN_PROGRESS",
      stageEnteredAt: "x",
      roles: ["INTERVIEW_PANEL"],
      interviews: [
        {
          id: "i1",
          kind: "PANEL",
          scheduledFor: "x",
          durationMins: 60,
          status: "SCHEDULED",
          location: null,
          stageName: "Interview",
          iAmPanelist: true,
          panel: [{ employeeId: "e1", name: "Chidi", submitted: false }],
          myScorecard: null,
          scorecards: null,
        },
      ],
      scores: null,
    });
    const out = await apiComms.mine.application("a1", signal());
    expect(out.candidateName).toBe("Ada Okafor");
    expect(out.interviews[0]).toMatchObject({
      kind: "Panel",
      mine: null,
      everyones: null,
    });
    expect(out.score).toBeNull();
    expect(out.roles).toEqual(["Invited to interview"]);
  });

  it("hands in a scorecard with its weights and trims what was written", async () => {
    mail.submitMyScorecard.mockResolvedValue({
      id: "s1",
      interviewerId: "e1",
      interviewerName: null,
      recommendation: "YES",
      notes: "Solid",
      submitted: true,
      submittedAt: "x",
      composite: 4.33,
      ratings: [
        { competency: "Technical", score: 5, weight: 2, comment: null },
      ],
    });
    const out = await apiComms.mine.submitScorecard("i1", {
      recommendation: "YES",
      notes: "  Solid  ",
      ratings: [
        { competency: "Technical", score: 5, weight: 2, comment: "" },
        { competency: "Culture", score: 3, weight: 1, comment: "  warm  " },
      ],
    });
    expect(mail.submitMyScorecard).toHaveBeenCalledWith("i1", {
      recommendation: "YES",
      notes: "Solid",
      ratings: [
        { competency: "Technical", score: 5, weight: 2 },
        { competency: "Culture", score: 3, weight: 1, comment: "warm" },
      ],
    });
    expect(out.composite).toBe(4.33);
  });

  it("opens a CV through the audited route for the application", async () => {
    mail.myCv.mockResolvedValue({ url: "https://x", note: null });
    const open = apiComms.mine.openCv;
    expect(open).not.toBeNull();
    await open?.("a1");
    expect(mail.myCv).toHaveBeenCalledWith("a1");
  });
});

describe("the record's own reads", () => {
  it("words each email by what asked for it", () => {
    const log = emailLogFrom([
      {
        id: "e1",
        kind: "DECLINE",
        kindLabel: "Not taking them forward",
        trigger: "REJECTION",
        status: "SENT",
        note: null,
        subject: "s",
        stageName: "Applied",
        templateName: "Kind",
        sentAt: "x",
        createdAt: "y",
      },
      {
        id: "e2",
        kind: "STAGE_UPDATE",
        kindLabel: "Update",
        trigger: "STAGE_ENTRY",
        status: "PENDING",
        note: null,
        subject: null,
        stageName: "Interview",
        templateName: null,
        sentAt: null,
        createdAt: "y",
      },
    ]);
    expect(log.map((e) => e.because)).toEqual([
      "Rejected, with a decline email",
      "Moved into Interview",
    ]);
  });

  it("carries the score the API worked out, and the kind in words", () => {
    const out = scoreFrom({
      outOf: 5,
      composite: 4.17,
      compositeBp: 41667,
      interviews: [
        {
          interviewId: "i1",
          kind: "PANEL",
          status: "COMPLETED",
          scheduledFor: "x",
          composite: 4.17,
          compositeBp: 41667,
          scorecards: [],
        },
      ],
      recommendations: { STRONG_YES: 1, YES: 1, NO: 0, STRONG_NO: 0 },
      byCompetency: [
        {
          competency: "Technical",
          average: 4.67,
          averageBp: 46667,
          ratings: 2,
        },
      ],
      scorecardsSubmitted: 2,
    });
    expect(out.composite).toBe(4.17);
    expect(out.interviews[0]?.kind).toBe("Panel");
    expect(out.byCompetency).toEqual([
      { competency: "Technical", average: 4.67, ratings: 2 },
    ]);
  });
});
