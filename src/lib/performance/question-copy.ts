import type { QuestionCopy } from "@/lib/api/performance";

/**
 * What to say after a period's questions were copied, when something was left
 * behind.
 *
 * A copy used to say nothing at all when it left a question out. Since a
 * subsection can be asked on the review form, it can: a question that asks a
 * subsection is read again from the subsection rather than copied, and one whose
 * subsection has since been switched off or removed is left behind. The new
 * period then has fewer questions than the one it was copied from, with nothing
 * to say why, and the person who reads the list has no way to know one is missing.
 *
 * ## The API's sentence, said once, with what was copied in front of it
 *
 * `skippedNote` is the API's own (`Left out: "Teamwork" (it is switched off).`):
 * it names the subsection and the reason, and nothing here rewords it. What this
 * adds is the count of what did arrive, so the line reads as a whole account of
 * what the copy did. When nothing arrived it says that plainly instead of "Copied
 * 0 questions".
 *
 * ## Absent is nothing, not "nothing left out"
 *
 * `null` when the copy left nothing out, and when the server sends neither field.
 * A server that does not say whether anything was left out is not a server that
 * said nothing was, and a line claiming either would be a claim made without an
 * answer. So there is no "everything was copied" line: the list is what arrived.
 */
export function copyNoteFor(result: QuestionCopy): string | null {
  const note = result.skippedNote?.trim();
  const skipped = result.skipped ?? 0;
  if (!note && skipped <= 0) return null;

  const arrived =
    result.copied === 0
      ? "Nothing was copied."
      : `Copied ${result.copied} ${result.copied === 1 ? "question" : "questions"}.`;

  /* A count with no sentence from the API: say what is known and no more. */
  const left =
    note ??
    `${skipped} ${skipped === 1 ? "question was" : "questions were"} left out.`;
  return `${arrived} ${left}`;
}
