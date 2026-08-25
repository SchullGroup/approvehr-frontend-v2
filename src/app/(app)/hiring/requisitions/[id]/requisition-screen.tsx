"use client";

import { Lock, MapPin, Megaphone, Users } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  EmptyState,
  Skeleton,
  formatMoney,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SourceBadge } from "@/components/hiring/source-badge";
import { usePermissions } from "@/lib/permissions";
import { pipelineCards, requisitionById } from "@/lib/mock/hiring";
import { employeeById } from "@/lib/mock/people";
import { fullName } from "@/lib/types";
import { RequisitionScreening, UnknownRequisition } from "./screening";
import { RequisitionWorkspace } from "./workspace";

/**
 * One role — gated.
 *
 * The salary band, the hiring team's names and every candidate's pipeline
 * record (expected salary included) all render below, so this screen is kept
 * to whoever holds `MANAGE_HIRING`, the same gate every sibling hiring screen
 * uses. See `candidate-screen.tsx` for the pattern this copies.
 */
export function RequisitionScreen({ id }: { id: string }) {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/hiring", label: "Pipeline" }]}
          title="Requisition"
        />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading this requisition</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/hiring", label: "Pipeline" }]}
          title="Requisition"
        />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot see this requisition"
              description="A requisition holds the salary band, the hiring team and every candidate's pipeline record — including their expected salary — so it is kept to whoever hires. Ask whoever manages access to add hiring to your role."
              action={
                <ButtonLink href="/hiring" variant="secondary" size="sm">
                  Back to hiring
                </ButtonLink>
              }
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <RequisitionDetail id={id} />;
}

/* -------------------------------------------------------------------------- */

const STATUS_TONE = {
  draft: "neutral",
  pending_approval: "warning",
  open: "success",
  on_hold: "warning",
  closed: "neutral",
} as const;

const STATUS_LABEL = {
  draft: "Draft",
  pending_approval: "Pending approval",
  open: "Open",
  on_hold: "On hold",
  closed: "Closed",
} as const;

const WORK_MODE = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" };
const TYPE = { full_time: "Full time", contract: "Contract", internship: "Internship" };

/**
 * A band, written out in full.
 *
 * Two decimals and thousands separators, never abbreviated: an approved band is
 * the figure an offer gets checked against, and ₦1.8m is not something you can
 * reconcile with.
 */
const band = (min: number, max: number) =>
  `${formatMoney(min, "NGN", { decimals: true })} – ${formatMoney(max, "NGN", { decimals: true })}`;

/**
 * The role itself, once `MANAGE_HIRING` has already been confirmed by
 * `RequisitionScreen` above.
 *
 * ## The page has two halves and only one of them can be live
 *
 * `/api/v1/careers` answers about the **advert** and the applications it brings
 * in. `Requisition`, `PipelineStage`, `Candidate`, the pipeline `Application`,
 * `Interview` and `Scorecard` all exist in Prisma and none of them has a route —
 * so the role facts and the board below are the seeded demo data whatever mode
 * the app is in, and each panel says so. The screening queue in the middle is
 * live whenever the API is up, and it is the one place in the product that can
 * move somebody into a pipeline without asking for a requisition id by hand,
 * because the requisition is the URL.
 *
 * ## Why an unknown id is not a 404
 *
 * Connected, the roles list on `/hiring` is built from adverts, and an advert's
 * `requisitionId` is a real database id this browser's seed has never seen.
 * `notFound()` there would be a dead end reached by following a link the product
 * itself drew — so an unrecognised id renders the half that *is* live.
 */
function RequisitionDetail({ id }: { id: string }) {
  const req = requisitionById(id);
  if (!req) return <UnknownRequisition id={id} />;

  const cards = pipelineCards(req.id);
  const manager = employeeById(req.hiringManagerId);
  const recruiter = employeeById(req.recruiterId);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/hiring", label: "Pipeline" },
          { href: `/hiring/requisitions/${req.id}`, label: req.reference },
        ]}
        title={req.title}
        meta={
          <>
            <Badge tone={STATUS_TONE[req.status]} dot>
              {STATUS_LABEL[req.status]}
            </Badge>
            <Badge tone="neutral" size="sm">
              {req.reference}
            </Badge>
          </>
        }
        action={
          <ButtonLink href="/hiring/postings" variant="secondary" size="sm">
            <Megaphone aria-hidden="true" className="size-3.5" />
            Job adverts
          </ButtonLink>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {/* Role facts. Kept above the pipeline because a recruiter screening a
            CV needs the band and the must-haves in the same glance. */}
        {/* Scoped to the two cards it sits above. The panels further down carry
            their own badge — the applications one is live when the API is up,
            and a note here claiming that would be wrong in demo mode. */}
        <SourceBadge live={false} note="The role's own details." />

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-x-6 gap-y-3 text-body-sm">
                <Fact label="Salary band">
                  <span className="tabular whitespace-nowrap">
                    {band(req.salaryMin, req.salaryMax)}
                  </span>
                </Fact>
                <Fact label="Location">
                  <span className="inline-flex items-center gap-1">
                    <MapPin aria-hidden="true" className="size-3.5 text-faint" />
                    {req.location}
                  </span>
                </Fact>
                <Fact label="Type">
                  {TYPE[req.employmentType]} · {WORK_MODE[req.workMode]}
                </Fact>
                <Fact label="Opened">{req.openedAt}</Fact>
              </div>

              <div className="grid gap-5 border-t border-line pt-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-meta font-semibold tracking-wide text-muted">
                    Must have
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {req.mustHaves.map((m) => (
                      <li
                        key={m}
                        className="flex gap-2 text-body-sm text-body"
                      >
                        <span aria-hidden="true" className="text-success-text">
                          ✓
                        </span>
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
                {req.niceToHaves.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-meta font-semibold tracking-wide text-muted">
                      Nice to have
                    </h3>
                    <ul className="flex flex-col gap-1.5">
                      {req.niceToHaves.map((m) => (
                        <li
                          key={m}
                          className="flex gap-2 text-body-sm text-body"
                        >
                          <span aria-hidden="true" className="text-faint">
                            +
                          </span>
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col gap-3.5">
              <h3 className="text-meta font-semibold tracking-wide text-muted">
                Hiring team
              </h3>
              <Person label="Hiring manager" name={manager ? fullName(manager) : "—"} role={manager?.jobTitle} />
              <Person label="Recruiter" name={recruiter ? fullName(recruiter) : "—"} role={recruiter?.jobTitle} />
              <div className="border-t border-line pt-3">
                <p className="flex items-center gap-1.5 text-meta text-muted">
                  <Users aria-hidden="true" className="size-3.5" />
                  {req.activeStages.length} of 5 pipeline stages in use
                </p>
              </div>
            </CardBody>
          </Card>
        </div>

        <RequisitionScreening requisitionId={req.id} roleName={req.title} />

        <div className="flex flex-col gap-4">
          <SourceBadge live={false} note="The pipeline board." />
          <RequisitionWorkspace
            initialCards={cards}
            activeStages={[...req.activeStages]}
          />
        </div>
      </PageBody>
    </>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-meta uppercase tracking-wide text-faint">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}

function Person({
  label,
  name,
  role,
}: {
  label: string;
  name: string;
  role?: string;
}) {
  return (
    <div>
      <p className="text-meta uppercase tracking-wide text-faint">
        {label}
      </p>
      <p className="mt-0.5 text-body-sm font-medium text-ink">{name}</p>
      {role && <p className="text-meta text-muted">{role}</p>}
    </div>
  );
}
