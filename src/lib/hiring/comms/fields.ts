import type {
  EmailKind,
  EmailKindInfo,
  EmailPreview,
  FieldProblem,
  MergeField,
} from "./model";

/**
 * The words a company may put in an email to a candidate, and how they are filled in.
 *
 * This is the **demo's** copy of the API's rules (`email-fields.ts` there). When a
 * company is connected the API owns them: the editor shows the list the API sends
 * and the preview comes from the API. They are written down here, with the same
 * sentences, so the offline editor refuses what the real one would and a person
 * trying it out learns the real rules.
 *
 * ## A fixed list, on purpose
 *
 * A template is merged with facts about a person and sent in the company's name.
 * The merge fields are the whole of what it may reach for: nine of them, and
 * nothing else. A field that is not on the list is refused when the template is
 * **saved**, not discovered when somebody is emailed `{salary}` as literal text.
 * A kind of email may use only the fields that exist at the moment it is sent: an
 * acknowledgement has no interview time.
 *
 * ## One pass
 *
 * Values are put in by one pass over the template and never read again. A brace
 * that is not part of a field is refused too: "we will send your {offer" is what a
 * half-typed field looks like.
 *
 * No React, no state.
 */

export const MERGE_FIELDS: readonly MergeField[] = [
  {
    name: "candidate_first_name",
    label: "The candidate's first name",
    sample: "Ada",
  },
  { name: "job_title", label: "The job's title", sample: "Operations Analyst" },
  {
    name: "company_name",
    label: "Your company's name",
    sample: "Your Company",
  },
  {
    name: "stage_name",
    label: "The stage they are now in",
    sample: "Interview",
  },
  {
    name: "reference",
    label: "The reference they were given",
    sample: "APP-7K3Q9M2X",
  },
  {
    name: "interview_time",
    label: "When their interview is",
    sample: "Tuesday 20 October 2026 at 10:00",
  },
  {
    name: "interview_location",
    label: "Where their interview is",
    sample: "Our Lagos office, 4th floor",
  },
  {
    name: "recruiter_name",
    label: "The person who sent it",
    sample: "Amina Yusuf",
  },
  {
    name: "reply_to",
    label: "Where replies go",
    sample: "people@example.com",
  },
];

const NAMES = new Set(MERGE_FIELDS.map((field) => field.name));

const COMMON = [
  "candidate_first_name",
  "job_title",
  "company_name",
  "reply_to",
] as const;

export const KINDS: readonly Omit<EmailKindInfo, "defaultTemplateId">[] = [
  {
    kind: "ACKNOWLEDGE",
    label: "Application received",
    when: "Sent when somebody applies, after the form is accepted.",
    fields: [...COMMON, "reference"],
    builtIn: {
      subject:
        "{company_name}: we received your application for {job_title} ({reference})",
      body:
        "Hello {candidate_first_name},\n\n" +
        "{company_name} has received your application for {job_title}. " +
        "If you need to get in touch about it, reply to this email and quote your reference, {reference}.",
    },
  },
  {
    kind: "INVITE",
    label: "Invitation to interview",
    when: "Sent when an interview is arranged, or when somebody is moved into an interview stage.",
    fields: [
      ...COMMON,
      "stage_name",
      "reference",
      "interview_time",
      "interview_location",
      "recruiter_name",
    ],
    builtIn: {
      subject: "{company_name}: your interview for {job_title}",
      body:
        "Hello {candidate_first_name},\n\n" +
        "{company_name} would like to meet you about {job_title}.\n\n" +
        "When: {interview_time}\nWhere: {interview_location}\n\n" +
        "If that time does not suit you, reply to this email as soon as you can.",
    },
  },
  {
    kind: "DECLINE",
    label: "Not taking them forward",
    when: "Sent when somebody is rejected and the person doing it asks for it to be sent.",
    fields: [...COMMON, "stage_name", "reference", "recruiter_name"],
    builtIn: {
      subject: "{company_name}: your application for {job_title}",
      body:
        "Hello {candidate_first_name},\n\n" +
        "Thank you for applying for {job_title} at {company_name} and for the time you put into it. " +
        "After careful consideration we will not be taking your application further on this occasion.\n\n" +
        "We wish you well with your search.",
    },
  },
  {
    kind: "OFFER_SENT",
    label: "Offer sent",
    when: "Sent when an offer goes out, if the person sending it asks for it to be.",
    fields: [...COMMON, "reference", "recruiter_name"],
    builtIn: {
      subject: "{company_name}: an update on your application for {job_title}",
      body:
        "Hello {candidate_first_name},\n\n" +
        "We are pleased to tell you that {company_name} would like to offer you the role of {job_title}. " +
        "Your offer is on its way to you, and {recruiter_name} will be in touch about it. " +
        "If you have any questions in the meantime, reply to this email.",
    },
  },
  {
    kind: "STAGE_UPDATE",
    label: "Update on their application",
    when: "A message for a stage that is none of the above, sent when somebody is moved into it.",
    fields: [...COMMON, "stage_name", "reference", "recruiter_name"],
    builtIn: {
      subject: "{company_name}: an update on your application for {job_title}",
      body:
        "Hello {candidate_first_name},\n\n" +
        "Your application for {job_title} at {company_name} has moved to the next stage: {stage_name}.\n\n" +
        "If you have any questions, reply to this email.",
    },
  },
];

