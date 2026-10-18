import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { EmailReadiness } from "@/lib/hiring/comms/model";
import type { InterviewsGateway } from "@/lib/hiring/interviews/gateway";
import type {
  ChangeResult,
  InterviewNotice,
  InterviewView,
} from "@/lib/hiring/interviews/model";

/**
 * The Interviews card of a record, over a gateway that is told what to answer.
 *
 * What these hold: the card reads what the API holds (the time on the company's clock,
 * the link, the log of messages) and says nothing more; a change shows at once and is put
 * back, with the API's own sentence, if it is refused; and the invitation is offered only
 * for an interview nobody was invited to.
 */

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
    stages: [
      {
        stageId: "s4",
        name: "Interview",
        order: 3,
        type: "INTERVIEW",
        emailTemplateId: null,
        panel: [
          {
            employeeId: "p1",
            userId: null,
            kind: "EMPLOYEE",
            name: "Chidi Nwosu",
            jobTitle: "",
          },
        ],
      },
    ],
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

const notice = (over: Partial<InterviewNotice> = {}): InterviewNotice => ({
  id: "n1",
  kind: "INVITE",
  audience: "CANDIDATE",
  recipient: "Chioma Aduba",
  status: "SENT",
  note: null,
  at: "2026-10-12T09:00:00.000Z",
  ...over,
});

const view = (over: Partial<InterviewView> = {}): InterviewView => ({
  id: "iv-1",
  applicationId: "pa-1",
  candidateName: "Chioma Aduba",
  role: "Payroll Analyst",
  kind: "TECHNICAL",
  scheduledFor: "2026-10-20T09:00:00.000Z",
  durationMins: 60,
  status: "SCHEDULED",
  location: null,
  joinUrl: "https://meet.google.com/abc-defg-hij",
  timeZone: "Africa/Lagos",
  stageName: "Interview",
  panelists: [{ key: "e:p1", name: "Chidi Nwosu", submitted: false }],
  sequence: 0,
  notices: [notice()],
  cancelReason: null,
  ...over,
});

const fake = (over: Partial<InterviewsGateway> = {}): InterviewsGateway => ({
  mode: "api",
  storesCancelReason: true,
  now: () => "2026-10-10T09:00:00.000Z",
  explainer: async () => ({
    candidate: "They get the time and a calendar file.",
    panelist: "Each panelist gets the same, never a score.",
  }),
  reminderSettings: async () => null,
  saveReminderSettings: vi.fn(),
  setCandidateReminders: vi.fn(),
  schedule: vi.fn(),
  change: vi.fn(),
  cancel: vi.fn(),
  notify: vi.fn(),
  complete: vi.fn(async () => undefined),
  noShow: vi.fn(async () => undefined),
  calendarFile: vi.fn(),
  ...over,
});

function show(
  interviews: InterviewView[],
  over: Partial<React.ComponentProps<typeof InterviewsCard>> = {},
) {
  const props = {
    applicationId: "pa-1",
    requisitionId: "req-1",
    stageId: "s4",
    stageName: "Interview",
    candidateName: "Chioma Aduba",
    role: "Payroll Analyst",
    canManage: true,
    onChanged: vi.fn(),
    ...over,
  };
  const tree = (list: InterviewView[]) => (
    <ToastProvider>
      <InterviewsCard {...props} interviews={list} />
    </ToastProvider>
  );
  const utils = render(tree(interviews));
  return {
    ...props,
    rerender: (list: InterviewView[]) => utils.rerender(tree(list)),
  };
}

beforeEach(() => {
  readiness.data = READY;
  gateway.current = fake();
});

