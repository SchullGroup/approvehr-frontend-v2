"use client";

import { ApiError } from "@/lib/api/client";
import { interviewsApi } from "@/lib/api/interviews";
import { candidateEmailApi } from "@/lib/api/candidate-email";
import {
  recruitmentApi,
  type ApiInterviewMutation,
} from "@/lib/api/recruitment";
import type { ChangeResult, InterviewView } from "./model";
import type { InterviewsGateway } from "./gateway";
import { INVITE_EXPLAINER } from "./words";
import { outcomeFrom, viewFromMutation } from "./wire";

/**
 * The connected side of the interview screens: the API, in its own words.
 *
 * It turns what the API answers into the shapes the screens draw and nothing else. A
 * refusal is left as the `ApiError` the client threw, so the sentence a screen shows is the
 * one the API wrote. And it never turns a `queued` into a `sent`: a message is "sent" here
 * only where the API's own word is.
 */

const resultFrom = (
  answer: ApiInterviewMutation,
  before: InterviewView | null,
  role: string | null,
  fresh: boolean,
): ChangeResult => {
  /* An API that predates interview invitations answers with the candidate's own email and
     nothing about the panel: that is all there is to say, and it is said as it came. */
  const outcome = answer.notified
    ? outcomeFrom(answer.notified, answer.candidateName)
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
  return {
    interview: viewFromMutation(
      answer,
      { role },
      fresh ? [] : (before?.notices ?? null),
      outcome,
    ),
    outcome,
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
      },
    );
    return resultFrom(answer, null, target.role, true);
  },

  change: async (was, input) => {
    const { sendUpdate, ...fields } = input;
    const answer = await recruitmentApi.rescheduleInterview(was.id, {
      ...fields,
      sendUpdate,
    });
    return resultFrom(answer, was, was.role, false);
  },

  cancel: async (was, input) => {
    const answer = await recruitmentApi.cancelInterview(was.id, {
      sendCancellation: input.sendCancellation,
    });
    return resultFrom(answer, was, was.role, false);
  },

  notify: async (was) => {
    const answer = await recruitmentApi.notifyInterview(was.id);
    return resultFrom(answer, was, was.role, false);
  },

  /* Provisional: the server's reminders are wired once it publishes them. */
  reminderSettings: async () => null,
  saveReminderSettings: async () => {
    throw new ApiError(
      0,
      "not_available",
      "This server does not keep reminder settings yet.",
    );
  },
  setRemindersOff: async () => {
    throw new ApiError(
      0,
      "not_available",
      "This server does not keep reminders yet.",
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
