import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { JobRolesScreen } from "./job-roles-screen";

export const metadata: Metadata = {
  title: "Job roles",
  description:
    "What jobs this company has, what each one involves, and what people on it are judged against.",
};

export default function JobRolesPage() {
  return (
    <>
      <PageHeader
        title="Job roles"
        breadcrumb={[
          { href: "/settings", label: "Settings" },
          { href: "/settings/job-roles", label: "Job roles" },
        ]}
      />
      <PageBody>
        <JobRolesScreen />
      </PageBody>
    </>
  );
}
