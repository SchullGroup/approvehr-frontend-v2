import { describe, expect, it } from "vitest";
import {
  SETTLED,
  defaultReminderSettings,
  remindersOf,
  settledLog,
  type Plannable,
  type ReminderLogEntry,
} from "@/lib/hiring/interviews/demo-reminders";

/**
 * The practice board's plan for an interview's reminders, by the API's own rules.
 *
 * What it holds: nothing is planned unless the invitation was sent for the interview as it
 * stands; each reminder is due the company's time before (or after) and one whose time has
 * passed is not planned late; a change nobody was told of leaves nobody with reminders; a
 * change or a cancellation settles what was waiting; and a switch for the candidate takes
 * only the candidate's.
 */

const NOW = "2026-10-10T09:00:00.000Z";
const START = "2026-10-20T09:00:00.000Z";
const nameOf = (seat: string) =>
  seat === "e:p1" ? "Chidi Nwosu" : "Kemi Outside";

const interview = (over: Partial<Plannable> = {}): Plannable => ({
  id: "iv-1",
  candidateName: "Ada Okafor",
  scheduledFor: START,
  durationMins: 60,
  status: "SCHEDULED",
  seats: ["e:p1"],
  sequence: 0,
  toldSequence: 0,
  candidateRemindersOff: false,
  reminderLog: [],
  ...over,
});

const plan = (
  over: Partial<Plannable> = {},
  settings = defaultReminderSettings(),
  now = NOW,
) => remindersOf(interview(over), settings, now, nameOf);

const summary = (items: ReturnType<typeof plan>["items"]) =>
  items.map((i) => [i.slot, i.recipient, i.dueAt, i.status]);

describe("planning", () => {
  it("plans what the company asked for, at its times, by the API's defaults", () => {
    expect(summary(plan().items)).toEqual([
      ["cand-early", "Ada Okafor", "2026-10-19T09:00:00.000Z", "planned"],
      ["cand-late", "Ada Okafor", "2026-10-20T08:00:00.000Z", "planned"],
      ["pan-late", "Chidi Nwosu", "2026-10-20T08:00:00.000Z", "planned"],
      ["nudge-1", "Chidi Nwosu", "2026-10-21T10:00:00.000Z", "planned"],
      ["nudge-2", "Chidi Nwosu", "2026-10-23T10:00:00.000Z", "planned"],
    ]);
    expect(plan().paused).toBeNull();
  });

  it("leaves the panelist's earlier reminder off until the company switches it on", () => {
    expect(plan().items.some((i) => i.slot === "pan-early")).toBe(false);
    const settings = defaultReminderSettings();
    settings.panelist.early.enabled = true;
    expect(
      plan({}, settings).items.find((i) => i.slot === "pan-early")?.dueAt,
    ).toBe("2026-10-19T09:00:00.000Z");
  });

  it("follows the company's times when they change", () => {
    const settings = defaultReminderSettings();
    settings.candidate.early.minutesBefore = 2_880;
    settings.scorecardNudge.firstAfterHours = 2;
    settings.scorecardNudge.secondAfterHours = null;
    const items = plan({}, settings).items;
    expect(items.find((i) => i.slot === "cand-early")?.dueAt).toBe(
      "2026-10-18T09:00:00.000Z",
    );
    expect(items.find((i) => i.slot === "nudge-1")?.dueAt).toBe(
      "2026-10-20T12:00:00.000Z",
    );
    expect(items.some((i) => i.slot === "nudge-2")).toBe(false);
  });

  it("leaves out what the company switched off", () => {
    const settings = defaultReminderSettings();
    settings.candidate.late.enabled = false;
    settings.scorecardNudge.enabled = false;
    expect(plan({}, settings).items.map((i) => i.slot)).toEqual([
      "cand-early",
      "pan-late",
    ]);
  });

  it("is not tied to the browser's clock: an offset is a length of time before the start", () => {
    /* Both reminders a day before, across a clock change, are exactly 24 hours before. */
    const items = plan({ scheduledFor: "2026-10-25T09:00:00.000Z" }).items;
    expect(items.find((i) => i.slot === "cand-early")?.dueAt).toBe(
      "2026-10-24T09:00:00.000Z",
    );
  });

  it("does not plan a reminder whose time has already passed: sending it late is worse than not", () => {
    /* Booked a day and a half ahead: the 24-hour one is still to come, a 48-hour one is not. */
    const settings = defaultReminderSettings();
    settings.candidate.early.minutesBefore = 2_880;
    const items = plan(
      { scheduledFor: "2026-10-11T21:00:00.000Z" },
      settings,
    ).items;
    expect(items.map((i) => i.slot)).not.toContain("cand-early");
    expect(items.map((i) => i.slot)).toContain("cand-late");
  });

  it("names the panel's people, one reminder for each", () => {
    const items = plan({ seats: ["e:p1", "e:p2"] }).items.filter(
      (i) => i.slot === "pan-late",
    );
    expect(items.map((i) => i.recipient)).toEqual([
      "Chidi Nwosu",
      "Kemi Outside",
    ]);
  });
});

