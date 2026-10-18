"use client";

import { useMemo, useState } from "react";
import { interviewsApi } from "@/lib/api/interviews";
import {
  recruitmentApi,
  type ApiInterviewDetail,
  type ApiInterviewSummary,
} from "@/lib/api/recruitment";
import { useLoaded } from "@/lib/use-loaded";
import type { InterviewNotice, InterviewView } from "./model";
import type { InterviewReminders } from "./reminders";
import {
  isReminderRow,
  noticeFromRow,
  remindersFromApi,
  viewFromSummary,
} from "./wire";

/**
 * A connected record's interviews, with what the application's own answer leaves out.
 *
 * The record lists each interview's time, place and panel. The link to join, the zone its
 * time is written in, the calendar sequence and the log of what was asked of the mail are
 * each interview's own, so they are read once for the record and joined on. Until they
 * arrive an interview is drawn from the summary alone, with its messages **unknown**
 * (`null`), which a screen never reads as "no email was asked for".
 *
 * A failed read of one interview's messages leaves just that one unknown. An API that has
 * no such route leaves every one unknown, and nothing here pretends otherwise.
 *
 * The log holds every email about the interview, reminders included, and the two are read
 * apart: the messages go on the interview's emails, and what is planned and what became of
 * each reminder comes from the reminders read, which also says why when none is planned.
 */

type Extras = {
  detail: ApiInterviewDetail | null;
  notices: InterviewNotice[] | null;
  reminders: InterviewReminders | null;
  /** The per-interview switch for the candidate's reminders, when either read said it. */
  candidateReminders: boolean | null;
};

export function useConnectedInterviews(
  summaries: readonly ApiInterviewSummary[],
  context: {
    applicationId: string;
    candidateName: string;
    role: string | null;
  },
  enabled = true,
): { views: InterviewView[]; reload: () => void } {
  const ids = summaries.map((summary) => summary.id);
  const loaded = useLoaded<Map<string, Extras>>(
    `interview-extras:${ids.join(",")}`,
    enabled && ids.length > 0,
    async (signal) => {
      const entries = await Promise.all(
        ids.map(async (id): Promise<[string, Extras]> => {
          const [detail, notices, reminders] = await Promise.allSettled([
            recruitmentApi.getInterview(id, signal),
            interviewsApi.notices(id, signal),
            interviewsApi.reminders(id, signal),
          ]);
          return [
            id,
            {
              detail: detail.status === "fulfilled" ? detail.value : null,
              notices:
                notices.status === "fulfilled"
                  ? notices.value.notices
                      .filter((row) => !isReminderRow(row))
                      .map(noticeFromRow)
                  : null,
              reminders:
                reminders.status === "fulfilled"
                  ? remindersFromApi(reminders.value)
                  : null,
              candidateReminders:
                reminders.status === "fulfilled"
                  ? reminders.value.candidateReminders
                  : detail.status === "fulfilled"
                    ? (detail.value.candidateReminders ?? null)
                    : null,
            },
          ];
        }),
      );
      return new Map(entries);
    },
  );

  /* The last answer stays while the next is read, so a change followed by `reload()`
     refreshes in place instead of dropping every link and log for a moment. */
  const [kept, setKept] = useState<Map<string, Extras> | null>(null);
  if (loaded.data !== null && kept !== loaded.data) setKept(loaded.data);
  const extras = loaded.data ?? kept;

  const { applicationId, candidateName, role } = context;
  const views = useMemo(
    () =>
      summaries.map((summary) => {
        const base = viewFromSummary(summary, {
          applicationId,
          candidateName,
          role,
        });
        const more = extras?.get(summary.id);
        if (!more) return base;
        return {
          ...base,
          ...(more.detail
            ? {
                joinUrl: more.detail.joinUrl ?? base.joinUrl,
                timeZone: more.detail.timeZone ?? base.timeZone,
                sequence: more.detail.calendarSequence ?? base.sequence,
              }
            : {}),
          notices: more.notices,
          reminders: more.reminders,
          ...(more.candidateReminders !== null
            ? { candidateReminders: more.candidateReminders }
            : {}),
        };
      }),
    [summaries, extras, applicationId, candidateName, role],
  );

  return { views, reload: loaded.reload };
}
