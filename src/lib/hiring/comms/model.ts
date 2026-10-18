import type { ApplicationOutcome, InterviewKind } from "@/lib/api/recruitment";
import type { StageType } from "@/lib/hiring/pipeline/stage-types";
import type { FitSummary } from "@/lib/hiring/screening/model";

/**
 * What the email, panel, panelist and retention screens draw, whichever side it
 * came from.
 *
 * `api-comms.ts` turns the API's answers into these and `demo-comms.ts` makes them
 * from a book kept in this browser, so a screen has one code path and cannot
 * quietly behave differently offline.
 *
 * No React, no state.
 */

/* ------------------------------------------------------------------ the emails */

/**
 * What a kind of email is called. The ones this screen knows by name are listed; the
 * API may send more (the editor draws whatever kinds it is given), so any other word
 * is a kind too and is never refused here.
 */
export type KnownEmailKind =
  | "ACKNOWLEDGE"
  | "INVITE"
  | "DECLINE"
  | "OFFER_SENT"
  | "STAGE_UPDATE"
  | "INTERVIEW_UPDATE"
  | "INTERVIEW_CANCELLED"
  | "PANELIST_INVITE"
  | "PANELIST_UPDATE"
  | "PANELIST_CANCELLED";
export type EmailKind = KnownEmailKind | (string & Record<never, never>);

/** One of the few words a template may put in curly braces. */
export type MergeField = {
  /** What goes between the braces: `job_title`. */
  name: string;
  /** In words: "The job's title". */
  label: string;
  /** What it looks like in a preview made with no real person. */
  sample: string;
  /**
   * Empty is allowed: a line of the message that uses it and has no value is left out
   * and the email still goes. Not for a subject, which is one line and cannot lose it.
   */
  optional?: boolean;
};

/** A kind of email: when it goes, what it may use, and what is sent if the company wrote nothing. */
export type EmailKindInfo = {
  kind: EmailKind;
  label: string;
  /** "Sent when somebody applies, after the form is accepted." */
  when: string;
  /** Who gets it: the candidate, or somebody on an interview's panel. Absent: the candidate. */
  audience?: "CANDIDATE" | "PANELIST";
  /** The only fields that exist at that moment. */
  fields: string[];
  builtIn: { subject: string; body: string };
  defaultTemplateId: string | null;
};

export type EmailTemplate = {
  id: string;
  kind: EmailKind;
  kindLabel: string;
  name: string;
  subject: string;
  body: string;
  /** What an action that names no template sends, for its kind. */
  isDefault: boolean;
  archived: boolean;
  /** Stages that send it. Archiving is refused while it is not zero. */
  usedByStages: number;
};

/** Whose name emails go out in, and where replies go. Read-only: it is not typed here. */
export type EmailSender = {
  name: string;
  registeredName: string;
  /** `null` when there is no careers display name to decide about. */
  displayNameAccepted: boolean | null;
  replyTo: string | null;
  /** Why the careers display name was not used, when it was not. */
  note?: string | null;
};

export type EmailCatalog = {
  fields: MergeField[];
  kinds: EmailKindInfo[];
  templates: EmailTemplate[];
  sender: EmailSender | null;
};

export type EmailDraft = {
  kind: EmailKind;
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
};

/** A problem with one field of a draft, in words the person can act on. */
export type FieldProblem = { field: string; message: string };

export type EmailPreview = {
  /** False when the text as written would be refused on save. */
  valid: boolean;
  errors: FieldProblem[];
  /** The values are made up, not a real person's. */
  sample: boolean;
  subject: string | null;
  /** The message as plain text, one paragraph per blank line. */
  text: string | null;
  /** The email as it is sent. Only the API makes it; shown inside a sandboxed frame. */
  html: string | null;
  usedFields: string[];
  /** Fields the text uses that have no value for this person: it would not be sent. */
  missing: string[];
};

