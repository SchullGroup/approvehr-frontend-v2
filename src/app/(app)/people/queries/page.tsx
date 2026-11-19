import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { QueriesScreen } from "./queries-screen";
import { StartQueryButton } from "./start-dialog";

export const metadata: Metadata = {
  title: "Queries",
  description:
    "Written queries to staff, their one written reply, and the outcome recorded on each.",
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
      <PageHeader
        title="Queries"
        breadcrumb={[
          { href: "/people", label: "Employees" },
          { href: "/people/queries", label: "Queries" },
        ]}
        action={<StartQueryButton />}
      />
      <PageBody>
        <QueriesScreen {...(subjectId ? { subjectId } : {})} />
      </PageBody>
    </>
  );
}
