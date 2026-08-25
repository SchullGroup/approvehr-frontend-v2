import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { StartPeriodButton } from "@/app/(app)/performance";
import { ApprovalInbox } from "./inbox";

export const metadata: Metadata = {
  title: "My approvals",
  description: "Everything waiting on a decision from you, across every module.",
};

/**
 * The inbox, plus one door that is not about the inbox.
 *
 * `StartPeriodButton` is here because deciding things is what somebody is doing
 * when they think "we are overdue an appraisal" — the product owner's rule is
 * that the same action should be reachable from every screen a person might be
 * on when the thought occurs, rather than from the one screen where it logically
 * belongs. It is the same dialog as the one on the dashboard, the performance
 * landing, the objectives queue and an employee's record; there is one
 * implementation of it and five ways in.
 *
 * It renders **nothing** for a company with appraisals switched off or a reader
 * who cannot run one, which is what makes it safe on a screen with no
 * performance content on it at all.
 */
export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="My approvals"
        action={<StartPeriodButton withIcon />}
      />
      <PageBody>
        <ApprovalInbox />
      </PageBody>
    </>
  );
}
