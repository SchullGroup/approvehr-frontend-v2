import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiInterviewSummary } from "@/lib/api/recruitment";

/**
 * A connected record's interviews, with what the application's own answer leaves out.
 *
 * The link to join, the zone, the calendar sequence and the log of messages are each
 * interview's own, so they are read once for the record and joined on. Until they arrive
 * an interview is drawn from its summary with its messages unknown, never "none", and one
 * that cannot be read leaves just that one unknown.
 */

const rec = vi.hoisted(() => ({ getInterview: vi.fn() }));
const ivs = vi.hoisted(() => ({ notices: vi.fn(), reminders: vi.fn() }));

vi.mock("@/lib/api/recruitment", async (original) => {
  const real = await original<typeof import("@/lib/api/recruitment")>();
  return { ...real, recruitmentApi: { ...real.recruitmentApi, ...rec } };
});
vi.mock("@/lib/api/interviews", () => ({ interviewsApi: ivs }));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true }),
}));

const { useConnectedInterviews } =
  await import("@/lib/hiring/interviews/use-connected-interviews");

const summary = (id: string): ApiInterviewSummary => ({
  id,
  kind: "PANEL",
  scheduledFor: "2026-10-20T09:00:00.000Z",
  durationMins: 60,
  status: "SCHEDULED",
  location: null,
  scorecards: [],
  panelists: [
    { employeeId: "p1", userId: null, name: "Chidi Nwosu", submitted: false },
  ],
});

const detail = (id: string) => ({
  id,
  joinUrl: "https://meet.google.com/abc-defg-hij",
  timeZone: "Africa/Nairobi",
  calendarSequence: 3,
});

const ctx = {
  applicationId: "pa-1",
  candidateName: "Chioma Aduba",
  role: "Payroll Analyst",
};

function Show({ list }: { list: readonly ApiInterviewSummary[] }) {
  const { views } = useConnectedInterviews(list, ctx);
  return (
    <ul>
      {views.map((v) => (
        <li key={v.id} data-testid={v.id}>
          {JSON.stringify({
            join: v.joinUrl,
            zone: v.timeZone,
            seq: v.sequence,
            notices:
              v.notices === null
                ? null
                : v.notices.map((n) => [n.audience, n.status]),
            candidateReminders: v.candidateReminders ?? null,
            reminders:
              v.reminders === undefined || v.reminders === null
                ? null
                : {
                    items: v.reminders.items.map((r) => [
                      r.slot,
                      r.recipient,
                      r.status,
                    ]),
                    paused: v.reminders.paused?.code ?? null,
                  },
          })}
        </li>
      ))}
    </ul>
  );
}

const read = (id: string) =>
  JSON.parse(screen.getByTestId(id).textContent ?? "{}");

beforeEach(() => {
  rec.getInterview.mockReset();
  ivs.notices.mockReset();
  ivs.reminders.mockReset();
  /* Most of these are about the log: the plan is not read unless a test says it is. */
  ivs.reminders.mockRejectedValue(new ApiError(404, "not_found", "No route."));
});

