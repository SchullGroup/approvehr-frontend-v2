import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import {
  CancelInterviewDialog,
  RescheduleInterviewDialog,
  ScheduleInterviewDialog,
} from "@/components/hiring/interviews/interview-dialogs";
import { ApiError } from "@/lib/api/client";
import type { EmailReadiness } from "@/lib/hiring/comms/model";
import type {
  CancelInput,
  ChangeInput,
  ChangeResult,
  InterviewNotice,
  InterviewView,
  ScheduleInput,
} from "@/lib/hiring/interviews/model";

/**
 * Booking, changing and cancelling an interview, as a person meets it.
 *
 * What these hold: the time is on the company's clock and says so; the choice to send
 * is made by a person and is **Don't send** until they make it; the dialog says what the
 * API says about each message and never more; and a refusal lands under the box it is
 * about with what was typed kept.
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

const EXPLAINER = {
  candidate: "They get the day, the time, the link and a calendar file.",
  panelist:
    "Each panelist gets the same with the candidate's name. Never a score.",
};

const NOW = "2026-10-10T09:00:00.000Z";

const notice = (over: Partial<InterviewNotice> = {}): InterviewNotice => ({
  id: "n1",
  kind: "INVITE",
  audience: "CANDIDATE",
  recipient: "Chioma Aduba",
  status: "PENDING",
  note: null,
  at: null,
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
  joinUrl: null,
  timeZone: "Africa/Lagos",
  stageName: "Interview",
  panelists: [],
  sequence: 0,
  notices: [],
  cancelReason: null,
  ...over,
});

const getFile = vi.fn();

const result = (
  notices: InterviewNotice[],
  asked: boolean,
  over: Partial<InterviewView> = {},
): ChangeResult => ({
  interview: view(over),
  outcome: { asked, notices },
});

const dialogOf = (name: string) => screen.findByRole("dialog", { name });

const fill = (dialog: HTMLElement, day: string, time: string) => {
  fireEvent.change(
    dialog.querySelector("input[type=date]") as HTMLInputElement,
    {
      target: { value: day },
    },
  );
  fireEvent.change(
    dialog.querySelector("input[type=time]") as HTMLInputElement,
    {
      target: { value: time },
    },
  );
};

/* ================================================================ scheduling */

function renderSchedule(
  over: Partial<React.ComponentProps<typeof ScheduleInterviewDialog>> = {},
) {
  const onConfirm = vi.fn<(input: ScheduleInput) => Promise<ChangeResult>>(
    async () => result([notice({ status: "NOT_ASKED" })], false),
  );
  render(
    <ToastProvider>
      <ScheduleInterviewDialog
        open
        onClose={() => undefined}
        onConfirm={onConfirm}
        getFile={getFile}
        candidateName="Chioma Aduba"
        timeZone="Africa/Lagos"
        now={NOW}
        stagePanel={[{ id: "e:p1", name: "Chidi Nwosu" }]}
        people={[]}
        peopleLoading={false}
        panelSupported
        readiness={READY}
        explainer={EXPLAINER}
        {...over}
      />
    </ToastProvider>,
  );
  return onConfirm;
}

describe("scheduling: the time", () => {
  it("names the company's clock beside the time, before and after one is chosen", async () => {
    renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    expect(dialog).toHaveTextContent("Lagos time (WAT)");
    fill(dialog, "2026-10-20", "10:00");
    expect(dialog).toHaveTextContent("10:00 · Lagos time (WAT)");
  });

  it("says what the candidate will see once there is a day and a time", async () => {
    renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    expect(dialog).not.toHaveTextContent("The candidate will see");
    fill(dialog, "2026-10-20", "10:00");
    expect(dialog).toHaveTextContent(
      "The candidate will see: Tuesday 20 October 2026 at 10:00, Lagos time (WAT), for 60 minutes.",
    );
  });

  it("makes the instant from the company's clock, not the browser's", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule({ timeZone: "Pacific/Auckland" });
    const dialog = await dialogOf("Schedule an interview");
    fill(dialog, "2026-10-20", "10:00");
    expect(dialog).toHaveTextContent("Auckland time");
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    /* 10:00 in Auckland (UTC+13 in October) is 21:00 UTC the day before. */
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledFor: "2026-10-19T21:00:00.000Z" }),
    );
  });

  it("books Lagos time as UTC+1", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    fill(dialog, "2026-10-20", "10:00");
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledFor: "2026-10-20T09:00:00.000Z",
        timeZone: "Africa/Lagos",
      }),
    );
  });

  it("asks for a day and a time before it books anything", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    expect(dialog).toHaveTextContent("Choose a day.");
    expect(dialog).toHaveTextContent("Choose a time.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("refuses a length that is not a real one", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    fill(dialog, "2026-10-20", "10:00");
    const length = within(dialog).getByLabelText("Duration (minutes)");
    await user.clear(length);
    await user.type(length, "2");
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    expect(dialog).toHaveTextContent("An interview is 5 to 480 minutes.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("stacks the date and the time on a phone, with the shared control", async () => {
    renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    const date = dialog.querySelector("input[type=date]") as HTMLElement;
    const row = date.closest(".grid") as HTMLElement;
    expect(row.className).toContain("grid-cols-1");
    expect(row.className).toContain("sm:grid-cols-2");
    expect(row.className).toContain("[&>*]:min-w-0");
    expect(date.className).toContain("min-w-0");
  });
});

