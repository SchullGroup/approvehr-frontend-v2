/**
 * What an application form is made of, and the rules an answer has to meet.
 *
 * ## One definition, three readers
 *
 * The staff **builder** edits a `FormDefinition`, the public **form** and the
 * builder's **preview** both draw one, and all three call the same
 * `validateAnswers`. That is the whole point of this file being pure: "the preview
 * is exactly what an applicant sees" is true because it is the same component
 * given the same value, and "the preview complains about what the form will
 * complain about" is true because there is one function that complains.
 *
 * ## Why it lives under `lib/marketing`
 *
 * The public page is exported as a standalone site, and its import closure may not
 * reach the signed-in app (see `scripts/export-marketing.ts`). The builder can
 * import from here — the app may read the marketing surface — but not the other
 * way round, so the shared half sits on the side both can reach. No React, no
 * `fetch`, no environment: a function of its arguments.
 */

/* --------------------------------------------------------------------- kinds */

/** Every kind of question the form can ask. */
export type QuestionKind =
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "SINGLE_CHOICE"
  | "MULTI_CHOICE"
  | "YES_NO"
  | "NUMBER"
  | "URL"
  | "FILE";

export const QUESTION_KINDS: readonly QuestionKind[] = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "YES_NO",
  "NUMBER",
  "URL",
  "FILE",
];

/** What the builder calls each kind, and one line on what it is for. */
export const QUESTION_KIND_INFO: Record<
  QuestionKind,
  { label: string; hint: string }
> = {
  SHORT_TEXT: { label: "Short answer", hint: "A line of text." },
  LONG_TEXT: {
    label: "Long answer",
    hint: "A paragraph, with an optional word limit.",
  },
  SINGLE_CHOICE: { label: "Pick one", hint: "One option from a list." },
  MULTI_CHOICE: { label: "Pick several", hint: "Any number from a list." },
  YES_NO: { label: "Yes or no", hint: "Can flag the application for a look." },
  NUMBER: { label: "Number", hint: "Years of experience, notice period." },
  URL: { label: "Web link", hint: "A portfolio, a profile, a repository." },
  FILE: { label: "File", hint: "A certificate, a work sample." },
};

/** Which answer to a yes or no question flags the application for a look. */
export type KnockoutAnswer = "YES" | "NO";

/**
 * One choice. The `id` is stable and the label is not: relabelling an option on a
 * live form does not orphan the answers that already picked it.
 */
export type QuestionOption = { id: string; label: string };

export type FormQuestion = {
  /** Stable for the life of the question; answers are kept against it. */
  id: string;
  kind: QuestionKind;
  label: string;
  /** One line under the label. Empty for none. */
  helper: string;
  required: boolean;
  /** Long answers only. `null` for no limit. */
  wordLimit: number | null;
  /** Choice questions only. */
  options: QuestionOption[];
  /** Yes or no only. Flags the application for a person; never rejects anyone. */
  knockout: boolean;
  /** Yes or no only: the answer that raises the flag. */
  knockoutWhen: KnockoutAnswer;
  /** Number questions only. `null` for no bound. */
  min: number | null;
  max: number | null;
  /**
   * How many applications have answered it, from the API. Above zero its kind is
   * fixed — a yes or no that became a number would leave a column of answers that
   * mean nothing — and taking it off the form archives it rather than deleting it.
   * Absent on a question that has not been saved.
   */
  answered?: number;
};

/** How a standard box is treated on one posting. */
export type Presence = "OFF" | "OPTIONAL" | "REQUIRED";

export type FormDefinition = {
  /**
   * The boxes every application has. Name and email are always there and always
   * required — an application nobody can answer is not an application — so they
   * are not switches.
   */
  standard: {
    phone: Presence;
    /** The covering note, a text box. */
    coverNote: Presence;
    /** A file: the CV. */
    cv: Presence;
  };
  /**
   * The privacy notice and its checkbox. Not the advert's to switch: it is the
   * company's setting, carried here because the form draws it, and shown in the
   * builder as read-only.
   */
  consent: {
    enabled: boolean;
    /** The notice, as the applicant will be shown it. */
    text: string;
    /** The company's full policy, when it gave an address. */
    url: string | null;
    /** Which text it is (`default-1`, `custom-3`), so a record can say. */
    ref: string | null;
  };
  questions: FormQuestion[];
};

