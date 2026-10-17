"use client";

import { ApiError } from "@/lib/api/client";
import {
  INTERVIEW_KIND_LABEL,
  type InterviewKind,
} from "@/lib/api/recruitment";
import { sampleValues, type Values } from "@/lib/hiring/comms/fields";
import type {
  MyApplication,
  MyApplicationRow,
  MyInterviewRow,
  MyScorecard,
  PanelMember,
} from "@/lib/hiring/comms/model";
import { scoreOfRatings } from "@/lib/hiring/comms/score";
import { accountSeat } from "@/lib/hiring/comms/seats";
import { demoAccess } from "@/lib/hiring/access/demo-store";
import { memberOf } from "@/lib/hiring/access/demo-ops";
import {
  CANDIDATES,
  INTERVIEWS,
  REQUISITIONS,
  SCORECARDS,
} from "@/lib/mock/hiring";
import { EMPLOYEES } from "@/lib/mock/people";
import {
  archiveEmailTemplate,
  catalogOf,
  checkDraft,
  createEmailTemplate,
  previewDraft,
  restoreEmailTemplate,
  retentionReport,
  setRetention,
  setStageEmail,
  setStagePanel,
  stageSettings,
  updateEmailTemplate,
} from "./demo-comms-ops";
import { DEMO_NOW, type DemoBook, type Op } from "./demo-ops";
import { demoPipeline, demoRun } from "./demo-store";
import type { PipelineGateway } from "./gateway";

/**
 * The offline side of the email, panel, panelist and retention screens: the book in
 * this browser, answering in the API's words.
 *
 * Refusals are thrown as `ApiError` so a screen has one catch block whichever side
 * it is talking to. A template that cannot be saved is thrown the way the API
 * throws it, as a `400` with each problem against its field, so the editor puts
 * every message under the field it is about.
 */

const refuse = (message: string): ApiError =>
  new ApiError(422, "unprocessable", message);

function unwrap<T>(result: Op<T>): T {
  if (!result.ok) throw refuse(result.error);
  return result.value;
}

/** Who the offline panelist screens are for: an employee on two interviews, owing one scorecard. */
export const DEMO_ME = "p-05";

/** An invited account the demo's access book knows, by its sign-in id. */
function accountOf(userId: string): { name: string } | null {
  for (const job of Object.values(demoAccess.current().jobs)) {
    for (const grant of job.grants) {
      if (memberOf(grant).userId === userId) return { name: grant.name };
    }
  }
  return null;
}

/**
 * Somebody on a panel, from the key it is stored under: a raw employee id (how every
 * panel saved before accounts was written), `u:<id>` for an invited account.
 */
const person = (key: string): PanelMember => {
  if (key.startsWith("u:")) {
    const userId = key.slice(2);
    return {
      employeeId: null,
      userId,
      kind: "ACCOUNT",
      name: accountOf(userId)?.name ?? "A guest",
      jobTitle: "",
    };
  }
  const id = key.startsWith("e:") ? key.slice(2) : key;
  const found = EMPLOYEES.find((employee) => employee.id === id);
  return {
    employeeId: id,
    userId: null,
    kind: "EMPLOYEE",
    name: found ? `${found.firstName} ${found.lastName}` : "A colleague",
    jobTitle: found?.jobTitle ?? "",
  };
};

/** Real values for a preview made for one person. */
function valuesFor(book: DemoBook, applicationId: string): Values | null {
  const app = book.apps.find((a) => a.id === applicationId);
  if (!app) return null;
  const role = REQUISITIONS.find((r) => r.id === app.requisitionId);
  const stage = book.stages.find((s) => s.id === app.stageId);
  return {
    ...sampleValues(book.mail.companyName, book.mail.replyTo),
    candidate_first_name: app.name.split(" ")[0] ?? "",
    job_title: role?.title ?? "",
    stage_name: stage?.name ?? "",
    reference: app.reference,
    interview_time: null,
    interview_location: null,
  };
}

/* ------------------------------------------------------- my interviews (seed) */

