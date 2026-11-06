"use client";

import { Users } from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadState,
  Skeleton,
} from "@/components/ui";
import { useProgram } from "@/components/projects/program-context";
import { MetricTiles, WorkloadBars } from "@/components/projects/program-parts";
import { PROGRAM } from "@/lib/projects/terms";
import { useProgramRollup } from "@/lib/store/programs";

/**
 * Who is carrying what in a program: open and overdue tasks by person, the
 * busiest ten, and everybody past them rolled into one line. A name opens that
 * person's tasks in this program. A task with two people on it counts for both.
 */
export function WorkloadView() {
  const { program } = useProgram();
  const rollup = useProgramRollup(program.id);
  const data = rollup.data;
  const base = `/projects/programs/${program.id}`;
  return (
    <LoadState
      loading={rollup.status === "loading"}
      error={rollup.status === "error" ? rollup.error : null}
      subject="the workload"
      onRetry={rollup.reload}
      skeleton={<Skeleton className="h-64" />}
    >
      {data && (
        <div className="space-y-6">
          <MetricTiles
            metrics={data.totals}
            hrefFor={(bucket) => `${base}?view=tasks&bucket=${bucket}`}
          />
          <Card>
            <CardHeader
              title="Workload"
              description={`Open tasks by person in this ${PROGRAM.one}, the busiest first.`}
            />
            <CardBody>
              {data.workload.totalPeople === 0 &&
              data.workload.unassigned === 0 ? (
                <EmptyState
                  compact
                  icon={<Users />}
                  title="Nothing open"
                  description="Nobody has open tasks in this program right now."
                />
              ) : (
                <WorkloadBars
                  people={data.workload.people}
                  others={data.workload.others}
                  unassigned={data.workload.unassigned}
                  hrefFor={(id) => `${base}?view=tasks&assignee=${id}`}
                />
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </LoadState>
  );
}