/* -------------------------------------------------------------------- limits */

/**
 * The API's own limits (`careers/form.ts`, `FORM_LIMITS`). The staff form read
 * returns them too; these are what the builder holds before that answer arrives
 * and what a test can lean on.
 */
export const LABEL_MAX = 300;
export const HELPER_MAX = 500;
export const SHORT_TEXT_MAX = 300;
export const LONG_TEXT_MAX_CHARS = 8_000;
export const URL_MAX = 500;
export const WORD_LIMIT_MIN = 1;
export const WORD_LIMIT_MAX = 1_000;
export const OPTION_MAX = 120;
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 30;
export const QUESTIONS_MAX = 20;
export const FILE_QUESTIONS_MAX = 3;
export const CONSENT_TEXT_MAX = 6_000;

/** What the box under a long answer should say it can take, in words. */
export const defaultWordLimit = 150;

/* ------------------------------------------------------------------ defaults */

export function defaultDefinition(): FormDefinition {
  return {
    standard: {
      phone: "OPTIONAL",
      coverNote: "OPTIONAL",
      cv: "OPTIONAL",
    },
    consent: { enabled: false, text: "", url: null, ref: null },
    questions: [],
  };
}

const randomId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

/** A fresh id for a question the builder adds. Stable once made. */
export function newQuestionId(): string {
  return `q_${randomId()}`;
}

/** A fresh id for an option the builder adds. Stable once made. */
export function newOptionId(): string {
  return `o_${randomId()}`;
}

export const blankOption = (label = ""): QuestionOption => ({
  id: newOptionId(),
  label,
});

export function blankQuestion(
  kind: QuestionKind,
  id: string = newQuestionId(),
): FormQuestion {
  return {
    id,
    kind,
    label: "",
    helper: "",
    required: false,
    wordLimit: kind === "LONG_TEXT" ? defaultWordLimit : null,
    options:
      kind === "SINGLE_CHOICE" || kind === "MULTI_CHOICE"
        ? [blankOption(), blankOption()]
        : [],
    knockout: false,
    knockoutWhen: "NO",
    min: null,
    max: null,
  };
}

/* --------------------------------------------------------------------- words */

/**
 * Words in a piece of text, the way a person counts them.
 *
 * Runs of anything that is not whitespace, so "well-known" is one word and a
 * line of dashes is none that matter. The server counts the same way; the box on
 * the form and the refusal from the API therefore cannot disagree about a limit.
 */
export function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

/* ------------------------------------------------------------------- answers */

/** A file already in storage, ready to be named in the application. */
export type UploadedFile = {
  /** The key the API issued. Never shown. */
  key: string;
  name: string;
  sizeBytes: number;
};

/**
 * What the applicant has put in one question.
 *
 * Text, a number typed as text, a link, "yes" or "no", one option, several
 * options, or a file. Numbers stay text until they are sent so that "1e" half way
 * through typing is not rewritten under somebody's fingers.
 */
export type AnswerValue = string | string[] | UploadedFile | null;
export type Answers = Record<string, AnswerValue>;

export const isUploadedFile = (value: AnswerValue): value is UploadedFile =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Has the applicant put anything in this question at all? */
export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * `http` or `https`, with a dotted host. Anything else is not a link to follow.
 *
 * `https://` is assumed when the applicant left it off, because the API assumes it
 * too and a form stricter than the API turns away an answer the API would have
 * kept. A scheme that is not web (`javascript:`, `ftp:`) is still refused, and so
 * is a link with a name and password in it.
 */
export function isWebLink(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > URL_MAX) return false;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.username === "" &&
      url.password === "" &&
      url.hostname.includes(".")
    );
  } catch {
    return false;
  }
}

/** A number as the API accepts it: optional minus, up to 15 digits, up to 6 decimals. */
export const NUMBER_PATTERN = /^-?\d{1,15}(?:\.\d{1,6})?$/;

/**
 * The refusals the form gives, one sentence per field, keyed by question id.
 *
 * Short and about what to do, not about what went wrong. An empty object means
 * every answer is acceptable.
 */