describe("scheduling: the join link", () => {
  it("shows the hint before anything is typed", async () => {
    renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    expect(dialog).toHaveTextContent("Paste a Google Meet / Zoom / Teams link");
  });

  it("refuses a link that is not https, inline, and books nothing", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    fill(dialog, "2026-10-20", "10:00");
    await user.type(
      within(dialog).getByLabelText(/Join link/),
      "http://meet.google.com/abc",
    );
    /* Moving to the next box is what shows the problem, before Schedule is pressed. */
    await user.click(within(dialog).getByLabelText(/Location/));
    expect(dialog).toHaveTextContent("Use a link that starts with https://");
    expect(dialog).not.toHaveTextContent(
      "Paste a Google Meet / Zoom / Teams link",
    );
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("recognises the call it looks like", async () => {
    const user = userEvent.setup();
    renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    await user.type(
      within(dialog).getByLabelText(/Join link/),
      "https://zoom.us/j/84012345678",
    );
    expect(dialog).toHaveTextContent("This looks like a Zoom link.");
  });

  it("sends a good link as it was pasted, trimmed, and nothing when there is none", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    fill(dialog, "2026-10-20", "10:00");
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      joinUrl: null,
      location: null,
    });
  });

  it("sends the link and the place when they were given", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    fill(dialog, "2026-10-20", "10:00");
    await user.type(
      within(dialog).getByLabelText(/Join link/),
      "  https://meet.google.com/abc-defg-hij ",
    );
    await user.type(within(dialog).getByLabelText(/Location/), "Boardroom");
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      joinUrl: "https://meet.google.com/abc-defg-hij",
      location: "Boardroom",
    });
  });
});

