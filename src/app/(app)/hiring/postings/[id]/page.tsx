import type { Metadata } from "next";
import { PostingScreen } from "./posting-screen";

export const metadata: Metadata = {
  title: "Advert",
  description:
    "One job advert: the links to share, and the form an applicant fills in.",
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PostingScreen id={id} />;
}
