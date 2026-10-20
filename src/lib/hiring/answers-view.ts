import { countWords, type QuestionKind } from "@/lib/marketing/apply-form";

/**
 * What a recruiter reads of an application beyond the person's name and CV.
 *
 * A view-model, not the wire: `lib/api/careers.ts` turns what the API sends into
 * this, and the screens that show answers — the queue row, the candidate's page —
 * draw only this. So the way an answer is worded, a word counted or a flag phrased
 * is decided once, here, and a change to the wire is one mapping.
 */

export type AnswerFile = {
  /** What it is, in words: "PDF, 54 KB". The API does not keep the file's own name. */
  description: string;
  sizeBytes: number | null;
  /** What the virus check made of it, when the API says. */
  scanStatus: string | null;
};

export type AnswerRow = {
  id: string;
  /** The question as the applicant saw it, kept with the answer. */
  label: string;
  kind: QuestionKind;
  /** Whether the question was a knockout when it was asked. */
  knockout: boolean;
  /** The answer in words. `null` when they left it blank. */
  text: string | null;
  /** Long answers only. */
  words: number | null;
  /** A web link answer, already checked to be http(s). */
  link: string | null;
  file: AnswerFile | null;
  /** The answer raised a flag. A reason to look, never a verdict. */
  flagged: boolean;
  flagReason: string | null;
};

export type ConsentRecord = {
  /** `YYYY-MM-DD`. */
  acceptedOn: string;
  /** The notice exactly as the applicant was shown it. */
  noticeText: string;
  noticeRef: string | null;
};

export type DuplicateMarker = {
  reason: "SAME_EMAIL" | "SAME_PHONE";
  /** The earlier application, which the marker links to. */
  ofId: string;
  ofName: string | null;
};

export type ApplicationExtras = {
  reference: string | null;
  source: string | null;
  answers: AnswerRow[];
  consent: ConsentRecord | null;
  /** How many answers raised a flag. */
  flagCount: number;
  duplicate: DuplicateMarker | null;
};

export const NO_EXTRAS: ApplicationExtras = {
  reference: null,
  source: null,
  answers: [],
  consent: null,
  flagCount: 0,
  duplicate: null,
};

/** Is there anything to show beyond what a row already shows? */
export function hasExtras(
  extras: ApplicationExtras | null | undefined,
): boolean {
  if (!extras) return false;
  return (
    extras.answers.length > 0 ||
    extras.consent !== null ||
    extras.flagCount > 0 ||
    extras.duplicate !== null ||
    extras.reference !== null
  );
}

/** "3 words", "1 word". */
export const wordsLabel = (words: number): string =>
  `${words} ${words === 1 ? "word" : "words"}`;

/** Words in a long answer, counted the way the form counts them. */
export const wordsOf = (text: string): number => countWords(text);

export const DUPLICATE_REASON: Record<DuplicateMarker["reason"], string> = {
  SAME_EMAIL: "the same email address",
  SAME_PHONE: "the same phone number",
};
