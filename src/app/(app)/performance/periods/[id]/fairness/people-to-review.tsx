"use client";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  EmptyState,
  Spinner,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import {
  NotePanel,
  RecordCheck,
  exactPoints,
  StatusBadge,
} from "@/components/performance/record-check";
import { SuggestButton } from "@/components/performance/suggestions";
import type { ApiReviewFlag, ApiReviewFlags } from "@/lib/api/performance";
import { useReviewBriefing } from "@/lib/store/ai";

export function flaggedCount(flags: ApiReviewFlags | null) {
  return flags ? flags.counts.below + flags.counts.above : 0;
}

export function PeopleToReview({
  cycleId,
  flags,
  loading,
  error,
  reload,
}: {
  cycleId: string;
  flags: ApiReviewFlags | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}) {
  const briefing = useReviewBriefing();

  if (error) {
    return (
      <LoadFailure
        subject="the people to review"
        error={error}
        onRetry={reload}
      />
    );
  }
  if (!flags) {
    return loading ? (
      <Card>
        <CardBody className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          Comparing marks with records
        </CardBody>
      </Card>
    ) : null;
  }

  const below = flags.people.filter((p) => p.status === "below");
  const above = flags.people.filter((p) => p.status === "above");
  const unclear = flags.people.filter((p) => p.status === "unclear");
  const gap = (flags.rules.gapBp / 100).toFixed(0);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Marks that don't match the record"
          description={`Anyone marked at least ${gap} points away from what their objectives, peer feedback and past marks suggest. A flag is a reason to look, not a finding. Their own manager never sees it.`}
          action={
            below.length + above.length > 0 &&
            !briefing.outcome &&
            !briefing.loading ? (
              <SuggestButton
                label="Write a briefing"
                loading={briefing.loading}
                onClick={() => void briefing.ask({ cycleId })}
              />
            ) : undefined
          }
        />
        {(briefing.loading || briefing.outcome || briefing.error) && (
          <CardBody>
            <NotePanel state={briefing} />
          </CardBody>
        )}
      </Card>

      {below.length + above.length === 0 ? (
        <Card>
          <EmptyState
            title="Nobody to review"
            description={`Every mark is within ${gap} points of the record, or there isn't enough evidence to tell.`}
          />
        </Card>
      ) : (
        <>
          <FlagList
            title="Below their record"
            people={below}
            cycleId={cycleId}
          />
          <FlagList
            title="Above their record"
            people={above}
            cycleId={cycleId}
          />
        </>
      )}

      {unclear.length > 0 && (
        <Disclosure
          title="Not enough evidence to tell"
          meta={
            <Badge tone="neutral" size="sm">
              {unclear.length}
            </Badge>
          }
          hint="No measured objective and fewer than 3 colleagues gave feedback."
          region={false}
        >
          <ul className="space-y-1 text-body-sm text-body">
            {unclear.map((person) => (
              <li key={person.employeeId}>
                {person.name}
                <span className="text-muted"> · {describe(person)}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}

function describe(person: ApiReviewFlag) {
  return (
    [person.jobTitle, person.department].filter(Boolean).join(", ") ||
    "No role on file"
  );
}

function FlagList({
  title,
  people,
  cycleId,
}: {
  title: string;
  people: ApiReviewFlag[];
  cycleId: string;
}) {
  if (!people.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-body-md font-semibold text-ink">
        {title} <span className="text-muted">({people.length})</span>
      </h3>
      {people.map((person) => (
        <Disclosure
          key={person.employeeId}
          dense
          region={false}
          title={person.name}
          hint={describe(person)}
          meta={
            <>
              <StatusBadge status={person.status} />
              {person.gapBp !== null && (
                <span className="text-body-sm font-semibold tabular-nums text-warning-text">
                  {exactPoints(person.gapBp)}
                </span>
              )}
            </>
          }
        >
          <RecordCheck cycleId={cycleId} flag={person} />
        </Disclosure>
      ))}
    </section>
  );
}