export function validateAnswers(
  questions: readonly FormQuestion[],
  answers: Answers,
): Record<string, string> {
  const problems: Record<string, string> = {};

  for (const question of questions) {
    const value = answers[question.id];
    const answered = isAnswered(value);

    if (!answered) {
      if (question.required) {
        problems[question.id] =
          question.kind === "FILE"
            ? "Attach a file."
            : question.kind === "SINGLE_CHOICE" || question.kind === "YES_NO"
              ? "Pick an answer."
              : question.kind === "MULTI_CHOICE"
                ? "Pick at least one."
                : "Answer this one.";
      }
      continue;
    }

    switch (question.kind) {
      case "SHORT_TEXT": {
        const text = String(value);
        if (text.length > SHORT_TEXT_MAX)
          problems[question.id] =
            `Keep it to ${SHORT_TEXT_MAX} characters or fewer.`;
        break;
      }
      case "LONG_TEXT": {
        const text = String(value);
        const words = countWords(text);
        if (question.wordLimit !== null && words > question.wordLimit) {
          const over = words - question.wordLimit;
          problems[question.id] =
            `That is ${over} ${over === 1 ? "word" : "words"} over the ${question.wordLimit} word limit.`;
        } else if (text.length > LONG_TEXT_MAX_CHARS) {
          problems[question.id] = "That is too long. Shorten it.";
        }
        break;
      }
      case "SINGLE_CHOICE": {
        if (!question.options.some((option) => option.id === String(value)))
          problems[question.id] = "Pick one of the options.";
        break;
      }
      case "MULTI_CHOICE": {
        const chosen = Array.isArray(value) ? value : [];
        if (
          chosen.some(
            (choice) =>
              !question.options.some((option) => option.id === choice),
          )
        )
          problems[question.id] = "Pick from the options given.";
        break;
      }
      case "YES_NO": {
        if (value !== "yes" && value !== "no")
          problems[question.id] = "Pick yes or no.";
        break;
      }
      case "NUMBER": {
        const text = String(value).trim();
        const number = Number(text);
        if (!NUMBER_PATTERN.test(text) || !Number.isFinite(number)) {
          problems[question.id] = "Enter a number.";
        } else if (question.min !== null && number < question.min) {
          problems[question.id] = `Enter ${question.min} or more.`;
        } else if (question.max !== null && number > question.max) {
          problems[question.id] = `Enter ${question.max} or fewer.`;
        }
        break;
      }
      case "URL": {
        if (!isWebLink(String(value)))
          problems[question.id] =
            "Enter a web address, like https://example.com/portfolio.";
        break;
      }
      case "FILE":
        break;
    }
  }

  return problems;
}

/* -------------------------------------------------------- a question, in text */

/**
 * An answer as one readable string, for a list row, an export or a test.
 *
 * Yes and no are capitalised, several options are joined, a file is its name.
 * Nothing here is sent anywhere: the wire has its own shape.
 */
export function answerText(
  value: AnswerValue | undefined,
  question?: Pick<FormQuestion, "kind" | "options">,
): string {
  if (value === undefined || value === null) return "";
  const labelOf = (id: string) =>
    question?.options.find((option) => option.id === id)?.label ?? id;
  if (typeof value === "string") {
    if (question?.kind === "YES_NO") {
      if (value === "yes") return "Yes";
      if (value === "no") return "No";
    }
    return question?.kind === "SINGLE_CHOICE" ? labelOf(value) : value;
  }
  if (Array.isArray(value)) return value.map(labelOf).join(", ");
  return value.name;
}

/* -------------------------------------------------------------------- checks */

/**
 * Whether a question that was added is ready to be saved, one sentence each.
 *
 * Used by the builder. It is not `validateAnswers`: this is about the *question*
 * being well formed, that is about an *answer* to it being acceptable.
 */
