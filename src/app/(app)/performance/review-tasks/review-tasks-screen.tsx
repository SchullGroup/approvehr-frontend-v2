"use client";

import { PageBody, PageHeader } from "@/components/portal/shell";
import { MyTasksPanel } from "../my-tasks";
import { ReviewTasksTab } from "../review-tasks";
import { StartPeriodButton } from "../start-period";

/**
 * Weekly tasks: log your own, grade your team's.
 *
 * Both halves on one route because they are one loop — what somebody logs is
 * what somebody else grades, and the grade comes back to the same screen it
 * was logged on. It was called "Review tasks" and held only the grading half,
 * so the answer to *"where do employees submit their tasks?"* was a modal two
 * clicks inside one specific KPI.
 *
 * Own week first. Everybody has one; most people review nobody, and
 * `ReviewTasksTab` renders nothing at all when the queue is empty — so for
 * most of the company this page is exactly what it should be, and for a
 * manager it is both jobs in the order they do them.
 */
export function ReviewTasksScreen() {
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title="Weekly tasks"
        action={<StartPeriodButton withIcon />}
      />
      <PageBody className="flex flex-col gap-6">
        <MyTasksPanel />
        <ReviewTasksTab />
      </PageBody>
    </>
  );
}