describe("scheduling: asking before anything is sent", () => {
  const radio = (dialog: HTMLElement, name: RegExp) =>
    within(dialog).getByRole("radio", { name });

  it("starts on Don't send, and books without sending", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    expect(radio(dialog, /^Don't send/)).toBeChecked();
    expect(
      radio(dialog, /^Send the invitation with a calendar file/),
    ).not.toBeChecked();
    fill(dialog, "2026-10-20", "10:00");
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ sendInvite: false });
  });

  it("sends only when the person chose to", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    await user.click(
      radio(dialog, /^Send the invitation with a calendar file/),
    );
    fill(dialog, "2026-10-20", "10:00");
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ sendInvite: true });
  });

  it("says, in the API's words, what goes to the candidate and what goes to each panelist", async () => {
    renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    expect(dialog).toHaveTextContent(
      "The candidate: They get the day, the time, the link and a calendar file.",
    );
    expect(dialog).toHaveTextContent(
      "Each panelist: Each panelist gets the same with the candidate's name. Never a score.",
    );
  });

  it("makes no promise about what goes where when the API did not say", async () => {
    renderSchedule({ explainer: null });
    const dialog = await dialogOf("Schedule an interview");
    expect(dialog).not.toHaveTextContent("The candidate:");
    expect(dialog).not.toHaveTextContent("Each panelist:");
  });

  it("says who it is from and where replies go", async () => {
    renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    expect(dialog).toHaveTextContent(
      "From: Schull Technologies via ApproveHR. Replies go to people@schull.io.",
    );
    expect(dialog).not.toHaveTextContent("Without one, nothing is sent");
  });

  it("warns, as the email editor does, when there is no reply-to address", async () => {
    renderSchedule({
      readiness: {
        ...READY,
        willSend: false,
        blockedBy: [
          "Add a reply-to address: replies from candidates have to go somewhere.",
        ],
        sender: { ...READY.sender!, replyTo: null },
      },
    });
    const dialog = await dialogOf("Schedule an interview");
    expect(dialog).toHaveTextContent(
      "From: Schull Technologies via ApproveHR. There is no reply-to address yet.",
    );
    expect(dialog).toHaveTextContent(
      "Without one, nothing is sent: an email whose replies go nowhere is not sent.",
    );
    const link = within(dialog).getByRole("link", {
      name: "Add it in Careers settings",
    });
    expect(link).toHaveAttribute("href", "/hiring/postings/settings");
  });

  it("lists what would stop it going, only once sending is chosen", async () => {
    const user = userEvent.setup();
    renderSchedule({
      readiness: {
        ...READY,
        willSend: false,
        blockedBy: ["Emails to candidates are switched off for your company."],
      },
    });
    const dialog = await dialogOf("Schedule an interview");
    expect(dialog).not.toHaveTextContent("It would not be sent right now");
    await user.click(radio(dialog, /^Send the invitation/));
    expect(dialog).toHaveTextContent("It would not be sent right now");
    expect(dialog).toHaveTextContent(
      "Emails to candidates are switched off for your company.",
    );
  });

  it("refuses an invitation for a time that has passed, and says how to get past it", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule();
    const dialog = await dialogOf("Schedule an interview");
    await user.click(radio(dialog, /^Send the invitation/));
    fill(dialog, "2026-10-01", "10:00");
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    expect(dialog).toHaveTextContent(
      /That time has passed, so an invitation for it would be no use/,
    );
    expect(dialog).toHaveTextContent("choose Don't send");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("offers no choice about mail at all when this server does not send any", async () => {
    renderSchedule({ readiness: null, panelSupported: false });
    const dialog = await dialogOf("Schedule an interview");
    expect(within(dialog).queryByRole("radio")).toBeNull();
    expect(dialog).not.toHaveTextContent("Who scores it");
  });

  it("says who is invited to score it, and sends the whole set when it was chosen", async () => {
    const user = userEvent.setup();
    const onConfirm = renderSchedule({
      people: [
        { id: "e:p1", name: "Chidi Nwosu" },
        { id: "u:acct", name: "Kemi Outsider" },
      ],
    });
    const dialog = await dialogOf("Schedule an interview");
    expect(dialog).toHaveTextContent(
      "The stage's panel is invited: Chidi Nwosu.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Choose who is invited" }),
    );
    await user.click(
      within(dialog).getByRole("combobox", {
        name: /Add somebody: Invited to score this interview/,
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: /Kemi Outsider/ }),
    );
    fill(dialog, "2026-10-20", "10:00");
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      panel: { employeeIds: ["p1"], userIds: ["acct"] },
    });
  });
});

describe("scheduling: what the API said afterwards", () => {
  async function book(outcome: ChangeResult, send = true) {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => outcome);
    renderSchedule({ onConfirm });
    const dialog = await dialogOf("Schedule an interview");
    if (send)
      await user.click(
        within(dialog).getByRole("radio", { name: /^Send the invitation/ }),
      );
    fill(dialog, "2026-10-20", "10:00");
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    return screen.findByRole("dialog", { name: "Interview booked" });
  }

  it("says queued is not sent", async () => {
    const done = await book(
      result(
        [
          notice({ status: "PENDING" }),
          notice({
            id: "p",
            audience: "PANELIST",
            recipient: "Chidi Nwosu",
            status: "PENDING",
          }),
        ],
        true,
      ),
    );
    expect(done).toHaveTextContent(
      "The messages are queued. Queued is not sent",
    );
    expect(done).toHaveTextContent("Chioma Aduba: queued.");
    expect(done).toHaveTextContent("Chidi Nwosu: queued.");
    expect(done).not.toHaveTextContent("were sent");
  });

  it("says skipped, with the API's reason, and that nothing went", async () => {
    const done = await book(
      result(
        [
          notice({
            status: "SKIPPED",
            note: "not sent: no reply-to address is set for this company (Careers settings). We do not send an email whose replies would go nowhere",
          }),
        ],
        true,
      ),
    );
    expect(done).toHaveTextContent(
      "At least one message was skipped, so it was not sent.",
    );
    expect(done).toHaveTextContent(
      "Chioma Aduba: skipped. No reply-to address is set for this company",
    );
  });

  it("says not asked when the person chose not to send", async () => {
    const done = await book(
      result(
        [
          notice({ status: "NOT_ASKED" }),
          notice({
            id: "p",
            audience: "PANELIST",
            recipient: "Chidi Nwosu",
            status: "NOT_ASKED",
          }),
        ],
        false,
      ),
      false,
    );
    expect(done).toHaveTextContent("Interview booked. Nothing was emailed.");
    expect(done).toHaveTextContent("Chioma Aduba: not asked.");
  });

  it("says sent only when the API says sent", async () => {
    const done = await book(
      result([notice({ status: "SENT", at: "2026-10-10T09:01:00Z" })], true),
    );
    expect(done).toHaveTextContent("The messages were sent.");
  });

  it("offers the calendar for what was just booked", async () => {
    const done = await book(
      result([notice({ status: "NOT_ASKED" })], false),
      false,
    );
    expect(
      within(done).getByRole("button", { name: /Add to calendar/ }),
    ).toBeInTheDocument();
  });
});

