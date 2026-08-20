"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Info, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  Field,
  Money,
  Textarea,
  useToast,
} from "@/components/ui";
import { fullName, type PipelineCard } from "@/lib/types";

type Decision = "approved" | "declined";

/**
 * Offer approval. The approver's real question is "is this in band, and what
 * does it do to the team's spread" — so both are computed and stated here
 * rather than left for them to work out from a number.
 */
export function OfferApprovals({ initial }: { initial: PipelineCard[] }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [declining, setDeclining] = useState<PipelineCard | null>(null);
  const [note, setNote] = useState("");
  const toast = useToast();

  const pending = useMemo(
    () => initial.filter((c) => !decisions[c.id]),
    [initial, decisions],
  );
  const settled = initial.filter((c) => decisions[c.id]);

  function decide(card: PipelineCard, decision: Decision) {
    setDecisions((d) => ({ ...d, [card.id]: decision }));
    toast.push({
      title:
        decision === "approved"
          ? `Offer approved for ${fullName(card.candidate)}`
          : `Offer declined for ${fullName(card.candidate)}`,
      tone: decision === "approved" ? "success" : "info",
      detail:
        decision === "approved"
          ? "The recruiter can now send it to the candidate."
          : undefined,
    });
  }

  if (initial.length === 0) {
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
      {pending.length === 0 && (
        <Callout tone="success" title="Everything actioned">
          You have cleared the queue. Decisions below can still be revisited by
          an admin.
        </Callout>
      )}

      {pending.map((card) => (
        <OfferCard
          key={card.id}
          card={card}
          onApprove={() => decide(card, "approved")}
          onDecline={() => {
            setDeclining(card);
            setNote("");
          }}
        />
      ))}

      {settled.length > 0 && (
        <Card>
          <CardHeader title="Decided in this session" />
          <CardBody className="flex flex-col gap-2.5">
            {settled.map((card) => (
              <div
                key={card.id}
                className="flex items-center gap-3 rounded-md border border-line p-2.5"
              >
                <Avatar name={fullName(card.candidate)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] font-medium text-ink">
                    {fullName(card.candidate)}
                  </p>
                  <p className="truncate text-[0.75rem] text-muted">
                    {card.requisition.title}
                  </p>
                </div>
                <Badge
                  tone={decisions[card.id] === "approved" ? "success" : "danger"}
                  size="sm"
                  dot
                >
                  {decisions[card.id] === "approved" ? "Approved" : "Declined"}
                </Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={declining !== null}
        onClose={() => setDeclining(null)}
        onConfirm={() => {
          if (declining) decide(declining, "declined");
          setDeclining(null);
        }}
        title={
          declining ? `Decline this offer for ${fullName(declining.candidate)}?` : ""
        }
        confirmLabel="Decline offer"
        tone="danger"
        body={
          <div className="flex flex-col gap-4">
            <p className="text-sm text-body">
              The recruiter is notified with your reason and can revise the
              offer. The candidate is not contacted.
            </p>
            <Field
              label="Reason"
              required
              help="The recruiter sees this. Be specific enough to act on."
            >
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                placeholder="Above band for this level — bring it under ₦1.6m or re-grade the role."
              />
            </Field>
          </div>
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function OfferCard({
  card,
  onApprove,
  onDecline,
}: {
  card: PipelineCard;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const offer = card.offer!;
  const { salaryMin, salaryMax } = card.requisition;
  const above = offer.grossMonthly > salaryMax;
  const below = offer.grossMonthly < salaryMin;
  /* Where the offer sits in the band, as a percentage of the range. */
  const position = Math.max(
    0,
    Math.min(
      100,
      ((offer.grossMonthly - salaryMin) / (salaryMax - salaryMin)) * 100,
    ),
  );

  const submitted = card.scorecards.filter((s) => s.submittedAt);
  const avg =
    submitted.length > 0
      ? submitted.reduce(
          (sum, sc) =>
            sum +
            sc.ratings.reduce((a, r) => a + r.score, 0) / (sc.ratings.length || 1),
          0,
        ) / submitted.length
      : null;

  return (
    <Card>
      <CardHeader
        title={
          <Link
            href={`/hiring/candidates/${card.id}`}
            className="hover:text-accent-text hover:underline underline-offset-4"
          >
            {fullName(card.candidate)}
          </Link>
        }
        description={`${card.requisition.title} · ${card.requisition.reference}`}
        action={
          <Badge tone="warning" dot>
            Awaiting your approval
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_240px]">
          <div>
            {/* Band position — the actual decision aid. */}
            <div className="flex items-baseline justify-between">
              <p className="text-h3 text-ink tabular">
                <Money amount={offer.grossMonthly} />
              </p>
              {above ? (
                <Badge tone="danger" size="sm">
                  Above band
                </Badge>
              ) : below ? (
                <Badge tone="info" size="sm">
                  Below band
                </Badge>
              ) : (
                <Badge tone="success" size="sm">
                  In band
                </Badge>
              )}
            </div>

            <div className="mt-3">
              <div className="relative h-2 rounded-full bg-sunken">
                <div
                  className={cn(
                    "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface",
                    above || below ? "bg-danger" : "bg-success-strong",
                  )}
                  style={{ left: `${above ? 100 : below ? 0 : position}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[0.75rem] tabular text-muted">
                <span>
                  <Money amount={salaryMin} compact />
                </span>
                <span>
                  <Money amount={salaryMax} compact />
                </span>
              </div>
            </div>

            {above && (
              <Callout tone="danger" className="mt-4" title="Outside the approved band">
                This is{" "}
                <Money amount={offer.grossMonthly - salaryMax} /> above the
                ceiling agreed when the requisition was opened. Approving it
                sets a new internal reference for this level.
              </Callout>
            )}
          </div>

          <DescriptionList
            columns={1}
            items={[
              { term: "Start date", value: offer.startDate },
              {
                term: "Interview average",
                value: avg !== null ? `${avg.toFixed(1)} / 5` : "—",
              },
              {
                term: "Scorecards in",
                value: `${submitted.length} of ${card.scorecards.length}`,
              },
              {
                term: "Notice period",
                value: card.candidate.noticePeriodWeeks
                  ? `${card.candidate.noticePeriodWeeks} weeks`
                  : "—",
              },
            ]}
          />
        </div>

        {card.scorecards.length > submitted.length && (
          <Callout tone="warning" icon={<Info aria-hidden="true" />}>
            Not every interviewer has submitted a scorecard. You can still
            approve, but you are deciding on partial evidence.
          </Callout>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button variant="approve" onClick={onApprove}>
            <Check aria-hidden="true" className="size-4" />
            Approve offer
          </Button>
          <Button variant="secondary" onClick={onDecline}>
            <ThumbsDown aria-hidden="true" className="size-4" />
            Decline
          </Button>
          <Link
            href={`/hiring/candidates/${card.id}`}
            className="ml-auto text-[0.875rem] text-accent-text hover:underline underline-offset-4"
          >
            Read the full record
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
