"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Lock,
  Megaphone,
  Plus,
  TriangleAlert,
} from "lucide-react";
import {
  Badge,
  BarChart,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Skeleton,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  formatMoney,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SourceBadge } from "@/components/hiring/source-badge";
import { usePermissions } from "@/lib/permissions";
import type { RoleRow } from "@/lib/api/hiring";
import { pipelineSnapshot, useHiringOverview } from "@/lib/store/hiring";
import { fullName } from "@/lib/types";

/**
 * Hiring, at a glance.
 *
 * ## Two sources on one page, and the page says which is which
 *
 * The top of this screen is live when the API is up: adverts, how many people
 * applied, how many are waiting to be screened, and how many have been screened
 * in all come from `/careers/postings` and `/careers/analytics`. The bottom —
 * interviews and offers — has no endpoint in this API, so it is the seeded demo
 * data in both modes and says so on each card.
 *
 * Splitting the badge per panel rather than per page is the honest version. A
 * single "Live from the API" at the top of a page whose lower half is a fixture
 * would be the exact failure the badges exist to prevent.
 *
 * ## Why there is no funnel on this page
 *
 * "Where applications are" is point-in-time occupancy: how many people are
 * sitting in each state right now. That is not monotonically decreasing — a
 * fortnight of screening leaves more people advanced than waiting — and
 * `FunnelChart` draws inside a shrinking track, so the bars overflow it and the
 * chart reads as broken. Bars are the right instrument for a count. A funnel
 * would be right for one cohort's conversion over time, which needs dates this
 * API does not expose.
 */
