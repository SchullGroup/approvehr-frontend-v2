import type {
  ApiAnswer,
  ApiApplicationDetail,
  ApiCareersSettings,
  ApiFieldMode,
  ApiForm,
  ApiFormQuestion,
  PutFormBody,
  PutFormQuestion,
} from "@/lib/api/careers";
import {
  QUESTION_KINDS,
  countWords,
  defaultDefinition,
  isWebLink,
  type FormDefinition,
  type FormQuestion,
  type Presence,
} from "@/lib/marketing/apply-form";
import {
  DUPLICATE_REASON,
  type AnswerRow,
  type ApplicationExtras,
  type DuplicateMarker,
} from "@/lib/hiring/answers-view";
import { formatBytes } from "@/lib/marketing/apply-files";

/**
 * The staff side of the application form, between the wire and the screens.
 *
 * Three jobs, all pure so they can be tested without a server:
 *
 * 1. **Form in** — the API's form for an advert becomes the `FormDefinition` the
 *    builder edits and the preview draws.
 * 2. **Form out** — a `FormDefinition` becomes the body of `PUT …/form`: the whole
 *    list, in order, and a question the API has not seen yet goes without an `id`.
 * 3. **Answers in** — an application's answers, consent and flags become the
 *    `ApplicationExtras` the screens show.
 */

/* --------------------------------------------------------------------- form in */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for an id the API minted. The builder's own are `q_…` and mean "new". */
export const isServerId = (id: string): boolean => UUID.test(id);

const presence = (mode: ApiFieldMode): Presence => mode;

function questionFromApi(question: ApiFormQuestion): FormQuestion {
  return {
    id: question.id,
    kind: question.kind,
    label: question.label,
    helper: question.helpText ?? "",
    required: question.required,
    wordLimit: question.maxWords,
    options: question.choices ?? [],
    knockout: question.knockout !== null,
    /* `flagWhen: false` means a "No" raises the flag. */
    knockoutWhen: question.knockout?.flagWhen === true ? "YES" : "NO",
    min: question.minValue,
    max: question.maxValue,
    answered: question.answerCount,
  };
}

/**
 * The API's form as the builder holds it. The consent half is the company's
 * setting, not the advert's, so it is passed in from the settings read.
 */
export function definitionFromApi(
  form: ApiForm,
  consent: ApiCareersSettings["consent"] | null = null,
): FormDefinition {
  return {
    standard: {
      phone: presence(form.settings.phoneMode),
      cv: presence(form.settings.cvMode),
      coverNote: presence(form.settings.coverNoteMode),
    },
    consent: consent?.required
      ? {
          enabled: true,
          text: consent.text,
          url: consent.url,
          ref: consent.version,
        }
      : defaultDefinition().consent,
    questions: form.questions
      .filter((question) => QUESTION_KINDS.includes(question.kind))
      .map(questionFromApi),
  };
}

/* -------------------------------------------------------------------- form out */

function questionToApi(question: FormQuestion): PutFormQuestion {
  const isChoice =
    question.kind === "SINGLE_CHOICE" || question.kind === "MULTI_CHOICE";
  const helper = question.helper.trim();
  return {
    ...(isServerId(question.id) ? { id: question.id } : {}),
    kind: question.kind,
    label: question.label.trim(),
    helpText: helper === "" ? null : helper,
    required: question.required,
    ...(question.kind === "LONG_TEXT" ? { maxWords: question.wordLimit } : {}),
    ...(question.kind === "NUMBER"
      ? { minValue: question.min, maxValue: question.max }
      : {}),
    ...(isChoice
      ? {
          choices: question.options.map((option) => ({
            id: option.id,
            label: option.label.trim(),
          })),
        }
      : {}),
    ...(question.kind === "YES_NO"
      ? {
          knockout: question.knockout
            ? { flagWhen: question.knockoutWhen === "YES" }
            : null,
        }
      : {}),
  };
}

/** The whole form as `PUT …/form` takes it. */
export function putBodyFromDefinition(definition: FormDefinition): PutFormBody {
  return {
    settings: {
      phoneMode: definition.standard.phone,
      cvMode: definition.standard.cv,
      coverNoteMode: definition.standard.coverNote,
    },
    questions: definition.questions.map(questionToApi),
  };
}

/**
 * Where a refusal from `PUT …/form` belongs.
 *
 * The API names a field `questions.<n>.<name>` — the position in the list that
 * was sent — so the n-th question in the definition is the one to mark. Anything
 * else (a problem with the list as a whole) comes back under `form`.
 */