const KIND: Record<string, InterviewKind> = {
  recruiter_screen: "SCREEN",
  technical: "TECHNICAL",
  panel: "PANEL",
  final: "FINAL",
};
const STATUS = {
  scheduled: "SCHEDULED",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
  no_show: "NO_SHOW",
} as const;

const kindLabel = (kind: string): string =>
  INTERVIEW_KIND_LABEL[KIND[kind] ?? "SCREEN"];

const countable = (status: string): boolean =>
  status === "scheduled" || status === "completed";

/** A scorecard the offline book holds: handed in here, or seeded. */
function cardFor(
  book: DemoBook,
  interviewId: string,
  applicationId: string,
  interviewerId: string,
): MyScorecard | null {
  const mine =
    interviewerId === DEMO_ME
      ? book.scorecards.find((card) => card.interviewId === interviewId)
      : undefined;
  if (mine) {
    return {
      id: `mine-${interviewId}`,
      by: person(interviewerId).name,
      recommendation: mine.recommendation,
      notes: mine.notes,
      submitted: true,
      composite: scoreOfRatings(mine.ratings),
      ratings: mine.ratings,
    };
  }
  const seeded = SCORECARDS.find(
    (card) =>
      card.applicationId === applicationId &&
      card.interviewerId === interviewerId &&
      card.submittedAt !== null,
  );
  if (!seeded) return null;
  const ratings = seeded.ratings.map((rating) => ({
    ...rating,
    weight: 1,
    comment: null as string | null,
  }));
  return {
    id: seeded.id,
    by: person(interviewerId).name,
    recommendation: seeded.recommendation
      ? (seeded.recommendation.toUpperCase() as MyScorecard["recommendation"])
      : null,
    notes: seeded.notes,
    submitted: true,
    composite: scoreOfRatings(ratings),
    ratings,
  };
}

const mineOf = (book: DemoBook): MyInterviewRow[] =>
  INTERVIEWS.filter(
    (i) => i.interviewerIds.includes(DEMO_ME) && countable(i.status),
  )
    .map((i) => {
      const app = book.apps.find((a) => a.id === i.applicationId);
      const role = REQUISITIONS.find((r) => r.id === app?.requisitionId);
      return {
        interviewId: i.id,
        applicationId: i.applicationId,
        candidateName: app?.name ?? "A candidate",
        role: role?.title ?? "",
        reference: role?.reference ?? "",
        kind: kindLabel(i.kind),
        scheduledFor: i.scheduledFor,
        durationMins: i.durationMins,
        status: STATUS[i.status],
        location: null,
        scorecardIn: cardFor(book, i.id, i.applicationId, DEMO_ME) !== null,
      };
    })
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

const page = <T>(rows: T[], number: number, size: number): T[] =>
  rows.slice((number - 1) * size, number * size);

/* -------------------------------------------------------------------- gateway */

export const demoComms: Pick<
  PipelineGateway,
  "stages" | "emails" | "retention" | "mine"
