import type { Metadata } from "next";
import { HiredScreen } from "./hired-screen";

export const metadata: Metadata = {
  title: "Hired",
  description:
    "People whose offer was accepted, and whether they have become employees.",
};

/**
 * `/hiring/hired`
 *
 * A shell. `?job=<id>` opens the list already narrowed to one job, which is how a
 * role's own page links to its hires. It is read here, on the server, and handed
 * down: `useSearchParams` in the screen would put the whole page behind a Suspense
 * boundary for one word.
 */
export default async function HiredPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string | string[] }>;
}) {
  const query = await searchParams;
  const job = Array.isArray(query.job) ? query.job[0] : query.job;
  return <HiredScreen initialJob={job ?? ""} />;
}
