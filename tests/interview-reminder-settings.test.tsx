import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { defaultReminderSettings } from "@/lib/hiring/interviews/demo-reminders";
import type { InterviewsGateway } from "@/lib/hiring/interviews/gateway";
import type { ReminderSettings } from "@/lib/hiring/interviews/reminders";

/**
 * The company's reminder defaults.
 *
 * What these hold: each reminder says in one plain line when it goes and the one
 * condition that applies to all of them; the hours are held to the bounds the server gave,
 * under their own box and before anything is sent; and a refusal from the server lands
 * under the same box with what was typed kept.
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

const fake = (
  settings: ReminderSettings | null,
  over: Partial<InterviewsGateway> = {},
  mode: "api" | "demo" = "api",
): InterviewsGateway => ({
  mode,
  storesCancelReason: false,
  now: () => "2026-10-10T09:00:00.000Z",
  explainer: async () => null,
  reminderSettings: async () => settings,
  saveReminderSettings: vi.fn(async (next: ReminderSettings) => next),
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

const open = async (
  settings: ReminderSettings | null = defaultReminderSettings(),
  over: Partial<InterviewsGateway> = {},
  mode: "api" | "demo" = "api",
) => {
  gateway.current = fake(settings, over, mode);
  render(
    <ToastProvider>
      <InterviewRemindersScreen />
    </ToastProvider>,
  );
  await screen.findByText("The first reminder to the candidate");
  return gateway.current as InterviewsGateway;
};

const box = (name: RegExp | string, nth = 0) =>
  screen.getAllByRole("textbox", { name })[nth] as HTMLInputElement;

beforeEach(() => {
  gateway.current = null;
});

describe("the page", () => {
  it("names the four reminders, each with one plain line that says it only follows a sent invitation", async () => {
    await open();
    for (const title of [
      "The first reminder to the candidate",
      "The last reminder to the candidate",
      "A reminder to each panelist",
      "A nudge to hand in the scorecard",
    ])
      expect(screen.getByText(title)).toBeInTheDocument();
    expect(
      screen.getAllByText(
        /Only sent for interviews where you chose to send the invitation\./,
      ),
    ).toHaveLength(4);
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

  it("does not claim an audit log in a practice workspace that has none", async () => {
    gateway.current = fake(defaultReminderSettings(), {}, "demo");
    render(
      <ToastProvider>
        <InterviewRemindersScreen />
      </ToastProvider>,
    );
    await screen.findByText("The first reminder to the candidate");
    expect(screen.queryByText(/audit log/)).toBeNull();
  });

  it("shows the hours as they are, with the bounds the server gave", async () => {
    await open();
    expect(box(/Hours before the interview/, 0)).toHaveValue("24");
    expect(box(/Hours before the interview/, 1)).toHaveValue("1");
    expect(box(/Hours after the interview/)).toHaveValue("24");
    expect(box(/Most nudges for one interview/)).toHaveValue("2");
    expect(screen.getAllByText(/From 1 to 168 hours\./)).toHaveLength(4);
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
});

describe("changing them", () => {
  it("does nothing until something changes: the buttons are off and nothing says unsaved", async () => {
    await open();
    expect(
      screen.getByRole("button", { name: "Save reminders" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Discard changes" }),
    ).toBeDisabled();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("saves what was typed as numbers, with each switch as it was left", async () => {
    const user = userEvent.setup();
    const g = await open();
    fireEvent.change(box(/Hours before the interview/, 0), {
      target: { value: "48" },
    });
    await user.click(screen.getAllByRole("switch", { name: "Send it" })[1]!);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save reminders" }));
    await waitFor(() => expect(g.saveReminderSettings).toHaveBeenCalled());
    const saved = (g.saveReminderSettings as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as ReminderSettings;
    expect(saved.rules.map((r) => [r.kind, r.enabled, r.hours])).toEqual([
      ["CANDIDATE_EARLY", true, 48],
      ["CANDIDATE_FINAL", false, 1],
      ["PANELIST", true, 24],
      ["SCORECARD_NUDGE", true, 24],
    ]);
    expect(saved.nudges.max).toBe(2);
    expect(
      await screen.findByText("Interview reminders saved"),
    ).toBeInTheDocument();
  });

  it("holds each box to the bounds the server gave, under that box, before asking", async () => {
    const user = userEvent.setup();
    const g = await open();
    fireEvent.change(box(/Hours before the interview/, 0), {
      target: { value: "0" },
    });
    fireEvent.change(box(/Hours before the interview/, 1), {
      target: { value: "169" },
    });
    fireEvent.change(box(/Most nudges for one interview/), {
      target: { value: "9" },
    });
    await user.click(screen.getByRole("button", { name: "Save reminders" }));
    expect(screen.getAllByText("Between 1 and 168 hours.")).toHaveLength(2);
    expect(screen.getByText("Between 1 and 5 nudges.")).toBeInTheDocument();
    expect(g.saveReminderSettings).not.toHaveBeenCalled();
  });

  it("refuses a part of an hour and an empty box, as numbers that are not", async () => {
    const user = userEvent.setup();
    const g = await open();
    fireEvent.change(box(/Hours before the interview/, 0), {
      target: { value: "1.5" },
    });
    fireEvent.change(box(/Hours after the interview/), {
      target: { value: "" },
    });
    await user.click(screen.getByRole("button", { name: "Save reminders" }));
    expect(screen.getAllByText(/hours\.$/).length).toBeGreaterThanOrEqual(2);
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
              field: "rules.CANDIDATE_FINAL.hours",
              message: "The last reminder has to be after the first.",
            },
          ],
        );
      }),
    });
    fireEvent.change(box(/Hours before the interview/, 1), {
      target: { value: "30" },
    });
    await user.click(screen.getByRole("button", { name: "Save reminders" }));
    expect(
      await screen.findByText("The last reminder has to be after the first."),
    ).toBeInTheDocument();
    expect(box(/Hours before the interview/, 1)).toHaveValue("30");
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
    fireEvent.change(box(/Hours before the interview/, 0), {
      target: { value: "30" },
    });
    await user.click(screen.getByRole("button", { name: "Save reminders" }));
    const callout = await screen.findByText(
      "You need the following to do that: Settings.",
    );
    expect(callout).toBeInTheDocument();
    expect(
      screen.getByText("The reminders were not saved"),
    ).toBeInTheDocument();
  });

  it("discards what was typed", async () => {
    const user = userEvent.setup();
    await open();
    fireEvent.change(box(/Hours before the interview/, 0), {
      target: { value: "72" },
    });
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(box(/Hours before the interview/, 0)).toHaveValue("24");
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("is wrapped in the same settings frame as the others, with its own tab", async () => {
    await open();
    const tab = screen.getByRole("link", { name: "Interview reminders" });
    expect(tab).toHaveAttribute("href", "/hiring/settings/interviews");
    expect(tab).toHaveAttribute("aria-current", "page");
  });
});
