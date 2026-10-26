import { describe, expect, it } from "vitest";
import type {
  InterviewNotice,
  NoticeAudience,
  NoticeKind,
  NoticeStatus,
} from "@/lib/hiring/interviews/model";
import {
  candidateSees,
  candidateWasInvited,
  describeChanges,
  groupNotices,
  noticeKindLabel,
  noticeLine,
  outcomeHeadline,
  outcomeLines,
  senderLine,
} from "@/lib/hiring/interviews/words";

/**
 * What the screens say about the messages an interview owed.
 *
 * The rule under all of it: a message is "sent" only when the API says it was sent.
 * Queued is waiting, skipped says why, "not asked" is a person's choice, and nothing
 * here may read as the opposite of what the status is.
 */

const STATUSES: NoticeStatus[] = [
  "NOT_ASKED",
  "PENDING",
  "SENDING",
  "SENT",
  "SKIPPED",
  "FAILED",
];
const KINDS: NoticeKind[] = ["INVITE", "UPDATE", "CANCEL"];
const AUDIENCES: NoticeAudience[] = ["CANDIDATE", "PANELIST"];

const notice = (over: Partial<InterviewNotice> = {}): InterviewNotice => ({
  id: "n1",
  kind: "INVITE",
  audience: "CANDIDATE",
  recipient: "Ada Okafor",
  status: "PENDING",
  note: null,
  at: null,
  ...over,
});

/** The sentences where "sent" is allowed: the ones that say it did not happen, or has not yet. */
const withoutDenials = (text: string): string =>
  text
    .replace(/\bnot sent yet\b/gi, "")
    .replace(/\bcould not be sent\b/gi, "")
    .replace(/\bnot sent\b/gi, "")
    .replace(/\bnothing was sent\b/gi, "")
    .replace(/\bnothing is sent\b/gi, "")
    .replace(/\bQueued is not sent\b/gi, "")
    .replace(/\bis not sent\b/gi, "")
    .replace(/\bwas not sent\b/gi, "")
    .replace(/\bnothing is sent from a practice board\b/gi, "");

describe("no copy claims a message was sent unless the API says it was", () => {
  it("says sent for SENT and for nothing else, across every kind, audience and status", () => {
    for (const status of STATUSES) {
      for (const kind of KINDS) {
        for (const audience of AUDIENCES) {
          const n = notice({
            status,
            kind,
            audience,
            at: "2026-10-20T09:00:00Z",
          });
          const line = noticeLine(n, () => "today");
          const said = `${line.label}. ${line.detail ?? ""}`;
          if (status === "SENT") {
            expect(line.label).toBe("Sent");
            continue;
          }
          expect(line.label, status).not.toMatch(/sent/i);
          expect(
            withoutDenials(said),
            `${status}/${kind}/${audience}: ${said}`,
          ).not.toMatch(/\bsent\b/i);
        }
      }
    }
  });

  it("words a queue as waiting, not as done", () => {
    for (const status of ["PENDING", "SENDING"] as const) {
      const line = noticeLine(notice({ status }), () => "");
      expect(line.label).toBe("Queued");
      expect(line.detail).toContain("not sent yet");
    }
  });

  it("gives the API's reason for a skip, without its 'not sent:' lead", () => {
    const line = noticeLine(
      notice({
        status: "SKIPPED",
        note: "not sent: no reply-to address is set for this company (Careers settings). We do not send an email whose replies would go nowhere",
      }),
      () => "",
    );
    expect(line.label).toBe("Skipped");
    expect(line.tone).toBe("warning");
    expect(line.detail).toBe(
      "No reply-to address is set for this company (Careers settings). We do not send an email whose replies would go nowhere.",
    );
  });

  it("says a choice not to send is a choice, in the person's own terms", () => {
    const line = noticeLine(notice({ status: "NOT_ASKED" }), () => "");
    expect(line).toMatchObject({ label: "Not asked", tone: "neutral" });
    expect(line.detail).toBe("You chose not to send an invitation.");
    expect(
      noticeLine(notice({ status: "NOT_ASKED", kind: "UPDATE" }), () => "")
        .detail,
    ).toBe("You chose not to send an updated invitation.");
    expect(
      noticeLine(notice({ status: "NOT_ASKED", kind: "CANCEL" }), () => "")
        .detail,
    ).toBe("You chose not to send a cancellation.");
  });

  it("shows when it was sent, from the API's own time", () => {
    const line = noticeLine(
      notice({ status: "SENT", at: "2026-10-20T09:00:00Z" }),
      (iso) => `at ${iso}`,
    );
    expect(line.detail).toBe("Sent at 2026-10-20T09:00:00Z.");
  });

  it("keeps every sentence about a whole change clear of 'sent' unless it was", () => {
    for (const status of STATUSES) {
      const outcome = {
        asked: status !== "NOT_ASKED",
        notices: [
          notice({ status }),
          notice({
            id: "n2",
            audience: "PANELIST",
            recipient: "Chidi Nwosu",
            status,
          }),
        ],
      };
      for (const done of ["booked", "updated", "cancelled"] as const) {
        const text = [
          outcomeHeadline(outcome, done).text,
          ...outcomeLines(outcome).map((line) => line.text),
        ].join(" ");
        if (status === "SENT") continue;
        expect(withoutDenials(text), `${status}/${done}: ${text}`).not.toMatch(
          /\bsent\b/i,
        );
      }
    }
  });
});

