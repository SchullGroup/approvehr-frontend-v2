"use client";

import { useSyncExternalStore } from "react";
import {
  APPLICATIONS,
  CANDIDATES,
  REQUISITIONS,
  SCORECARDS,
} from "@/lib/mock/hiring";
import { STAGES, type Application, type StageId } from "@/lib/types";
import { createPersistedState } from "@/lib/store/persisted";
import {
  DEMO_NOW,
  type DemoApp,
  type DemoBook,
  type DemoEvent,
  type DemoStage,
  type DemoTemplate,
  type Op,
} from "./demo-ops";
import type { EmailTemplate } from "@/lib/hiring/comms/model";
import type { DemoComms } from "@/lib/hiring/comms/state";
import type { RejectionReason, Tag } from "./model";
import { referenceFor } from "./reference";
import type { StageType } from "./stage-types";

/**
 * The demo's pipeline, kept in this browser.
 *
 * What the seeded hiring module could never do: a move that survives a refresh, a
 * tag that is still there on the next screen, a template edited and then used. The
 * book is built once from the same seed every other demo hiring screen reads, so
 * the board, the record and the overview agree about who is who, and then it is
 * the browser's own.
 *
 * Everything below `seedBook` is behind `DEMO_ENABLED`, so a production build holds
 * an empty book and none of the invented people, reasons or templates.
 */

/* --------------------------------------------------------------------- seed */

const STAGE_TYPE_OF: Record<StageId, StageType> = {
  sourced: "APPLIED",
  shortlisted: "SCREENING",
  prescreen: "SCREENING",
  interview: "INTERVIEW",
  selection: "OFFER",
};

const SOURCE_OF: Record<string, string> = {
  careers_page: "careers-page",
  referral: "referral",
  linkedin: "linkedin",
  agency: "agency",
  sourced: "sourced",
};

export const DEMO_TEMPLATES: DemoTemplate[] = !DEMO_ENABLED
  ? []
  : [
      {
        id: "tpl-standard",
        name: "Standard hiring",
        isDefault: true,
        stages: [
          {
            id: "ts-1",
            name: "Applied",
            type: "APPLIED",
            requiresScorecards: false,
          },
          {
            id: "ts-2",
            name: "Phone screen",
            type: "SCREENING",
            requiresScorecards: false,
          },
          {
            id: "ts-3",
            name: "Assessment",
            type: "TEST",
            requiresScorecards: false,
          },
          {
            id: "ts-4",
            name: "Interview",
            type: "INTERVIEW",
            requiresScorecards: true,
          },
          {
            id: "ts-5",
            name: "Offer",
            type: "OFFER",
            requiresScorecards: false,
          },
          {
            id: "ts-6",
            name: "Hired",
            type: "HIRED",
            requiresScorecards: false,
          },
          {
            id: "ts-7",
            name: "Rejected",
            type: "REJECTED",
            requiresScorecards: false,
          },
        ],
      },
      {
        id: "tpl-quick",
        name: "Quick hire",
        isDefault: false,
        stages: [
          {
            id: "tq-1",
            name: "Applied",
            type: "APPLIED",
            requiresScorecards: false,
          },
          {
            id: "tq-2",
            name: "Interview",
            type: "INTERVIEW",
            requiresScorecards: true,
          },
          {
            id: "tq-3",
            name: "Offer",
            type: "OFFER",
            requiresScorecards: false,
          },
          {
            id: "tq-4",
            name: "Hired",
            type: "HIRED",
            requiresScorecards: false,
          },
          {
            id: "tq-5",
            name: "Rejected",
            type: "REJECTED",
            requiresScorecards: false,
          },
        ],
      },
      {
        id: "tpl-bootcamp",
        name: "Boot camp intake",
        isDefault: false,
        stages: [
          {
            id: "tb-1",
            name: "Applied",
            type: "APPLIED",
            requiresScorecards: false,
          },
          {
            id: "tb-2",
            name: "Online assessment",
            type: "TEST",
            requiresScorecards: false,
          },
          {
            id: "tb-3",
            name: "Panel interview",
            type: "INTERVIEW",
            requiresScorecards: true,
          },
          {
            id: "tb-4",
            name: "Admitted",
            type: "HIRED",
            requiresScorecards: false,
          },
          {
            id: "tb-5",
            name: "Not admitted",
            type: "REJECTED",
            requiresScorecards: false,
          },
        ],
      },
    ];

export const DEMO_TAGS: Tag[] = !DEMO_ENABLED
  ? []
  : [
      { id: "tag-1", name: "Strong CV" },
      { id: "tag-2", name: "Call back later" },
      { id: "tag-3", name: "Referred by staff" },
      { id: "tag-4", name: "Needs a reference check" },
    ];

