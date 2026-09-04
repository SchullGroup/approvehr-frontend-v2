/**
 * What other route folders may use from the webhooks screen.
 *
 * `CopyButton` and `CodeInline` are the two things here that are not about
 * webhooks at all: one copies a string and reports failure rather than
 * swallowing it, the other renders a value somebody compares character by
 * character. `/settings/devices` shows a signing secret of exactly the same
 * kind, and a second copy of either would drift — the monospace argument in
 * `code.tsx` applies identically to a `whsec_` a person is about to paste into
 * an agent's config.
 *
 * The rest of `code.tsx` stays private: `PayloadBlock` and friends know what a
 * webhook delivery looks like and have no business anywhere else.
 */
export { CopyButton, CodeInline, CodeBlock } from "./code";