export function validateQuestions(
  questions: readonly FormQuestion[],
): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const question of questions) {
    const label = question.label.trim();
    if (label === "") {
      problems[question.id] = "Write the question.";
      continue;
    }
    if (label.length > LABEL_MAX) {
      problems[question.id] = `Keep the question to ${LABEL_MAX} characters.`;
      continue;
    }
    if (question.helper.length > HELPER_MAX) {
      problems[question.id] =
        `Keep the helper text to ${HELPER_MAX} characters.`;
      continue;
    }
    if (question.kind === "SINGLE_CHOICE" || question.kind === "MULTI_CHOICE") {
      const labels = question.options.map((option) => option.label.trim());
      const filled = labels.filter((label) => label !== "");
      if (labels.some((label) => label === "")) {
        problems[question.id] =
          "Fill in every option, or remove the empty one.";
      } else if (filled.length < OPTIONS_MIN) {
        problems[question.id] = `Give at least ${OPTIONS_MIN} options.`;
      } else if (filled.length > OPTIONS_MAX) {
        problems[question.id] = `Keep it to ${OPTIONS_MAX} options.`;
      } else if (
        new Set(filled.map((label) => label.toLowerCase())).size !==
        filled.length
      ) {
        problems[question.id] = "Two options are the same.";
      } else if (filled.some((label) => label.length > OPTION_MAX)) {
        problems[question.id] = `Keep each option to ${OPTION_MAX} characters.`;
      }
    }
    if (question.kind === "LONG_TEXT" && question.wordLimit !== null) {
      if (
        !Number.isInteger(question.wordLimit) ||
        question.wordLimit < WORD_LIMIT_MIN ||
        question.wordLimit > WORD_LIMIT_MAX
      ) {
        problems[question.id] =
          `A word limit is a whole number from ${WORD_LIMIT_MIN} to ${WORD_LIMIT_MAX}.`;
      }
    }
    if (
      question.kind === "NUMBER" &&
      question.min !== null &&
      question.max !== null &&
      question.min > question.max
    ) {
      problems[question.id] =
        "The smallest number has to be at most the largest.";
    }
  }
  return problems;
}

/** Problems with the form as a whole, other than a single question. */
export function validateDefinition(definition: FormDefinition): {
  questions: Record<string, string>;
  form: string | null;
} {
  const questions = validateQuestions(definition.questions);
  let form: string | null = null;
  if (definition.questions.length > QUESTIONS_MAX) {
    form = `A form can have ${QUESTIONS_MAX} questions at most.`;
  } else if (fileQuestions(definition.questions).length > FILE_QUESTIONS_MAX) {
    form = `A form can ask for ${FILE_QUESTIONS_MAX} file uploads at most, besides the CV.`;
  }
  return { questions, form };
}

/** True when nothing in the definition would be refused. */
export function isDefinitionValid(definition: FormDefinition): boolean {
  const { questions, form } = validateDefinition(definition);
  return form === null && Object.keys(questions).length === 0;
}

/* ------------------------------------------------------------------- editing */

/**
 * Pure edits on a list of questions. The builder uses these and nothing else, so
 * what a button does is a function with a test rather than a handler with a
 * closure.
 */
export function addQuestion(
  questions: readonly FormQuestion[],
  kind: QuestionKind,
): FormQuestion[] {
  return [...questions, blankQuestion(kind)];
}

export function updateQuestion(
  questions: readonly FormQuestion[],
  id: string,
  change: Partial<FormQuestion>,
): FormQuestion[] {
  return questions.map((question) =>
    question.id === id ? { ...question, ...change } : question,
  );
}

export function removeQuestion(
  questions: readonly FormQuestion[],
  id: string,
): FormQuestion[] {
  return questions.filter((question) => question.id !== id);
}

/** Move one question up (-1) or down (1). At either end, nothing moves. */
export function moveQuestion(
  questions: readonly FormQuestion[],
  id: string,
  direction: -1 | 1,
): FormQuestion[] {
  const from = questions.findIndex((question) => question.id === id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= questions.length) return [...questions];
  const next = [...questions];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

/**
 * Change a question's kind and keep what still makes sense.
 *
 * The label, helper and required flag survive; the settings that belong to the
 * old kind do not, and the settings the new kind needs are filled in with the
 * same defaults a fresh question gets.
 */
export function changeKind(
  question: FormQuestion,
  kind: QuestionKind,
): FormQuestion {
  if (question.kind === kind) return question;
  const fresh = blankQuestion(kind, question.id);
  const keepsOptions =
    (kind === "SINGLE_CHOICE" || kind === "MULTI_CHOICE") &&
    (question.kind === "SINGLE_CHOICE" || question.kind === "MULTI_CHOICE");
  return {
    ...fresh,
    label: question.label,
    helper: question.helper,
    required: question.required,
    options: keepsOptions ? question.options : fresh.options,
  };
}

/** The file boxes on a form, in the order they appear. */
export function fileQuestions(
  questions: readonly FormQuestion[],
): FormQuestion[] {
  return questions.filter((question) => question.kind === "FILE");
}
