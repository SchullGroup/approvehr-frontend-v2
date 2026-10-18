"use client";

import {
  candidateEmailApi,
  type ApiCandidateEmail,
  type ApiEmailCatalog,
  type ApiEmailTemplate,
  type ApiMyApplication,
  type ApiMyApplicationCard,
  type ApiMyRole,
  type ApiPanelMember,
  type ApiMyScorecard,
  type ApiScoreSummary,
} from "@/lib/api/candidate-email";
import { careersApi } from "@/lib/api/careers";
import {
  INTERVIEW_KIND_LABEL,
  recruitmentApi,
  type InterviewKind,
} from "@/lib/api/recruitment";
import type {
  EmailCatalog,
  EmailTemplate,
  MyApplication,
  MyScorecard,
  PanelMember,
  ScoreSummary,
  SentEmail,
} from "@/lib/hiring/comms/model";
import type { FitSummary } from "@/lib/hiring/screening/model";
import { fitFromRow } from "@/lib/hiring/screening/wire";
import { becauseOf } from "@/lib/hiring/comms/status";
import type { PipelineGateway } from "./gateway";

/**
 * The connected side of the email, panel, panelist and retention screens: the API,
 * in its own words.
 *
 * It turns the wire into the shapes the screens draw and nothing else. A refusal is
 * left as the `ApiError` the client threw, so the sentence a screen shows is the one
 * the API wrote.
 */

/* ------------------------------------------------------------------- mapping */

export const templateFrom = (template: ApiEmailTemplate): EmailTemplate => ({
  id: template.id,
  kind: template.kind,
  kindLabel: template.kindLabel,
  name: template.name,
  subject: template.subject,
  body: template.body,
  isDefault: template.isDefault,
  archived: template.archived,
  usedByStages: template.usedByStages,
});

export const catalogFrom = (catalog: ApiEmailCatalog): EmailCatalog => ({
  fields: catalog.fields,
  kinds: catalog.kinds,
  templates: catalog.templates.map(templateFrom),
  sender: catalog.sender
    ? {
        name: catalog.sender.name,
        registeredName: catalog.sender.registeredName,
        displayNameAccepted: catalog.sender.displayNameAccepted,
        replyTo: catalog.sender.replyTo,
      }
    : null,
});

/** What an application has had or is owed, as the record page draws it. */
export const emailLogFrom = (
  emails: readonly ApiCandidateEmail[],
): SentEmail[] =>
  emails.map((email) => ({
    id: email.id,
    kindLabel: email.kindLabel,
    status: email.status,
    note: email.note,
    subject: email.subject,
    stageName: email.stageName,
    templateName: email.templateName,
    sentAt: email.sentAt,
    createdAt: email.createdAt,
    because: becauseOf(email.trigger, email.stageName),
  }));

const kindLabel = (kind: string): string =>
  INTERVIEW_KIND_LABEL[kind as InterviewKind] ?? kind;

const ROLE_LABEL: Record<ApiMyRole, string> = {
  HIRING_MANAGER: "Hiring manager",
  RECRUITER: "Recruiter",
  STAGE_PANEL: "On the panel for this stage",
  INTERVIEW_PANEL: "Invited to interview",
};

export const roleLabels = (roles: readonly ApiMyRole[]): string[] =>
  roles.map((role) => ROLE_LABEL[role]);

export const scoreFrom = (score: ApiScoreSummary): ScoreSummary => ({
  outOf: score.outOf,
  composite: score.composite,
  interviews: score.interviews.map((line) => ({
    interviewId: line.interviewId,
    kind: kindLabel(line.kind),
    composite: line.composite,
    scorecards: line.scorecards.map((card) => ({
      interviewerId: card.interviewerId,
      composite: card.composite,
      recommendation: card.recommendation,
    })),
  })),
  recommendations: score.recommendations,
  byCompetency: score.byCompetency.map((entry) => ({
    competency: entry.competency,
    average: entry.average,
    ratings: entry.ratings,
  })),
  scorecardsSubmitted: score.scorecardsSubmitted,
});

/** A seat on a stage's panel. An API that predates invited accounts sends staff only. */
const panelMemberFrom = (member: ApiPanelMember): PanelMember => ({
  employeeId: member.employeeId,
  userId: member.userId ?? null,
  kind: member.kind ?? (member.employeeId ? "EMPLOYEE" : "ACCOUNT"),
  name: member.name,
  jobTitle: member.jobTitle,
});

/**
 * What the narrow door says of the fit score. Only where the API sent it, which it
 * does only where the job lets this person see scores: absent is absent.
 */
