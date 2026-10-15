/**
 * A reference that looks like the API's and is the same one every time.
 *
 * The API makes `APP-` and eight characters from an alphabet with no I, L, O or U
 * (they read as 1, 1, 0 and V). The demo has to look like that and has to be
 * stable: a demo applicant's reference must not change between visits, and it
 * must not come from a random call.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function referenceFor(id: string): string {
  let hash = 2166136261;
  let out = "";
  for (let round = 0; round < 8; round += 1) {
    for (let i = 0; i < id.length; i += 1) {
      hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
    }
    hash = Math.imul(hash ^ (round + 1), 16777619) >>> 0;
    out += ALPHABET.charAt(hash % ALPHABET.length);
  }
  return `APP-${out}`;
}