export const SUBJECT_MAX = 150;
export const BODY_MAX = 5_000;
export const NAME_MAX = 80;
const MAX_FIELDS_PER_TEXT = 40;

const fieldList = (names: readonly string[]): string =>
  names.map((name) => `{${name}}`).join(", ");

type Token = { field: string };

/** The `{field}` tokens in a text, and where the first stray brace is. */
export function tokens(text: string): {
  tokens: Token[];
  stray: number | null;
} {
  const found: Token[] = [];
  let stray: number | null = null;
  let cursor = 0;
  const pattern = /\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const between = text.slice(cursor, match.index);
    const loose = between.search(/[{}]/);
    if (loose >= 0 && stray === null) stray = cursor + loose;
    found.push({ field: match[1] ?? "" });
    cursor = match.index + match[0].length;
  }
  const tail = text.slice(cursor).search(/[{}]/);
  if (tail >= 0 && stray === null) stray = cursor + tail;
  return { tokens: found, stray };
}

export function kindInfo(kind: EmailKind): (typeof KINDS)[number] {
  const found = KINDS.find((entry) => entry.kind === kind);
  if (!found) throw new Error(`Unknown email kind ${kind}`);
  return found;
}

function problemsIn(
  fieldName: "subject" | "body",
  text: string,
  kind: EmailKind,
): FieldProblem[] {
  const info = kindInfo(kind);
  const found = tokens(text);
  const problems: FieldProblem[] = [];
  const reported = new Set<string>();

  if (found.stray !== null) {
    const near = text
      .slice(Math.max(0, found.stray - 12), found.stray + 12)
      .replace(/\s+/g, " ");
    problems.push({
      field: fieldName,
      message:
        `There is a curly brace that is not part of a field, near "${near.trim()}". ` +
        `Braces are only for fields such as {job_title}. Fields you can use here: ${fieldList(info.fields)}.`,
    });
  }
  if (found.tokens.length > MAX_FIELDS_PER_TEXT) {
    problems.push({
      field: fieldName,
      message: `That uses ${String(found.tokens.length)} fields. Forty is the most one text can carry.`,
    });
  }
  for (const token of found.tokens) {
    if (reported.has(token.field)) continue;
    reported.add(token.field);
    if (!NAMES.has(token.field)) {
      problems.push({
        field: fieldName,
        message:
          `{${token.field}} is not a field you can use. ` +
          `The ones that exist, for this kind of email: ${fieldList(info.fields)}.`,
      });
    } else if (!info.fields.includes(token.field)) {
      const where = KINDS.filter((entry) => entry.fields.includes(token.field))
        .map((entry) => `"${entry.label}"`)
        .join(", ");
      problems.push({
        field: fieldName,
        message:
          `{${token.field}} cannot be used in a "${info.label}" email: ${info.when.toLowerCase()} ` +
          `It can be used in: ${where}.`,
      });
    }
  }
  return problems;
}

