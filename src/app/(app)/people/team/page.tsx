import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { MyTeamScreen } from "./team-screen";

export const metadata: Metadata = {
  title: "My team",
  description:
    "The people you lead: who they are, how to reach them and their leave, with nothing about pay.",
};

export default function MyTeamPage() {
  return (
    <>
      <PageHeader
        title="My team"
        breadcrumb={[
          { href: "/people", label: "Employees" },
          { href: "/people/team", label: "My team" },
        ]}
      />
      <PageBody>
        <MyTeamScreen />
      </PageBody>
    </>
  );
}
