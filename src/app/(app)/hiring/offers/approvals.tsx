"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Info, ThumbsDown } from "lucide-react";
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
import { SourceBadge } from "@/components/hiring/source-badge";
import { BandPosition } from "@/app/(app)/payroll/pay-setup/band-position";
import { bandStanding } from "@/lib/grades/band";
import type { OfferBand } from "@/lib/api/hiring";
import { pipelineSnapshot, useOfferBands, type OfferBands } from "@/lib/store/hiring";
import { fullName, type PipelineCard } from "@/lib/types";

type Decision = "approved" | "declined";

/**
 * Offer approval.
 *
 * ## The band is real now, and that is the point of the screen
 *
 * The approver's question is "is this in band" — and until this change the bar
 * on this screen was drawn between the requisition's own `salaryMin` and
 * `salaryMax`, two seeded numbers with nothing behind them. A meter against
 * those cannot answer the question: move the seed and the band moves with it, so
 * "in band" meant "inside a range somebody typed next to this role", not "inside
 * what this company pays for this work".
 *
 * It now reads the **grade ladder**, which is live whenever the API is up, and
 * draws with `<BandPosition />` — the same component the pay-setup screen uses,
 * so a figure cannot be described one way here and another way there. The marker
 * is allowed to leave the track when an offer is outside the band, because that
 * is the one case worth an approver's attention and the old bar clamped it to
 * the end, which reads as "at the top" — the opposite of the truth.
 *
 * ## The decision is still not recorded anywhere, and the toast says so
 *
 * `Offer` is a Prisma model with `status`, `approvedById`, `approvedAt` and an
 * `outsideBand` flag that routes it to the budget holder — and no module in
 * `approvehr-api` exposes it. So pressing Approve moves a chip on this screen
 * and nothing else, and both the badge and the toast say that plainly. The band
 * beside it is live; the decision is not. Two facts, two badges.
 */
export function OfferApprovals() {
  const pipeline = pipelineSnapshot();
  const bands = useOfferBands();
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [declining, setDeclining] = useState<PipelineCard | null>(null);
  const [note, setNote] = useState("");
  const toast = useToast();

  /* Only the ones actually waiting on a decision. `offersOut` also carries the
     ones already with the candidate, which nobody has to act on. */
  const awaiting = useMemo(
    () =>
      pipeline.offersOut.filter(
        (card) => card.offer?.status === "pending_approval",
      ),
    [pipeline.offersOut],
  );

  const pending = awaiting.filter((card) => !decisions[card.id]);
  const settled = awaiting.filter((card) => decisions[card.id]);

  function decide(card: PipelineCard, decision: Decision) {
    setDecisions((current) => ({ ...current, [card.id]: decision }));
    toast.push({
      title:
        decision === "approved"
          ? `Offer approved for ${fullName(card.candidate)}`
          : `Offer declined for ${fullName(card.candidate)}`,
      tone: decision === "approved" ? "success" : "info",
      detail: "Shown on this screen only — offers have no endpoint yet.",
    });
  }

  if (awaiting.length === 0) {
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
      {/* Why there is no band, when there is no band. Three different facts
          end in an empty ladder — no grades, still loading, or no permission to
          read the pay structure — and `note` is the one that applies. Saying
          "no grades" to somebody who simply cannot see them sends them to build
          a ladder that already exists. */}
      {bands.note && !bands.loading && (
        <Callout tone="warning" title="These are not being checked against a band">
          {bands.note}
        </Callout>
      )}

      {pending.map((card) => (
        <OfferCard
          key={card.id}
          card={card}
          bands={bands}
          onApprove={() => decide(card, "approved")}
          onDecline={() => {
            setDeclining(card);
            setNote("");
          }}
        />
      ))}

      {settled.length > 0 && (
        <Card>
          <CardHeader
            title="Decided in this session"
            description="Kept in this browser. Nothing was written and nobody was told."
          />
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
            <p className="text-[0.875rem] text-body">
              Your reason stays on this screen. The candidate is not contacted.
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
                placeholder="Above band for this level — bring it under the top of the grade or re-grade the role."
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
  bands,
  onApprove,
  onDecline,
}: {
  card: PipelineCard;
  bands: OfferBands;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const offer = card.offer;
  if (!offer) return null;

  const placement = bands.bandFor(offer.grossMonthly);
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
          <div className="flex flex-col gap-4">
            {placement ? (
              <>
                <BandPosition
                  grade={placement.band}
                  offerKobo={placement.offerKobo}
                  gradeLabel={placement.label}
                  label="Offer against the grade"
                />
                <span className="self-start">
                  <SourceBadge
                    live={bands.live}
                    note="The band. The decision below is not recorded anywhere."
                  />
                </span>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="flex items-baseline gap-2">
                  <Money amount={offer.grossMonthly} decimals size="lg" />
                  <span className="text-[0.875rem] text-muted">a month</span>
                </p>
                <p className="text-[0.875rem] text-body">{bands.note}</p>
              </div>
            )}

            {placement && <OutsideBandNote placement={placement} />}
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

/**
 * What approving an out-of-band offer commits the company to.
 *
 * `BandPosition` already draws the marker outside the track and says how far
 * over it is. This adds the consequence, which the meter cannot: an approved
 * offer above the top of a grade becomes the internal reference for that level,
 * and the next person at that level will point at it.
 */
function OutsideBandNote({ placement }: { placement: OfferBand }) {
  const standing = bandStanding(placement.offerKobo, placement.band);
  if (standing === "above") {
    return (
      <Callout tone="danger" title="Above the top of the grade">
        Approving this sets a new internal reference for {placement.label}. The
        next offer at this level will be argued against it.
      </Callout>
    );
  }
  if (standing === "below") {
    return (
      <Callout tone="info" title="Below the bottom of the grade">
        They would start under what {placement.label} pays. That is usually a
        first-year rate rather than a saving — it corrects itself at the first
        review.
      </Callout>
    );
  }
  return null;
}
