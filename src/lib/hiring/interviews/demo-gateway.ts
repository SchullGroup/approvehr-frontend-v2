"use client";

import { ApiError } from "@/lib/api/client";
import type { EmailKind } from "@/lib/hiring/comms/model";
import { kindInfo } from "@/lib/hiring/comms/fields";
import { person, cardFor } from "@/lib/hiring/pipeline/demo-comms";
import { DEMO_NOW } from "@/lib/hiring/pipeline/demo-ops";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { accountSeat } from "@/lib/hiring/comms/seats";
import { buildIcs, eventFor, icsFilename } from "./calendar";
import {
  cancel,
  change,
  notify,
  schedule,
  saveReminderSettings,
  setRemindersOff,
  settle,
  viewOf,
  type MailRules,
  type Op,
  type Roster,
} from "./demo-ops";
import { demoInterviews, interviewRun } from "./demo-store";
import type { InterviewsGateway } from "./gateway";
import { settingsProblems } from "./reminders";
import { INVITE_EXPLAINER } from "./words";

/**
 * The offline side of the interview screens: the book in this browser, answering in the
 * API's words.
 *
 * Refusals are thrown as `ApiError` so a screen has one catch block whichever side it is
 * talking to. Nothing is ever sent from here: a message somebody asks for is recorded as
 * not sent, with the reason, and a message they decline to ask for is "not asked".
 */

/** The company's zone in a practice workspace. */
const DEMO_ZONE = "Africa/Lagos";

/** What a practice view says is planned: the book's defaults, on the practice clock. */
export const demoPlan = () => ({
  settings: demoInterviews.current().reminderSettings,
  now: DEMO_NOW,
});

const refuse = (message: string): ApiError =>
  new ApiError(422, "unprocessable", message);

function unwrap<T>(result: Op<T>): T {
  if (!result.ok) throw refuse(result.error);
  return result.value;
}

/** The company's mail: its switch, its reply-to and the words of each kind. */
function rules(): MailRules {
  const book = demoPipeline.current();
  return {
    enabled: book.mail.enabled,
    replyTo: book.mail.replyTo,
    companyName: book.mail.companyName,
    wording: (kind: EmailKind) => {
      const own = book.emailTemplates.find(
        (template) =>
          template.kind === kind && template.isDefault && !template.archived,
      );
      return own ?? kindInfo(kind).builtIn;
    },
  };
}

export function demoRoster(): Roster {
  return {
    nameOf: (seat) => person(seat).name,
    submitted: (interview, seat) =>
      seat.startsWith("e:") &&
      cardFor(
        demoPipeline.current(),
        interview.id,
        interview.applicationId,
        seat.slice(2),
      ) !== null,
  };
}

const PRACTICE_FILE = DEMO_ENABLED
  ? "This file was made in this browser, not by ApproveHR. Nobody was sent an invitation."
  : null;

export const demoInterviewsGateway: InterviewsGateway = {
  mode: "demo",
  now: () => DEMO_NOW,
  explainer: async () => INVITE_EXPLAINER,
  storesCancelReason: false,

  schedule: async (target, input) => {
    const seats = input.panel
      ? [
          ...input.panel.employeeIds.map((id) => `e:${id}`),
          ...input.panel.userIds.map(accountSeat),
        ]
      : null;
    const { interview, outcome } = unwrap(
      interviewRun((book) =>
        schedule(
          book,
          target,
          input,
          seats,
          rules(),
          demoRoster(),
          DEMO_ZONE,
          DEMO_NOW,
        ),
      ),
    );
    return { interview: viewOf(interview, demoRoster(), demoPlan()), outcome };
  },

  change: async (was, input) => {
    const { interview, outcome } = unwrap(
      interviewRun((book) =>
        change(book, was.id, input, rules(), demoRoster(), DEMO_ZONE, DEMO_NOW),
      ),
    );
    return { interview: viewOf(interview, demoRoster(), demoPlan()), outcome };
  },

  cancel: async (was, input) => {
    const { interview, outcome } = unwrap(
      interviewRun((book) =>
        cancel(book, was.id, input, rules(), demoRoster(), DEMO_ZONE, DEMO_NOW),
      ),
    );
    return { interview: viewOf(interview, demoRoster(), demoPlan()), outcome };
  },

  notify: async (was) => {
    const { interview, outcome } = unwrap(
      interviewRun((book) =>
        notify(book, was.id, rules(), demoRoster(), DEMO_ZONE, DEMO_NOW),
      ),
    );
    return { interview: viewOf(interview, demoRoster(), demoPlan()), outcome };
  },

  reminderSettings: async () => demoInterviews.current().reminderSettings,

  saveReminderSettings: async (settings) => {
    const problems = settingsProblems(settings);
    if (problems.length > 0)
      throw new ApiError(
        400,
        "validation_failed",
        "Some fields are not valid.",
        problems,
      );
    return unwrap(interviewRun((book) => saveReminderSettings(book, settings)));
  },

  setRemindersOff: async (was, off) => {
    const interview = unwrap(
      interviewRun((book) => setRemindersOff(book, was.id, off)),
    );
    return (
      viewOf(interview, demoRoster(), demoPlan()).reminders ?? {
        off,
        items: [],
      }
    );
  },

  complete: async (id) => {
    unwrap(interviewRun((book) => settle(book, id, "COMPLETED")));
  },
  noShow: async (id) => {
    unwrap(interviewRun((book) => settle(book, id, "NO_SHOW")));
  },

  calendarFile: async (interview, who) => {
    const event = eventFor(interview, who);
    const text = buildIcs(event, { demo: true, stamp: new Date(DEMO_NOW) });
    return {
      filename: icsFilename(event),
      blob: new Blob([text], { type: "text/calendar;charset=utf-8" }),
      note: PRACTICE_FILE,
    };
  },
};