export type PreviewRequest =
  | {
      templateId: string;
      subject?: string;
      body?: string;
      applicationId?: string;
    }
  | {
      kind: EmailKind;
      subject: string;
      body: string;
      applicationId?: string;
    };

/** Whether emails would actually leave, and in whose name. */
export type EmailReadiness = {
  /**
   * The server knows about emails to candidates at all. When it does not, the
   * screens leave out every choice about them rather than offer one it cannot keep.
   */
  supported: boolean;
  /** The company's own switch. */
  enabled: boolean;
  /** Everything needed is in place, so an email asked for would be sent. */
  willSend: boolean;
  /** Why not, as sentences. */
  blockedBy: string[];
  sender: EmailSender | null;
};

/* -------------------------------------------------------- what an application had */

export type EmailStatus = "PENDING" | "SENDING" | "SENT" | "SKIPPED" | "FAILED";

/** One email an application has had or is owed. */
export type SentEmail = {
  id: string;
  kindLabel: string;
  status: EmailStatus;
  /** Why it was not sent, or is waiting. */
  note: string | null;
  subject: string | null;
  stageName: string | null;
  templateName: string | null;
  sentAt: string | null;
  createdAt: string;
  /** What asked for it: "You moved them into Interview". */
  because: string;
};

/**
 * What the API says about the one email an action owed.
 *
 * `null` is "no email was asked for or owed". A screen says an email went out only
 * for `SENT`, and says "queued" for anything still on its way.
 */
export type EmailNotice = {
  status: EmailStatus;
  note: string | null;
  kindLabel: string;
} | null;

/** A single move, and what became of the email it owed. */
export type MoveResult = { email: EmailNotice };

/* --------------------------------------------------------------------- stages */

export type PanelMember = {
  /** `null` for an invited account, who has no employee record. */
  employeeId: string | null;
  userId: string | null;
  kind: "EMPLOYEE" | "ACCOUNT";
  name: string;
  /** Staff only. An invited account has no job title in the company. */
  jobTitle: string;
};

/** A role's stage as the email and panel settings read it. */
export type StageSetting = {
  stageId: string;
  name: string;
  order: number;
  type: StageType | null;
  /** The email a person moving somebody here sends. */
  emailTemplateId: string | null;
  /** The people who sit on it. `null` for a stage that has none: only interviews do. */
  panel: PanelMember[] | null;
};

/* ---------------------------------------------------------------- the score */

export type ScoreLine = {
  interviewId: string;
  kind: string;
  composite: number | null;
  scorecards: {
    interviewerId: string;
    composite: number | null;
    recommendation: string | null;
  }[];
};

/** An application's interview score and how it was reached. */
export type ScoreSummary = {
  outOf: number;
  /** `null` while nothing has been scored. Never 0. */
  composite: number | null;
  interviews: ScoreLine[];
  recommendations: {
    STRONG_YES: number;
    YES: number;
    NO: number;
    STRONG_NO: number;
  };
  byCompetency: { competency: string; average: number; ratings: number }[];
  scorecardsSubmitted: number;
};

/* ------------------------------------------------------------------ retention */

export type RetentionReport = {
  months: number | null;
  setAt: string | null;
  /** Nothing is deleted before this day. */
  purgeFrom: string | null;
  purgeActive: boolean;
  mode: "delete" | "report" | "off";
  due: { candidates: number; declinedApplications: number };
  dueWithin30Days: { candidates: number; declinedApplications: number };
  heldInTalentPool: number;
  /** The grace period, in days, that follows setting or changing it. */
  graceDays: number;
};

/** On a record: the day somebody is scheduled to go, or why there is no day. */
export type RetentionLine = {
  /** `YYYY-MM-DD`. */
  scheduledDeletionOn: string | null;
  reason: "none_set" | "talent_pool" | "still_active" | "hired" | null;
};

/* ---------------------------------------------------- the panelist's own door */