export const DEMO_REASONS: RejectionReason[] = !DEMO_ENABLED
  ? []
  : [
      { id: "reason-1", label: "Does not meet the must-haves", active: true },
      {
        id: "reason-2",
        label: "Salary expectation above the band",
        active: true,
      },
      { id: "reason-3", label: "Cannot start in time", active: true },
      {
        id: "reason-4",
        label: "Did not do well in the assessment",
        active: true,
      },
      { id: "reason-5", label: "Did not attend the interview", active: true },
      { id: "reason-6", label: "The role has been filled", active: true },
    ];

export const DEMO_EMAIL_TEMPLATES: EmailTemplate[] = !DEMO_ENABLED
  ? []
  : [
      {
        id: "etpl-1",
        kind: "STAGE_UPDATE",
        kindLabel: "Update on their application",
        name: "Moved to the next stage",
        subject:
          "{company_name}: an update on your application for {job_title}",
        body:
          "Hello {candidate_first_name},\n\n" +
          "Your application for {job_title} has moved to the next stage: {stage_name}.\n\n" +
          "If you have any questions, reply to this email.",
        isDefault: true,
        archived: false,
        usedByStages: 0,
      },
      {
        id: "etpl-2",
        kind: "INVITE",
        kindLabel: "Invitation to interview",
        name: "Interview invitation",
        subject: "{company_name}: your interview for {job_title}",
        body:
          "Hello {candidate_first_name},\n\n" +
          "We would like to meet you about {job_title}.\n\n" +
          "When: {interview_time}\nWhere: {interview_location}\n\n" +
          "If that time does not suit you, reply to this email as soon as you can.",
        isDefault: true,
        archived: false,
        usedByStages: 0,
      },
      {
        id: "etpl-3",
        kind: "DECLINE",
        kindLabel: "Not taking them forward",
        name: "Kind decline",
        subject: "{company_name}: your application for {job_title}",
        body:
          "Hello {candidate_first_name},\n\n" +
          "Thank you for the time you put into applying for {job_title}. " +
          "We will not be taking your application further this time, and we wish you well.",
        isDefault: true,
        archived: false,
        usedByStages: 0,
      },
    ];

export const DEMO_COMMS: DemoComms = !DEMO_ENABLED
  ? {
      emailTemplates: [],
      emails: [],
      mail: {
        enabled: true,
        replyTo: null,
        companyName: "Your company",
        senderName: "Your company",
      },
      retention: { months: null, setAt: null },
      scorecards: [],
    }
  : {
      emailTemplates: DEMO_EMAIL_TEMPLATES,
      emails: [],
      mail: {
        enabled: true,
        replyTo: "people@schull.io",
        companyName: "Schull Technologies",
        senderName: "Schull Technologies",
      },
      retention: { months: null, setAt: null },
      scorecards: [],
    };

function seedStages(): DemoStage[] {
  return REQUISITIONS.flatMap((requisition) => {
    const used = STAGES.filter((stage) =>
      requisition.activeStages.includes(stage.id),
    );
    const open: DemoStage[] = used.map((stage, order) => ({
      id: `${requisition.id}:${stage.id}`,
      requisitionId: requisition.id,
      name: stage.label,
      order,
      type: STAGE_TYPE_OF[stage.id],
      requiresScorecards: stage.id === "interview",
      /* One stage of each kind sends a message, so the move-and-tell choice has
         something to ask about, and the interview one has a panel to show. */
      ...(stage.id === "shortlisted" ? { emailTemplateId: "etpl-1" } : {}),
      ...(stage.id === "interview"
        ? { emailTemplateId: "etpl-2", panel: ["p-05", "p-01"] }
        : {}),
    }));
    return [
      ...open,
      {
        id: `${requisition.id}:hired`,
        requisitionId: requisition.id,
        name: "Hired",
        order: open.length,
        type: "HIRED" as const,
        requiresScorecards: false,
      },
      {
        id: `${requisition.id}:rejected`,
        requisitionId: requisition.id,
        name: "Rejected",
        order: open.length + 1,
        type: "REJECTED" as const,
        requiresScorecards: false,
      },
    ];
  });
}

