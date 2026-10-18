import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { InterviewReminders } from "@/components/hiring/interviews/interview-reminders";
import {
  RescheduleInterviewDialog,
  CancelInterviewDialog,
} from "@/components/hiring/interviews/interview-dialogs";
import { ApiError } from "@/lib/api/client";
import { defaultReminderSettings } from "@/lib/hiring/interviews/demo-reminders";
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
 * says why there are none when the invitation wasn't sent, and offers no switch then; it
 * never calls a reminder sent unless it is; and turning reminders off for one interview
 * shows at once and is put back, with the API's sentence, if it is refused.
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
  kind: "CANDIDATE_EARLY",
  audience: "CANDIDATE",
  at: "2026-10-19T09:00:00.000Z",
  status: "PLANNED",
  note: null,
  ...over,
});

const view = (
  reminders: Reminders | null | undefined,
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
  ...(reminders === undefined ? {} : { reminders }),
  ...over,
});

function show(
  interview: InterviewView,
  over: Partial<React.ComponentProps<typeof InterviewReminders>> = {},
) {
  const onOff = vi.fn();
  render(
    <ToastProvider>
      <InterviewReminders
        interview={interview}
        timeZone="Africa/Lagos"
        settings={defaultReminderSettings()}
        canManage
        onOff={onOff}
        {...over}
      />
    </ToastProvider>,
  );
  return onOff;
}

describe("what is planned and what went", () => {
  it("lists each reminder with who, when before, and the day and time on the company's clock", () => {
    show(
      view({
        off: false,
        items: [
          item(),
          item({
            id: "r2",
            kind: "PANELIST",
            audience: "PANELIST",
            at: "2026-10-19T09:00:00.000Z",
          }),
          item({
            id: "r3",
            kind: "CANDIDATE_FINAL",
            at: "2026-10-20T08:00:00.000Z",
          }),
        ],
      }),
    );
    const list = screen.getByRole("list");
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(
      "The candidate: 24 hours before the interview",
    );
    expect(rows[0]).toHaveTextContent("Mon 19 Oct, 10:00 · Lagos time (WAT)");
    expect(rows[0]).toHaveTextContent("Planned");
    expect(rows[1]).toHaveTextContent(
      "Each panelist: 24 hours before the interview",
    );
    expect(rows[2]).toHaveTextContent(
      "The candidate: 1 hour before the interview",
    );
    expect(rows[2]).toHaveTextContent("Tue 20 Oct, 09:00");
  });

  it("says Sent only for the one the API says was sent, and Skipped with the reason for the one that was not", () => {
    show(
      view({
        off: false,
        items: [
          item({ id: "a", status: "SENT" }),
          item({
            id: "b",
            kind: "PANELIST",
            audience: "PANELIST",
            status: "SKIPPED",
            note: "not sent: no reply-to address is set for this company (Careers settings). We do not send an email whose replies would go nowhere",
          }),
          item({ id: "c", kind: "CANDIDATE_FINAL", status: "PENDING" }),
          item({
            id: "d",
            kind: "SCORECARD_NUDGE",
            audience: "PANELIST",
            status: "FAILED",
            note: "not sent: the mail provider refused it 3 times",
            nth: { n: 1, of: 2 },
          }),
        ],
      }),
    );
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("Sent")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Skipped")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent(
      "No reply-to address is set for this company (Careers settings).",
    );
    expect(within(rows[2]!).getByText("Queued")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("Failed")).toBeInTheDocument();
    expect(rows[3]).toHaveTextContent("Each panelist: scorecard nudge 1 of 2");
    expect(rows[3]).toHaveTextContent("The mail provider refused it 3 times.");
    /* One Sent badge among four rows. */
    expect(screen.getAllByText("Sent")).toHaveLength(1);
  });

  it("says nothing is planned, and where to change it, when every time has passed", () => {
    show(view({ off: false, items: [] }));
    expect(screen.getByText(/Nothing is planned\./)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "the company's settings" }),
    ).toHaveAttribute("href", "/hiring/settings/interviews");
  });
});

