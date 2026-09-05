/**
 * Recruitment is switched on. It was a wall (`RecruitmentComingSoon` for
 * every child) while there was nowhere for the pipeline to actually go —
 * see `src/modules/recruitment/` in the API, and the recruitment API/store
 * layer beside this one. `RecruitmentComingSoon` is unused now, not deleted:
 * the next module that needs only the plain wall still has `ComingSoon`
 * itself, in `components/portal/shell.tsx`.
 */
export default function HiringLayout({ children }: { children: React.ReactNode }) {
  return children;
}
