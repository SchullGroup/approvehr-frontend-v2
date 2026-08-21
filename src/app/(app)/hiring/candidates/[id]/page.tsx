import type { Metadata } from "next";
import { APPLICATIONS, cardById } from "@/lib/mock/hiring";
import { fullName } from "@/lib/types";
import { CandidateScreen } from "./candidate-screen";

/**
 * `/hiring/candidates/[id]`
 *
 * A shell. Whether this person's details come from the API or from the seed is a
 * client decision — see the header of `candidate-screen.tsx` — so everything
 * below the metadata lives there.
 *
 * `generateStaticParams` covers the seeded pipeline ids so the demo's pages are
 * prerendered. Every other id renders on demand, which is the normal case
 * connected: a real `JobApplication` or `Candidate` id this build has never
 * seen.
 */
export function generateStaticParams() {
  return APPLICATIONS.map((application) => ({ id: application.id }));
}

/**
 * The tab name.
 *
 * Resolved from the seed only, because metadata is generated on the server and
 * the API needs the caller's session. A live record's tab therefore reads
 * "Candidate" while the page itself shows their name — the honest trade, since
 * the alternative is a request that cannot be made.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const card = cardById(id);
  return {
    title: card ? fullName(card.candidate) : "Candidate",
    description: "One applicant, their application and their pipeline record.",
  };
}

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CandidateScreen id={id} />;
}