const fitOfCard = (row: ApiMyApplicationCard): { fit?: FitSummary } => {
  if (row.scoreStatus === undefined || row.scoreStatus === null) return {};
  const fit = fitFromRow({ score: row.score, scoreStatus: row.scoreStatus });
  return fit ? { fit } : {};
};

const screeningOfApplication = (
  row: ApiMyApplication,
): { screening?: NonNullable<MyApplication["screening"]> } => {
  if (!row.screening) return {};
  const fit = fitFromRow({
    score: row.screening.score,
    scoreStatus: row.screening.status,
  });
  return fit
    ? {
        screening: {
          fit,
          coverage: row.screening.coverage,
          reasons: row.screening.reasons,
        },
      }
    : {};
};

const scorecardFrom = (card: ApiMyScorecard): MyScorecard => ({
  id: card.id,
  by: card.interviewerName,
  recommendation: card.recommendation,
  notes: card.notes,
  submitted: card.submitted,
  composite: card.composite,
  ratings: card.ratings,
});

const applicationFrom = (row: ApiMyApplication): MyApplication => ({
  id: row.id,
  candidateName: `${row.candidate.firstName} ${row.candidate.lastName}`.trim(),
  role: row.requisition.jobTitle,
  reference: row.requisition.reference,
  stageName: row.stage?.name ?? null,
  outcome: row.outcome,
  roles: roleLabels(row.roles),
  hasCv: row.candidate.hasCv,
  interviews: row.interviews.map((interview) => ({
    id: interview.id,
    kind: kindLabel(interview.kind),
    kindCode: interview.kind,
    scheduledFor: interview.scheduledFor,
    durationMins: interview.durationMins,
    status: interview.status,
    location: interview.location,
    joinUrl: interview.joinUrl ?? null,
    timeZone: interview.timeZone ?? null,
    sequence: interview.calendarSequence ?? 0,
    stageName: interview.stageName,
    iAmPanelist: interview.iAmPanelist,
    panel: interview.panel.map((seat) => ({
      employeeId: seat.employeeId,
      userId: seat.userId ?? null,
      name: seat.name,
      submitted: seat.submitted,
    })),
    mine: interview.myScorecard ? scorecardFrom(interview.myScorecard) : null,
    everyones: interview.scorecards
      ? interview.scorecards.map(scorecardFrom)
      : null,
  })),
  score: row.scores ? scoreFrom(row.scores) : null,
  ...screeningOfApplication(row),
});

/* ------------------------------------------------------------------- gateway */

export const apiComms: Pick<
  PipelineGateway,
  "stages" | "emails" | "retention" | "mine"