describe("what a booking, change or cancellation says about its messages", () => {
  it("says nothing was emailed when nothing was asked", () => {
    expect(
      outcomeHeadline(
        { asked: false, notices: [notice({ status: "NOT_ASKED" })] },
        "booked",
      ),
    ).toEqual({
      tone: "success",
      text: "Interview booked. Nothing was emailed.",
    });
  });

  it("says queued is not sent", () => {
    const headline = outcomeHeadline(
      { asked: true, notices: [notice({ status: "PENDING" })] },
      "updated",
    );
    expect(headline.tone).toBe("info");
    expect(headline.text).toContain("Queued is not sent");
  });

  it("is a warning when any message was skipped, and a failure when any failed", () => {
    expect(
      outcomeHeadline(
        {
          asked: true,
          notices: [
            notice({ status: "PENDING" }),
            notice({ id: "b", status: "SKIPPED" }),
          ],
        },
        "booked",
      ).tone,
    ).toBe("warning");
    expect(
      outcomeHeadline(
        {
          asked: true,
          notices: [
            notice({ status: "SKIPPED" }),
            notice({ id: "b", status: "FAILED" }),
          ],
        },
        "booked",
      ).tone,
    ).toBe("danger");
  });

  it("says the messages were sent only when every one is SENT", () => {
    expect(
      outcomeHeadline(
        {
          asked: true,
          notices: [
            notice({ status: "SENT" }),
            notice({ id: "b", status: "SENT" }),
          ],
        },
        "cancelled",
      ).text,
    ).toBe("Interview cancelled. The messages were sent.");
  });

  it("gives the candidate a line, then the panelists who got the same answer share one", () => {
    const lines = outcomeLines({
      asked: true,
      notices: [
        notice({ id: "p1", audience: "PANELIST", recipient: "Chidi Nwosu" }),
        notice({
          id: "c",
          recipient: "Ada Okafor",
          status: "SKIPPED",
          note: "not sent: no reply-to address",
        }),
        notice({ id: "p2", audience: "PANELIST", recipient: "Emeka Anyanwu" }),
      ],
    });
    expect(lines.map((l) => l.text)).toEqual([
      "Ada Okafor: skipped. No reply-to address.",
      "Panelists (Chidi Nwosu, Emeka Anyanwu): queued. The invitation is queued. It is not sent yet.",
    ]);
  });

  it("shortens a long list of panelists", () => {
    const lines = outcomeLines({
      asked: false,
      notices: ["A", "B", "C", "D", "E"].map((name, i) =>
        notice({
          id: `p${i}`,
          audience: "PANELIST",
          recipient: name,
          status: "NOT_ASKED",
        }),
      ),
    });
    expect(lines[0]?.text).toContain("Panelists (A, B and 3 more): not asked.");
  });
});

