import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApprovalInbox } from "./inbox";

export const metadata: Metadata = {
  title: "My approvals",
  description: "Everything waiting on a decision from you, across every module.",
};

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="My approvals"
        description="Everything waiting on a decision from you — leave, payroll, offers, expenses — ranked by what breaks first if you do nothing."
      />
      <PageBody>
        <ApprovalInbox />
      </PageBody>
    </>
  );
}
