"use client";

import { careersApi } from "@/lib/api/careers";
import { interviewsApi } from "@/lib/api/interviews";
import { candidateEmailApi } from "@/lib/api/candidate-email";
import {
  recruitmentApi,
  type ApiInterviewMutation,
} from "@/lib/api/recruitment";
import type {
  ChangeOutcome,
  ChangeResult,
  InterviewView,
  NoticeKind,
} from "./model";
import type { InterviewsGateway } from "./gateway";
import { replanCounts, type InterviewReminders } from "./reminders";
import { INVITE_EXPLAINER } from "./words";
import {
  choicesToPatch,
  outcomeFrom,
  reminderSettingsFromApi,
  remindersFromApi,
  viewFromMutation,
} from "./wire";

/**
 * The connected side of the interview screens: the API, in its own words.
 *
 * It turns what the API answers into the shapes the screens draw and nothing else. A
 * refusal is left as the `ApiError` the client threw, so the sentence a screen shows is the
 * one the API wrote. And it never turns a `queued` into a `sent`: a message is "sent" here
 * only where the API's own word is.
 */

/**
 * What is planned for an interview now, read after a change. A failed read is `null`, which
 * a screen draws as unknown: showing the plan from before the change would show reminders
 * that were just taken off.
 */
const plannedNow = async (id: string): Promise<InterviewReminders | null> => {
  try {
    return remindersFromApi(await interviewsApi.reminders(id));
  } catch {
    return null;
  }
};

const resultFrom = (
  answer: ApiInterviewMutation,
  before: InterviewView | null,
  role: string | null,
  fresh: boolean,
  after: InterviewReminders | null,
  /** Which message the request was about, for "not asked" to say which. */
  occasion: NoticeKind,
): ChangeResult => {
  /* An API that predates interview invitations answers with the candidate's own email and
     nothing about the panel: that is all there is to say, and it is said as it came. */
  const outcome = answer.notified
    ? outcomeFrom(answer.notified, answer.candidateName, occasion)
    : {
        asked: answer.email !== undefined && answer.email !== null,
        notices: answer.email
          ? [
              {
                id: answer.email.id,
                kind: "INVITE" as const,
                audience: "CANDIDATE" as const,
                recipient: answer.candidateName,
                status: answer.email.status,
                note: answer.email.note,
                at: null,
              },
            ]
          : [],
      };
  const counts = replanCounts(
    fresh ? null : (before?.reminders ?? null),
    after,
  );
  const told: ChangeOutcome = {
    ...outcome,
    ...(counts && after
      ? { reminders: { ...counts, paused: after.paused } }
      : {}),
  };
  return {
    interview: {
      ...viewFromMutation(
        answer,
        { role },
        fresh ? [] : (before?.notices ?? null),
        told,
      ),
      reminders: after,
    },
    outcome: told,
  };
};

export const apiInterviewsGateway: InterviewsGateway = {
  mode: "api",
  now: () => new Date().toISOString(),

  /*
   * The API serves no account of what each copy holds, only when each email is sent, so
   * the words are written from its contract (see `INVITE_EXPLAINER`). They are offered
   * only where the server sends the panel an email at all.
   */
  explainer: async (signal) => {
    const catalog = await candidateEmailApi.catalog(signal);
    return catalog.kinds.some((kind) => kind.kind === "PANELIST_INVITE")
      ? INVITE_EXPLAINER
      : null;
  },

  /* The API keeps no reason for a cancellation, so the dialog does not ask for one. */
  storesCancelReason: false,

  schedule: async (target, input) => {
    const answer = await recruitmentApi.scheduleInterview(
      target.applicationId,
      {
        kind: input.kind,
        scheduledFor: input.scheduledFor,
        timeZone: input.timeZone,
        durationMins: input.durationMins,
        ...(input.location ? { location: input.location } : {}),
        ...(input.joinUrl ? { joinUrl: input.joinUrl } : {}),
        ...(input.panel
          ? {
              panelistIds: input.panel.employeeIds,
              panelistUserIds: input.panel.userIds,
            }
          : {}),
        sendInvite: input.sendInvite,
        ...(input.candidateReminders === false
          ? { candidateReminders: false }
          : {}),
      },
    );
    return resultFrom(
      answer,
      null,
      target.role,
      true,
      await plannedNow(answer.id),
      "INVITE",
    );
  },

  change: async (was, input) => {
    const { sendUpdate, ...fields } = input;
    const answer = await recruitmentApi.rescheduleInterview(was.id, {
      ...fields,
      sendUpdate,
    });
    return resultFrom(
      answer,
      was,
      was.role,
      false,
      await plannedNow(answer.id),
      "UPDATE",
    );
  },

  cancel: async (was, input) => {
    const answer = await recruitmentApi.cancelInterview(was.id, {
      sendCancellation: input.sendCancellation,
    });
    return resultFrom(
      answer,
      was,
      was.role,
      false,
      await plannedNow(answer.id),
      "CANCEL",
    );
  },

  notify: async (was) => {
    const answer = await recruitmentApi.notifyInterview(was.id);
    return resultFrom(
      answer,
      was,
      was.role,
      false,
      await plannedNow(answer.id),
      "INVITE",
    );
  },

  reminderSettings: async (signal) =>
    reminderSettingsFromApi(await careersApi.getSettings(signal)),

  saveReminderSettings: async (values) => {
    const saved = reminderSettingsFromApi(
      await careersApi.updateSettings({
        interviewReminders: choicesToPatch(values),
      }),
    );
    if (!saved)
      throw new Error("The server did not say what it kept for the reminders.");
    return saved;
  },

  setCandidateReminders: async (was, on) => {
    const answer = await recruitmentApi.rescheduleInterview(was.id, {
      candidateReminders: on,
    });
    return resultFrom(
      answer,
      was,
      was.role,
      false,
      await plannedNow(answer.id),
      "UPDATE",
    );
  },

  complete: async (id) => {
    await recruitmentApi.completeInterview(id);
  },
  noShow: async (id) => {
    await recruitmentApi.noShowInterview(id);
  },

  calendarFile: async (interview, who) => {
    const file =
      who === "panelist"
        ? await interviewsApi.myCalendarFile(interview.id)
        : await interviewsApi.staffCalendarFile(interview.id);
    return { filename: file.filename, blob: file.blob, note: null };
  },
};