describe("what an interview card says", () => {
  it("gives the time on the company's clock, with the clock named, the link and who scores it", () => {
    show([view()]);
    expect(screen.getByText(/Tue 20 Oct, 10:00/)).toHaveTextContent(
      "Tue 20 Oct, 10:00 · Lagos time (WAT) · 60 mins",
    );
    const link = screen.getByRole("link", { name: /Join the call/ });
    expect(link).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText(/Invited to score it/)).toHaveTextContent(
      "Chidi Nwosu (waiting)",
    );
  });

  it("writes an interview booked on another clock on that clock", () => {
    show([view({ timeZone: "Africa/Nairobi" })]);
    expect(screen.getByText(/Tue 20 Oct/)).toHaveTextContent(
      "Tue 20 Oct, 12:00 · Nairobi time (EAT)",
    );
  });

  it("lists every message asked of the mail, with its status and its reason", () => {
    show([
      view({
        notices: [
          notice({ status: "SENT" }),
          notice({
            id: "n2",
            audience: "PANELIST",
            recipient: "Chidi Nwosu",
            status: "SKIPPED",
            note: "not sent: mail not configured",
          }),
          notice({ id: "n3", kind: "UPDATE", status: "PENDING" }),
          notice({ id: "n4", kind: "CANCEL", status: "NOT_ASKED" }),
        ],
      }),
    ]);
    const list = screen.getByText("Emails about this interview").parentElement!;
    expect(within(list).getByText("Sent")).toBeInTheDocument();
    expect(within(list).getByText("Skipped")).toBeInTheDocument();
    expect(list).toHaveTextContent("Mail not configured.");
    expect(within(list).getByText("Queued")).toBeInTheDocument();
    expect(within(list).getByText("Not asked")).toBeInTheDocument();
    expect(list).toHaveTextContent("You chose not to send a cancellation.");
  });

  it("says no email was asked for when none was, and says nothing at all when the server does not say", () => {
    const { unmount } = render(
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
          interviews={[view({ notices: [] })]}
        />
      </ToastProvider>,
    );
    expect(screen.getByText(/No email has been asked for/)).toBeInTheDocument();
    unmount();
    show([view({ notices: null })]);
    expect(screen.queryByText("Emails about this interview")).toBeNull();
    expect(screen.queryByText(/No email has been asked for/)).toBeNull();
  });

  it("says nothing is scheduled when nothing is", () => {
    show([]);
    expect(screen.getByText("Nothing scheduled.")).toBeInTheDocument();
  });

  it("offers booking, rescheduling and cancelling to people who manage hiring, and not to anybody else", () => {
    const { unmount } = render(
      <ToastProvider>
        <InterviewsCard
          applicationId="pa-1"
          requisitionId="req-1"
          stageId="s4"
          stageName="Interview"
          candidateName="Chioma Aduba"
          role={null}
          canManage={false}
          onChanged={() => undefined}
          interviews={[view()]}
        />
      </ToastProvider>,
    );
    expect(screen.queryByRole("button", { name: "Schedule" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reschedule" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    /* The calendar is anybody's who can see the interview. */
    expect(
      screen.getByRole("button", { name: /Add to calendar/ }),
    ).toBeInTheDocument();
    unmount();
    show([view()]);
    expect(
      screen.getByRole("button", { name: "Schedule" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reschedule" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});

describe("sending an invitation that was not sent", () => {
  it("is offered for an interview nobody has been invited to, and not otherwise", () => {
    const { unmount } = render(
      <ToastProvider>
        <InterviewsCard
          applicationId="pa-1"
          requisitionId="req-1"
          stageId="s4"
          stageName="Interview"
          candidateName="Chioma Aduba"
          role={null}
          canManage
          onChanged={() => undefined}
          interviews={[view({ notices: [notice({ status: "NOT_ASKED" })] })]}
        />
      </ToastProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Send the invitation" }),
    ).toBeInTheDocument();
    unmount();
    show([view({ notices: [notice({ status: "SENT" })] })]);
    expect(
      screen.queryByRole("button", { name: "Send the invitation" }),
    ).toBeNull();
  });

  it("is not offered when this server does not say what was sent, or does not send mail", () => {
    show([view({ notices: null })]);
    expect(
      screen.queryByRole("button", { name: "Send the invitation" }),
    ).toBeNull();
  });

  it("asks first, says who it goes to and from whom, and sends only on the button that says so", async () => {
    const user = userEvent.setup();
    const notify = vi.fn(async (): Promise<ChangeResult> => ({
      interview: view(),
      outcome: {
        asked: true,
        notices: [notice({ status: "PENDING" })],
      },
    }));
    gateway.current = fake({ notify });
    const props = show([view({ notices: [notice({ status: "NOT_ASKED" })] })]);
    await user.click(
      screen.getByRole("button", { name: "Send the invitation" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Send the invitation?",
    });
    expect(dialog).toHaveTextContent(
      "Technical with Chioma Aduba, Tue 20 Oct, 10:00",
    );
    expect(dialog).toHaveTextContent(
      "Nothing is sent unless you press the button.",
    );
    expect(dialog).toHaveTextContent("From: Schull Technologies via ApproveHR");
    expect(notify).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", {
        name: "Send the invitation with a calendar file",
      }),
    );
    await waitFor(() => expect(notify).toHaveBeenCalled());
    const done = await screen.findByRole("dialog", {
      name: "Invitation asked for",
    });
    expect(done).toHaveTextContent("Queued is not sent");
    expect(props.onChanged).toHaveBeenCalled();
  });

  it("closes without sending on 'Don't send'", async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    gateway.current = fake({ notify });
    show([view({ notices: [notice({ status: "NOT_ASKED" })] })]);
    await user.click(
      screen.getByRole("button", { name: "Send the invitation" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Send the invitation?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Don't send" }),
    );
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("a change shows at once, and is put back when it is refused", () => {
  const cancelling = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Cancel this interview?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Cancel the interview" }),
    );
    return dialog;
  };

  it("shows the interview as cancelled while the API is answering, and keeps it so on success", async () => {
    const user = userEvent.setup();
    let resolve!: (value: ChangeResult) => void;
    const cancel = vi.fn(
      () =>
        new Promise<ChangeResult>((r) => {
          resolve = r;
        }),
    );
    gateway.current = fake({ cancel });
    const props = show([view()]);
    await cancelling(user);
    await waitFor(() => expect(cancel).toHaveBeenCalled());
    /* Before any answer: the card already says it, marked as saving. */
    const card = screen
      .getByText("Technical")
      .closest("[aria-busy]") as HTMLElement;
    expect(card).toHaveAttribute("aria-busy", "true");
    expect(within(card).getByText("Saving")).toBeInTheDocument();
    expect(
      within(card).queryByRole("button", { name: /Add to calendar/ }),
    ).toBeNull();

    await act(async () => {
      resolve({
        interview: view({ status: "CANCELLED", cancelReason: "Role on hold" }),
        outcome: {
          asked: false,
          notices: [notice({ kind: "CANCEL", status: "NOT_ASKED" })],
        },
      });
    });
    expect(
      await screen.findByRole("dialog", { name: "Interview cancelled" }),
    ).toBeInTheDocument();
    expect(props.onChanged).toHaveBeenCalled();
    expect(screen.getByText(/Cancelled: Role on hold/)).toBeInTheDocument();
  });

  it("puts the card back and shows the API's own sentence when the cancel is refused", async () => {
    const user = userEvent.setup();
    const cancel = vi.fn(async (): Promise<ChangeResult> => {
      throw new ApiError(
        409,
        "conflict",
        "That interview has already taken place.",
      );
    });
    gateway.current = fake({ cancel });
    show([view()]);
    const dialog = await cancelling(user);
    expect(
      await within(dialog).findByText(
        "That interview has already taken place.",
      ),
    ).toBeInTheDocument();
    const card = screen
      .getByText("Technical")
      .closest("[aria-busy], div.rounded-md") as HTMLElement;
    expect(within(card).queryByText("Saving")).toBeNull();
    expect(within(card).getByText("scheduled")).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: /Add to calendar/ }),
    ).toBeInTheDocument();
  });

  it("retires the overlay once the record is read again", async () => {
    const user = userEvent.setup();
    const cancel = vi.fn(async (): Promise<ChangeResult> => ({
      interview: view({ status: "CANCELLED" }),
      outcome: { asked: false, notices: [] },
    }));
    gateway.current = fake({ cancel });
    const props = show([view()]);
    await cancelling(user);
    await screen.findByRole("dialog", { name: "Interview cancelled" });
    /* The re-read says the server still has it as it was: the card says what the server says. */
    props.rerender([view()]);
    await waitFor(() => expect(screen.queryByText(/Cancelled/)).toBeNull());
  });

  it("puts a refused 'Mark complete' back and says the API's sentence", async () => {
    const user = userEvent.setup();
    const complete = vi.fn(async () => {
      throw new ApiError(
        403,
        "forbidden",
        "You need the following to do that: Hire.",
      );
    });
    gateway.current = fake({ complete });
    const onNotice = vi.fn();
    show([view()], { onNotice });
    await user.click(screen.getByRole("button", { name: "Mark complete" }));
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith(
        "danger",
        "You need the following to do that: Hire.",
      ),
    );
    expect(screen.getByText("scheduled")).toBeInTheDocument();
  });
});
