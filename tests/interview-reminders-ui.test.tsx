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
import { InterviewReminders } from "@/components/hiring/interviews/interview-reminders";
import {
  CancelInterviewDialog,
  RescheduleInterviewDialog,
  ScheduleInterviewDialog,
} from "@/components/hiring/interviews/interview-dialogs";
import { ApiError } from "@/lib/api/client";
import {
  settingsViewOf,
  defaultReminderSettings,
} from "@/lib/hiring/interviews/demo-reminders";
import type { EmailReadiness } from "@/lib/hiring/comms/model";
import type { InterviewsGateway } from "@/lib/hiring/interviews/gateway";
import type {
  ChangeResult,
  InterviewNotice,
  InterviewView,
} from "@/lib/hiring/interviews/model";
import type {
  InterviewReminders as Reminders,
  PlannedReminder,
} from "@/lib/hiring/interviews/reminders";

/**
 * The Reminders section of an interview.
 *
 * What these hold: it says what is planned, what went and what was skipped and why; it
 * says why there are none in the API's words, and plainly when the invitation wasn't sent;
 * it never calls a reminder sent unless the API did; the one switch is the candidate's and
 * says so; and turning it off shows at once and is put back, with the API's sentence, if it
 * is refused.
 */

const sent: InterviewNotice = {
  id: "n1",
  kind: "INVITE",
  audience: "CANDIDATE",
  recipient: "Chioma Aduba",
  status: "SENT",
  note: null,
  at: "2026-10-12T09:00:00.000Z",
};

const item = (over: Partial<PlannedReminder> = {}): PlannedReminder => ({
  id: "r1",
  slot: "cand-early",
  label: "Reminder to the candidate (earlier)",
  audience: "CANDIDATE",
  recipient: "Chioma Aduba",
  dueAt: "2026-10-19T09:00:00.000Z",
  sentAt: null,
  status: "planned",
  reason: null,
  current: true,
  ...over,
});

const panel = (
  name: string,
  over: Partial<PlannedReminder> = {},
): PlannedReminder =>
  item({
    id: `p-${name}`,
    slot: "pan-late",
    label: "Reminder to the panelist (shortly before)",
    audience: "PANELIST",
    recipient: name,
    dueAt: "2026-10-20T08:00:00.000Z",
    ...over,
  });

const reminders = (
  items: PlannedReminder[],
  paused: Reminders["paused"] = null,
): Reminders => ({ items, paused });

const view = (
  list: Reminders | null | undefined,
  over: Partial<InterviewView> = {},
): InterviewView => ({
  id: "iv-1",
  applicationId: "pa-1",
  candidateName: "Chioma Aduba",
  role: "Payroll Analyst",
  kind: "TECHNICAL",
  scheduledFor: "2026-10-20T09:00:00.000Z",
  durationMins: 60,
  status: "SCHEDULED",
  location: null,
  joinUrl: null,
  timeZone: "Africa/Lagos",
  stageName: null,
  panelists: [],
  sequence: 0,
  notices: [sent],
  cancelReason: null,
  candidateReminders: true,
  ...(list === undefined ? {} : { reminders: list }),
  ...over,
});

function show(
  interview: InterviewView,
  over: Partial<React.ComponentProps<typeof InterviewReminders>> = {},
) {
  const onCandidateReminders = vi.fn();
  render(
    <ToastProvider>
      <InterviewReminders
        interview={interview}
        timeZone="Africa/Lagos"
        now="2026-10-10T09:00:00.000Z"
        canManage
        onCandidateReminders={onCandidateReminders}
        {...over}
      />
    </ToastProvider>,
  );
  return onCandidateReminders;
}

const SWITCH = "Don't remind the candidate about this interview";

