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
    name: "join_link",
    label:
      "The link to join an online interview (left out of the line when there is none)",
    sample: "https://meet.google.com/abc-defg-hij",
    optional: true,
  },
  {
    name: "interview_date",
    label: "The day of their interview",
    sample: "Tuesday 20 October 2026",
  },
  {
    name: "interview_time_zone",
    label: "The time zone its time is in",
    sample: "Lagos time (WAT)",
  },
  {
    name: "interview_duration",
    label: "How long it is expected to take",
    sample: "1 hour",
  },
  {
    name: "add_to_calendar_link",
    label: "A link that adds the interview to Google Calendar",
    sample: "https://calendar.google.com/calendar/render?action=TEMPLATE",
  },
  {
    name: "add_to_outlook_link",
    label: "A link that adds the interview to Outlook",
    sample: "https://outlook.live.com/calendar/0/deeplink/compose",
  },
  {
    name: "candidate_name",
    label: "The candidate's full name (emails to the panel only)",
    sample: "Ada Okafor",
  },
  {
    name: "panelist_first_name",
    label: "The panelist's first name (emails to the panel only)",
    sample: "Chidi",
  },
  {
    name: "scorecard_link",
    label:
      "Where the panelist hands in their scorecard (emails to the panel only)",
    sample: "https://app.example.com/hiring/my-interviews",
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
const OPTIONAL = new Set(
  MERGE_FIELDS.filter((field) => field.optional).map((field) => field.name),
);

const COMMON = [
  "candidate_first_name",
  "job_title",
  "company_name",
  "reply_to",
] as const;

/** What there is to say about an interview once one is arranged. */
const INTERVIEW_FACTS = [
  "interview_time",
  "interview_date",
  "interview_time_zone",
  "interview_location",
  "interview_duration",
  "join_link",
  "add_to_calendar_link",
  "add_to_outlook_link",
] as const;

/** What an email to somebody on the panel may say: the candidate by name, and nothing of their contact details. */
const PANELIST_COMMON = [
  "panelist_first_name",
  "candidate_name",
  "candidate_first_name",
  "job_title",
  "company_name",
  "reply_to",
  "stage_name",
  "recruiter_name",
] as const;

const CALENDAR_LINES =
  "Add it to your calendar:\n" +
  "Google Calendar: {add_to_calendar_link}\n" +
  "Outlook: {add_to_outlook_link}";

export const KINDS: readonly Omit<EmailKindInfo, "defaultTemplateId">[] = [
  {
    kind: "ACKNOWLEDGE",
    label: "Application received",
    when: "Sent when somebody applies, after the form is accepted.",
    audience: "CANDIDATE",
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
    when: "Sent when an interview is arranged and the person arranging it asks for the candidate to be told, or when somebody is moved into an interview stage. A calendar file is attached when it is for a particular interview.",
    audience: "CANDIDATE",
    fields: [
      ...COMMON,
      "stage_name",
      "reference",
      "recruiter_name",
      ...INTERVIEW_FACTS,
    ],
    builtIn: {
      subject: "{company_name}: your interview for {job_title}",
      body:
        "Hello {candidate_first_name},\n\n" +
        "{company_name} would like to meet you about {job_title}.\n\n" +
        "When: {interview_time}\nWhere: {interview_location}\nJoin online: {join_link}\n\n" +
        `${CALENDAR_LINES}\n\n` +
        "If that time does not suit you, reply to this email as soon as you can.",
    },
  },
  {
    kind: "INTERVIEW_UPDATE",
    label: "Interview changed",
    when: "Sent when an interview the candidate was invited to is changed (its time, length, place or join link) and the person changing it asks for the candidate to be told. A calendar file with the new details is attached.",
    audience: "CANDIDATE",
    fields: [
      ...COMMON,
      "stage_name",
      "reference",
      "recruiter_name",
      ...INTERVIEW_FACTS,
    ],
    builtIn: {
      subject: "{company_name}: your interview for {job_title} has changed",
      body:
        "Hello {candidate_first_name},\n\n" +
        "The details of your interview for {job_title} at {company_name} have changed. Please use these new details.\n\n" +
        "When: {interview_time}\nWhere: {interview_location}\nJoin online: {join_link}\n\n" +
        `${CALENDAR_LINES}\n\n` +
        "If the new time does not suit you, reply to this email as soon as you can.",
    },
  },
  {
    kind: "INTERVIEW_CANCELLED",
    label: "Interview cancelled",
    when: "Sent when an interview the candidate was invited to is cancelled and the person cancelling it asks for the candidate to be told. A calendar file that removes it is attached.",
    audience: "CANDIDATE",
    fields: [
      ...COMMON,
      "stage_name",
      "reference",
      "recruiter_name",
      "interview_time",
      "interview_date",
      "interview_time_zone",
      "interview_location",
    ],
    builtIn: {
      subject:
        "{company_name}: your interview for {job_title} has been cancelled",
      body:
        "Hello {candidate_first_name},\n\n" +
        "Your interview for {job_title} at {company_name}, which was due on {interview_time}, has been cancelled. We are sorry for the change.\n\n" +
        "If you have any questions, reply to this email.",
    },
  },
  {
    kind: "PANELIST_INVITE",
    label: "Invitation to the panel",
    when: "Sent to each person on the panel when an interview is arranged and the person arranging it asks for the panel to be told. Their own calendar file is attached.",
    audience: "PANELIST",
    fields: [...PANELIST_COMMON, ...INTERVIEW_FACTS, "scorecard_link"],
    builtIn: {
      subject:
        "{company_name}: interview with {candidate_name} for {job_title}",
      body:
        "Hello {panelist_first_name},\n\n" +
        "You have been asked to take part in an interview for {job_title} at {company_name}.\n\n" +
        "Candidate: {candidate_name}\nWhen: {interview_time}\nWhere: {interview_location}\nJoin online: {join_link}\nLength: {interview_duration}\n\n" +
        `${CALENDAR_LINES}\n\n` +
        "Afterwards, hand in your scorecard in ApproveHR: {scorecard_link}",
    },
  },
  {
    kind: "PANELIST_UPDATE",
    label: "Interview changed (panel)",
    when: "Sent to each person on the panel when an interview is changed and the person changing it asks for the panel to be told. Their own calendar file with the new details is attached.",
    audience: "PANELIST",
    fields: [...PANELIST_COMMON, ...INTERVIEW_FACTS, "scorecard_link"],
    builtIn: {
      subject: "{company_name}: interview with {candidate_name} has changed",
      body:
        "Hello {panelist_first_name},\n\n" +
        "The details of your interview with {candidate_name} for {job_title} have changed. Please use these new details.\n\n" +
        "When: {interview_time}\nWhere: {interview_location}\nJoin online: {join_link}\nLength: {interview_duration}\n\n" +
        CALENDAR_LINES,
    },
  },
  {
    kind: "PANELIST_CANCELLED",
    label: "Interview cancelled (panel)",
    when: "Sent to each person on the panel who was told about an interview, when it is cancelled and the person cancelling it asks for the panel to be told. A calendar file that removes it is attached.",
    audience: "PANELIST",
    fields: [
      ...PANELIST_COMMON,
      "interview_time",
      "interview_date",
      "interview_time_zone",
      "interview_location",
    ],
    builtIn: {
      subject:
        "{company_name}: interview with {candidate_name} has been cancelled",
      body:
        "Hello {panelist_first_name},\n\n" +
        "The interview with {candidate_name} for {job_title} at {company_name}, which was due on {interview_time}, has been cancelled. " +
        "You do not need to attend, and there is no scorecard to hand in for it.",
    },
  },
  {
    kind: "INTERVIEW_REMINDER_CANDIDATE",
    label: "Reminder of an interview",
    when: "Sent shortly before an interview to a candidate who was sent its invitation (at the times set in Hiring settings; 24 hours and 1 hour before unless changed). Never sent as the first email about an interview.",
    audience: "CANDIDATE",
    fields: [...COMMON, "recruiter_name", ...INTERVIEW_FACTS],
    builtIn: {
      subject: "{company_name}: a reminder of your interview for {job_title}",
      body:
        "Hello {candidate_first_name},\n\n" +
        "This is a reminder of your interview for {job_title} at {company_name}.\n\n" +
        "When: {interview_time}\nWhere: {interview_location}\nJoin online: {join_link}\n\n" +
        "If you need to change the time, reply to this email or write to {reply_to}.",
    },
  },
  {
    kind: "INTERVIEW_REMINDER_PANELIST",
    label: "Reminder of an interview (panel)",
    when: "Sent shortly before an interview to a person on its panel who was sent its invitation (an hour before unless changed in Hiring settings; a day before is off unless switched on).",
    audience: "PANELIST",
    fields: [...PANELIST_COMMON, ...INTERVIEW_FACTS, "scorecard_link"],
    builtIn: {
      subject:
        "{company_name}: a reminder of your interview with {candidate_name}",
      body:
        "Hello {panelist_first_name},\n\n" +
        "This is a reminder of your interview with {candidate_name} for {job_title} at {company_name}.\n\n" +
        "When: {interview_time}\nWhere: {interview_location}\nJoin online: {join_link}\nLength: {interview_duration}\n\n" +
        "Afterwards, hand in your scorecard in ApproveHR: {scorecard_link}",
    },
  },
  {
    kind: "SCORECARD_NUDGE",
    label: "Scorecard to hand in",
    when: "Sent to a person on the panel who has not handed in a scorecard, a day after the interview ends and again at most three days after (the times are set in Hiring settings). Never after they have handed one in, or if the interview was cancelled.",
    audience: "PANELIST",
    fields: [
      ...PANELIST_COMMON,
      "interview_time",
      "interview_date",
      "interview_time_zone",
      "scorecard_link",
    ],
    builtIn: {
      subject: "{company_name}: your scorecard for {candidate_name}",
      body:
        "Hello {panelist_first_name},\n\n" +
        "Your interview with {candidate_name} for {job_title} was on {interview_date}, and your scorecard has not been handed in yet. You can do it in ApproveHR: {scorecard_link}\n\n" +
        "If you were not able to take part, reply to this email and say so.",
    },
  },
  {
    kind: "DECLINE",
    label: "Not taking them forward",
    when: "Sent when somebody is rejected and the person doing it asks for it to be sent.",
    audience: "CANDIDATE",
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
    audience: "CANDIDATE",
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
    audience: "CANDIDATE",
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

/**
 * What a kind is called, for a kind the API may have added since this was written:
 * its own name in words when it is not one this screen knows. Never throws.
 */
export function kindLabelOf(kind: string): string {
  const known = KINDS.find((entry) => entry.kind === kind);
  if (known) return known.label;
  const words = kind.toLowerCase().replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Email";
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
    } else if (fieldName === "subject" && OPTIONAL.has(token.field)) {
      problems.push({
        field: fieldName,
        message:
          `{${token.field}} cannot be used in a subject. It is empty for some interviews, ` +
          "and a subject is one line that cannot lose it. Use it in the message instead.",
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

/**
 * Puts values in by one pass. A field with no value is reported and left as it was,
 * except an optional one in a message: the line it was on is left out and the email goes.
 */
export function merge(
  text: string,
  values: Values,
  options: { multiline?: boolean } = {},
): { text: string; used: string[]; missing: string[] } {
  const used = new Set<string>();
  const missing = new Set<string>();
  /* Stands in for an optional field with no value, so the line it was on can be found
     and dropped after the pass. `cleanValue` removes it from any value, so it cannot
     come from one. */
  const DROP = "\u0000";
  const out = text.replace(/\{([^{}]*)\}/g, (whole, name: string) => {
    if (!NAMES.has(name)) return whole;
    used.add(name);
    const raw = values[name];
    const cleaned = raw ? cleanValue(raw) : "";
    if (cleaned === "") {
      if (options.multiline && OPTIONAL.has(name)) return DROP;
      missing.add(name);
      return whole;
    }
    return cleaned;
  });
  const kept = out.includes(DROP)
    ? out
        .split("\n")
        .filter((line) => !line.includes(DROP))
        .join("\n")
    : out;
  return {
    text: options.multiline ? kept : kept.replace(/\s+/g, " ").trim(),
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
