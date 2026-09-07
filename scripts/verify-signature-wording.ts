import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  SIGNATURE_KIND,
  SIGNING_WORDING,
} from "../src/lib/api/signatures";

/**
 * The two signature sentences must say the same thing on both sides of the wire.
 *
 * `SIGNING_WORDING` is what a person is shown above the button, and it is what
 * the **API stores on the record** — so if this repo's copy drifts, somebody
 * signs having read one sentence and the certificate produced afterwards quotes
 * a different one. That is not a copy bug; it is a record of an agreement that
 * misquotes the agreement, on the one document produced when a signature is
 * questioned.
 *
 * `SIGNATURE_KIND` is the sentence that stops somebody reading this as a
 * cryptographic digital signature. Softening it on one side only would leave
 * the screen overclaiming while the certificate stayed honest.
 *
 * Same mechanism as `verify-template.ts`'s cross-repo check and for the same
 * reason: a sentence in a header asking somebody to keep two copies in step is
 * not a gate. Parsed out of the API's source as text, because this package
 * cannot resolve that tree.
 *
 * Skips when `approvehr-api` is not checked out beside this repo — CI for the
 * frontend clones this one alone.
 *
 * Run by `npm run check`.
 */

const SOURCE = path.resolve(
  import.meta.dirname,
  "../../../approvehr-api/src/modules/signatures/service.ts",
);

/**
 * Read a `export const NAME = "…" + "…";` declaration out of the API's source
 * and join its string parts.
 *
 * Deliberately not `eval` and deliberately not a JSON parse: the declaration is
 * a concatenation of quoted parts across several lines, and what is being
 * compared is the sentence a person reads rather than the shape of the source.
 */
function constantFrom(source: string, name: string): string | null {
  const at = source.indexOf(`export const ${name} =`);
  if (at === -1) return null;
  const end = source.indexOf(";", at);
  const declaration = source.slice(at, end);
  const parts = [...declaration.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) =>
    (match[1] ?? "").replace(/\\"/g, '"').replace(/\\\\/g, "\\"),
  );
  return parts.length === 0 ? null : parts.join("");
}

let failures = 0;
const check = (label: string, ours: string, theirs: string | null): void => {
  if (theirs === null) {
    failures += 1;
    console.log(`  FAIL  ${label} — not found in the API's source`);
    return;
  }
  if (ours !== theirs) {
    failures += 1;
    console.log(`  FAIL  ${label} differs between the two repos`);
    console.log(`        web: ${ours}`);
    console.log(`        api: ${theirs}`);
    return;
  }
  console.log(`  ok    ${label} matches the API, word for word`);
};

if (!existsSync(SOURCE)) {
  console.log(
    "  skip  signature wording vs the API — approvehr-api is not checked out beside this repo",
  );
} else {
  const source = readFileSync(SOURCE, "utf8");
  check("SIGNING_WORDING", SIGNING_WORDING, constantFrom(source, "SIGNING_WORDING"));
  check("SIGNATURE_KIND", SIGNATURE_KIND, constantFrom(source, "SIGNATURE_KIND"));
}

if (failures > 0) {
  console.error(
    `\nSignature wording check failed: ${String(failures)} of 2.\n` +
      "The API stores `SIGNING_WORDING` on the record, so a difference means " +
      "somebody signs having read one sentence and the certificate quotes " +
      "another. Copy the API's text here rather than editing the API to match.",
  );
  process.exit(1);
}

console.log("Signature wording check passed. Both sentences agree.");
