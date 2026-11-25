/**
 * Whether these marketing pages are served by the app itself.
 *
 * True in this repo, where `/register` and the sign-in page are routes of the
 * same deployment. `scripts/export-marketing.ts` rewrites this file to `false`
 * in the standalone marketing build, which has no app behind it, so its pages
 * offer a demo and nothing that would 404.
 */
export const SERVED_WITH_APP: boolean = true;