describe("when there are none, and why", () => {
  it.each([["NOT_ASKED"], ["SKIPPED"], ["FAILED"]] as const)(
    "says the invitation wasn't sent when it was %s, with no switch and no list",
    (status) => {
      show(view({ off: false, items: [] }, { notices: [{ ...sent, status }] }));
      expect(
        screen.getByText("No reminders: the invitation wasn't sent."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("switch")).toBeNull();
      expect(screen.queryByRole("list")).toBeNull();
    },
  );

  it("says queued is not sent, so reminders have not started", () => {
    show(
      view(
        { off: false, items: [] },
        { notices: [{ ...sent, status: "PENDING" }] },
      ),
    );
    expect(
      screen.getByText(/No reminders yet: the invitation is queued, not sent/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("says a cancelled interview has none, and offers no switch", () => {
    show(view({ off: false, items: [] }, { status: "CANCELLED" }));
    expect(
      screen.getByText("No reminders: the interview is cancelled."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("draws nothing at all where the server does not say what is planned", () => {
    for (const reminders of [undefined, null]) {
      const { container, unmount } = render(
        <ToastProvider>
          <InterviewReminders
            interview={view(reminders)}
            timeZone="Africa/Lagos"
            settings={null}
            canManage
            onOff={() => undefined}
          />
        </ToastProvider>,
      );
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});

describe("turning them off for one interview", () => {
  it("offers a switch to people who manage hiring, saying it changes nothing for the company", () => {
    show(view({ off: false, items: [item()] }));
    const box = screen.getByRole("switch", {
      name: "Don't send reminders for this interview",
    });
    expect(box).not.toBeChecked();
    expect(
      screen.getByText(/The company's settings are not changed/),
    ).toBeInTheDocument();
  });

  it("does not offer it to anybody else, who can still read the plan", () => {
    show(view({ off: false, items: [item()] }), { canManage: false });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      screen.getByText(/24 hours before the interview/),
    ).toBeInTheDocument();
  });

  it("asks for the change when it is pressed", async () => {
    const user = userEvent.setup();
    const onOff = show(view({ off: false, items: [item()] }));
    await user.click(
      screen.getByRole("switch", {
        name: "Don't send reminders for this interview",
      }),
    );
    expect(onOff).toHaveBeenCalledWith(
      expect.objectContaining({ id: "iv-1" }),
      true,
    );
  });

  it("says nothing is planned while they are off, and keeps what already went", () => {
    show(
      view({
        off: true,
        items: [item({ status: "SENT", id: "gone" })],
      }),
    );
    expect(
      screen.getByRole("switch", {
        name: "Don't send reminders for this interview",
      }),
    ).toBeChecked();
    expect(
      screen.getByText(
        "Reminders are off for this interview. Nothing is planned.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText(/Nothing is planned\. Every/)).toBeNull();
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
  reminderSettings: async () => defaultReminderSettings(),
  saveReminderSettings: vi.fn(),
  setRemindersOff: vi.fn(),
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

const reminderSwitch = () =>
  screen.getByRole("switch", {
    name: "Don't send reminders for this interview",
  });

describe("the switch, through the card", () => {
  const planned = view({
    off: false,
    items: [
      item(),
      item({
        id: "r3",
        kind: "CANDIDATE_FINAL",
        at: "2026-10-20T08:00:00.000Z",
      }),
    ],
  });

  it("shows reminders off at once, and keeps what the API answers with", async () => {
    const user = userEvent.setup();
    let resolve!: (value: Reminders) => void;
    const setRemindersOff = vi.fn(
      () =>
        new Promise<Reminders>((r) => {
          resolve = r;
        }),
    );
    gateway.current = fake({ setRemindersOff });
    const onChanged = vi.fn();
    card(planned, { onChanged });
    await user.click(reminderSwitch());
    /* Before any answer: what was planned is already gone from the list. */
    expect(reminderSwitch()).toBeChecked();
    expect(
      screen.getByText(
        "Reminders are off for this interview. Nothing is planned.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/24 hours before the interview/)).toBeNull();
    resolve({ off: true, items: [] });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(setRemindersOff).toHaveBeenCalledWith(
      expect.objectContaining({ id: "iv-1" }),
      true,
    );
    expect(reminderSwitch()).toBeChecked();
  });

  it("puts the list back and says the API's sentence when it refuses", async () => {
    const user = userEvent.setup();
    const setRemindersOff = vi.fn(async (): Promise<Reminders> => {
      throw new ApiError(
        409,
        "conflict",
        "That interview has already taken place.",
      );
    });
    gateway.current = fake({ setRemindersOff });
    const onNotice = vi.fn();
    card(planned, { onNotice });
    await user.click(reminderSwitch());
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith(
        "danger",
        "That interview has already taken place.",
      ),
    );
    expect(reminderSwitch()).not.toBeChecked();
    expect(screen.getAllByText(/before the interview/).length).toBeGreaterThan(
      1,
    );
  });

  it("reads the company's hours from the defaults, so a changed default reads as changed", async () => {
    const settings = defaultReminderSettings();
    const early = settings.rules.find((r) => r.kind === "CANDIDATE_EARLY");
    if (early) early.hours = 48;
    gateway.current = fake({ reminderSettings: async () => settings });
    card(planned);
    expect(
      await screen.findByText("The candidate: 2 days before the interview"),
    ).toBeInTheDocument();
  });
});

/* ------------------------------------------------- a change says what it did to them */

const NOW = "2026-10-10T09:00:00.000Z";
const outcome = (
  reminders: { planned: number; removed: number } | null | undefined,
): ChangeResult => ({
  interview: view(undefined),
  outcome: {
    asked: false,
    notices: [{ ...sent, status: "NOT_ASKED" }],
    ...(reminders === undefined ? {} : { reminders }),
  },
});

describe("what a reschedule or a cancellation says about the reminders", () => {
  it("says they were planned again for the new time, after the API answers", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <RescheduleInterviewDialog
          open
          interview={view({ off: false, items: [item()] })}
          onClose={() => undefined}
          onConfirm={async () => outcome({ planned: 3, removed: 3 })}
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
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(time, { target: { value: "11:30" } });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    const done = await screen.findByRole("dialog", {
      name: "Interview updated",
    });
    expect(done).toHaveTextContent(
      "3 reminders were planned again for the new time.",
    );
  });

  it("says nothing about reminders when the API says nothing", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <CancelInterviewDialog
          open
          interview={view(undefined)}
          onClose={() => undefined}
          onConfirm={async () => outcome(undefined)}
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
    const done = await screen.findByRole("dialog", {
      name: "Interview cancelled",
    });
    expect(done).not.toHaveTextContent(/reminder/i);
  });

  it("says how many planned reminders a cancellation took away", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <CancelInterviewDialog
          open
          interview={view(undefined)}
          onClose={() => undefined}
          onConfirm={async () => outcome({ planned: 0, removed: 2 })}
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
    const done = await screen.findByRole("dialog", {
      name: "Interview cancelled",
    });
    expect(done).toHaveTextContent("2 planned reminders were removed.");
  });
});