export function HiringScreen() {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader title="Hiring" />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading your hiring pipeline</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING") && !can("APPROVE_HIRING")) {
    return (
      <>
        <PageHeader title="Hiring" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot see hiring"
              description="Applications hold a stranger's phone number and salary expectation, so they are kept to whoever hires or approves hiring. Ask whoever manages access to add one of those to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Overview />;
}

/* -------------------------------------------------------------------------- */

function Overview() {
  const { live, loading, error, roles, numbers, bars, reload } = useHiringOverview();
  const pipeline = pipelineSnapshot();

  return (
    <>
      <PageHeader
        title="Hiring"
        action={
          <>
            <ButtonLink href="/hiring/postings" variant="secondary" size="sm">
              <Megaphone aria-hidden="true" className="size-4" />
              Job adverts
            </ButtonLink>
            <ButtonLink href="/hiring/requisitions/new" variant="accent" size="sm">
              <Plus aria-hidden="true" className="size-4" />
              New role
            </ButtonLink>
          </>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <SourceBadge live={live} />
          {loading && <span className="text-meta text-muted">Loading…</span>}
          {error && (
            <>
              <span className="text-body-sm text-danger-text">
                {error.message}
              </span>
              <Button variant="secondary" size="sm" onClick={reload}>
                Try again
              </Button>
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Live adverts"
            value={String(numbers.liveAdverts)}
            hint={
              numbers.adverts === numbers.liveAdverts
                ? "all of them"
                : `${numbers.adverts - numbers.liveAdverts} draft or closed`
            }
          />
          <Stat label="People who applied" value={String(numbers.applications)} />
          <Stat
            label="Waiting to be screened"
            value={String(numbers.waiting)}
            icon={<TriangleAlert aria-hidden="true" />}
            hint={numbers.waiting > 0 ? "nobody has looked yet" : "queue is clear"}
          />
          <Stat
            label="Screened in"
            value={String(numbers.advanced)}
            hint={
              numbers.advanceRate === null
                ? "no rate until somebody is screened"
                : `${numbers.advanceRate}% of everyone screened`
            }
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader
              title="Advertised roles"
              description="Newest first. The count is everybody who applied through that advert."
              action={
                numbers.waiting > 0 ? (
                  <ButtonLink
                    href="/hiring/postings/applications"
                    variant="accent"
                    size="sm"
                  >
                    Screen {numbers.waiting} waiting
                  </ButtonLink>
                ) : undefined
              }
            />
            {roles.length === 0 ? (
              <EmptyState
                compact
                icon={<Megaphone aria-hidden="true" />}
                title="No adverts yet"
                description="Write one and candidates can apply to it directly."
                action={
                  <ButtonLink href="/hiring/postings" variant="accent" size="sm">
                    Write an advert
                  </ButtonLink>
                }
              />
            ) : (
              <TableWrap className="rounded-none border-0">
                <THead>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH align="right">Applied</TH>
                  <TH align="right">Waiting</TH>
                  <TH align="right">Pay range</TH>
                </THead>
                <TBody>
                  {roles.map((role) => (
                    <RoleTableRow key={role.postingId} role={role} />
                  ))}
                </TBody>
              </TableWrap>
            )}
          </Card>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader
                title="Where applications are"
                action={<SourceBadge live={live} />}
              />
              <CardBody>
                <BarChart
                  colorBy="series"
                  caption="Applications by state: waiting to be screened, screened in, turned down, withdrawn"
                  points={bars}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Interviews booked"
                action={<SourceBadge live={false} />}
              />
              <CardBody className="flex flex-col gap-3">
                {pipeline.scheduledInterviews.length === 0 ? (
                  <p className="text-body-sm text-muted">Nothing booked.</p>
                ) : (
                  <p className="text-body-sm text-body">
                    <span className="tabular font-medium text-ink">
                      {pipeline.scheduledInterviews.length}
                    </span>{" "}
                    scheduled, and{" "}
                    <span className="tabular font-medium text-ink">
                      {pipeline.stalled.length}
                    </span>{" "}
                    candidates have sat in one stage for a week or more.
                  </p>
                )}
                <ButtonLink href="/hiring/interviews" variant="secondary" size="sm">
                  <CalendarClock aria-hidden="true" className="size-3.5" />
                  Open interviews
                </ButtonLink>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Offers out" action={<SourceBadge live={false} />} />
              <CardBody className="flex flex-col gap-3">
                {pipeline.offersOut.length === 0 && (
                  <p className="text-body-sm text-muted">No offers pending.</p>
                )}
                {pipeline.offersOut.map((card) => (
                  /* A plain wrapper with the link stretched over it by
                     `after:inset-0`. An outer <Link> wrapping the inner one
                     would nest anchors, which breaks hydration silently and
                     renders the page blank with nothing useful in the console. */
                  <div
                    key={card.id}
                    className="relative flex items-center gap-3 rounded-md border border-line p-2.5 transition-colors hover:bg-canvas"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-medium text-ink">
                        <Link
                          href={`/hiring/candidates/${card.id}`}
                          className="after:absolute after:inset-0 hover:text-accent-text hover:underline underline-offset-4"
                        >
                          {fullName(card.candidate)}
                        </Link>
                      </p>
                      <p className="truncate text-meta text-muted">
                        {card.requisition.title}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-body-sm font-medium text-ink">
                        {formatMoney(card.offer!.grossMonthly, "NGN", {
                          decimals: true,
                        })}
                      </p>
                      <Badge
                        tone={card.offer!.status === "sent" ? "info" : "warning"}
                        size="sm"
                      >
                        {card.offer!.status === "sent"
                          ? "With the candidate"
                          : "Waiting on approval"}
                      </Badge>
                    </div>
                  </div>
                ))}
                <ButtonLink href="/hiring/offers" variant="secondary" size="sm">
                  Open offer approvals
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </ButtonLink>
              </CardBody>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A pay range, written out in full.
 *
 * Two decimals and thousands separators, never abbreviated. Somebody reconciles
 * a band against an offer letter and against a bank statement, and ₦1.8m is not
 * a figure you can do that with.
 */
function payRange(min: number | null, max: number | null): string {
  const low = min === null ? null : formatMoney(min, "NGN", { decimals: true });
  const high = max === null ? null : formatMoney(max, "NGN", { decimals: true });
  if (low && high) return low === high ? low : `${low} – ${high}`;
  if (low) return `${low} and up`;
  if (high) return `Up to ${high}`;
  return "Not quoted";
}

const STATUS_TONE = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  CLOSED: "warning",
} as const;

/**
 * One advertised role.
 *
 * The title opens the role's own page whenever an approved requisition sits
 * behind the advert — which is where the pipeline and this role's screening
 * queue live. An advert with no requisition has nothing to open, so it is plain
 * text and the subtitle says why rather than offering a link into nothing.
 *
 * The two links are in **different cells** on purpose. Wrapping the row in one
 * link and putting another inside it nests anchors, which breaks hydration
 * silently: the page renders blank and the console says nothing useful.
 */
function RoleTableRow({ role }: { role: RoleRow }) {
  return (
    <TR interactive>
      <TDPrimary
        title={
          role.requisitionId ? (
            <Link
              href={`/hiring/requisitions/${role.requisitionId}`}
              className="hover:text-accent-text hover:underline underline-offset-4"
            >
              {role.title}
            </Link>
          ) : (
            role.title
          )
        }
        subtitle={[
          role.reference ?? "No approved role behind it",
          role.location ?? "Location not set",
          role.employmentTypeLabel,
        ].join(" · ")}
      />
      <TD>
        <Badge tone={STATUS_TONE[role.status]} size="sm" dot>
          {role.statusLabel}
        </Badge>
      </TD>
      <TD align="right" className="tabular font-medium text-ink">
        {role.applications}
      </TD>
      <TD align="right" className="tabular">
        {role.waiting > 0 ? (
          <Link
            href={`/hiring/postings/applications?posting=${role.postingId}`}
            className="font-medium text-accent-text hover:underline underline-offset-4"
          >
            {role.waiting}
          </Link>
        ) : (
          <span className="text-muted">0</span>
        )}
      </TD>
      <TD align="right" className="tabular whitespace-nowrap">
        {payRange(role.salaryMin, role.salaryMax)}
      </TD>
    </TR>
  );
}
