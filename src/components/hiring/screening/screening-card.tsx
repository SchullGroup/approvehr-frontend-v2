"use client";

import { Card, CardBody, CardHeader } from "@/components/ui";
import { AssessmentRecord } from "@/components/hiring/screening/assessment-record";
import { ExplanationPanel } from "@/components/hiring/screening/explanation-panel";
import type { ScreeningSubject } from "@/lib/hiring/screening/model";
import { useExplanation } from "@/lib/hiring/screening/use-screening";
import { useScreeningGateway } from "@/lib/hiring/screening/use-gateway";
import { useCan } from "@/lib/permissions";

/**
 * A person's screening on their record: how the score was worked out, where they
 * stand against the pass mark, and their assessment score with its history.
 *
 * Staff only: this is drawn on the record page, which needs the hiring
 * permissions. It is not on the narrow screens an interview panelist uses.
 *
 * ## It is absent, not empty, where the viewer may not see scores
 *
 * Who may see a score is set per job. When the API sends none for this person the card
 * is not drawn at all.
 */
export function ScreeningCard({
  subject,
  postingId,
}: {
  subject: ScreeningSubject;
  /** Where criteria are written, for the "add criteria" button. */
  postingId?: string | undefined;
}) {
  const canManage = useCan("MANAGE_HIRING");
  const gateway = useScreeningGateway();
  const state = useExplanation(subject);
  /* The API sent no score for this person: they may not see scores on this job. The
     whole card goes, header and assessment too. A box saying "hidden" would tell them
     one exists, and an error would tell them something is broken. */
  if (state.hidden) return null;
  return (
    <Card>
      <CardHeader
        title="Screening"
        description="Advice for the person reading. It decides nothing, and nobody is rejected because of it."
      />
      <CardBody className="flex flex-col gap-6">
        <ExplanationPanel
          state={state}
          subject={subject}
          criteriaHref={
            postingId
              ? `/hiring/postings/${postingId}?tab=screening`
              : undefined
          }
        />
        {gateway.supports.assessment && (
          <div className="border-t border-line pt-5">
            <AssessmentRecord subject={subject} canEdit={canManage} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
