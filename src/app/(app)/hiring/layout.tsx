import { RecruitmentComingSoon } from "./recruitment-coming-soon";

/**
 * Recruitment is switched off for now — every screen under `/hiring/*`
 * (pipeline, job adverts, interviews, offers, requisitions, candidates)
 * renders this instead of `children`.
 *
 * Deliberately a layout, not deletions: nothing under this route is touched,
 * so turning the module back on is one-line revert of this file. `children`
 * is intentionally unused — nothing downstream of it runs data fetching for
 * a route nobody can reach here anyway, since the child screens are all
 * client components.
 *
 * Used to render the generic `ComingSoon` from `components/portal/shell.tsx`
 * — a badge and two sentences, identical to what any other switched-off
 * module would show. `RecruitmentComingSoon` replaced it because the sidebar
 * consolidated four links (pipeline, job adverts, interviews, offers) into
 * one, and one door needs to open onto more than a wall: what was four
 * places to discover "not yet" is now one place to see what each of those
 * four will actually do. `ComingSoon` itself is untouched, for the next
 * module that only needs the plain version.
 */
export default function HiringLayout() {
  return <RecruitmentComingSoon />;
}