describe("the log of messages on an interview", () => {
  it("puts panelists who got the same answer on one row, and the candidate on one of their own", () => {
    const groups = groupNotices([
      notice({ id: "c" }),
      notice({ id: "p1", audience: "PANELIST", recipient: "Chidi Nwosu" }),
      notice({ id: "p2", audience: "PANELIST", recipient: "Emeka Anyanwu" }),
      notice({
        id: "p3",
        audience: "PANELIST",
        recipient: "Ngozi Eze",
        status: "SKIPPED",
        note: "not sent: x",
      }),
    ]);
    expect(groups.map((g) => [g.audience, g.recipients, g.status])).toEqual([
      ["CANDIDATE", ["Ada Okafor"], "PENDING"],
      ["PANELIST", ["Chidi Nwosu", "Emeka Anyanwu"], "PENDING"],
      ["PANELIST", ["Ngozi Eze"], "SKIPPED"],
    ]);
  });

  it("labels the messages in plain words", () => {
    expect(noticeKindLabel("INVITE", "CANDIDATE")).toBe("Invitation");
    expect(noticeKindLabel("UPDATE", "PANELIST")).toBe(
      "Updated invitation to a panelist",
    );
    expect(noticeKindLabel("CANCEL", "CANDIDATE")).toBe("Cancellation");
  });

  it("knows whether the candidate has been invited, or is about to be", () => {
    expect(candidateWasInvited(null)).toBe(false);
    expect(candidateWasInvited([])).toBe(false);
    expect(candidateWasInvited([notice({ status: "NOT_ASKED" })])).toBe(false);
    expect(candidateWasInvited([notice({ status: "SKIPPED" })])).toBe(false);
    expect(candidateWasInvited([notice({ status: "PENDING" })])).toBe(true);
    expect(candidateWasInvited([notice({ status: "SENT" })])).toBe(true);
    expect(
      candidateWasInvited([notice({ status: "SENT", audience: "PANELIST" })]),
    ).toBe(false);
  });
});

describe("the sender, and the time the candidate will see", () => {
  it("says who it is from and where replies go", () => {
    expect(
      senderLine({ name: "Schull Technologies", replyTo: "people@schull.io" }),
    ).toBe(
      "From: Schull Technologies via ApproveHR. Replies go to people@schull.io.",
    );
  });

  it("does not say 'via ApproveHR' twice", () => {
    expect(
      senderLine({
        name: "Schull Technologies via ApproveHR",
        replyTo: "a@b.co",
      }),
    ).toBe("From: Schull Technologies via ApproveHR. Replies go to a@b.co.");
  });

  it("says there is no reply-to address rather than inventing one", () => {
    expect(senderLine({ name: "Schull Technologies", replyTo: null })).toBe(
      "From: Schull Technologies via ApproveHR. There is no reply-to address yet.",
    );
  });

  it("states the day, the time and the clock it is on", () => {
    expect(
      candidateSees({
        weekday: "Tuesday",
        date: "20 October 2026",
        time: "10:00",
        zone: "Lagos time (WAT)",
        durationMins: 60,
        location: null,
        online: true,
      }),
    ).toBe(
      "Tuesday 20 October 2026 at 10:00, Lagos time (WAT), for 60 minutes, online.",
    );
    expect(
      candidateSees({
        weekday: "Tuesday",
        date: "20 October 2026",
        time: "10:00",
        zone: "Lagos time (WAT)",
        durationMins: null,
        location: "Boardroom",
        online: false,
      }),
    ).toBe("Tuesday 20 October 2026 at 10:00, Lagos time (WAT) at Boardroom.");
    expect(
      candidateSees({
        weekday: "Tuesday",
        date: "20 October 2026",
        time: "10:00",
        zone: "Lagos time (WAT)",
        durationMins: 90,
        location: "Boardroom",
        online: true,
      }),
    ).toBe(
      "Tuesday 20 October 2026 at 10:00, Lagos time (WAT), for 90 minutes at Boardroom, and online.",
    );
  });
});

describe("what a change changes", () => {
  const was = {
    kind: "SCREEN",
    scheduledFor: "2026-10-20T09:00:00.000Z",
    durationMins: 60,
    location: "Boardroom",
    joinUrl: null as string | null,
  };
  const label = (kind: string) => kind.toLowerCase();
  const when = (iso: string) => iso.slice(11, 16);

  it("lists nothing when nothing differs", () => {
    expect(describeChanges(was, { ...was }, when, label)).toEqual([]);
  });

  it("names each thing that moved, once", () => {
    expect(
      describeChanges(
        was,
        {
          kind: "FINAL",
          scheduledFor: "2026-10-20T10:30:00.000Z",
          durationMins: 45,
          location: "Room 2",
          joinUrl: "https://meet.google.com/abc-defg-hij",
        },
        when,
        label,
      ),
    ).toEqual([
      "Kind: screen to final",
      "Time: 09:00 to 10:30",
      "Length: 60 to 45 minutes",
      "Place: Boardroom to Room 2",
      "Join link: added",
    ]);
  });

  it("says a place or a link was removed", () => {
    expect(
      describeChanges(
        { ...was, joinUrl: "https://zoom.us/j/1" },
        { ...was, location: null, joinUrl: null },
        when,
        label,
      ),
    ).toEqual(["Place: removed", "Join link: removed"]);
  });
});
