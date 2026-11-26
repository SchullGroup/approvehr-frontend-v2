import type { Metadata } from "next";
import { PageBody } from "@/components/portal/shell";
import { QueriesHeader, QueriesScreen } from "./queries-screen";

export const metadata: Metadata = {
  title: "Queries",
  description:
    "Letters that ask for a written explanation, and what came of each: the register for the people who write them, your own letters for everybody else.",
};

/**
 * `?subject=` narrows the register to one person, which is where a person's record links to.
 * Read here, on the server, and handed down as a prop, so the screen needs no Suspense boundary
 * for one string (the same call `profile/page.tsx` makes for its tab).
 */
export default async function QueriesPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string | string[] }>;
}) {
  const { subject } = await searchParams;
  const single = Array.isArray(subject) ? subject[0] : subject;
  const subjectId =
    single && /^[0-9a-f-]{36}$/i.test(single) ? single : undefined;
  return (
    <>
      <QueriesHeader />
      <PageBody>
        <QueriesScreen {...(subjectId ? { subjectId } : {})} />
      </PageBody>
    </>
  );
}
