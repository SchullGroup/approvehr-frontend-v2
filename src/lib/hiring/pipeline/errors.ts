import { ApiError } from "@/lib/api/client";

/**
 * What to say when something was refused.
 *
 * The API's own sentence, always. A refusal that names a field — "A pipeline needs
 * somewhere to end" on `stages` — has the useful words in `details`, and the
 * envelope's own message is the generic "Some fields are not valid", so the first
 * field's sentence is the one a person can act on.
 *
 * Anything that is not the API's (a network failure, a bug) says only that it did
 * not work: a raw error string is written for a developer.
 */
export function sentenceOf(error: unknown): string {
  if (error instanceof ApiError) {
    const field = error.fieldErrors[0]?.message;
    return field && field.trim() !== "" ? field : error.message;
  }
  return "Something went wrong. Try again.";
}