> = {
  stages: {
    list: async (requisitionId, signal) => {
      const stages = await recruitmentApi.listStages(requisitionId, signal);
      const ordered = [...stages].sort((a, b) => a.order - b.order);
      /* Only an interview stage has a panel, so only those are asked. */
      return Promise.all(
        ordered.map(async (stage) => ({
          stageId: stage.id,
          name: stage.name,
          order: stage.order,
          type: stage.type ?? null,
          emailTemplateId: stage.emailTemplateId ?? null,
          panel:
            stage.type === "INTERVIEW"
              ? (
                  await candidateEmailApi.getPanel(
                    requisitionId,
                    stage.id,
                    signal,
                  )
                ).members.map(panelMemberFrom)
              : null,
        })),
      );
    },
    setEmail: async (requisitionId, stageId, templateId) => {
      await recruitmentApi.updateStage(requisitionId, stageId, {
        emailTemplateId: templateId,
      });
    },
    setPanel: async (requisitionId, stageId, seats) =>
      (
        await candidateEmailApi.setPanel(requisitionId, stageId, seats)
      ).members.map(panelMemberFrom),
  },

  emails: {
    catalog: async (signal) =>
      catalogFrom(await candidateEmailApi.catalog(signal)),
    readiness: async (signal) => {
      const settings = await careersApi.getSettings(signal);
      const emails = settings.candidateEmails;
      const sender = settings.emailSender;
      return {
        /* An API that predates candidate emails says nothing: "switched on, and
           nothing known to be in the way" would be a claim it has not made, so it
           reads as unavailable instead. */
        supported: emails !== undefined,
        enabled: emails?.enabled ?? false,
        willSend: emails?.willSend ?? false,
        blockedBy: emails
          ? emails.blockedBy
          : ["This server does not send emails to candidates yet."],
        sender: sender
          ? {
              name: sender.name,
              registeredName: sender.registeredName,
              displayNameAccepted: sender.displayNameAccepted,
              replyTo: settings.contact.replyToEmail,
              note: sender.note,
            }
          : null,
      };
    },
    create: async (draft) =>
      templateFrom(
        await candidateEmailApi.create({
          kind: draft.kind,
          name: draft.name,
          subject: draft.subject,
          body: draft.body,
          ...(draft.isDefault ? { isDefault: true } : {}),
        }),
      ),
    update: async (id, patch) =>
      templateFrom(await candidateEmailApi.update(id, patch)),
    archive: async (id) => templateFrom(await candidateEmailApi.archive(id)),
    restore: async (id) => templateFrom(await candidateEmailApi.restore(id)),
    preview: async (request, signal) =>
      candidateEmailApi.preview(
        "templateId" in request
          ? {
              templateId: request.templateId,
              ...(request.subject !== undefined
                ? { subject: request.subject }
                : {}),
              ...(request.body !== undefined ? { body: request.body } : {}),
              ...(request.applicationId
                ? { applicationId: request.applicationId }
                : {}),
            }
          : {
              kind: request.kind,
              subject: request.subject,
              body: request.body,
              ...(request.applicationId
                ? { applicationId: request.applicationId }
                : {}),
            },
        signal,
      ),
    setEnabled: async (enabled) => {
      await careersApi.updateSettings({ candidateEmailsEnabled: enabled });
    },
  },

  retention: {
    report: async (signal) => {
      const [report, settings] = await Promise.all([
        candidateEmailApi.retention(signal),
        careersApi.getSettings(signal),
      ]);
      return { ...report, graceDays: settings.retention?.graceDays ?? 7 };
    },
    set: async (months) => {
      await careersApi.updateSettings({ retentionMonths: months });
    },
  },

  mine: {
    access: async (signal) => {
      const access = await candidateEmailApi.myAccess(signal);
      return {
        hasAnyAccess: access.hasAnyAccess,
        managing: access.hiringManagerOf.map((role) => ({
          requisitionId: role.requisitionId,
          reference: role.reference,
          jobTitle: role.jobTitle,
        })),
        paneling: access.panelOf.map((role) => ({
          requisitionId: role.requisitionId,
          reference: role.reference,
          jobTitle: role.jobTitle,
          stages: role.stages,
        })),
        interviewsInvitedTo: access.interviewsInvitedTo,
      };
    },
    interviews: async (query, signal) => {
      const page = await candidateEmailApi.myInterviews(
        {
          ...(query.awaitingMyScorecard ? { awaitingMyScorecard: true } : {}),
          page: query.page,
          pageSize: query.pageSize,
        },
        signal,
      );
      return {
        rows: page.data.map((row) => ({
          interviewId: row.interviewId,
          applicationId: row.applicationId,
          candidateName: row.candidateName,
          role: row.jobTitle,
          reference: row.requisitionReference,
          kind: kindLabel(row.kind),
          kindCode: row.kind,
          scheduledFor: row.scheduledFor,
          durationMins: row.durationMins,
          status: row.status,
          location: row.location,
          joinUrl: row.joinUrl ?? null,
          timeZone: row.timeZone ?? null,
          sequence: row.calendarSequence ?? 0,
          scorecardIn: row.myScorecardSubmitted,
        })),
        total: page.meta.total,
      };
    },
    applications: async (query, signal) => {
      const page = await candidateEmailApi.myApplications(
        {
          ...(query.includeClosed ? { includeClosed: true } : {}),
          page: query.page,
          pageSize: query.pageSize,
        },
        signal,
      );
      return {
        rows: page.data.map((row) => ({
          id: row.id,
          candidateName: row.candidateName,
          role: row.jobTitle,
          reference: row.requisitionReference,
          stageName: row.stageName,
          outcome: row.outcome,
          roles: roleLabels(row.roles),
          interviewsOfMine: row.myInterviews.filter((i) => i.iAmPanelist)
            .length,
          scorecardsOwed: row.myInterviews.filter(
            (i) =>
              i.iAmPanelist &&
              !i.myScorecardSubmitted &&
              (i.status === "SCHEDULED" || i.status === "COMPLETED"),
          ).length,
          hasCv: row.hasCv,
          ...fitOfCard(row),
        })),
        total: page.meta.total,
      };
    },
    application: async (id, signal) =>
      applicationFrom(await candidateEmailApi.myApplication(id, signal)),
    submitScorecard: async (interviewId, input) =>
      scorecardFrom(
        await candidateEmailApi.submitMyScorecard(interviewId, {
          recommendation: input.recommendation,
          ...(input.notes.trim() ? { notes: input.notes.trim() } : {}),
          ratings: input.ratings.map((rating) => ({
            competency: rating.competency,
            score: rating.score,
            weight: rating.weight,
            ...(rating.comment.trim()
              ? { comment: rating.comment.trim() }
              : {}),
          })),
        }),
      ),
    openCv: (applicationId) => candidateEmailApi.myCv(applicationId),
  },
};
