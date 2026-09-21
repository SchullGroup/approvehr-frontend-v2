import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ChangesScreen } from "./changes-screen";

export const metadata: Metadata = {
  title: "Promotions and transfers",
  description:
    "Promotions, transfers, regrades and pay changes waiting for a decision, and the ones agreed but not yet in effect.",
};

export default function ChangesPage() {
  return (
    <>
      <PageHeader
        title="Promotions and transfers"
        breadcrumb={[
          { href: "/people", label: "Employees" },
          { href: "/people/changes", label: "Promotions and transfers" },
        ]}
      />
      <PageBody>
        <ChangesScreen />
      </PageBody>
    </>
  );
}
