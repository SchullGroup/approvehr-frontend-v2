import { ComingSoon } from "@/components/portal/shell";

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
 */
export default function HiringLayout() {
  return <ComingSoon label="Recruitment" />;
}
