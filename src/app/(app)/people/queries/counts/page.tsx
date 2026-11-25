import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { CountsScreen } from "./counts-screen";

export const metadata: Metadata = {
  title: "Query counts",
  description:
    "How many queries were served in a year, by where they stand and by month, with small figures withheld.",
};

export default function QueryCountsPage() {
  return (
    <>
      <PageHeader
        title="Counts"
        breadcrumb={[
          { href: "/people", label: "Employees" },
          { href: "/people/queries", label: "Queries" },
        ]}
      />
      <PageBody>
        <CountsScreen />
      </PageBody>
    </>
  );
}