describe("what is planned and what went", () => {
  it("lists each reminder with its name, who it is for, and the day and time on the company's clock", () => {
    show(
      view(
        reminders([
          item(),
          panel("Chidi Nwosu"),
          panel("Kemi Outside"),
          item({
            id: "r3",
            slot: "cand-late",
            label: "Reminder to the candidate (shortly before)",
            dueAt: "2026-10-20T08:00:00.000Z",
          }),
        ]),
      ),
    );
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Reminder to the candidate (earlier)");
    expect(rows[0]).toHaveTextContent("The candidate");
    expect(rows[0]).toHaveTextContent(
      "Goes Mon 19 Oct, 10:00 · Lagos time (WAT)",
    );
    expect(rows[0]).toHaveTextContent("Planned");
    /* A panel's reminder is one row for the two of them, not one each. */
    const together = rows.find((r) =>
      r.textContent?.includes("Reminder to the panelist"),
    );
    expect(together).toHaveTextContent("Chidi Nwosu and Kemi Outside");
    expect(together).toHaveTextContent("Goes Tue 20 Oct, 09:00");
  });

  it("says Sent only for the one the API says was sent, and Skipped with the reason for the one that was not", () => {
    show(
      view(
        reminders([
          item({
            id: "a",
            status: "sent",
            sentAt: "2026-10-19T09:01:00.000Z",
          }),
          panel("Chidi Nwosu", {
            status: "skipped",
            reason:
              "not sent: no reply-to address is set for this company (Careers settings). We do not send an email whose replies would go nowhere",
          }),
          item({
            id: "c",
            slot: "cand-late",
            label: "Reminder to the candidate (shortly before)",
            dueAt: "2026-10-20T08:00:00.000Z",
            status: "due",
            reason:
              "waiting: this company has reached its daily limit of emails to candidates",
          }),
          panel("Kemi Outside", {
            id: "d",
            slot: "nudge-1",
            label: "Scorecard nudge (first)",
            dueAt: "2026-10-21T10:00:00.000Z",
            status: "failed",
            reason: "not sent: the mail provider refused it 3 times",
          }),
        ]),
      ),
    );
    /* In the order they are due; two due at the same time go by slot. */
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("Sent")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("Sent Mon 19 Oct, 10:01");
    expect(within(rows[1]!).getByText("Waiting to go")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent(
      "This company has reached its daily limit of emails to candidates.",
    );
    expect(within(rows[2]!).getByText("Skipped")).toBeInTheDocument();
    /* Taken off before its time came: planned for then, not due then. */
    expect(rows[2]).toHaveTextContent(
      "Was planned for Tue 20 Oct, 09:00 · Lagos time (WAT)",
    );
    expect(rows[2]).toHaveTextContent(
      "No reply-to address is set for this company (Careers settings).",
    );
    expect(within(rows[3]!).getByText("Failed")).toBeInTheDocument();
    expect(rows[3]).toHaveTextContent("Scorecard nudge (first)");
    expect(rows[3]).toHaveTextContent("The mail provider refused it 3 times.");
    /* One Sent badge among four rows. */
    expect(screen.getAllByText("Sent")).toHaveLength(1);
  });

  it("lists reminders planned for an earlier version of the interview apart, as history", () => {
    show(
      view(
        reminders([
          item({
            id: "old",
            status: "skipped",
            current: false,
            reason:
              "not sent: the interview was changed after this was planned, and the change has not been sent to them (send an update to plan new reminders)",
          }),
          item({ id: "new", dueAt: "2026-10-20T08:00:00.000Z" }),
        ]),
      ),
    );
    expect(
      screen.getByText("Planned for an earlier version of this interview"),
    ).toBeInTheDocument();
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(2);
    expect(lists[1]).toHaveTextContent(
      "The interview was changed after this was planned",
    );
    expect(lists[1]).toHaveTextContent("Was planned for Mon 19 Oct, 10:00");
  });

  it("says they go only once the invitation has, when it is queued and not sent", () => {
    show(
      view(reminders([item()]), {
        notices: [{ ...sent, status: "PENDING" }],
      }),
    );
    expect(
      screen.getByText(
        "These go only once the invitation has gone. It is queued, not sent.",
      ),
    ).toBeInTheDocument();
  });

  it("does not say it when the invitation has gone", () => {
    show(view(reminders([item()])));
    expect(screen.queryByText(/queued, not sent/)).toBeNull();
  });
});

describe("when there are none, and why", () => {
  it("says it plainly when the invitation wasn't sent, with no list", () => {
    show(
      view(
        reminders([], {
          code: "no_invitation",
          reason:
            "Nobody has been sent an invitation to this interview, so no reminders are planned. A reminder only ever follows an invitation a person chose to send.",
        }),
        { notices: [{ ...sent, status: "NOT_ASKED" }] },
      ),
    );
    expect(
      screen.getByText("No reminders: the invitation wasn't sent."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("gives the API's own sentence when a change was not sent to them", () => {
    show(
      view(
        reminders([], {
          code: "changed_since_told",
          reason:
            "The interview changed after they were last told, and the change has not been sent to them, so no reminders are planned. Send an update to plan new ones.",
        }),
      ),
    );
    expect(
      screen.getByText(/Send an update to plan new ones\./),
    ).toBeInTheDocument();
  });

  it("says a cancelled interview has none, with the history it left, and offers no switch", () => {
    show(
      view(
        reminders(
          [
            item({
              status: "skipped",
              current: false,
              reason: "not sent: the interview was cancelled",
            }),
          ],
          {
            code: "not_scheduled",
            reason: "This interview is cancelled, so no reminders are planned.",
          },
        ),
        { status: "CANCELLED" },
      ),
    );
    expect(
      screen.getByText(
        "This interview is cancelled, so no reminders are planned.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      screen.getByText("The interview was cancelled."),
    ).toBeInTheDocument();
  });

  it("does not say an interview that took place has none while nudges are still waiting", () => {
    show(
      view(
        reminders(
          [
            panel("Chidi Nwosu", {
              slot: "nudge-1",
              label: "Scorecard nudge (first)",
              dueAt: "2026-10-21T10:00:00.000Z",
            }),
          ],
          {
            code: "not_scheduled",
            reason: "This interview is completed, so no reminders are planned.",
          },
        ),
        { status: "COMPLETED" },
      ),
    );
    expect(screen.queryByText(/so no reminders are planned/)).toBeNull();
    expect(screen.getByText("Scorecard nudge (first)")).toBeInTheDocument();
  });

  it("draws nothing at all where the server does not say what is planned", () => {
    for (const list of [undefined, null]) {
      const { container, unmount } = render(
        <ToastProvider>
          <InterviewReminders
            interview={view(list)}
            timeZone="Africa/Lagos"
            now="2026-10-10T09:00:00.000Z"
            canManage
            onCandidateReminders={() => undefined}
          />
        </ToastProvider>,
      );
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});

describe("the candidate's switch for one interview", () => {
  it("offers it to people who manage hiring, saying the panel's reminders are not changed", () => {
    show(view(reminders([item()])));
    const box = screen.getByRole("switch", { name: SWITCH });
    expect(box).not.toBeChecked();
    expect(
      screen.getByText("The panel's reminders are not changed."),
    ).toBeInTheDocument();
  });

  it("still offers it with no invitation sent, because it holds for when one is", () => {
    show(
      view(
        reminders([], {
          code: "no_invitation",
          reason: "Nobody has been sent an invitation.",
        }),
      ),
    );
    expect(screen.getByRole("switch", { name: SWITCH })).toBeInTheDocument();
  });

  it("does not offer it to anybody else, who can still read the plan", () => {
    show(view(reminders([item()])), { canManage: false });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      screen.getByText("Reminder to the candidate (earlier)"),
    ).toBeInTheDocument();
  });

  it("does not offer it where the API does not say whether it is on", () => {
    show(view(reminders([item()]), { candidateReminders: undefined }));
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("asks for the change when it is pressed: off for the candidate", async () => {
    const user = userEvent.setup();
    const onCandidateReminders = show(view(reminders([item()])));
    await user.click(screen.getByRole("switch", { name: SWITCH }));
    expect(onCandidateReminders).toHaveBeenCalledWith(
      expect.objectContaining({ id: "iv-1" }),
      false,
    );
  });

  it("is checked when the candidate's reminders are off, and asks to turn them back on", async () => {
    const user = userEvent.setup();
    const onCandidateReminders = show(
      view(reminders([panel("Chidi Nwosu")]), { candidateReminders: false }),
    );
    const box = screen.getByRole("switch", { name: SWITCH });
    expect(box).toBeChecked();
    /* The panel's reminders are still listed. */
    expect(screen.getByText("Chidi Nwosu")).toBeInTheDocument();
    await user.click(box);
    expect(onCandidateReminders).toHaveBeenCalledWith(
      expect.objectContaining({ id: "iv-1" }),
      true,
    );
  });

  it("is not offered once the interview is over", () => {
    show(view(reminders([item()]), { status: "COMPLETED" }));
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

/* ------------------------------------------------ through the card, with a gateway */

const readiness = vi.hoisted(() => ({ data: null as unknown }));
const gateway = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/hiring/interviews/use-interviews", () => ({
  useInterviewsGateway: () => gateway.current,
}));
vi.mock("@/lib/hiring/pipeline/use-comms", () => ({
  useEmailReadiness: () => ({
    data: readiness.data,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
  useStageMail: () => ({
    known: true,
    byStage: new Map(),
    stages: [],
    catalog: null,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
}));
vi.mock("@/lib/hiring/access/use-panel-people", () => ({
  usePanelPeople: () => ({ people: [], loading: false }),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true }),
}));

const { InterviewsCard } =
  await import("@/components/hiring/interviews/interviews-card");

const READY: EmailReadiness = {
  supported: true,
  enabled: true,
  willSend: true,
  blockedBy: [],
  sender: {
    name: "Schull Technologies",
    registeredName: "Schull Technologies",
    displayNameAccepted: null,
    replyTo: "people@schull.io",
  },
};

const fake = (over: Partial<InterviewsGateway> = {}): InterviewsGateway => ({
  mode: "api",
  storesCancelReason: false,
  now: () => "2026-10-10T09:00:00.000Z",
  explainer: async () => null,
  reminderSettings: async () => settingsViewOf(defaultReminderSettings()),
  saveReminderSettings: vi.fn(),
  setCandidateReminders: vi.fn(),
  schedule: vi.fn(),
  change: vi.fn(),
  cancel: vi.fn(),
  notify: vi.fn(),
  complete: vi.fn(),
  noShow: vi.fn(),
  calendarFile: vi.fn(),
  ...over,
});

beforeEach(() => {
  readiness.data = READY;
  gateway.current = fake();
});

function card(
  interview: InterviewView,
  over: Partial<React.ComponentProps<typeof InterviewsCard>> = {},
) {
  render(
    <ToastProvider>
      <InterviewsCard
        applicationId="pa-1"
        requisitionId="req-1"
        stageId="s4"
        stageName="Interview"
        candidateName="Chioma Aduba"
        role="Payroll Analyst"
        canManage
        onChanged={() => undefined}
        interviews={[interview]}
        {...over}
      />
    </ToastProvider>,
  );
}

const reminderSwitch = () => screen.getByRole("switch", { name: SWITCH });

describe("the switch, through the card", () => {
  const planned = () =>
    view(
      reminders([
        item(),
        item({
          id: "r3",
          slot: "cand-late",
          label: "Reminder to the candidate (shortly before)",
          dueAt: "2026-10-20T08:00:00.000Z",
        }),
        panel("Chidi Nwosu"),
      ]),
    );

  it("shows the candidate's reminders gone at once, keeps the panel's, and keeps what the API answers with", async () => {
    const user = userEvent.setup();
    let resolve!: (value: ChangeResult) => void;
    const setCandidateReminders = vi.fn(
      () =>
        new Promise<ChangeResult>((r) => {
          resolve = r;
        }),
    );
    gateway.current = fake({ setCandidateReminders });
    const onChanged = vi.fn();
    card(planned(), { onChanged });
    await user.click(reminderSwitch());
    /* Before any answer: the candidate's are already off the list, the panel's are not. */
    expect(reminderSwitch()).toBeChecked();
    expect(
      screen.queryByText("Reminder to the candidate (earlier)"),
    ).toBeNull();
    expect(
      screen.getByText("Reminder to the panelist (shortly before)"),
    ).toBeInTheDocument();
    resolve({
      interview: view(reminders([panel("Chidi Nwosu")]), {
        candidateReminders: false,
      }),
      outcome: { asked: false, notices: [] },
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(setCandidateReminders).toHaveBeenCalledWith(
      expect.objectContaining({ id: "iv-1" }),
      false,
    );
    expect(reminderSwitch()).toBeChecked();
  });

  it("asks to turn them back on from the switch that is checked", async () => {
    const user = userEvent.setup();
    const setCandidateReminders = vi.fn(async (): Promise<ChangeResult> => ({
      interview: planned(),
      outcome: { asked: false, notices: [] },
    }));
    gateway.current = fake({ setCandidateReminders });
    card({ ...planned(), candidateReminders: false });
    await user.click(reminderSwitch());
    await waitFor(() =>
      expect(setCandidateReminders).toHaveBeenCalledWith(
        expect.objectContaining({ id: "iv-1" }),
        true,
      ),
    );
  });

  it("puts the list back and says the API's sentence when it refuses", async () => {
    const user = userEvent.setup();
    const setCandidateReminders = vi.fn(async (): Promise<ChangeResult> => {
      throw new ApiError(
        409,
        "conflict",
        "Only an interview that has not happened yet can be changed.",
      );
    });
    gateway.current = fake({ setCandidateReminders });
    const onNotice = vi.fn();
    card(planned(), { onNotice });
    await user.click(reminderSwitch());
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith(
        "danger",
        "Only an interview that has not happened yet can be changed.",
      ),
    );
    expect(reminderSwitch()).not.toBeChecked();
    expect(
      screen.getByText("Reminder to the candidate (earlier)"),
    ).toBeInTheDocument();
  });

  it("does not ask the server for the company's settings just to name a reminder: the API names each one", async () => {
    const reminderSettings = vi.fn(async () =>
      settingsViewOf(defaultReminderSettings()),
    );
    gateway.current = fake({ reminderSettings });
    card(planned());
    expect(
      await screen.findByText("Reminder to the candidate (earlier)"),
    ).toBeInTheDocument();
    expect(reminderSettings).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------- a change says what it did to them */

const NOW = "2026-10-10T09:00:00.000Z";
const outcome = (
  counts:
    | { planned: number; removed: number | null; paused?: Reminders["paused"] }
    | null
    | undefined,
  asked = false,
): ChangeResult => ({
  interview: view(undefined),
  outcome: {
    asked,
    notices: [{ ...sent, status: asked ? "PENDING" : "NOT_ASKED" }],
    ...(counts === undefined
      ? {}
      : counts === null
        ? { reminders: null }
        : { reminders: { paused: null, ...counts } }),
  },
});

describe("what a booking, a reschedule or a cancellation says about the reminders", () => {
  const reschedule = async (result: ChangeResult) => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <RescheduleInterviewDialog
          open
          interview={view(reminders([item()]))}
          onClose={() => undefined}
          onConfirm={async () => result}
          getFile={vi.fn()}
          timeZone="Africa/Lagos"
          now={NOW}
          readiness={READY}
          explainer={null}
        />
      </ToastProvider>,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Reschedule this interview",
    });
    const time = dialog.querySelector("input[type=time]") as HTMLInputElement;
    fireEvent.change(time, { target: { value: "11:30" } });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    return screen.findByRole("dialog", { name: "Interview updated" });
  };

  const cancel = async (result: ChangeResult) => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <CancelInterviewDialog
          open
          interview={view(undefined)}
          onClose={() => undefined}
          onConfirm={async () => result}
          getFile={vi.fn()}
          timeZone="Africa/Lagos"
          readiness={READY}
          explainer={null}
        />
      </ToastProvider>,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Cancel this interview?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Cancel the interview" }),
    );
    return screen.findByRole("dialog", { name: "Interview cancelled" });
  };

  it("says how many were planned again for the new time, and how many were taken off", async () => {
    const done = await reschedule(outcome({ planned: 3, removed: 3 }));
    expect(done).toHaveTextContent(
      "3 reminders are planned for the new time. 3 reminders planned for the old time were taken off.",
    );
  });

  it("gives the API's reason when none is planned for the new time", async () => {
    const done = await reschedule(
      outcome({
        planned: 0,
        removed: 2,
        paused: {
          code: "changed_since_told",
          reason:
            "The interview changed after they were last told, and the change has not been sent to them, so no reminders are planned. Send an update to plan new ones.",
        },
      }),
    );
    expect(done).toHaveTextContent(
      "no reminders are planned. Send an update to plan new ones.",
    );
    expect(done).toHaveTextContent(
      "2 reminders planned for the old time were taken off.",
    );
  });

  it("says how many planned reminders a cancellation took off", async () => {
    const done = await cancel(outcome({ planned: 0, removed: 2 }));
    expect(done).toHaveTextContent("2 planned reminders were taken off.");
  });

  it("says no reminder was planned when a cancellation had none to take off", async () => {
    const done = await cancel(outcome({ planned: 0, removed: 0 }));
    expect(done).toHaveTextContent(
      "No reminder was planned, so none was taken off.",
    );
  });

  it("says nothing about reminders when the API says nothing", async () => {
    const done = await cancel(outcome(undefined));
    expect(done).not.toHaveTextContent(/reminder/i);
    const other = await reschedule(outcome(null));
    expect(other).not.toHaveTextContent(/reminder/i);
  });
});

describe("booking with the invitation: reminders", () => {
  const renderSchedule = () => {
    const onConfirm = vi.fn(async (): Promise<ChangeResult> =>
      outcome({ planned: 8, removed: null }, true),
    );
    render(
      <ToastProvider>
        <ScheduleInterviewDialog
          open
          onClose={() => undefined}
          onConfirm={onConfirm}
          getFile={vi.fn()}
          candidateName="Chioma Aduba"
          timeZone="Africa/Lagos"
          now={NOW}
          stagePanel={[{ id: "e:p1", name: "Chidi Nwosu" }]}
          people={[]}
          peopleLoading={false}
          panelSupported
          readiness={READY}
          explainer={null}
        />
      </ToastProvider>,
    );
    return onConfirm;
  };
  const fillIn = (dialog: HTMLElement) => {
    fireEvent.change(
      dialog.querySelector("input[type=date]") as HTMLInputElement,
      {
        target: { value: "2026-10-20" },
      },
    );
    fireEvent.change(
      dialog.querySelector("input[type=time]") as HTMLInputElement,
      {
        target: { value: "10:00" },
      },
    );
  };

  it("offers the candidate's switch only once the invitation is to be sent", async () => {
    const user = userEvent.setup();
    renderSchedule();
    const dialog = await screen.findByRole("dialog", {
      name: "Schedule an interview",
    });
    expect(within(dialog).queryByRole("switch", { name: SWITCH })).toBeNull();
    await user.click(
      within(dialog).getByRole("radio", {
        name: /^Send the invitation with a calendar file/,
      }),
    );
    const box = within(dialog).getByRole("switch", { name: SWITCH });
    expect(box).not.toBeChecked();
    expect(dialog).toHaveTextContent(/The panel's reminders are not changed/);
  });

  it("sends nothing about reminders unless the switch was used", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule();
    const dialog = await screen.findByRole("dialog", {
      name: "Schedule an interview",
    });
    await user.click(
      within(dialog).getByRole("radio", {
        name: /^Send the invitation with a calendar file/,
      }),
    );
    fillIn(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(
      (onConfirm.mock.calls[0] as unknown as [Record<string, unknown>])[0],
    ).not.toHaveProperty("candidateReminders");
  });

  it("asks for the candidate's reminders off when the switch is on, and only when sending", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule();
    const dialog = await screen.findByRole("dialog", {
      name: "Schedule an interview",
    });
    await user.click(
      within(dialog).getByRole("radio", {
        name: /^Send the invitation with a calendar file/,
      }),
    );
    await user.click(within(dialog).getByRole("switch", { name: SWITCH }));
    fillIn(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(
      (onConfirm.mock.calls[0] as unknown as [Record<string, unknown>])[0],
    ).toMatchObject({ sendInvite: true, candidateReminders: false });
  });

  it("does not send the switch when it was used and then the invitation was taken back", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule();
    const dialog = await screen.findByRole("dialog", {
      name: "Schedule an interview",
    });
    await user.click(
      within(dialog).getByRole("radio", {
        name: /^Send the invitation with a calendar file/,
      }),
    );
    await user.click(within(dialog).getByRole("switch", { name: SWITCH }));
    await user.click(
      within(dialog).getByRole("radio", { name: /^Don't send/ }),
    );
    fillIn(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(
      (onConfirm.mock.calls[0] as unknown as [Record<string, unknown>])[0],
    ).not.toHaveProperty("candidateReminders");
  });

  it("says how many reminders are planned, and that they go only once the invitation has", async () => {
    const user = userEvent.setup();
    renderSchedule();
    const dialog = await screen.findByRole("dialog", {
      name: "Schedule an interview",
    });
    await user.click(
      within(dialog).getByRole("radio", {
        name: /^Send the invitation with a calendar file/,
      }),
    );
    fillIn(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    const done = await screen.findByRole("dialog", {
      name: "Interview booked",
    });
    expect(done).toHaveTextContent(
      "8 reminders are planned. A reminder goes only once its invitation has.",
    );
  });
});