describe("scheduling: a refusal", () => {
  async function refused(error: ApiError) {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => {
      throw error;
    });
    renderSchedule({ onConfirm });
    const dialog = await dialogOf("Schedule an interview");
    fill(dialog, "2026-10-20", "10:00");
    await user.type(within(dialog).getByLabelText(/Location/), "Boardroom");
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    return dialog;
  }

  it("lands under the box it names, with everything typed still there", async () => {
    const dialog = await refused(
      new ApiError(400, "validation_failed", "Some fields are not valid.", [
        { field: "joinUrl", message: "That link is not one we can send." },
      ]),
    );
    await waitFor(() =>
      expect(dialog).toHaveTextContent("That link is not one we can send."),
    );
    expect(dialog).not.toHaveTextContent("The interview was not booked");
    expect(within(dialog).getByLabelText(/Location/)).toHaveValue("Boardroom");
    expect(dialog.querySelector("input[type=date]")).toHaveValue("2026-10-20");
  });

  it("says an unplaced refusal once, at the top, as the API wrote it", async () => {
    const dialog = await refused(
      new ApiError(
        422,
        "unprocessable",
        "This role is on hold, so nobody can be interviewed for it.",
      ),
    );
    expect(
      await within(dialog).findByText(
        "This role is on hold, so nobody can be interviewed for it.",
      ),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent("The interview was not booked");
    expect(within(dialog).queryByText("Interview booked")).toBeNull();
  });
});

/* ================================================================ rescheduling */

function renderReschedule(
  interview: InterviewView,
  over: Partial<React.ComponentProps<typeof RescheduleInterviewDialog>> = {},
) {
  const onConfirm = vi.fn<(input: ChangeInput) => Promise<ChangeResult>>(
    async () =>
      result([notice({ kind: "UPDATE", status: "NOT_ASKED" })], false),
  );
  render(
    <ToastProvider>
      <RescheduleInterviewDialog
        open
        interview={interview}
        onClose={() => undefined}
        onConfirm={onConfirm}
        getFile={getFile}
        timeZone="Africa/Lagos"
        now={NOW}
        readiness={READY}
        explainer={EXPLAINER}
        {...over}
      />
    </ToastProvider>,
  );
  return onConfirm;
}

