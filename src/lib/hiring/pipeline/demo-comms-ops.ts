import { TODAY } from "@/lib/today";
import { INTERVIEWS, REQUISITIONS, SCORECARDS } from "@/lib/mock/hiring";
import {
  KINDS,
  MERGE_FIELDS,
  kindInfo,
  merge,
  previewOf,
  sampleValues,
  validateDraft,
  type Values,
} from "@/lib/hiring/comms/fields";
import type {
  EmailCatalog,
  EmailDraft,
  EmailKind,
  EmailNotice,
  EmailPreview,
  EmailTemplate,
  FieldProblem,
  PanelMember,
  PreviewRequest,
  RetentionLine,
  RetentionReport,
  SentEmail,
  StageSetting,
} from "@/lib/hiring/comms/model";
import { becauseOf } from "@/lib/hiring/comms/status";
import { scoreOfRatings } from "@/lib/hiring/comms/score";
import type { DemoEmail, EmailTrigger } from "@/lib/hiring/comms/state";
import type { DemoApp, DemoBook, Op } from "./demo-ops";

/**
 * The offline book's emails, panels and retention, as plain functions over a plain
 * object: each takes the book and returns the next one.
 *
 * ## Nothing is ever sent from here
 *
 * An offline book has no mail transport. So when somebody asks for an email — by
 * moving a card into a stage that has a message, or by ticking "send a decline" —
 * the book records that they asked and records that it was **not sent**, with the
 * reason, in the API's own words. It runs the same checks the API's worker does
 * (switched off, no reply-to address, a field with no value) so the offline log
 * teaches the real reasons. It never says an email went out.
 */

const NOW = `${TODAY}T09:00:00.000Z`;

const fail = (error: string): { ok: false; error: string } => ({
  ok: false,
  error,
});

const DAY_MS = 24 * 60 * 60_000;

/** Days after setting a retention period before anything is deleted on its strength. */
export const GRACE_DAYS = 7;

/* ------------------------------------------------------------------ templates */

const cleanName = (name: string): string => name.trim().replace(/\s+/g, " ");

/** Stages (of roles and of pipeline templates) that send a template. */
export function usedBy(book: DemoBook, templateId: string): number {
  const own = book.stages.filter(
    (stage) => stage.emailTemplateId === templateId,
  ).length;
  const templated = book.templates.reduce(
    (sum, template) =>
      sum +
      template.stages.filter((stage) => stage.emailTemplateId === templateId)
        .length,
    0,
  );
  return own + templated;
}

const withUsage = (book: DemoBook, template: EmailTemplate): EmailTemplate => ({
  ...template,
  usedByStages: usedBy(book, template.id),
});

export function catalogOf(book: DemoBook): EmailCatalog {
  const live = (kind: EmailKind): string | null =>
    book.emailTemplates.find(
      (template) =>
        template.kind === kind && template.isDefault && !template.archived,
    )?.id ?? null;
  return {
    fields: [...MERGE_FIELDS],
    kinds: KINDS.map((entry) => ({
      ...entry,
      fields: [...entry.fields],
      defaultTemplateId: live(entry.kind),
    })),
    templates: [...book.emailTemplates]
      .sort(
        (a, b) =>
          a.kind.localeCompare(b.kind) ||
          Number(b.isDefault) - Number(a.isDefault) ||
          a.name.localeCompare(b.name),
      )
      .map((template) => withUsage(book, template)),
    sender: {
      name: book.mail.senderName,
      registeredName: book.mail.companyName,
      displayNameAccepted: null,
      replyTo: book.mail.replyTo,
    },
  };
}

/**
 * What is wrong with a draft, before it is saved: each problem against its field,
 * and a name that is already taken as a conflict (the API says that one as a
 * sentence about the whole thing, not about a field).
 */
