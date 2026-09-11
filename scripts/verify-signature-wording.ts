import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  MAX_SIGNABLE_BYTES,
  SIGNABLE_CONTENT_TYPE,
  SIGNATURE_KIND,
  SIGNING_WORDING,
} from "../src/lib/api/signatures";

/**
 * The signature copy and limits must say the same thing on both sides of the wire.
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
 * `MAX_SIGNABLE_BYTES` and the accepted content type are checked for a duller
 * but commoner failure. The send form refuses a file **before** encoding it, so
 * somebody is not made to wait for a refusal — which means the browser is
 * stating a rule rather than reporting one. Raise the API's cap to 10MB and
 * leave this at 5 and the product tells people a file is too big when it is
 * not, which reads as a bug in the file rather than in the form.
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

/**
 * Read `export const NAME = 5 * 1024 * 1024;` and evaluate the arithmetic.
 *
 * The multiplication is the readable form on both sides and neither should have
 * to write `5242880` to be checkable, so the parts are multiplied out here.
 * Only integers and `*`, so there is nothing to evaluate beyond that.
 */
function numberFrom(source: string, name: string): string | null {
  const at = source.indexOf(`export const ${name} =`);
  if (at === -1) return null;
  const end = source.indexOf(";", at);
  const parts = source
    .slice(source.indexOf("=", at) + 1, end)
    .split("*")
    .map((part) => Number(part.trim()));
  if (parts.length === 0 || parts.some((part) => !Number.isInteger(part))) {
    return null;
  }
  return String(parts.reduce((a, b) => a * b, 1));
}

/**
 * The single member of `export const NAME = new Set(["…"]);`.
 *
 * The API keeps a Set because it may one day accept a second format; this repo
 * keeps one string because the form accepts one. Comparing them asserts both
 * halves — the value matches, **and** the API has not quietly grown a second
 * member the send form would refuse. Returns null when there is more than one,
 * which fails the check with a message rather than passing on the first.
 */
function setMemberFrom(source: string, name: string): string | null {
  const at = source.indexOf(`export const ${name} =`);
  if (at === -1) return null;
  const end = source.indexOf(";", at);
  const members = [
    ...source.slice(at, end).matchAll(/"((?:[^"\\]|\\.)*)"/g),
  ].map((match) => match[1] ?? "");
  return members.length === 1 ? (members[0] ?? null) : null;
}

/** Kept beside the calls so the failure message cannot go stale. */
const CHECKS = 4;

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
  console.log(`  ok    ${label} agrees with the API`);
};

if (!existsSync(SOURCE)) {
  console.log(
    "  skip  signature wording vs the API — approvehr-api is not checked out beside this repo",
  );
} else {
  const source = readFileSync(SOURCE, "utf8");
  check(
    "SIGNING_WORDING",
    SIGNING_WORDING,
    constantFrom(source, "SIGNING_WORDING"),
  );
  check(
    "SIGNATURE_KIND",
    SIGNATURE_KIND,
    constantFrom(source, "SIGNATURE_KIND"),
  );
  check(
    "MAX_SIGNABLE_BYTES",
    String(MAX_SIGNABLE_BYTES),
    numberFrom(source, "MAX_SIGNABLE_BYTES"),
  );
  check(
    "SIGNABLE_CONTENT_TYPE",
    SIGNABLE_CONTENT_TYPE,
    setMemberFrom(source, "SIGNABLE_TYPES"),
  );
}

if (failures > 0) {
  console.error(
    `\nSignature check failed: ${String(failures)} of ${String(CHECKS)}.\n` +
      "The API stores `SIGNING_WORDING` on the record, so a difference means " +
      "somebody signs having read one sentence and the certificate quotes " +
      "another. A difference in the cap or the accepted type means the send " +
      "form refuses a file the API would have taken, or takes one it will " +
      "refuse. Copy the API's values here rather than editing the API to match.",
  );
  process.exit(1);
}

console.log(
  `Signature check passed. All ${String(CHECKS)} agree with the API.`,
);