export function problemsFromApi(
  details: readonly { field: string; message: string }[] | undefined,
  definition: FormDefinition,
): { questions: Record<string, string>; form: string | null } {
  const questions: Record<string, string> = {};
  let form: string | null = null;
  for (const detail of details ?? []) {
    const match = /^questions\.(\d+)(?:\.|$)/.exec(detail.field);
    const target = match?.[1]
      ? definition.questions[Number(match[1])]
      : undefined;
    if (target) {
      questions[target.id] ??= detail.message;
    } else {
      form ??= detail.message;
    }
  }
  return { questions, form };
}

/** Do two definitions say the same thing? Used by the unsaved-changes guard. */
export function sameDefinition(a: FormDefinition, b: FormDefinition): boolean {
  const strip = (definition: FormDefinition) => ({
    standard: definition.standard,
    questions: definition.questions.map((question) => ({
      ...question,
      /* How many people answered it is a fact about the world, not an edit. */
      answered: undefined,
    })),
  });
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/* ------------------------------------------------------------------ answers in */

function fileSentence(file: NonNullable<ApiAnswer["file"]>): string {
  const type = file.contentType
    ? file.contentType.includes("pdf")
      ? "PDF"
      : file.contentType.startsWith("image/")
        ? "Photo"
        : file.contentType.includes("word")
          ? "Word file"
          : file.contentType.includes("sheet") ||
              file.contentType.includes("excel")
            ? "Excel file"
            : "File"
    : "File";
  return file.sizeBytes ? `${type}, ${formatBytes(file.sizeBytes)}` : type;
}

function answerRow(
  answer: ApiAnswer,
  knockoutIds: ReadonlySet<string>,
): AnswerRow {
  const text = answer.file
    ? null
    : answer.display.trim() === ""
      ? null
      : answer.display;
  const isLong = answer.kind === "LONG_TEXT";
  return {
    id: answer.id,
    label: answer.question,
    kind: answer.kind,
    knockout:
      answer.flagged ||
      (answer.questionId !== null && knockoutIds.has(answer.questionId)),
    text,
    words: isLong && text !== null ? countWords(text) : null,
    link:
      answer.kind === "URL" && text !== null && isWebLink(text) ? text : null,
    file: answer.file
      ? {
          description: fileSentence(answer.file),
          sizeBytes: answer.file.sizeBytes,
          scanStatus: answer.file.scanStatus,
        }
      : null,
    flagged: answer.flagged,
    flagReason: answer.flagReason,
  };
}

const sourceLabel = (source: string | null): string | null => {
  if (!source) return null;
  const known: Record<string, string> = {
    "careers-page": "Careers page",
    linkedin: "LinkedIn",
    x: "X",
    whatsapp: "WhatsApp",
    facebook: "Facebook",
    email: "Email",
    instagram: "Instagram",
  };
  return known[source] ?? source;
};

export { sourceLabel };

function duplicateMarker(detail: ApiApplicationDetail): DuplicateMarker | null {
  /* The pointer stored when this one arrived looks backwards; the live list
     also finds later applications from the same person. Either is a marker. */
  const stored = detail.duplicate ?? null;
  const live = detail.likelyDuplicates?.[0] ?? null;
  const reason = (stored?.reason ?? live?.reason ?? null) as
    keyof typeof DUPLICATE_REASON | null;
  const ofId = stored?.ofId ?? live?.id ?? null;
  if (!reason || !ofId || !(reason in DUPLICATE_REASON)) return null;
  const match = detail.likelyDuplicates?.find((entry) => entry.id === ofId);
  return {
    reason,
    ofId,
    ofName: match?.name ?? null,
  };
}

/** What a recruiter reads of an application beyond the person and the CV. */
export function extrasFromDetail(
  detail: ApiApplicationDetail,
): ApplicationExtras {
  const answers = (detail.answers ?? []).map((answer) =>
    answerRow(answer, new Set()),
  );
  return {
    reference: detail.reference ?? null,
    source: sourceLabel(detail.source),
    answers,
    consent: detail.consent
      ? {
          acceptedOn: detail.consent.acceptedAt.slice(0, 10),
          noticeText: detail.consent.noticeText,
          noticeRef: detail.consent.noticeRef,
        }
      : null,
    flagCount:
      answers.filter((row) => row.flagged).length ||
      (detail.knockoutCount ?? 0),
    duplicate: duplicateMarker(detail),
  };
}

/** What a list row knows without fetching the whole application. */
export function summaryFromRow(row: {
  reference?: string | null | undefined;
  knockoutCount?: number | undefined;
  duplicate?: { ofId: string; reason: string } | null | undefined;
}): {
  reference: string | null;
  flagCount: number;
  duplicate: { ofId: string; reason: DuplicateMarker["reason"] } | null;
} {
  const reason = row.duplicate?.reason;
  return {
    reference: row.reference ?? null,
    flagCount: row.knockoutCount ?? 0,
    duplicate:
      row.duplicate && (reason === "SAME_EMAIL" || reason === "SAME_PHONE")
        ? { ofId: row.duplicate.ofId, reason }
        : null,
  };
}