export function checkDraft(
  book: DemoBook,
  draft: Pick<EmailDraft, "kind" | "name" | "subject" | "body">,
  exceptId?: string,
): { problems: FieldProblem[]; conflict: string | null } {
  const problems = validateDraft(draft.kind, draft);
  const name = cleanName(draft.name);
  if (name.length < 2)
    problems.unshift({ field: "name", message: "Give the template a name." });
  else if (name.length > 80)
    problems.unshift({
      field: "name",
      message: "Keep the name to 80 characters.",
    });
  const clash = book.emailTemplates.find(
    (template) =>
      template.id !== exceptId &&
      template.name.toLowerCase() === name.toLowerCase(),
  );
  return {
    problems,
    conflict: clash
      ? clash.archived
        ? `There is already an archived template called "${name}". Restore it, or choose another name.`
        : `There is already a template called "${name}".`
      : null,
  };
}

const nextId = (book: DemoBook): string => {
  let n = book.emailTemplates.length + 1;
  while (book.emailTemplates.some((t) => t.id === `etpl-${String(n)}`)) n += 1;
  return `etpl-${String(n)}`;
};

function makeDefault(
  templates: EmailTemplate[],
  id: string,
  kind: EmailKind,
): EmailTemplate[] {
  return templates.map((template) =>
    template.kind !== kind
      ? template
      : { ...template, isDefault: template.id === id },
  );
}

export function createEmailTemplate(
  book: DemoBook,
  draft: EmailDraft,
): Op<EmailTemplate> {
  const template: EmailTemplate = {
    id: nextId(book),
    kind: draft.kind,
    kindLabel: kindInfo(draft.kind).label,
    name: cleanName(draft.name),
    subject: draft.subject.trim(),
    body: draft.body.trim(),
    isDefault: false,
    archived: false,
    usedByStages: 0,
  };
  const templates = draft.isDefault
    ? makeDefault([...book.emailTemplates, template], template.id, draft.kind)
    : [...book.emailTemplates, template];
  return {
    ok: true,
    book: { ...book, emailTemplates: templates },
    value: withUsage(
      { ...book, emailTemplates: templates },
      templates.find((t) => t.id === template.id) as EmailTemplate,
    ),
  };
}

export function updateEmailTemplate(
  book: DemoBook,
  id: string,
  patch: Partial<Pick<EmailDraft, "name" | "subject" | "body" | "isDefault">>,
): Op<EmailTemplate> {
  const existing = book.emailTemplates.find((t) => t.id === id);
  if (!existing) return fail("That email template is not here any more.");
  if (existing.archived)
    return fail("That template is archived. Restore it before changing it.");
  let templates = book.emailTemplates.map((template) =>
    template.id !== id
      ? template
      : {
          ...template,
          ...(patch.name !== undefined ? { name: cleanName(patch.name) } : {}),
          ...(patch.subject !== undefined
            ? { subject: patch.subject.trim() }
            : {}),
          ...(patch.body !== undefined ? { body: patch.body.trim() } : {}),
          ...(patch.isDefault === false ? { isDefault: false } : {}),
        },
  );
  if (patch.isDefault === true)
    templates = makeDefault(templates, id, existing.kind);
  const next = { ...book, emailTemplates: templates };
  return {
    ok: true,
    book: next,
    value: withUsage(next, templates.find((t) => t.id === id) as EmailTemplate),
  };
}

export function archiveEmailTemplate(
  book: DemoBook,
  id: string,
): Op<EmailTemplate> {
  const existing = book.emailTemplates.find((t) => t.id === id);
  if (!existing) return fail("That email template is not here any more.");
  const used = usedBy(book, id);
  if (used > 0)
    return fail(
      `${String(used)} ${used === 1 ? "stage sends" : "stages send"} this email. ` +
        "Point them at another template, or at none, before archiving it.",
    );
  const templates = book.emailTemplates.map((t) =>
    t.id === id ? { ...t, archived: true, isDefault: false } : t,
  );
  const next = { ...book, emailTemplates: templates };
  return {
    ok: true,
    book: next,
    value: withUsage(next, templates.find((t) => t.id === id) as EmailTemplate),
  };
}