describe("a connected record's interviews", () => {
  it("draws from the summary at first, with the messages unknown, then joins on what each interview holds", async () => {
    rec.getInterview.mockImplementation(async (id: string) => detail(id));
    ivs.notices.mockResolvedValue({
      interviewId: "iv-1",
      calendarSequence: 3,
      notices: [
        {
          id: "e1",
          kind: "INVITE",
          kindLabel: "Invitation",
          status: "SENT",
          note: null,
          subject: null,
          sentAt: "2026-10-12T09:00:00.000Z",
          createdAt: "2026-10-12T09:00:00.000Z",
          audience: "CANDIDATE",
          recipient: {
            name: "Chioma Aduba",
            seat: "CANDIDATE",
            employeeId: null,
            userId: null,
          },
          inApp: null,
        },
        {
          id: "e2",
          kind: "PANELIST_INVITE",
          kindLabel: "Panel",
          status: "PENDING",
          note: null,
          subject: null,
          sentAt: null,
          createdAt: "2026-10-12T09:00:00.000Z",
          audience: "PANELIST",
          recipient: {
            name: "Chidi Nwosu",
            seat: "EMPLOYEE",
            employeeId: "p1",
            userId: null,
          },
          inApp: "CREATED",
        },
      ],
    });
    render(<Show list={[summary("iv-1")]} />);
    expect(read("iv-1")).toEqual({
      join: null,
      zone: null,
      seq: 0,
      notices: null,
      candidateReminders: null,
      reminders: null,
    });
    await waitFor(() => expect(read("iv-1").notices).not.toBeNull());
    expect(read("iv-1")).toEqual({
      join: "https://meet.google.com/abc-defg-hij",
      zone: "Africa/Nairobi",
      seq: 3,
      notices: [
        ["CANDIDATE", "SENT"],
        ["PANELIST", "PENDING"],
      ],
      candidateReminders: null,
      reminders: null,
    });
  });

  it("leaves the messages unknown for an interview whose log cannot be read, and still joins the rest", async () => {
    rec.getInterview.mockImplementation(async (id: string) => detail(id));
    ivs.notices.mockRejectedValue(
      new ApiError(404, "not_found", "No such route."),
    );
    render(<Show list={[summary("iv-1")]} />);
    await waitFor(() => expect(read("iv-1").join).not.toBeNull());
    expect(read("iv-1").notices).toBeNull();
    expect(read("iv-1").seq).toBe(3);
  });

  it("leaves one interview as its summary says when its own read fails, and does not disturb another", async () => {
    rec.getInterview.mockImplementation(async (id: string) => {
      if (id === "bad") throw new ApiError(500, "server", "Down.");
      return detail(id);
    });
    ivs.notices.mockResolvedValue({
      interviewId: "x",
      calendarSequence: 0,
      notices: [],
    });
    render(<Show list={[summary("bad"), summary("good")]} />);
    await waitFor(() => expect(read("good").join).not.toBeNull());
    expect(read("bad").join).toBeNull();
    /* Its log did read: an empty one is "nothing was asked for", which is a fact. */
    expect(read("bad").notices).toEqual([]);
    expect(read("good").notices).toEqual([]);
  });

  it("asks nothing for a record with no interviews", async () => {
    render(<Show list={[]} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(rec.getInterview).not.toHaveBeenCalled();
    expect(ivs.notices).not.toHaveBeenCalled();
  });
});

describe("a connected record's reminders", () => {
  const noticeRow = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    kind: "INVITE",
    kindLabel: "Invitation",
    status: "SENT",
    note: null,
    subject: null,
    sentAt: "2026-10-12T09:00:00.000Z",
    createdAt: "2026-10-12T09:00:00.000Z",
    audience: "CANDIDATE",
    recipient: {
      name: "Chioma Aduba",
      seat: "CANDIDATE",
      employeeId: null,
      userId: null,
    },
    inApp: null,
    ...over,
  });

  const planned = (over: Record<string, unknown> = {}) => ({
    interviewId: "iv-1",
    calendarSequence: 0,
    status: "SCHEDULED",
    candidateReminders: false,
    reminders: [
      {
        id: "r1",
        slot: "pan-late",
        slotLabel: "Reminder to the panelist (shortly before)",
        kind: "INTERVIEW_REMINDER_PANELIST",
        audience: "PANELIST",
        recipient: {
          name: "Chidi Nwosu",
          seat: "EMPLOYEE",
          employeeId: "p1",
          userId: null,
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

  it("joins what is planned on, and the candidate's switch from the same read", async () => {
    rec.getInterview.mockImplementation(async (id: string) => detail(id));
    ivs.notices.mockResolvedValue({
      interviewId: "iv-1",
      calendarSequence: 0,
      notices: [],
    });
    ivs.reminders.mockResolvedValue(planned());
    render(<Show list={[summary("iv-1")]} />);
    await waitFor(() => expect(read("iv-1").reminders).not.toBeNull());
    expect(read("iv-1").reminders).toEqual({
      items: [["pan-late", "Chidi Nwosu", "planned"]],
      paused: null,
    });
    expect(read("iv-1").candidateReminders).toBe(false);
    expect(ivs.reminders).toHaveBeenCalledWith("iv-1", expect.anything());
  });

  it("keeps the reminders out of the messages on the interview: the log holds both, and they are read apart", async () => {
    rec.getInterview.mockImplementation(async (id: string) => detail(id));
    ivs.notices.mockResolvedValue({
      interviewId: "iv-1",
      calendarSequence: 0,
      notices: [
        noticeRow("e1"),
        noticeRow("e2", {
          kind: "INTERVIEW_REMINDER_CANDIDATE",
          trigger: "REMINDER",
          slot: "cand-early",
          dueAt: "2026-10-19T09:00:00.000Z",
          expiresAt: "2026-10-19T21:00:00.000Z",
        }),
        noticeRow("e3", {
          kind: "SCORECARD_NUDGE",
          audience: "PANELIST",
          slot: "nudge-1",
        }),
      ],
    });
    render(<Show list={[summary("iv-1")]} />);
    await waitFor(() => expect(read("iv-1").notices).not.toBeNull());
    expect(read("iv-1").notices).toEqual([["CANDIDATE", "SENT"]]);
  });

  it("says nothing is known about the plan where it cannot be read, and still draws the rest", async () => {
    rec.getInterview.mockImplementation(async (id: string) => ({
      ...detail(id),
      candidateReminders: true,
    }));
    ivs.notices.mockResolvedValue({
      interviewId: "iv-1",
      calendarSequence: 0,
      notices: [],
    });
    /* The default for these tests: the route is not there. */
    render(<Show list={[summary("iv-1")]} />);
    await waitFor(() => expect(read("iv-1").join).not.toBeNull());
    expect(read("iv-1").reminders).toBeNull();
    /* The switch's state still comes from the interview itself, when it says. */
    expect(read("iv-1").candidateReminders).toBe(true);
    expect(read("iv-1").notices).toEqual([]);
  });

  it("reads each interview's plan on its own", async () => {
    rec.getInterview.mockImplementation(async (id: string) => detail(id));
    ivs.notices.mockResolvedValue({
      interviewId: "x",
      calendarSequence: 0,
      notices: [],
    });
    ivs.reminders.mockImplementation(async (id: string) => {
      if (id === "bad") throw new ApiError(500, "server", "Down.");
      return planned({ interviewId: id, candidateReminders: true });
    });
    render(<Show list={[summary("bad"), summary("good")]} />);
    await waitFor(() => expect(read("good").reminders).not.toBeNull());
    expect(read("bad").reminders).toBeNull();
    expect(read("good").candidateReminders).toBe(true);
  });
});
