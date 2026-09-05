"use client";

import { PageBody, PageHeader } from "@/components/portal/shell";
import { ReviewTasksTab } from "../review-tasks";
import { StartPeriodButton } from "../start-period";

/** What still needs a grade, on its own route. */
export function ReviewTasksScreen() {
  return (
    <>
      <PageHeader title="Review tasks" action={<StartPeriodButton withIcon />} />
      <PageBody>
        <ReviewTasksTab />
      </PageBody>
    </>
  );
}