export function restoreEmailTemplate(
  book: DemoBook,
  id: string,
): Op<EmailTemplate> {
  const existing = book.emailTemplates.find((t) => t.id === id);
  if (!existing) return fail("That email template is not here any more.");
  const templates = book.emailTemplates.map((t) =>
    t.id === id ? { ...t, archived: false } : t,
  );
  const next = { ...book, emailTemplates: templates };
  return {
    ok: true,
    book: next,
    value: withUsage(next, templates.find((t) => t.id === id) as EmailTemplate),
  };
}

/** What a draft would look like. Written to nothing; never throws for a half-typed field. */
export function previewDraft(
  book: DemoBook,
  request: PreviewRequest,
  valuesFor: (applicationId: string) => Values | null,
): EmailPreview {
  let kind: EmailKind;
  let subject: string;
  let body: string;
  if ("templateId" in request) {
    const template = book.emailTemplates.find(
      (t) => t.id === request.templateId,
    );
    if (!template) {
      return {
        valid: false,
        errors: [
          {
            field: "body",
            message: "That email template is not here any more.",
          },
        ],
        sample: true,
        subject: null,
        text: null,
        html: null,
        usedFields: [],
        missing: [],
      };
    }
    kind = template.kind;
    subject = request.subject ?? template.subject;
    body = request.body ?? template.body;
  } else {
    kind = request.kind;
    subject = request.subject;
    body = request.body;
  }
  const real = request.applicationId ? valuesFor(request.applicationId) : null;
  const values = real ?? sampleValues(book.mail.companyName, book.mail.replyTo);
  return previewOf(kind, { subject, body }, values, real === null);
}

/* ---------------------------------------------------------------------- stages */

export function setStageEmail(
  book: DemoBook,
  stageId: string,
  templateId: string | null,
): Op {
  const stage = book.stages.find((s) => s.id === stageId);
  if (!stage) return fail("That stage is not here any more.");
  if (templateId) {
    const template = book.emailTemplates.find((t) => t.id === templateId);
    if (!template || template.archived)
      return fail("That email template does not exist, or has been archived.");
  }
  return {
    ok: true,
    book: {
      ...book,
      stages: book.stages.map((s) =>
        s.id === stageId ? { ...s, emailTemplateId: templateId } : s,
      ),
    },
    value: undefined,
  };
}

export function setStagePanel(
  book: DemoBook,
  stageId: string,
  employeeIds: readonly string[],
): Op {
  const stage = book.stages.find((s) => s.id === stageId);
  if (!stage) return fail("That stage is not here any more.");
  if (stage.type !== "INTERVIEW")
    return fail(
      `"${stage.name}" is not an interview stage, so it has no panel. Only an interview stage does.`,
    );
  const wanted = [...new Set(employeeIds)];
  if (wanted.length > 20) return fail("A panel is at most 20 people.");
  return {
    ok: true,
    book: {
      ...book,
      stages: book.stages.map((s) =>
        s.id === stageId ? { ...s, panel: wanted } : s,
      ),
    },
    value: undefined,
  };
}

export function stageSettings(
  book: DemoBook,
  requisitionId: string,
  nameOf: (employeeId: string) => PanelMember,
): StageSetting[] {
  return book.stages
    .filter((stage) => stage.requisitionId === requisitionId)
    .sort((a, b) => a.order - b.order)
    .map((stage) => ({
      stageId: stage.id,
      name: stage.name,
      order: stage.order,
      type: stage.type,
      emailTemplateId: stage.emailTemplateId ?? null,
      panel:
        stage.type === "INTERVIEW" ? (stage.panel ?? []).map(nameOf) : null,
    }));
}

/* ----------------------------------------------------------------- owing email */

type Spec = {
  kind: EmailKind;
  trigger: EmailTrigger;
  stageName: string | null;
  /** The template named, else the company's default for the kind, else the built-in. */
  templateId: string | null;
};

const NOT_SENT = {
  companyOff:
    "not sent: emails to candidates are switched off for this company",
  noReplyTo:
    "not sent: no reply-to address is set for this company (Careers settings). " +
    "We do not send an email whose replies would go nowhere",
  practice: "not sent: nothing is sent from a practice board",
} as const;

