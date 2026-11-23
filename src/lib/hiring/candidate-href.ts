/**
 * Which kind of id a candidate link carries (UAT 23 Nov, L11 / CRAWL-7).
 *
 * `/hiring/candidates/{id}` is reached with three kinds of id: a pipeline
 * application (the board, offers, interviews, the hired list), a careers-page
 * application (the applications queue, the advert's screening) and a
 * recruitment candidate (what screening somebody in returns). The page used to
 * try each kind in turn, so most loads made two lookups that always failed.
 * A link that knows its kind says so, and the page asks that kind first. A link
 * that does not (an old bookmark, a notification) still works, the slow way.
 */
export type CandidateIdKind = "application" | "applicant" | "candidate";

const KINDS: readonly CandidateIdKind[] = [
  "application",
  "applicant",
  "candidate",
];

export function candidateHref(id: string, kind: CandidateIdKind): string {
  return `/hiring/candidates/${id}?kind=${kind}`;
}

/** The hint in a URL, or null when there is none or it is not one of the three. */
export function kindFrom(
  value: string | null | undefined,
): CandidateIdKind | null {
  return KINDS.find((kind) => kind === value) ?? null;
}
