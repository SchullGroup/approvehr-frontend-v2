import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApprovalInbox } from "./inbox";

export const metadata: Metadata = {
  title: "My approvals",
  description:
    "Everything waiting on a decision from you, across every module.",
};

/**
 * The inbox.
 *
 * It used to carry "Start an appraisal period" as well, a company-wide act
 * with nothing to do with what is waiting here. Starting a period belongs to
 * Performance (L23).
 */
export default function ApprovalsPage() {
  return (
    <>
      <PageHeader title="My approvals" />
      <PageBody>
        <ApprovalInbox />
      </PageBody>
    </>
  );
}
