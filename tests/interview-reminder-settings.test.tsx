import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  defaultReminderSettings,
  settingsViewOf,
} from "@/lib/hiring/interviews/demo-reminders";
import type { InterviewsGateway } from "@/lib/hiring/interviews/gateway";
import type {
  ReminderSettings,
  ReminderSettingsView,
} from "@/lib/hiring/interviews/reminders";

/**
 * The company's reminder choices.
 *
 * What these hold: each reminder says in one plain line the one condition that applies to
 * all of them; the times are held to the limits the server gave, under their own box and
 * before anything is sent; the pair of reminders and the pair of nudges are held in their
 * order; a refusal from the server lands under the same box with what was typed kept; and
 * what has gone against the daily limit is said where the server says it.
 */

const gateway = vi.hoisted(() => ({ current: null as unknown, mode: "demo" }));

vi.mock("@/lib/hiring/interviews/use-interviews", () => ({
  useInterviewsGateway: () => gateway.current,
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/hiring/settings/interviews",
  useSearchParams: () => new URLSearchParams(),
}));

const { InterviewRemindersScreen } =
  await import("@/app/(app)/hiring/settings/interviews/reminders-screen");

const viewOf = (
  over: Partial<ReminderSettingsView> = {},
): ReminderSettingsView => ({
  ...settingsViewOf(defaultReminderSettings()),
  willSend: true,
  ...over,
});

