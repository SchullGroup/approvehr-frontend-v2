import { beforeEach, describe, expect, it } from "vitest";
import { defaultReminderSettings } from "@/lib/hiring/interviews/demo-reminders";
import { demoInterviewsGateway } from "@/lib/hiring/interviews/demo-gateway";
import { demoInterviews } from "@/lib/hiring/interviews/demo-store";
import { interviewsOf } from "@/lib/hiring/interviews/demo-ops";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { ApiError } from "@/lib/api/client";
import type { ScheduleInput } from "@/lib/hiring/interviews/model";

/**
 * The practice board's interview gateway, end to end: what a person does on a practice
 * record is kept in this browser, answers in the API's words and never claims a message
 * went out.
 */

const target = {
  applicationId: "app-01",
  candidateName: "Ifeanyi Obi",
  role: "Senior Backend Engineer",
  stageName: "Interview",
  stageSeats: ["e:p-05"],
};

const input = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  kind: "PANEL",
  scheduledFor: "2026-08-26T09:00:00.000Z",
  timeZone: "Africa/Lagos",
  durationMins: 60,
  location: null,
  joinUrl: "https://meet.google.com/abc-defg-hij",
  panel: null,
  sendInvite: false,
  ...over,
});

beforeEach(() => {
  demoInterviews.commit({
    interviews: [],
    counter: 0,
    reminderSettings: defaultReminderSettings(),
  });
  const book = demoPipeline.current();
  demoPipeline.commit({
    ...book,
    mail: { ...book.mail, enabled: true, replyTo: "people@schull.io" },
  });
});

