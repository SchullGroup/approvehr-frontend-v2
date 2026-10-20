"use client";

import { UserCheck } from "lucide-react";
import { ButtonLink, Card, CardBody } from "@/components/ui";
import { useHiredGateway } from "@/lib/hiring/hired/use-hired";
import { useLoaded } from "@/lib/use-loaded";

/**
 * One job's hires, in a line, with the way to the list.
 *
 * The count is the Hired list's own, asked for this job and nothing else, so the role
 * page and the list cannot disagree. It says how many of the job's places are taken
 * (everybody who has not said they will not join) and how many of those are employees
 * already. If the list cannot be read it says nothing rather than a wrong figure.
 */
export function JobHires({
  requisitionId,
  headcount,
}: {
  requisitionId: string;
  headcount: number | null;
}) {
  const gateway = useHiredGateway();
  const loaded = useLoaded(
    `job-hires:${gateway.mode}:${requisitionId}`,
    true,
    (signal) =>
      gateway.list(
        {
          filters: { requisitionId },
          sort: "accepted-desc",
          cursor: null,
          pageSize: 1,
        },
        signal,
      ),
  );

  const counts = loaded.data?.counts ?? null;
  if (!loaded.data || !counts) return null;

  const hired = counts.HIRED + counts.EMPLOYEE_CREATED;
  const places = headcount === null ? "" : ` of ${String(headcount)}`;

  return (
    <Card>
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <UserCheck
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted"
          />
          <div>
            <p className="text-body-sm font-medium text-ink">
              {hired === 0
                ? "Nobody has accepted an offer for this job yet"
                : `${String(hired)}${places} hired`}
            </p>
            {hired > 0 && (
              <p className="text-body-sm text-muted">
                {counts.EMPLOYEE_CREATED === 0
                  ? "None is an employee yet."
                  : `${String(counts.EMPLOYEE_CREATED)} ${counts.EMPLOYEE_CREATED === 1 ? "is" : "are"} already an employee.`}
                {counts.DID_NOT_JOIN > 0
                  ? ` ${String(counts.DID_NOT_JOIN)} did not join.`
                  : ""}
              </p>
            )}
          </div>
        </div>
        {loaded.data.total > 0 && (
          <ButtonLink
            href={`/hiring/hired?job=${requisitionId}`}
            variant="secondary"
            size="sm"
          >
            Open the Hired list for this job
          </ButtonLink>
        )}
      </CardBody>
    </Card>
  );
}