const fake = (
  view: ReminderSettingsView | null,
  over: Partial<InterviewsGateway> = {},
  mode: "api" | "demo" = "api",
): InterviewsGateway => ({
  mode,
  storesCancelReason: false,
  now: () => "2026-10-10T09:00:00.000Z",
  explainer: async () => null,
  reminderSettings: async () => view,
  saveReminderSettings: vi.fn(async (values: ReminderSettings) =>
    viewOf({ values }),
  ),
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

const open = async (
  view: ReminderSettingsView | null = viewOf(),
  over: Partial<InterviewsGateway> = {},
  mode: "api" | "demo" = "api",
) => {
  gateway.current = fake(view, over, mode);
  render(
    <ToastProvider>
      <InterviewRemindersScreen />
    </ToastProvider>,
  );
  await screen.findByText("Reminders to the candidate");
  return gateway.current as InterviewsGateway;
};

/** The four "how long before" boxes in page order: candidate early and late, panel early and late. */
const before = (nth: number) =>
  screen.getAllByRole("textbox", { name: "How long before" })[
    nth
  ] as HTMLInputElement;
const unit = (nth: number) =>
  screen.getAllByRole("combobox", { name: "Unit" })[nth] as HTMLSelectElement;
const nudge = (which: "First" | "Second") =>
  screen.getByRole("textbox", {
    name: new RegExp(`${which} nudge, hours after the interview ends`),
  }) as HTMLInputElement;
const save = () => screen.getByRole("button", { name: "Save reminders" });
const savedWith = (g: InterviewsGateway) =>
  (g.saveReminderSettings as ReturnType<typeof vi.fn>).mock
    .calls[0]?.[0] as ReminderSettings;

beforeEach(() => {
  gateway.current = null;
});

describe("the page", () => {
  it("has a card for the candidate, one for the panel and one for the nudges, each with the one plain line", async () => {
    await open();
    for (const title of [
      "Reminders to the candidate",
      "Reminders to the panel",
      "Scorecard nudges",
    ])
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(
      screen.getAllByRole("switch", { name: "Earlier reminder" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("switch", { name: "Later reminder" }),
    ).toHaveLength(2);
    /* Four reminders and the nudge: every one says it only follows a sent invitation. */
    expect(
      screen.getAllByText(
        /Only sent for interviews where you chose to send the invitation\./,
      ),
    ).toHaveLength(5);
  });

  it("says nothing here sends anything by itself, and mentions the audit log only where there is one", async () => {
    await open(undefined, {}, "api");
    expect(
      screen.getByText(/nothing here sends anything by itself/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Changes are written to the audit log\./),
    ).toBeInTheDocument();
  });

  it("does not claim an audit log in a practice workspace, and says nothing is sent from it", async () => {
    await open(undefined, {}, "demo");
    expect(screen.queryByText(/audit log/)).toBeNull();
    expect(
      screen.getByText(/practice workspace: nothing is sent/i),
    ).toBeInTheDocument();
  });

  it("says once what a change reaches: planned reminders keep their times", async () => {
    await open();
    expect(
      screen.getByText(/Reminders already planned keep their times/),
    ).toBeInTheDocument();
  });

  it("shows the times as the company has them, in the unit they read best in, with the limits the server gave", async () => {
    await open();
    expect([0, 1, 2, 3].map((n) => before(n).value)).toEqual([
      "24",
      "1",
      "24",
      "1",
    ]);
    expect([0, 1, 2, 3].map((n) => unit(n).value)).toEqual([
      "hours",
      "hours",
      "hours",
      "hours",
    ]);
    expect(
      screen.getAllByText("From 2 hours to 3 days before the interview."),
    ).toHaveLength(2);
    expect(
      screen.getAllByText("From 15 minutes to 6 hours before the interview."),
    ).toHaveLength(2);
    expect(nudge("First")).toHaveValue("24");
    expect(nudge("Second")).toHaveValue("72");
    expect(screen.getByText(/From 1 hour to 2 days\./)).toBeInTheDocument();
  });

  it("shows the switches as they are: the panel's earlier reminder is off until it is switched on", async () => {
    await open();
    const earlier = screen.getAllByRole("switch", { name: "Earlier reminder" });
    expect(earlier[0]).toBeChecked();
    expect(earlier[1]).not.toBeChecked();
  });

  it("shows a day count in days and a part of an hour in minutes", async () => {
    const values = defaultReminderSettings();
    values.candidate.early.minutesBefore = 2_880;
    values.candidate.late.minutesBefore = 45;
    await open(viewOf({ values }));
    expect(before(0)).toHaveValue("2");
    expect(unit(0)).toHaveValue("days");
    expect(before(1)).toHaveValue("45");
    expect(unit(1)).toHaveValue("minutes");
  });

  it("says plainly when this server keeps no reminder settings", async () => {
    gateway.current = fake(null);
    render(
      <ToastProvider>
        <InterviewRemindersScreen />
      </ToastProvider>,
    );
    expect(
      await screen.findByText(
        /This server does not keep reminder settings yet/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save reminders" })).toBeNull();
  });

  it("warns, with the server's reasons, when no reminder would be sent right now", async () => {
    await open(
      viewOf({
        willSend: false,
        blockedBy: ["No reply-to address is set in Careers settings."],
      }),
    );
    expect(
      screen.getByText("No reminder would be sent right now"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No reply-to address is set in Careers settings."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/recorded as skipped, with the reason/),
    ).toBeInTheDocument();
  });

  it("says nothing of the sort when mail would go, or when the server does not say", async () => {
    await open(viewOf({ willSend: true }));
    expect(
      screen.queryByText("No reminder would be sent right now"),
    ).toBeNull();
  });

  it("says what has gone against the day's limit, and what is held back, where the server says", async () => {
    await open(
      viewOf({
        usage: {
          sentLast24Hours: 24,
          dailyLimit: 2_000,
          waiting: 4,
          dueNow: 2,
          remindersPlanned: 3,
        },
      }),
    );
    expect(
      screen.getByText(
        /24 of 2,000 emails to candidates and panelists were sent/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/4 waiting to go, 3 of them reminders planned/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/2 are due now and held back, by the daily limit/),
    ).toBeInTheDocument();
  });

  it("says nothing of a limit the server does not report", async () => {
    await open(viewOf({ usage: null }));
    expect(screen.queryByText("Sending today")).toBeNull();
  });
});

describe("changing them", () => {
  it("does nothing until something changes: the buttons are off and nothing says unsaved", async () => {
    await open();
    expect(save()).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Discard changes" }),
    ).toBeDisabled();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("saves what was typed as whole minutes, with each switch as it was left", async () => {
    const user = userEvent.setup();
    const g = await open();
    fireEvent.change(before(0), { target: { value: "2" } });
    await user.selectOptions(unit(0), "days");
    fireEvent.change(before(1), { target: { value: "30" } });
    await user.selectOptions(unit(1), "minutes");
    await user.click(
      screen.getAllByRole("switch", { name: "Earlier reminder" })[1]!,
    );
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await user.click(save());
    await waitFor(() => expect(g.saveReminderSettings).toHaveBeenCalled());
    expect(savedWith(g)).toEqual({
      candidate: {
        early: { enabled: true, minutesBefore: 2_880 },
        late: { enabled: true, minutesBefore: 30 },
      },
      panelist: {
        early: { enabled: true, minutesBefore: 1_440 },
        late: { enabled: true, minutesBefore: 60 },
      },
      scorecardNudge: {
        enabled: true,
        firstAfterHours: 24,
        secondAfterHours: 72,
      },
    });
    expect(
      await screen.findByText("Interview reminders saved"),
    ).toBeInTheDocument();
  });

  it("saves no second nudge when its switch is off, and hides its box", async () => {
    const user = userEvent.setup();
    const g = await open();
    await user.click(screen.getByRole("switch", { name: "A second nudge" }));
    expect(screen.queryByRole("textbox", { name: /Second nudge/ })).toBeNull();
    await user.click(save());
    await waitFor(() => expect(g.saveReminderSettings).toHaveBeenCalled());
    expect(savedWith(g).scorecardNudge.secondAfterHours).toBeNull();
  });

  it("holds each box to the limits the server gave, under that box, before asking", async () => {
    const user = userEvent.setup();
    const g = await open();
    fireEvent.change(before(0), { target: { value: "1" } });
    fireEvent.change(before(1), { target: { value: "7" } });
    fireEvent.change(nudge("First"), { target: { value: "49" } });
    await user.click(save());
    expect(
      screen.getByText(
        "The earlier reminder goes at least 2 hours before the interview.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The later reminder goes at most 6 hours before the interview.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The first nudge goes at most 2 days after the interview ends.",
      ),
    ).toBeInTheDocument();
    expect(g.saveReminderSettings).not.toHaveBeenCalled();
  });

  it("holds the pair in order: the earlier reminder has to be longer before than the later one", async () => {
    const user = userEvent.setup();
    const g = await open();
    fireEvent.change(before(2), { target: { value: "2" } });
    fireEvent.change(before(3), { target: { value: "3" } });
    await user.click(save());
    expect(
      screen.getByText(
        "The earlier reminder has to go longer before the interview than the later one.",
      ),
    ).toBeInTheDocument();
    expect(g.saveReminderSettings).not.toHaveBeenCalled();
  });

  it("holds the second nudge after the first", async () => {
    const user = userEvent.setup();
    const g = await open();
    fireEvent.change(nudge("Second"), { target: { value: "12" } });
    await user.click(save());
    expect(
      screen.getByText("The second nudge has to come after the first."),
    ).toBeInTheDocument();
    expect(g.saveReminderSettings).not.toHaveBeenCalled();
  });

  it("refuses a box that is empty or not a number", async () => {
    const user = userEvent.setup();
    const g = await open();
    fireEvent.change(before(0), { target: { value: "" } });
    fireEvent.change(nudge("First"), { target: { value: "soon" } });
    await user.click(save());
    expect(screen.getByText("Enter how long before.")).toBeInTheDocument();
    expect(screen.getByText("Hours are a whole number.")).toBeInTheDocument();
    expect(g.saveReminderSettings).not.toHaveBeenCalled();
  });

  it("puts the server's refusal under the box it names, and keeps what was typed", async () => {
    const user = userEvent.setup();
    const g = await open(undefined, {
      saveReminderSettings: vi.fn(async () => {
        throw new ApiError(
          400,
          "validation_failed",
          "Some fields are not valid.",
          [
            {
              field: "interviewReminders.candidate.late.minutesBefore",
              message:
                "The earlier reminder has to go longer before the interview than the later one.",
            },
          ],
        );
      }),
    });
    fireEvent.change(before(1), { target: { value: "30" } });
    await user.selectOptions(unit(1), "minutes");
    await user.click(save());
    expect(
      await screen.findByText(
        "The earlier reminder has to go longer before the interview than the later one.",
      ),
    ).toBeInTheDocument();
    expect(before(1)).toHaveValue("30");
    expect(screen.queryByText("The reminders were not saved")).toBeNull();
    expect(g.saveReminderSettings).toHaveBeenCalledTimes(1);
  });

  it("says a refusal that names no box once, at the top, as the API wrote it", async () => {
    const user = userEvent.setup();
    await open(undefined, {
      saveReminderSettings: vi.fn(async () => {
        throw new ApiError(
          403,
          "forbidden",
          "You need the following to do that: Settings.",
        );
      }),
    });
    fireEvent.change(before(0), { target: { value: "30" } });
    await user.click(save());
    expect(
      await screen.findByText("You need the following to do that: Settings."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The reminders were not saved"),
    ).toBeInTheDocument();
  });

  it("discards what was typed", async () => {
    const user = userEvent.setup();
    await open();
    fireEvent.change(before(0), { target: { value: "72" } });
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(before(0)).toHaveValue("24");
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("goes back to the standard times in one press, when the company's are not them", async () => {
    const user = userEvent.setup();
    const values = defaultReminderSettings();
    values.candidate.early.minutesBefore = 2_880;
    await open(viewOf({ values }));
    await user.click(
      screen.getByRole("button", { name: "Use the standard times" }),
    );
    expect(before(0)).toHaveValue("24");
    expect(unit(0)).toHaveValue("hours");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it("does not offer the standard times when the company is already on them", async () => {
    await open();
    expect(
      screen.queryByRole("button", { name: "Use the standard times" }),
    ).toBeNull();
  });

  it("is wrapped in the same settings frame as the others, with its own tab", async () => {
    await open();
    const tab = screen.getByRole("link", { name: "Interview reminders" });
    expect(tab).toHaveAttribute("href", "/hiring/settings/interviews");
    expect(tab).toHaveAttribute("aria-current", "page");
  });
});
