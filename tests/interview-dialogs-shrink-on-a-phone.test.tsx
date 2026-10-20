import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import {
  CancelInterviewDialog,
  NotifyInterviewDialog,
  RescheduleInterviewDialog,
  ScheduleInterviewDialog,
} from "@/components/hiring/interviews/interview-dialogs";
import type { EmailReadiness } from "@/lib/hiring/comms/model";
import type { InterviewView } from "@/lib/hiring/interviews/model";

/**
 * The interview dialogs on a phone.
 *
 * The date and the time are native controls, which are the ones that ran off the right
 * edge of an iPhone before: a time input in a half-width cell is wider than the cell. So
 * here the four dialogs are mounted and what lets the browser keep them inside a 375px
 * sheet is checked: the shared `Input`, a `FieldRow` that stacks the date over the time on
 * a phone, a body that scrolls down and never across. jsdom cannot measure a pixel; this
 * holds the structure, and `no-unsafe-form-rows.test.ts` reads every file for the rest.
 */

const classes = (node: Element) => Array.from(node.classList);

const NOT_SIZED = new Set(["checkbox", "radio", "file", "hidden", "range"]);

function expectShrinkSafe(dialog: HTMLElement) {
  const body = dialog.querySelector(".overflow-y-auto");
  expect(body, "the dialog body").not.toBeNull();
  expect(classes(body as Element)).toEqual(
    expect.arrayContaining(["min-w-0", "overflow-x-clip"]),
  );

  const controls = Array.from(
    dialog.querySelectorAll<HTMLElement>("input, select, textarea"),
  ).filter((el) => !NOT_SIZED.has((el as HTMLInputElement).type));
  for (const control of controls) {
    expect(
      classes(control),
      `${control.tagName.toLowerCase()} ${(control as HTMLInputElement).type}`,
    ).toEqual(expect.arrayContaining(["w-full", "min-w-0", "max-w-full"]));
  }

  /* Every column count that applies from the first pixel belongs to a row whose cells may shrink. */
  for (const grid of Array.from(
    dialog.querySelectorAll<HTMLElement>("div"),
  ).filter((el) => classes(el).some((c) => /^grid-cols-[2-9]$/.test(c)))) {
    expect(classes(grid), grid.className).toContain("[&>*]:min-w-0");
  }

  for (const label of Array.from(dialog.querySelectorAll("label[for]"))) {
    const root = label.parentElement?.parentElement;
    if (root && classes(root).includes("flex-col")) {
      expect(classes(root), `field "${label.textContent}"`).toContain(
        "min-w-0",
      );
    }
  }
  expect(classes(dialog)).toContain("min-w-0");
}

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

const interview: InterviewView = {
  id: "iv-1",
  applicationId: "pa-1",
  candidateName: "Chioma Aduba",
  role: "Payroll Analyst",
  kind: "TECHNICAL",
  scheduledFor: "2026-10-20T09:00:00.000Z",
  durationMins: 60,
  status: "SCHEDULED",
  location: "Boardroom",
  joinUrl: "https://meet.google.com/abc-defg-hij",
  timeZone: "Africa/Lagos",
  stageName: null,
  panelists: [],
  sequence: 0,
  notices: [],
  cancelReason: null,
};

const shared = {
  onClose: vi.fn(),
  getFile: vi.fn(),
  timeZone: "Africa/Lagos",
  readiness: READY,
  explainer: { candidate: "x", panelist: "y" },
};

describe("the interview dialogs", () => {
  it("Schedule: the date and the time stack on a phone and are the shared control", async () => {
    render(
      <ToastProvider>
        <ScheduleInterviewDialog
          open
          {...shared}
          onConfirm={vi.fn()}
          candidateName="Chioma Aduba"
          now="2026-10-10T09:00:00.000Z"
          stagePanel={null}
          people={[]}
          peopleLoading={false}
          panelSupported
        />
      </ToastProvider>,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Schedule an interview",
    });
    expectShrinkSafe(dialog);
    const date = dialog.querySelector("input[type=date]") as HTMLElement;
    const row = date.closest(".grid") as HTMLElement;
    expect(classes(row)).toEqual(
      expect.arrayContaining([
        "grid-cols-1",
        "sm:grid-cols-2",
        "[&>*]:min-w-0",
      ]),
    );
    expect(classes(row)).not.toContain("grid-cols-2");
    expect(row.contains(dialog.querySelector("input[type=time]"))).toBe(true);
  });

  it("Reschedule: the same", async () => {
    render(
      <ToastProvider>
        <RescheduleInterviewDialog
          open
          interview={interview}
          {...shared}
          onConfirm={vi.fn()}
          now="2026-10-10T09:00:00.000Z"
        />
      </ToastProvider>,
    );
    expectShrinkSafe(
      await screen.findByRole("dialog", { name: "Reschedule this interview" }),
    );
  });

  it("Cancel: a reason box and the choice, in a sheet no wider than the screen", async () => {
    render(
      <ToastProvider>
        <CancelInterviewDialog
          open
          interview={interview}
          {...shared}
          onConfirm={vi.fn()}
        />
      </ToastProvider>,
    );
    expectShrinkSafe(
      await screen.findByRole("dialog", { name: "Cancel this interview?" }),
    );
  });

  it("Send the invitation: words only, in the same sheet", async () => {
    render(
      <ToastProvider>
        <NotifyInterviewDialog
          open
          interview={interview}
          {...shared}
          onConfirm={vi.fn()}
        />
      </ToastProvider>,
    );
    expectShrinkSafe(
      await screen.findByRole("dialog", { name: "Send the invitation?" }),
    );
  });
});