const isForbiddenControl = (char: string): boolean => {
  const code = char.charCodeAt(0);
  return (
    code === 0x7f ||
    (code < 0x20 && code !== 0x0a && code !== 0x09 && code !== 0x0d)
  );
};

/** Everything wrong with a subject and a body for one kind, each against its field. */
export function validateDraft(
  kind: EmailKind,
  input: { subject: string; body: string },
): FieldProblem[] {
  const problems: FieldProblem[] = [];
  if (/[\r\n]/.test(input.subject)) {
    problems.push({
      field: "subject",
      message: "A subject is one line. Take out the line break.",
    });
  }
  if (input.subject.trim().length === 0) {
    problems.push({ field: "subject", message: "Write a subject." });
  }
  if (input.subject.length > SUBJECT_MAX) {
    problems.push({
      field: "subject",
      message: `A subject is at most ${String(SUBJECT_MAX)} characters. This one is ${String(input.subject.length)}.`,
    });
  }
  if (input.body.trim().length === 0) {
    problems.push({ field: "body", message: "Write the message." });
  }
  if (input.body.length > BODY_MAX) {
    problems.push({
      field: "body",
      message: `A message is at most ${BODY_MAX.toLocaleString("en")} characters. This one is ${input.body.length.toLocaleString("en")}.`,
    });
  }
  if ([...input.subject, ...input.body].some((c) => isForbiddenControl(c))) {
    problems.push({
      field: "body",
      message: "That contains characters that are not text.",
    });
  }
  problems.push(
    ...problemsIn("subject", input.subject, kind),
    ...problemsIn("body", input.body, kind),
  );
  return problems;
}

/** One line, no control characters, single spaces: a value as it goes into an email. */
function cleanValue(raw: string, max = 200): string {
  return [...raw.replace(/[\t\n\r]+/g, " ")]
    .filter((char) => char.charCodeAt(0) >= 0x20 && char.charCodeAt(0) !== 0x7f)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export type Values = Partial<Record<string, string | null | undefined>>;

/** Puts values in by one pass. A field with no value is reported and left as it was. */
export function merge(
  text: string,
  values: Values,
  options: { multiline?: boolean } = {},
): { text: string; used: string[]; missing: string[] } {
  const used = new Set<string>();
  const missing = new Set<string>();
  const out = text.replace(/\{([^{}]*)\}/g, (whole, name: string) => {
    if (!NAMES.has(name)) return whole;
    used.add(name);
    const raw = values[name];
    const cleaned = raw ? cleanValue(raw) : "";
    if (cleaned === "") {
      missing.add(name);
      return whole;
    }
    return cleaned;
  });
  return {
    text: options.multiline ? out : out.replace(/\s+/g, " ").trim(),
    used: [...used],
    missing: [...missing],
  };
}

/** Made-up values, with the company's own name and reply-to in place of the placeholders. */
export function sampleValues(company: string, replyTo: string | null): Values {
  return Object.fromEntries(
    MERGE_FIELDS.map((field) => [
      field.name,
      field.name === "company_name"
        ? company
        : field.name === "reply_to"
          ? (replyTo ?? field.sample)
          : field.sample,
    ]),
  );
}

/** A body as paragraphs: blank lines separate them. */
export function paragraphsOf(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[ \t]+$/gm, "").trim())
    .filter((paragraph) => paragraph !== "");
}

/**
 * What the offline preview shows. Never an HTML email: the offline editor has no
 * renderer to promise one with, so it says what the words will be.
 */
export function previewOf(
  kind: EmailKind,
  input: { subject: string; body: string },
  values: Values,
  sample: boolean,
): EmailPreview {
  const errors = validateDraft(kind, input);
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      sample,
      subject: null,
      text: null,
      html: null,
      usedFields: [],
      missing: [],
    };
  }
  const subject = merge(input.subject, values);
  const body = merge(input.body, values, { multiline: true });
  return {
    valid: true,
    errors: [],
    sample,
    subject: subject.text,
    text: paragraphsOf(body.text).join("\n\n"),
    html: null,
    usedFields: [...new Set([...subject.used, ...body.used])],
    missing: [...new Set([...subject.missing, ...body.missing])],
  };
}