> = {
  stages: {
    list: async (requisitionId) =>
      stageSettings(demoPipeline.current(), requisitionId, person),
    setEmail: async (_requisitionId, stageId, templateId) => {
      unwrap(demoRun((book) => setStageEmail(book, stageId, templateId)));
    },
    setPanel: async (_requisitionId, stageId, seats) => {
      const keys = [...seats.employeeIds, ...seats.userIds.map(accountSeat)];
      unwrap(demoRun((book) => setStagePanel(book, stageId, keys)));
      return keys.map(person);
    },
  },

  emails: {
    catalog: async () => catalogOf(demoPipeline.current()),
    readiness: async () => {
      const { mail } = demoPipeline.current();
      const blockedBy: string[] = [];
      if (!mail.enabled)
        blockedBy.push(
          "Emails to candidates are switched off for your company.",
        );
      if (!mail.replyTo)
        blockedBy.push(
          "Add a reply-to address: replies from candidates have to go somewhere.",
        );
      /* Nothing leaves an offline book, and it says so rather than implying it. */
      blockedBy.push(
        "This is a practice workspace with no email, so nothing is sent from it.",
      );
      return {
        supported: true,
        enabled: mail.enabled,
        willSend: false,
        blockedBy,
        sender: {
          name: mail.senderName,
          registeredName: mail.companyName,
          displayNameAccepted: null,
          replyTo: mail.replyTo,
        },
      };
    },
    create: async (draft) => {
      const book = demoPipeline.current();
      const { problems, conflict } = checkDraft(book, draft);
      if (problems.length > 0)
        throw new ApiError(
          400,
          "validation_failed",
          "Some fields are not valid",
          problems,
        );
      if (conflict) throw new ApiError(409, "conflict", conflict);
      return unwrap(demoRun((now) => createEmailTemplate(now, draft)));
    },
    update: async (id, patch) => {
      const book = demoPipeline.current();
      const existing = book.emailTemplates.find((t) => t.id === id);
      if (existing) {
        const { problems, conflict } = checkDraft(
          book,
          {
            kind: existing.kind,
            name: patch.name ?? existing.name,
            subject: patch.subject ?? existing.subject,
            body: patch.body ?? existing.body,
          },
          id,
        );
        if (problems.length > 0)
          throw new ApiError(
            400,
            "validation_failed",
            "Some fields are not valid",
            problems,
          );
        if (conflict) throw new ApiError(409, "conflict", conflict);
      }
      return unwrap(demoRun((now) => updateEmailTemplate(now, id, patch)));
    },
    archive: async (id) =>
      unwrap(demoRun((book) => archiveEmailTemplate(book, id))),
    restore: async (id) =>
      unwrap(demoRun((book) => restoreEmailTemplate(book, id))),
    preview: async (request) => {
      const book = demoPipeline.current();
      return previewDraft(book, request, (id) => valuesFor(book, id));
    },
    setEnabled: async (enabled) => {
      demoPipeline.commit({
        ...demoPipeline.current(),
        mail: { ...demoPipeline.current().mail, enabled },
      });
    },
  },

  retention: {
    report: async () => retentionReport(demoPipeline.current()),
    set: async (months) => {
      unwrap(demoRun((book) => setRetention(book, months)));
    },
  },

  mine: {
    access: async () => {
      const book = demoPipeline.current();
      const rows = mineOf(book);
      const roles = new Map<
        string,
        { reference: string; jobTitle: string; stages: string[] }
      >();
      for (const row of rows) {
        const app = book.apps.find((a) => a.id === row.applicationId);
        if (!app) continue;
        const entry = roles.get(app.requisitionId) ?? {
          reference: row.reference,
          jobTitle: row.role,
          stages: [],
        };
        const stage = book.stages.find((s) => s.id === app.stageId);
        if (stage && !entry.stages.includes(stage.name))
          entry.stages.push(stage.name);
        roles.set(app.requisitionId, entry);
      }
      return {
        hasAnyAccess: rows.length > 0,
        managing: [],
        paneling: [...roles].map(([requisitionId, role]) => ({
          requisitionId,
          ...role,
        })),
        interviewsInvitedTo: rows.length,
      };
    },
    interviews: async (query) => {
      const rows = mineOf(demoPipeline.current()).filter(
        (row) => !query.awaitingMyScorecard || !row.scorecardIn,
      );
      return {
        rows: page(rows, query.page, query.pageSize),
        total: rows.length,
      };
    },
    applications: async (query) => {
      const book = demoPipeline.current();
      const mine = mineOf(book);
      const ids = [...new Set(mine.map((row) => row.applicationId))];
      const rows: MyApplicationRow[] = ids.flatMap((id) => {
        const app = book.apps.find((a) => a.id === id);
        if (!app) return [];
        if (
          !query.includeClosed &&
          app.outcome !== "IN_PROGRESS" &&
          app.outcome !== "OFFER_MADE"
        )
          return [];
        const role = REQUISITIONS.find((r) => r.id === app.requisitionId);
        const theirs = mine.filter((row) => row.applicationId === id);
        return [
          {
            id,
            candidateName: app.name,
            role: role?.title ?? "",
            reference: role?.reference ?? "",
            stageName:
              book.stages.find((s) => s.id === app.stageId)?.name ?? null,
            outcome: app.outcome,
            roles: ["Invited to interview"],
            interviewsOfMine: theirs.length,
            scorecardsOwed: theirs.filter((row) => !row.scorecardIn).length,
            hasCv: false,
          },
        ];
      });
      return {
        rows: page(rows, query.page, query.pageSize),
        total: rows.length,
      };
    },
    application: async (id): Promise<MyApplication> => {
      const book = demoPipeline.current();
      const app = book.apps.find((a) => a.id === id);
      const theirs = INTERVIEWS.filter(
        (i) =>
          i.applicationId === id &&
          i.interviewerIds.includes(DEMO_ME) &&
          countable(i.status),
      );
      /* Not theirs is not there: the same `404` the API gives, so what exists
         is not theirs to learn. */
      if (!app || theirs.length === 0)
        throw new ApiError(404, "not_found", "That application was not found.");
      const role = REQUISITIONS.find((r) => r.id === app.requisitionId);
      const candidate = CANDIDATES.find((c) => c.id === app.candidateId);
      return {
        id,
        /* A name, never an address or a number. */
        candidateName: candidate
          ? `${candidate.firstName} ${candidate.lastName}`
          : app.name,
        role: role?.title ?? "",
        reference: role?.reference ?? "",
        stageName: book.stages.find((s) => s.id === app.stageId)?.name ?? null,
        outcome: app.outcome,
        roles: ["Invited to interview"],
        hasCv: false,
        interviews: theirs.map((interview) => ({
          id: interview.id,
          kind: kindLabel(interview.kind),
          scheduledFor: interview.scheduledFor,
          durationMins: interview.durationMins,
          status: STATUS[interview.status],
          location: null,
          stageName:
            book.stages.find((s) => s.id === app.stageId)?.name ?? null,
          iAmPanelist: true,
          panel: interview.interviewerIds.map((employeeId) => ({
            employeeId,
            userId: null,
            name: person(employeeId).name,
            submitted: cardFor(book, interview.id, id, employeeId) !== null,
          })),
          mine: cardFor(book, interview.id, id, DEMO_ME),
          /* Scoring is blind: a panelist is never shown what a colleague wrote. */
          everyones: null,
        })),
        score: null,
      };
    },
    submitScorecard: async (interviewId, input) => {
      const interview = INTERVIEWS.find((i) => i.id === interviewId);
      if (!interview || !interview.interviewerIds.includes(DEMO_ME))
        throw new ApiError(404, "not_found", "That interview was not found.");
      if (!countable(interview.status))
        throw refuse(
          "That interview did not take place, so there is nothing to score.",
        );
      if (input.ratings.length === 0 && !input.recommendation)
        throw refuse("Rate at least one thing, or give a recommendation.");
      for (const rating of input.ratings) {
        if (
          !Number.isInteger(rating.score) ||
          rating.score < 1 ||
          rating.score > 5
        )
          throw new ApiError(
            400,
            "validation_failed",
            "Some fields are not valid",
            [{ field: "score", message: "1 to 5." }],
          );
        if (!(rating.weight > 0))
          throw new ApiError(
            400,
            "validation_failed",
            "Some fields are not valid",
            [
              {
                field: "weight",
                message:
                  "A weight of zero drops the competency from the average.",
              },
            ],
          );
      }
      demoRun((book) => ({
        ok: true,
        book: {
          ...book,
          scorecards: [
            ...book.scorecards.filter(
              (card) => card.interviewId !== interviewId,
            ),
            {
              interviewId,
              recommendation: input.recommendation,
              notes: input.notes.trim(),
              ratings: input.ratings,
              submittedAt: DEMO_NOW,
            },
          ],
          unscored: book.unscored.filter(
            (id) => id !== interview.applicationId,
          ),
        },
        value: undefined,
      }));
      const saved = cardFor(
        demoPipeline.current(),
        interviewId,
        interview.applicationId,
        DEMO_ME,
      );
      if (!saved) throw refuse("That scorecard could not be read back.");
      return saved;
    },
    /* There are no files in an offline book to open. */
    openCv: null,
  },
};
