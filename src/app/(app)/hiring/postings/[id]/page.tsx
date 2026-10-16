import type { Metadata } from "next";
import { PostingScreen } from "./posting-screen";

export const metadata: Metadata = {
  title: "Advert",
  description:
    "One job advert: the links to share, the form an applicant fills in, and how applicants are screened.",
};

/**
 * `/hiring/postings/[id]`
 *
 * A shell. Whether somebody may open it, and everything it shows, is a client
 * fact — see `posting-screen.tsx`. Rendered on demand: an advert's id is a real
 * row this build has never seen.
 */
export default async function PostingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const tab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  /* Read here, on the server, and handed down: `useSearchParams` in the screen
     would put the whole page behind a Suspense boundary for one word. */
  return (
    <PostingScreen
      id={id}
      initialTab={tab === "screening" ? "screening" : "form"}
    />
  );
}
