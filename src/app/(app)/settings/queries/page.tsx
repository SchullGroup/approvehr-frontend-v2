import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { QueriesSettingsScreen } from "./queries-settings-screen";

export const metadata: Metadata = {
  title: "Queries",
  description:
    "Whether queries are switched on, the usual reply time, who may decide a query they issued, whether managers may draft, and the company's own letter templates.",
};

export default function QueriesSettingsPage() {
  return (
    <>
      <PageHeader
        title="Queries"
        breadcrumb={[
          { href: "/settings", label: "Settings" },
          { href: "/settings/queries", label: "Queries" },
        ]}
      />
      <PageBody>
        <QueriesSettingsScreen />
      </PageBody>
    </>
  );
}