const WHY_MISSING: Record<string, string> = {
  interview_time: "no interview is scheduled for them",
  interview_location: "no interview is scheduled for them",
  reference:
    "they did not apply through the careers page, so they were never given a reference",
};

/**
 * Records that an email was asked for, and that it was not sent, and why.
 *
 * The same checks, in the same order, as the API's worker: the company's switch,
 * the reply-to address, then a field with no value. Past all of them the only
 * reason left is that a practice board has no mail.
 */
export function owe(
  book: DemoBook,
  app: DemoApp,
  spec: Spec,
): { book: DemoBook; notice: EmailNotice } {
  const template = spec.templateId
    ? book.emailTemplates.find((t) => t.id === spec.templateId)
    : book.emailTemplates.find(
        (t) => t.kind === spec.kind && t.isDefault && !t.archived,
      );
  const wording = template ?? kindInfo(spec.kind).builtIn;

  const values: Values = {
    candidate_first_name: app.name.split(" ")[0] ?? "",
    job_title:
      REQUISITIONS.find((role) => role.id === app.requisitionId)?.title ?? "",
    company_name: book.mail.companyName,
    stage_name: spec.stageName,
    reference: app.reference,
    recruiter_name: "You",
    reply_to: book.mail.replyTo,
  };
  const missing = [
    ...new Set([
      ...merge(wording.subject, values).missing,
      ...merge(wording.body, values, { multiline: true }).missing,
    ]),
  ];

  let note: string;
  if (!book.mail.enabled) note = NOT_SENT.companyOff;
  else if (!book.mail.replyTo) note = NOT_SENT.noReplyTo;
  else if (missing.length > 0)
    note =
      `not sent: this email uses ${missing.map((m) => `{${m}}`).join(", ")} and ` +
      [
        ...new Set(
          missing.map((m) => WHY_MISSING[m] ?? "it has no value here"),
        ),
      ].join("; ");
  else note = NOT_SENT.practice;

  const entry: DemoEmail = {
    id: `demo-mail-${String(book.emails.length + 1)}`,
    applicationId: app.id,
    kind: spec.kind,
    trigger: spec.trigger,
    status: "SKIPPED",
    note,
    subject: null,
    stageName: spec.stageName,
    templateName: template?.name ?? null,
    at: NOW,
  };
  return {
    book: { ...book, emails: [...book.emails, entry] },
    notice: { status: "SKIPPED", note, kindLabel: kindInfo(spec.kind).label },
  };
}

export function emailsOf(book: DemoBook, applicationId: string): SentEmail[] {
  return book.emails
    .filter((email) => email.applicationId === applicationId)
    .map((email) => ({
      id: email.id,
      kindLabel: kindInfo(email.kind).label,
      status: email.status,
      note: email.note,
      subject: email.subject,
      stageName: email.stageName,
      templateName: email.templateName,
      sentAt: null,
      createdAt: email.at,
      because: becauseOf(email.trigger, email.stageName),
    }));
}

/* ----------------------------------------------------------------- the scores */

/** An application's seeded score: the figure the API would put on its card. */
export function scoreFor(applicationId: string): number | null {
  const figures: number[] = [];
  for (const interview of INTERVIEWS) {
    if (interview.applicationId !== applicationId) continue;
    if (interview.status !== "scheduled" && interview.status !== "completed")
      continue;
    const cards = SCORECARDS.filter(
      (card) =>
        card.applicationId === applicationId &&
        card.submittedAt !== null &&
        interview.interviewerIds.includes(card.interviewerId),
    )
      .map((card) =>
        scoreOfRatings(
          card.ratings.map((rating) => ({ ...rating, weight: 1 })),
        ),
      )
      .filter((value): value is number => value !== null);
    if (cards.length === 0) continue;
    figures.push(cards.reduce((sum, value) => sum + value, 0) / cards.length);
  }
  if (figures.length === 0) return null;
  const mean = figures.reduce((sum, value) => sum + value, 0) / figures.length;
  return Math.round(mean * 100) / 100;
}

/* ------------------------------------------------------------------ retention */

const addMonths = (date: Date, months: number): Date => {
  const out = new Date(date.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0),
  ).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
};

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

