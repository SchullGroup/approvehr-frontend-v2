import type { EmailKind, EmailStatus, EmailTemplate } from "./model";

/**
 * What the offline book keeps for emails, panels, scorecards and retention.
 *
 * Plain data, no behaviour: `demo-ops.ts` holds it in the book and
 * `demo-comms-ops.ts` is the only thing that changes it.
 */

export type EmailTrigger = "STAGE_ENTRY" | "REJECTION" | "INTERVIEW" | "OFFER";

/** An email somebody asked for in the offline book. It is never actually sent. */
export type DemoEmail = {
  id: string;
  applicationId: string;
  kind: EmailKind;
  trigger: EmailTrigger;
  status: EmailStatus;
  note: string | null;
  subject: string | null;
  stageName: string | null;
  templateName: string | null;
  at: string;
};

/** The company's mail settings, as the offline book has them. */
export type DemoMail = {
  /** The company's own switch for emails to candidates. */
  enabled: boolean;
  replyTo: string | null;
  /** What `{company_name}` says. */
  companyName: string;
  /** The name in the `From:` line. */
  senderName: string;
};

export type DemoRetention = {
  months: number | null;
  /** ISO instant the period was set or last changed. */
  setAt: string | null;
};

/** A scorecard handed in by the person using the offline book. */
export type DemoScorecard = {
  interviewId: string;
  recommendation: "STRONG_YES" | "YES" | "NO" | "STRONG_NO" | null;
  notes: string;
  ratings: {
    competency: string;
    score: number;
    weight: number;
    comment: string;
  }[];
  submittedAt: string;
};

export type DemoComms = {
  emailTemplates: EmailTemplate[];
  emails: DemoEmail[];
  mail: DemoMail;
  retention: DemoRetention;
  scorecards: DemoScorecard[];
};
