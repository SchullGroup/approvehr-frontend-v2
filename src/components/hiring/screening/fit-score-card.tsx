import { Card, CardBody, CardHeader } from "@/components/ui";
import { FitBadge } from "@/components/hiring/screening/fit-badge";
import type { MyApplication } from "@/lib/hiring/comms/model";

/**
 * The fit score on the narrow screens a panelist or collaborator reads.
 *
 * Whether somebody here sees a score is the job's choice, made by the API: where they
 * may not, `screening` is **absent** and the caller draws nothing, not even a box that
 * says it is hidden (that would tell them there is a score to want). This only ever
 * draws a score somebody was sent.
 */
export function FitScoreCard({
  screening,
}: {
  screening: NonNullable<MyApplication["screening"]>;
}) {
  return (
    <Card>
      <CardHeader
        title="Fit score"
        description="How closely the application matches what the job asked for. Advice for whoever reads the CV, not a decision."
      />
      <CardBody className="flex flex-col gap-2">
        <div>
          <FitBadge fit={screening.fit} size="md" />
        </div>
        {screening.reasons && (
          <p className="text-body-sm text-body [overflow-wrap:anywhere]">
            {screening.reasons}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