const graceEnds = (book: DemoBook): Date | null =>
  book.retention.months === null || book.retention.setAt === null
    ? null
    : new Date(new Date(book.retention.setAt).getTime() + GRACE_DAYS * DAY_MS);

export function setRetention(book: DemoBook, months: number | null): Op {
  if (months !== null) {
    if (!Number.isInteger(months)) return fail("Months are a whole number.");
    if (months < 1)
      return fail("At least a month, or clear it to keep rejected candidates.");
    if (months > 120)
      return fail(
        "Ten years is the longest this takes. Clear it to keep them.",
      );
  }
  if (months === book.retention.months)
    return { ok: true, book, value: undefined };
  return {
    ok: true,
    book: {
      ...book,
      retention: {
        months,
        setAt: months === null ? null : NOW,
      },
    },
    value: undefined,
  };
}

/** The day a rejected person's record is scheduled to go, or why there is no day. */
export function retentionLine(book: DemoBook, app: DemoApp): RetentionLine {
  const months = book.retention.months;
  if (months === null) return { scheduledDeletionOn: null, reason: "none_set" };
  const mine = book.apps.filter(
    (other) => other.candidateId === app.candidateId,
  );
  if (mine.some((other) => other.outcome === "HIRED"))
    return { scheduledDeletionOn: null, reason: "hired" };
  if (
    mine.some(
      (other) =>
        other.outcome === "IN_PROGRESS" || other.outcome === "OFFER_MADE",
    )
  )
    return { scheduledDeletionOn: null, reason: "still_active" };
  if (mine.some((other) => other.talentPool))
    return { scheduledDeletionOn: null, reason: "talent_pool" };
  const closed = Math.max(
    ...mine.map((other) =>
      new Date(other.rejection?.at ?? other.stageEnteredAt).getTime(),
    ),
  );
  const due = addMonths(new Date(closed), months);
  const grace = graceEnds(book);
  const on = grace && grace.getTime() > due.getTime() ? grace : due;
  return { scheduledDeletionOn: isoDay(on), reason: null };
}

/** What a purge would do today, written to nothing. */
export function retentionReport(book: DemoBook): RetentionReport {
  const months = book.retention.months;
  const grace = graceEnds(book);
  const base: RetentionReport = {
    months,
    setAt: book.retention.setAt,
    purgeFrom: grace ? isoDay(grace) : null,
    purgeActive: grace !== null && grace.getTime() <= new Date(NOW).getTime(),
    mode: "report",
    due: { candidates: 0, declinedApplications: 0 },
    dueWithin30Days: { candidates: 0, declinedApplications: 0 },
    heldInTalentPool: 0,
    graceDays: GRACE_DAYS,
  };
  if (months === null) return base;

  const now = new Date(NOW);
  const cutoff = addMonths(now, -months);
  const soon = addMonths(new Date(now.getTime() + 30 * DAY_MS), -months);

  /* One person at a time: everybody's applications have to have ended. */
  const byPerson = new Map<string, DemoApp[]>();
  for (const app of book.apps) {
    const list = byPerson.get(app.candidateId) ?? [];
    list.push(app);
    byPerson.set(app.candidateId, list);
  }
  let due = 0;
  let soonCount = 0;
  let held = 0;
  for (const apps of byPerson.values()) {
    const ended = apps.every(
      (app) => app.outcome === "REJECTED" || app.outcome === "WITHDRAWN",
    );
    if (!ended) continue;
    const last = Math.max(
      ...apps.map((app) =>
        new Date(app.rejection?.at ?? app.stageEnteredAt).getTime(),
      ),
    );
    const pooled = apps.some((app) => app.talentPool);
    if (last <= cutoff.getTime()) {
      if (pooled) held += 1;
      else due += 1;
    } else if (last <= soon.getTime() && !pooled) {
      soonCount += 1;
    }
  }
  return {
    ...base,
    due: { candidates: due, declinedApplications: 0 },
    dueWithin30Days: { candidates: soonCount, declinedApplications: 0 },
    heldInTalentPool: held,
  };
}
