"use client";

import Link from "next/link";
import { Check, ThumbsDown } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Callout,
  DescriptionList,
  EmptyState,
  Money,
  Skeleton,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { naira } from "@/lib/api/recruitment";
import { useCan } from "@/lib/permissions";
import {
  useApplicationDetail,
  useOfferMutations,
  useOffers,
} from "@/lib/store/recruitment";
import { useState } from "react";
import { useToast } from "@/components/ui";

/** Real offers waiting on approval — the connected replacement for `Approvals`. */
export function RealApprovals() {
  const { offers, loading, error, reload } = useOffers({ status: "PENDING_APPROVAL", pageSize: 50 });
  const canApprove = useCan("APPROVE_HIRING");
  const canManage = useCan("MANAGE_HIRING");

  if (loading && offers.length === 0) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (error) {
    return (
      <Card>
        <EmptyState
          title="Could not load offers"
          description={error.message}
          action={
            <Button variant="secondary" size="sm" onClick={reload}>
              Try again
            </Button>
          }
        />
      </Card>
    );
  }

  if (offers.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Check aria-hidden="true" />}
          title="No offers waiting on you"
          description="Offers appear here once a recruiter has prepared one and needs sign-off."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {!canApprove && (
        <Callout tone="info" title="You can see these, not decide them">
          Approving hiring is a separate permission from managing it. Ask whoever holds it to
          decide these.
        </Callout>
      )}
      {offers.map((offer) => (
        <RealOfferCard
          key={offer.id}
          applicationId={offer.applicationId}
          canApprove={canApprove}
          canManage={canManage}
          onChanged={reload}
        />
      ))}
    </div>
  );
}

function RealOfferCard({
  applicationId,
  canApprove,
  canManage,
  onChanged,
}: {
  applicationId: string;
  canApprove: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { application, loading } = useApplicationDetail(applicationId);
  const mutations = useOfferMutations();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (loading || !application?.offer) {
    return <Skeleton className="h-32 w-full" />;
  }

  const offer = application.offer;

  async function run(action: () => Promise<unknown>, label: string) {
    setBusy(true);
    try {
      await action();
      toast.push({ title: label, tone: "success" });
      onChanged();
    } catch (error) {
      toast.push({
        title: "Not done",
        tone: "danger",
        detail: error instanceof ApiError ? error.message : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <Link
            href={`/hiring/candidates/${application.id}`}
            className="hover:text-accent-text hover:underline underline-offset-4"
          >
            {application.candidateName}
          </Link>
        }
        description={`${application.requisitionJobTitle} · ${application.requisitionReference}`}
        action={
          <Badge tone="warning" dot>
            {offer.approvedAt ? "Approved — ready to send" : "Awaiting your approval"}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="flex items-baseline gap-2">
            <Money amount={naira(offer.grossMonthlyKobo)} decimals size="lg" />
            <span className="text-body-sm text-muted">a month</span>
          </p>
          {offer.outsideBand && (
            <Badge tone="warning" size="sm">
              Outside the requisition&rsquo;s band
            </Badge>
          )}
        </div>

        <DescriptionList
          columns={2}
          items={[
            { term: "Start date", value: offer.startDate },
            { term: "Candidate email", value: application.candidateEmail },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {!offer.approvedAt && canApprove && (
            <Button
              variant="approve"
              loading={busy}
              onClick={() => void run(() => mutations.approve(offer.id), "Approved")}
            >
              <Check aria-hidden="true" className="size-4" />
              Approve offer
            </Button>
          )}
          {offer.approvedAt && canManage && (
            <Button
              variant="accent"
              loading={busy}
              onClick={() => void run(() => mutations.send(offer.id), "Sent")}
            >
              Send offer
            </Button>
          )}
          {!offer.approvedAt && (
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => void run(() => mutations.decline(offer.id), "Declined")}
            >
              <ThumbsDown aria-hidden="true" className="size-4" />
              Decline
            </Button>
          )}
          <Link
            href={`/hiring/candidates/${application.id}`}
            className="ml-auto text-body-sm text-accent-text hover:underline underline-offset-4"
          >
            Read the full record
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