describe("the practice gateway", () => {
  it("keeps what was booked, on the practice clock", async () => {
    expect(demoInterviewsGateway.now()).toBe("2026-08-19T09:00:00.000Z");
    const { interview } = await demoInterviewsGateway.schedule(target, input());
    expect(interviewsOf(demoInterviews.current(), "app-01")).toHaveLength(1);
    expect(interview).toMatchObject({
      applicationId: "app-01",
      status: "SCHEDULED",
      sequence: 0,
      timeZone: "Africa/Lagos",
    });
    expect(interview.panelists.map((p) => p.name)).toEqual(["Fatima Bello"]);
  });

  it("answers a refusal the way the API does, as an ApiError carrying the sentence", async () => {
    await expect(
      demoInterviewsGateway.schedule(
        target,
        input({ joinUrl: "http://x.com/a" }),
      ),
    ).rejects.toMatchObject({
      message: "Use a link that starts with https://",
    });
    await expect(
      demoInterviewsGateway.schedule(target, input({ durationMins: 2 })),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("never says a message went out, whatever was asked", async () => {
    const asked = await demoInterviewsGateway.schedule(
      target,
      input({ sendInvite: true }),
    );
    const statuses = asked.outcome.notices.map((n) => n.status);
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses).not.toContain("SENT");
    expect(new Set(statuses)).toEqual(new Set(["SKIPPED"]));

    const notAsked = await demoInterviewsGateway.schedule(target, input());
    expect(new Set(notAsked.outcome.notices.map((n) => n.status))).toEqual(
      new Set(["NOT_ASKED"]),
    );
  });

  it("changes, cancels and sends later, each as the same interview", async () => {
    const { interview } = await demoInterviewsGateway.schedule(target, input());
    const moved = await demoInterviewsGateway.change(interview, {
      scheduledFor: "2026-08-27T09:00:00.000Z",
      sendUpdate: false,
    });
    expect(moved.interview).toMatchObject({ id: interview.id, sequence: 1 });

    const told = await demoInterviewsGateway.notify(moved.interview);
    expect(told.outcome.asked).toBe(true);
    expect(told.outcome.notices.every((n) => n.kind === "INVITE")).toBe(true);
    expect(told.interview.notices?.length).toBeGreaterThan(
      moved.interview.notices?.length ?? 0,
    );

    const gone = await demoInterviewsGateway.cancel(told.interview, {
      reason: "Role on hold",
      sendCancellation: false,
    });
    expect(gone.interview).toMatchObject({ status: "CANCELLED", sequence: 2 });
    await expect(
      demoInterviewsGateway.change(gone.interview, {
        durationMins: 30,
        sendUpdate: false,
      }),
    ).rejects.toMatchObject({
      message: "Only an interview that has not happened yet can be changed.",
    });
  });

  it("settles an interview as complete or a no-show, once", async () => {
    const { interview } = await demoInterviewsGateway.schedule(target, input());
    await demoInterviewsGateway.complete(interview.id);
    await expect(
      demoInterviewsGateway.noShow(interview.id),
    ).rejects.toMatchObject({
      message: "That interview has already been settled.",
    });
  });

  it("makes a calendar file that parses, is labelled as practice, and matches the booking", async () => {
    const { interview } = await demoInterviewsGateway.schedule(
      target,
      input({ location: "Boardroom, 4th floor" }),
    );
    const file = await demoInterviewsGateway.calendarFile(interview, "staff");
    expect(file.filename).toBe("interview-ifeanyi-obi-2026-08-26.ics");
    expect(file.note).toContain("not by ApproveHR");
    const text = await file.blob.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("DTSTART:20260826T090000Z");
    expect(text).toContain("DTEND:20260826T100000Z");
    expect(text).toContain("SEQUENCE:0");
    expect(text).toContain("X-APPROVEHR-DEMO:TRUE");
    expect(text.replace(/\r\n /g, "")).toContain(
      "LOCATION:Boardroom\\, 4th floor",
    );
  });

  it("makes a panelist's file from what a panelist is given, and says to hand the scorecard in", async () => {
    const { interview } = await demoInterviewsGateway.schedule(target, input());
    const file = await demoInterviewsGateway.calendarFile(
      interview,
      "panelist",
    );
    expect((await file.blob.text()).replace(/\r\n /g, "")).toContain(
      "My interviews",
    );
  });
});

describe("the practice gateway's reminders", () => {
  /** An interview whose invitation was sent, as the seed has them: the practice board sends none. */
  const toldInterview = async () => {
    const { interview } = await demoInterviewsGateway.schedule(target, input());
    const book = demoInterviews.current();
    demoInterviews.commit({
      ...book,
      interviews: book.interviews.map((i) =>
        i.id === interview.id ? { ...i, toldSequence: 0 } : i,
      ),
    });
    return interview;
  };

  it("offers the company's choices with what it gets until it chooses, and the API's limits", async () => {
    const view = await demoInterviewsGateway.reminderSettings(
      new AbortController().signal,
    );
    expect(view?.values.candidate.early).toEqual({
      enabled: true,
      minutesBefore: 1_440,
    });
    expect(view?.defaults).toEqual(defaultReminderSettings());
    expect(view?.bounds.earlyMinutes).toEqual({ min: 120, max: 4_320 });
    /* A practice board says nothing about whether mail would go: there is none. */
    expect(view?.willSend).toBeNull();
    expect(view?.usage).toBeNull();
  });

  it("keeps what was saved, and plans from it", async () => {
    const values = defaultReminderSettings();
    values.candidate.early.minutesBefore = 2_880;
    const kept = await demoInterviewsGateway.saveReminderSettings(values);
    expect(kept.values.candidate.early.minutesBefore).toBe(2_880);
    const interview = await toldInterview();
    const { interview: after } = await demoInterviewsGateway.change(interview, {
      kind: "TECHNICAL",
      sendUpdate: false,
    });
    expect(
      after.reminders?.items.find((i) => i.slot === "cand-early")?.dueAt,
    ).toBe("2026-08-24T09:00:00.000Z");
  });

  it("refuses what the API would refuse, with the box it is about", async () => {
    const values = defaultReminderSettings();
    values.candidate.early.minutesBefore = 60;
    await expect(
      demoInterviewsGateway.saveReminderSettings(values),
    ).rejects.toMatchObject({
      status: 400,
      fieldErrors: [
        {
          field: "candidate.early",
          message:
            "The earlier reminder goes at least 2 hours before the interview.",
        },
      ],
    });
    expect(
      demoInterviews.current().reminderSettings.candidate.early.minutesBefore,
    ).toBe(1_440);
  });

  it("switches the candidate's reminders off and on, and says what stands", async () => {
    const interview = await toldInterview();
    const off = await demoInterviewsGateway.setCandidateReminders(
      interview,
      false,
    );
    expect(off.interview.candidateReminders).toBe(false);
    expect(off.outcome.reminders).toMatchObject({ planned: 3, removed: 2 });
    expect(off.outcome.asked).toBe(false);
    expect(off.outcome.notices).toEqual([]);
    const on = await demoInterviewsGateway.setCandidateReminders(
      off.interview,
      true,
    );
    expect(on.interview.candidateReminders).toBe(true);
    expect(on.outcome.reminders?.planned).toBe(5);
  });

  it("refuses the switch for an interview that is over, in the API's sentence", async () => {
    const interview = await toldInterview();
    await demoInterviewsGateway.complete(interview.id);
    await expect(
      demoInterviewsGateway.setCandidateReminders(interview, false),
    ).rejects.toMatchObject({
      message: "Only an interview that has not happened yet can be changed.",
    });
  });

  it("books with the candidate's reminders off when asked, and says no reminders until an invitation has been sent", async () => {
    const { interview, outcome } = await demoInterviewsGateway.schedule(
      target,
      input({ sendInvite: true, candidateReminders: false }),
    );
    expect(interview.candidateReminders).toBe(false);
    expect(interview.reminders?.paused?.code).toBe("no_invitation");
    expect(interview.reminders?.items).toEqual([]);
    expect(outcome.notices.every((n) => n.status !== "SENT")).toBe(true);
  });
});