function seedApp(
  application: Application,
  index: number,
  stages: DemoStage[],
): DemoApp | null {
  const candidate = CANDIDATES.find((c) => c.id === application.candidateId);
  if (!candidate) return null;

  const own = stages.filter(
    (s) => s.requisitionId === application.requisitionId,
  );
  const terminal = (type: StageType) => own.find((s) => s.type === type);
  const stage =
    application.outcome === "hired"
      ? terminal("HIRED")
      : application.outcome === "in_progress"
        ? (own.find(
            (s) => s.id === `${application.requisitionId}:${application.stage}`,
          ) ?? own[0])
        : terminal("REJECTED");
  if (!stage) return null;

  const createdAt = `${application.appliedAt}T09:00:00.000Z`;
  const stageEnteredAt = `${application.stageEnteredAt}T09:00:00.000Z`;
  const entry = own[0];
  const history: DemoEvent[] = [
    {
      id: `${application.id}-e1`,
      kind: "SCREENED_IN",
      fromStage: null,
      toStage: entry?.name ?? null,
      note: null,
      at: createdAt,
      by: "A recruiter",
    },
  ];
  if (entry && stage.id !== entry.id) {
    history.push({
      id: `${application.id}-e2`,
      kind:
        application.outcome === "rejected"
          ? "REJECTED"
          : application.outcome === "withdrawn"
            ? "WITHDRAWN"
            : application.outcome === "hired"
              ? "HIRED"
              : "STAGE_MOVED",
      fromStage: entry.name,
      toStage: stage.name,
      note: application.rejectionReason ?? null,
      at: stageEnteredAt,
      by: "A recruiter",
    });
  }

  const tagIds: string[] = [];
  if (index % 7 === 0) tagIds.push("tag-1");
  if (index % 9 === 4) tagIds.push("tag-2");
  if (candidate.source === "referral") tagIds.push("tag-3");
  if (index % 11 === 6) tagIds.push("tag-4");

  return {
    id: application.id,
    requisitionId: application.requisitionId,
    candidateId: candidate.id,
    name: `${candidate.firstName} ${candidate.lastName}`,
    email: candidate.email,
    reference: referenceFor(application.id),
    source: SOURCE_OF[candidate.source] ?? null,
    flagged: index % 8 === 3,
    duplicate: index % 17 === 5,
    tagIds,
    talentPool: application.outcome !== "in_progress" && index % 3 === 0,
    stageId: stage.id,
    createdAt,
    stageEnteredAt,
    outcome:
      application.outcome === "hired"
        ? "HIRED"
        : application.outcome === "rejected"
          ? "REJECTED"
          : application.outcome === "withdrawn"
            ? "WITHDRAWN"
            : "IN_PROGRESS",
    rejection:
      application.outcome === "rejected" || application.outcome === "withdrawn"
        ? {
            label:
              application.rejectionReason ??
              (application.outcome === "withdrawn"
                ? "Withdrew from the process"
                : "Does not meet the must-haves"),
            note: null,
            at: stageEnteredAt,
          }
        : null,
    history,
  };
}

const EMPTY_BOOK: DemoBook = {
  ...DEMO_COMMS,
  stages: [],
  apps: [],
  tags: [],
  reasons: [],
  templates: [],
  queue: {},
  unscored: [],
};

function seedBook(): DemoBook {
  if (!DEMO_ENABLED) return EMPTY_BOOK;
  const stages = seedStages();
  return {
    ...DEMO_COMMS,
    stages,
    apps: APPLICATIONS.flatMap((application, index) => {
      const app = seedApp(application, index, stages);
      return app ? [app] : [];
    }),
    tags: DEMO_TAGS,
    reasons: DEMO_REASONS,
    templates: DEMO_TEMPLATES,
    queue: {},
    unscored: SCORECARDS.filter((card) => card.submittedAt === null).map(
      (card) => card.applicationId,
    ),
  };
}

/* -------------------------------------------------------------------- store */

/** Bump when the book's shape changes: an old payload is dropped, not merged. */
const BOOK_VERSION = 2;

export const demoPipeline = createPersistedState<DemoBook>({
  key: "approvehr.hiring.pipeline.store",
  empty: seedBook(),
  version: BOOK_VERSION,
});

/** The book, for rendering. Re-renders when anything changes it. */
export function useDemoBook(): DemoBook {
  return useSyncExternalStore(
    demoPipeline.subscribe,
    demoPipeline.read,
    demoPipeline.getServerSnapshot,
  );
}

/**
 * Run a write against the book and keep the result.
 *
 * Read with `current()`, never `read()`: until something subscribes `read()` is
 * the seed, and committing a write computed from it would throw away everything
 * this browser had stored. See `persisted.ts`.
 */
export function demoRun<T>(write: (book: DemoBook) => Op<T>): Op<T> {
  const result = write(demoPipeline.current());
  if (result.ok) demoPipeline.commit(result.book);
  return result;
}

export { DEMO_NOW };