describe("when there is nothing to plan, and why", () => {
  it("plans nothing, and says so, when the invitation was never sent", () => {
    const result = plan({ toldSequence: null });
    expect(result.items).toEqual([]);
    expect(result.paused?.code).toBe("no_invitation");
  });

  it("plans nothing when the interview changed and the change was not sent", () => {
    const result = plan({ sequence: 1, toldSequence: 0 });
    expect(result.items).toEqual([]);
    expect(result.paused?.code).toBe("changed_since_told");
    expect(result.paused?.reason).toMatch(/Send an update to plan new ones/);
  });

  it("plans nothing for a cancelled or no-show interview, and says which", () => {
    for (const status of ["CANCELLED", "NO_SHOW"]) {
      const result = plan({ status });
      expect(result.items, status).toEqual([]);
      expect(result.paused?.code, status).toBe("not_scheduled");
    }
    expect(plan({ status: "CANCELLED" }).paused?.reason).toBe(
      "This interview is cancelled, so no reminders are planned.",
    );
    expect(plan({ status: "NO_SHOW" }).paused?.reason).toBe(
      "This interview is no show, so no reminders are planned.",
    );
  });

  it("plans only the nudges for an interview that took place", () => {
    const result = plan(
      { status: "COMPLETED" },
      defaultReminderSettings(),
      "2026-10-20T11:00:00.000Z",
    );
    expect(result.items.map((i) => i.slot)).toEqual(["nudge-1", "nudge-2"]);
  });

  it("says nothing is waiting when the company switched everything off", () => {
    const settings = defaultReminderSettings();
    settings.candidate.early.enabled = false;
    settings.candidate.late.enabled = false;
    settings.panelist.late.enabled = false;
    settings.scorecardNudge.enabled = false;
    const result = plan({}, settings);
    expect(result.items).toEqual([]);
    expect(result.paused?.code).toBe("none_planned");
  });

  it("plans nothing for the candidate when the interview's switch is off, and the panel keeps theirs", () => {
    const result = plan({ candidateRemindersOff: true });
    expect(result.items.map((i) => i.slot)).toEqual([
      "pan-late",
      "nudge-1",
      "nudge-2",
    ]);
    expect(result.paused).toBeNull();
  });
});

describe("what already went", () => {
  const log: ReminderLogEntry[] = [
    {
      slot: "cand-early",
      seat: null,
      dueAt: "2026-10-19T09:00:00.000Z",
      sentAt: "2026-10-19T09:01:00.000Z",
      status: "sent",
      reason: null,
      sequence: 0,
    },
    {
      slot: "pan-late",
      seat: "e:p1",
      dueAt: "2026-10-20T08:00:00.000Z",
      sentAt: null,
      status: "skipped",
      reason: "not sent: mail not configured",
      sequence: 0,
    },
  ];

  it("is kept in the list, with each reason, and not planned a second time", () => {
    const items = plan(
      { reminderLog: log },
      undefined,
      "2026-10-19T12:00:00.000Z",
    ).items;
    expect(items.filter((i) => i.slot === "cand-early")).toHaveLength(1);
    expect(items.find((i) => i.slot === "cand-early")).toMatchObject({
      status: "sent",
      sentAt: "2026-10-19T09:01:00.000Z",
      recipient: "Ada Okafor",
    });
    expect(items.find((i) => i.slot === "pan-late")).toMatchObject({
      status: "skipped",
      reason: "not sent: mail not configured",
      recipient: "Chidi Nwosu",
    });
    expect(items.find((i) => i.slot === "cand-late")?.status).toBe("planned");
  });

  it("is not for the interview as it now stands once it has changed", () => {
    const items = plan({
      reminderLog: log,
      sequence: 1,
      toldSequence: 0,
    }).items;
    expect(items.every((i) => !i.current)).toBe(true);
  });
});

describe("what a change settles", () => {
  it("turns what was waiting into skipped reminders that say why", () => {
    const settled = settledLog(
      interview(),
      defaultReminderSettings(),
      NOW,
      SETTLED.changed,
    );
    expect(settled.map((e) => [e.slot, e.seat, e.status, e.sequence])).toEqual([
      ["cand-early", null, "skipped", 0],
      ["cand-late", null, "skipped", 0],
      ["pan-late", "e:p1", "skipped", 0],
      ["nudge-1", "e:p1", "skipped", 0],
      ["nudge-2", "e:p1", "skipped", 0],
    ]);
    expect(settled[0]?.reason).toBe(SETTLED.changed);
  });

  it("settles only the candidate's when that is what was switched off", () => {
    const settled = settledLog(
      interview(),
      defaultReminderSettings(),
      NOW,
      SETTLED.candidateOff,
      "candidate",
    );
    expect(settled.map((e) => e.slot)).toEqual(["cand-early", "cand-late"]);
  });

  it("settles nothing for people who were never told", () => {
    expect(
      settledLog(
        interview({ toldSequence: null }),
        defaultReminderSettings(),
        NOW,
        SETTLED.cancelled,
      ),
    ).toEqual([]);
  });

  it("uses the API's own words for why", () => {
    expect(SETTLED.cancelled).toBe("not sent: the interview was cancelled");
    expect(SETTLED.candidateOff).toBe(
      "not sent: reminders to the candidate are turned off for this interview",
    );
  });
});
