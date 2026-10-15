import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ProbationScreen } from "./probation-screen";

export const metadata: Metadata = {
  title: "Probation",
  description:
    "Whose probation is ending, who is overdue a decision, and who is on one nobody has dated.",
};

export default function ProbationPage() {
  return (
    <>
      <PageHeader
        title="Probation"
        breadcrumb={[
          { href: "/people", label: "Employees" },
          { href: "/people/probation", label: "Probation" },
        ]}
      />
      <PageBody>
        <ProbationScreen />
      </PageBody>
    </>
  );
}