export type MyAccess = {
  hasAnyAccess: boolean;
  /** Roles they hire for: they see everybody on them. */
  managing: { requisitionId: string; reference: string; jobTitle: string }[];
  /** Roles whose interview stages they sit on. */
  paneling: {
    requisitionId: string;
    reference: string;
    jobTitle: string;
    stages: string[];
  }[];
  interviewsInvitedTo: number;
};

/**
 * Where the nudges to hand in a scorecard stand, for a panelist who owes one. Said only
 * where the API says it: absent is "not said", never "no nudges".
 */
export type MyNudges = {
  /** How many have gone for this interview. */
  sent: number;
  /** The most there will be. */
  of: number;
  lastAt: string | null;
  /** When the next is due, if one is. */
  nextAt: string | null;
  /** Somebody turned the reminders for this interview off. */
  off: boolean;
};

export type MyInterviewRow = {
  interviewId: string;
  applicationId: string;
  candidateName: string;
  role: string;
  reference: string;
  kind: string;
  /** The kind as the API names it, for the calendar entry's title. */
  kindCode?: InterviewKind;
  scheduledFor: string;
  durationMins: number;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  location: string | null;
  /** An https link to join, when the interview is online and a person pasted one. */
  joinUrl?: string | null;
  /** The zone its time is written in: absent is the company's own. */
  timeZone?: string | null;
  /** The calendar sequence: goes up with each change a calendar is told about. */
  sequence?: number;
  scorecardIn: boolean;
  /** The nudges to hand it in, when one is owed. */
  nudges?: MyNudges | null;
};

export type MyInterviewPage = { rows: MyInterviewRow[]; total: number };

export type MyApplicationRow = {
  id: string;
  candidateName: string;
  role: string;
  reference: string;
  stageName: string | null;
  outcome: ApplicationOutcome;
  /** "Hiring manager" and "Interview panel", so a row says why they can see it. */
  roles: string[];
  interviewsOfMine: number;
  scorecardsOwed: number;
  hasCv: boolean;
  /**
   * The fit score, only where the job lets this person see scores. **Absent**, not
   * empty, where it does not: nothing is drawn for it.
   */
  fit?: FitSummary;
};

export type MyApplicationPage = { rows: MyApplicationRow[]; total: number };

export type MyScorecard = {
  id: string;
  by: string | null;
  recommendation: string | null;
  notes: string | null;
  submitted: boolean;
  composite: number | null;
  ratings: {
    competency: string;
    score: number;
    weight: number;
    comment: string | null;
  }[];
};

export type MyApplication = {
  id: string;
  /** Name, never contact details. */
  candidateName: string;
  role: string;
  reference: string;
  stageName: string | null;
  outcome: ApplicationOutcome;
  roles: string[];
  hasCv: boolean;
  interviews: {
    id: string;
    kind: string;
    kindCode?: InterviewKind;
    scheduledFor: string;
    durationMins: number;
    status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
    location: string | null;
    joinUrl?: string | null;
    timeZone?: string | null;
    sequence?: number;
    nudges?: MyNudges | null;
    stageName: string | null;
    iAmPanelist: boolean;
    panel: {
      employeeId: string | null;
      userId: string | null;
      name: string;
      submitted: boolean;
    }[];
    mine: MyScorecard | null;
    /** Everybody's. Only a hiring manager is given them: scoring is blind. */
    everyones: MyScorecard[] | null;
  }[];
  /** Only a hiring manager is given the score. */
  score: ScoreSummary | null;
  /**
   * The fit score and the reasons for it, only where the job lets this person see
   * scores. **Absent** where it does not: nothing is drawn, not even a box.
   */
  screening?: {
    fit: FitSummary;
    coverage: number | null;
    reasons: string | null;
  };
};

export type ScorecardInput = {
  recommendation: "STRONG_YES" | "YES" | "NO" | "STRONG_NO" | null;
  notes: string;
  ratings: {
    competency: string;
    score: number;
    weight: number;
    comment: string;
  }[];
};
