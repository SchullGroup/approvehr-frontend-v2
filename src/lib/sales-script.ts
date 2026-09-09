/**
 * Whether this build replays prepared assistant answers instead of calling a
 * real one.
 *
 * ## This is not the same claim `DEMO_ENABLED`'s own rule protects against
 *
 * `store/ai.ts`'s header calls a canned suggestion "a fabricated one," and
 * that rule is unchanged and unweakened by this file: it means a screen must
 * never claim a live model produced a sentence it did not. It does not mean
 * every non-live answer is dishonest — the Hiring module already shows fixed,
 * hand-written pipeline data under a plain "Demo data, this browser only"
 * label, connected or not, and nobody reads that as a fabrication, because
 * nothing on the screen claims otherwise.
 *
 * `SALES_SCRIPT_ENABLED` follows the same shape as that label, applied to the
 * assistant: a small set of real questions, answered in advance, disclosed as
 * exactly that — never presented as a live model answering in real time.
 * Deployed for prospects to click through with nobody narrating, which is why
 * the disclosure below has to do alone what a rep's own voice did in the
 * first version of this: say plainly that these are prepared, not live.
 *
 * Kept as a second, independent flag rather than a branch inside
 * `DEMO_ENABLED` regardless — seeing the whole rest of the demo (payroll,
 * leave, attendance, hiring) needs nothing extra, and the one place this
 * product has ever fabricated a sentence should stay opt-in and auditable on
 * its own, not folded into the flag that governs everything else. See
 * `next.config.ts`: this can only ever be `true` when `DEMO_ENABLED` is also
 * `true`.
 *
 * ## Every fact behind this is real. Only the sentence is prepared
 *
 * The answers in `lib/mock/sales-script-qa.ts` are hand-written, not
 * modelled — a live model call is the one thing this deployment cannot
 * depend on succeeding for an unattended visitor. What keeps this from being
 * the fabrication `store/ai.ts` warns about is that every fact quoted is read
 * straight out of the same `lib/mock/people.ts` and `lib/mock/workflows.ts`
 * every other screen in the demo already uses — so the number the assistant
 * gives and the number the Employees directory shows a click later are the
 * same number, checked by hand rather than computed live. A prepared answer
 * that disagreed with its own company's records would be worse than the
 * flakiness it exists to avoid.
 *
 * ## Same mechanism as `DEMO_ENABLED`, same reason
 *
 * An ambient global with no import, substituted by `compiler.define` in
 * `next.config.ts` — see that file and `lib/demo.ts` for why this cannot be an
 * exported `const`. `scripts/verify-demo.ts` proves it is folded away rather
 * than assuming so, the same way it already does for `DEMO_ENABLED`.
 */
declare global {
  const SALES_SCRIPT_ENABLED: boolean;
}

/**
 * The disclosure, or `null` — never a plain exported string.
 *
 * `sourceNote` in `lib/demo.ts` is a function for the same reason, and its own
 * comment records why: an exported `const` does not fold across a module
 * boundary here, so a plain string constant would survive in every build
 * regardless of the flag, gated or not at every call site. A ternary *inside*
 * this function's own body is what the minifier can actually eliminate, the
 * same shape `sourceNote` already proves out.
 *
 * The words themselves carry the whole honesty argument now that nobody is in
 * the room to say it out loud: "not a live AI" is in the sentence itself,
 * not implied by tone or left for a rep to add.
 */
export function salesScriptNote(): string | null {
  return SALES_SCRIPT_ENABLED
    ? "These are sample questions with prepared answers, not a live AI — grounded in this company's real records, so they show what the real assistant would find. Ask anything else and it'll say so, rather than pretend to know."
    : null;
}

/**
 * The assistant's own name, shown wherever the real product would show
 * "Google gemini-3.6-flash" or similar — the settings screen, and the status
 * line on the assistant page itself. Says what it is in three words, so
 * reading only this one string is still an honest answer to "is this real".
 */
export function salesScriptAssistantName(): string | null {
  return SALES_SCRIPT_ENABLED ? "Prepared examples — not a live AI" : null;
}

/**
 * What the assistant says to a question nobody prepared an answer for.
 *
 * A **function**, not an exported const, for the reason this module's header
 * already gives: an exported string does not fold across a module boundary
 * here, so a plain constant would survive in every build. A ternary inside a
 * function body is what the minifier can actually eliminate.
 *
 * It lives here rather than beside the answers in `mock/sales-script-qa.ts`
 * because this is the module `verify-demo.ts` exempts from the banned-copy
 * scan, and that exemption is only sound for modules whose whole job is
 * gating this copy. Keeping the disclosure sentences in one place means the
 * exemption list stays two modules long instead of growing with every file
 * that happens to hold a string.
 *
 * It refuses rather than guesses, which is the honesty the whole feature turns
 * on: a prepared set that stretched to answer anything would be exactly the
 * fabrication `store/ai.ts` warns about.
 */
export function scriptedFallback(): string {
  return SALES_SCRIPT_ENABLED
    ? "That's not one of the prepared questions — this is a small set of real examples, not a live AI that can answer anything. Try one of the ones above."
    : "";
}