describe("rescheduling", () => {
  it("starts from what is booked, on the company's clock, and changes nothing until something is changed", async () => {
    renderReschedule(
      view({
        location: "Boardroom",
        joinUrl: "https://meet.google.com/abc-defg-hij",
      }),
    );
    const dialog = await dialogOf("Reschedule this interview");
    expect(dialog.querySelector("input[type=date]")).toHaveValue("2026-10-20");
    expect(dialog.querySelector("input[type=time]")).toHaveValue("10:00");
    expect(dialog).toHaveTextContent("10:00 · Lagos time (WAT)");
    expect(dialog).toHaveTextContent(
      "Nothing here differs from what is already booked.",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    /* Nothing changed, so there is nothing to tell anybody. */
    expect(within(dialog).queryByRole("radio")).toBeNull();
  });

  it("shows what changed and only then asks whether to send an updated invitation", async () => {
    renderReschedule(view());
    const dialog = await dialogOf("Reschedule this interview");
    fireEvent.change(
      dialog.querySelector("input[type=time]") as HTMLInputElement,
      {
        target: { value: "11:30" },
      },
    );
    expect(dialog).toHaveTextContent("What changes");
    expect(dialog).toHaveTextContent(
      /Time: Tue 20 Oct, 10:00 to Tue 20 Oct, 11:30/,
    );
    expect(dialog).toHaveTextContent("Times are on Lagos time (WAT).");
    expect(
      within(dialog).getByRole("radio", { name: /^Don't send/ }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole("radio", {
        name: /^Send an updated invitation/,
      }),
    ).not.toBeChecked();
  });

  it("sends only the fields that changed, and says outright not to send an update", async () => {
    const user = userEvent.setup();
    const onConfirm = renderReschedule(view({ location: "Boardroom" }));
    const dialog = await dialogOf("Reschedule this interview");
    fireEvent.change(
      dialog.querySelector("input[type=time]") as HTMLInputElement,
      {
        target: { value: "11:30" },
      },
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledWith({
      scheduledFor: "2026-10-20T10:30:00.000Z",
      sendUpdate: false,
    });
  });

  it("sends an update only when the person chose it", async () => {
    const user = userEvent.setup();
    const onConfirm = renderReschedule(view());
    const dialog = await dialogOf("Reschedule this interview");
    fireEvent.change(
      dialog.querySelector("input[type=time]") as HTMLInputElement,
      {
        target: { value: "11:30" },
      },
    );
    await user.click(
      within(dialog).getByRole("radio", {
        name: /^Send an updated invitation/,
      }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ sendUpdate: true });
  });

  it("clears a link and a place with null, not by leaving them out", async () => {
    const user = userEvent.setup();
    const onConfirm = renderReschedule(
      view({ location: "Boardroom", joinUrl: "https://zoom.us/j/1" }),
    );
    const dialog = await dialogOf("Reschedule this interview");
    await user.clear(within(dialog).getByLabelText(/Join link/));
    await user.clear(within(dialog).getByLabelText(/Location/));
    expect(dialog).toHaveTextContent("Join link: removed");
    expect(dialog).toHaveTextContent("Place: removed");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledWith({
      location: null,
      joinUrl: null,
      sendUpdate: false,
    });
  });

  it("refuses a link that is not https here too", async () => {
    const user = userEvent.setup();
    const onConfirm = renderReschedule(view());
    const dialog = await dialogOf("Reschedule this interview");
    await user.type(
      within(dialog).getByLabelText(/Join link/),
      "http://zoom.us/j/1",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(dialog).toHaveTextContent("Use a link that starts with https://");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("says when what would be sent is the invitation itself, not a change", async () => {
    const user = userEvent.setup();
    renderReschedule(view({ notices: [notice({ status: "NOT_ASKED" })] }));
    const dialog = await dialogOf("Reschedule this interview");
    fireEvent.change(
      dialog.querySelector("input[type=time]") as HTMLInputElement,
      {
        target: { value: "11:30" },
      },
    );
    await user.click(
      within(dialog).getByRole("radio", {
        name: /^Send an updated invitation/,
      }),
    );
    expect(dialog).toHaveTextContent(
      "They have not been sent an invitation for this interview, so what would be sent is the invitation itself, not a change.",
    );
  });

  it("does not say that when the candidate already has the invitation", async () => {
    const user = userEvent.setup();
    renderReschedule(view({ notices: [notice({ status: "SENT" })] }));
    const dialog = await dialogOf("Reschedule this interview");
    fireEvent.change(
      dialog.querySelector("input[type=time]") as HTMLInputElement,
      {
        target: { value: "11:30" },
      },
    );
    await user.click(
      within(dialog).getByRole("radio", {
        name: /^Send an updated invitation/,
      }),
    );
    expect(dialog).not.toHaveTextContent("not a change");
  });

  it("says what the API said about each recipient afterwards", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () =>
      result(
        [
          notice({
            kind: "UPDATE",
            status: "SKIPPED",
            note: "not sent: mail not configured",
          }),
          notice({
            id: "p",
            kind: "UPDATE",
            audience: "PANELIST",
            recipient: "Chidi Nwosu",
            status: "PENDING",
          }),
        ],
        true,
      ),
    );
    renderReschedule(view(), { onConfirm });
    const dialog = await dialogOf("Reschedule this interview");
    fireEvent.change(
      dialog.querySelector("input[type=time]") as HTMLInputElement,
      {
        target: { value: "11:30" },
      },
    );
    await user.click(
      within(dialog).getByRole("radio", {
        name: /^Send an updated invitation/,
      }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    const done = await screen.findByRole("dialog", {
      name: "Interview updated",
    });
    expect(done).toHaveTextContent(
      "Chioma Aduba: skipped. Mail not configured.",
    );
    expect(done).toHaveTextContent("Chidi Nwosu: queued.");
    expect(done).not.toHaveTextContent("were sent");
  });

  it("keeps what was typed and shows the API's sentence when it refuses", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => {
      throw new ApiError(
        409,
        "conflict",
        "Another interview is already booked at that time.",
      );
    });
    renderReschedule(view(), { onConfirm });
    const dialog = await dialogOf("Reschedule this interview");
    fireEvent.change(
      dialog.querySelector("input[type=time]") as HTMLInputElement,
      {
        target: { value: "11:30" },
      },
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText(
        "Another interview is already booked at that time.",
      ),
    ).toBeInTheDocument();
    expect(dialog.querySelector("input[type=time]")).toHaveValue("11:30");
  });
});

/* ================================================================== cancelling */

function renderCancel(
  interview: InterviewView,
  over: Partial<React.ComponentProps<typeof CancelInterviewDialog>> = {},
) {
  const onConfirm = vi.fn<(input: CancelInput) => Promise<ChangeResult>>(
    async () =>
      result([notice({ kind: "CANCEL", status: "NOT_ASKED" })], false, {
        status: "CANCELLED",
      }),
  );
  render(
    <ToastProvider>
      <CancelInterviewDialog
        open
        interview={interview}
        onClose={() => undefined}
        onConfirm={onConfirm}
        getFile={getFile}
        timeZone="Africa/Lagos"
        readiness={READY}
        explainer={EXPLAINER}
        askReason
        {...over}
      />
    </ToastProvider>,
  );
  return onConfirm;
}

describe("cancelling", () => {
  it("asks for a reason only where the server keeps it, and not at all where it would be thrown away", async () => {
    renderCancel(view(), { askReason: false });
    const dialog = await dialogOf("Cancel this interview?");
    expect(within(dialog).queryByLabelText(/Reason/)).toBeNull();
    expect(
      within(dialog).getByRole("radio", { name: /^Don't send/ }),
    ).toBeChecked();
  });

  it("names the interview, takes an optional reason and defaults to Don't send", async () => {
    const user = userEvent.setup();
    const onConfirm = renderCancel(view());
    const dialog = await dialogOf("Cancel this interview?");
    expect(dialog).toHaveTextContent(
      "Technical with Chioma Aduba, Tue 20 Oct, 10:00",
    );
    expect(
      within(dialog).getByRole("radio", { name: /^Don't send/ }),
    ).toBeChecked();
    await user.click(
      within(dialog).getByRole("button", { name: "Cancel the interview" }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledWith({
      reason: null,
      sendCancellation: false,
    });
  });

  it("sends the reason, trimmed, and a cancellation only when chosen", async () => {
    const user = userEvent.setup();
    const onConfirm = renderCancel(view());
    const dialog = await dialogOf("Cancel this interview?");
    await user.type(within(dialog).getByLabelText(/Reason/), "  Role on hold ");
    await user.click(
      within(dialog).getByRole("radio", { name: /^Send a cancellation/ }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Cancel the interview" }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledWith({
      reason: "Role on hold",
      sendCancellation: true,
    });
  });

  it("says what the API said about each message, and offers no calendar for a cancelled interview", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () =>
      result(
        [
          notice({ kind: "CANCEL", status: "PENDING" }),
          notice({
            id: "p",
            kind: "CANCEL",
            audience: "PANELIST",
            recipient: "Chidi Nwosu",
            status: "SKIPPED",
            note: "not sent: x",
          }),
        ],
        true,
        { status: "CANCELLED" },
      ),
    );
    renderCancel(view(), { onConfirm });
    const dialog = await dialogOf("Cancel this interview?");
    await user.click(
      within(dialog).getByRole("radio", { name: /^Send a cancellation/ }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Cancel the interview" }),
    );
    const done = await screen.findByRole("dialog", {
      name: "Interview cancelled",
    });
    expect(done).toHaveTextContent("Chioma Aduba: queued.");
    expect(done).toHaveTextContent("Chidi Nwosu: skipped. X.");
    expect(
      within(done).queryByRole("button", { name: /Add to calendar/ }),
    ).toBeNull();
  });

  it("keeps the reason and shows the API's sentence when it refuses", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => {
      throw new ApiError(
        409,
        "conflict",
        "That interview has already taken place.",
      );
    });
    renderCancel(view(), { onConfirm });
    const dialog = await dialogOf("Cancel this interview?");
    await user.type(
      within(dialog).getByLabelText(/Reason/),
      "Booked by mistake",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Cancel the interview" }),
    );
    expect(
      await within(dialog).findByText(
        "That interview has already taken place.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Reason/)).toHaveValue(
      "Booked by mistake",
    );
  });
});
