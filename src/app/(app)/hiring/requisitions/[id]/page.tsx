import type { Metadata } from "next";
import { MapPin, Megaphone, Users } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  formatMoney,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SourceBadge } from "@/components/hiring/source-badge";
import { REQUISITIONS, pipelineCards, requisitionById } from "@/lib/mock/hiring";
import { employeeById } from "@/lib/mock/people";
import { fullName } from "@/lib/types";
import { RequisitionScreening, UnknownRequisition } from "./screening";
import { RequisitionWorkspace } from "./workspace";

/**
 * One role.
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

export function generateStaticParams() {
  return REQUISITIONS.map((r) => ({ id: r.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const req = requisitionById(id);
  return { title: req ? `${req.title} · Hiring` : "Requisition" };
}

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

export default async function RequisitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const req = requisitionById(id);
  if (!req) return <UnknownRequisition id={id} />;

  const cards = pipelineCards(req.id);
  const manager = employeeById(req.hiringManagerId);
  const recruiter = employeeById(req.recruiterId);
  const inProgress = cards.filter((c) => c.outcome === "in_progress").length;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/hiring", label: "Hiring" },
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
        description={`${req.openings} opening${req.openings > 1 ? "s" : ""} · ${inProgress} candidates in play · target start ${req.targetStartDate}`}
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
              <div className="flex flex-wrap gap-x-6 gap-y-3 text-[0.875rem]">
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
                  <h3 className="mb-2 text-[0.75rem] font-semibold tracking-wide text-muted">
                    Must have
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {req.mustHaves.map((m) => (
                      <li
                        key={m}
                        className="flex gap-2 text-[0.875rem] text-body"
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
                    <h3 className="mb-2 text-[0.75rem] font-semibold tracking-wide text-muted">
                      Nice to have
                    </h3>
                    <ul className="flex flex-col gap-1.5">
                      {req.niceToHaves.map((m) => (
                        <li
                          key={m}
                          className="flex gap-2 text-[0.875rem] text-body"
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
              <h3 className="text-[0.75rem] font-semibold tracking-wide text-muted">
                Hiring team
              </h3>
              <Person label="Hiring manager" name={manager ? fullName(manager) : "—"} role={manager?.jobTitle} />
              <Person label="Recruiter" name={recruiter ? fullName(recruiter) : "—"} role={recruiter?.jobTitle} />
              <div className="border-t border-line pt-3">
                <p className="flex items-center gap-1.5 text-[0.75rem] text-muted">
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
      <dt className="text-[0.75rem] uppercase tracking-wide text-faint">
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
      <p className="text-[0.75rem] uppercase tracking-wide text-faint">
        {label}
      </p>
      <p className="mt-0.5 text-[0.875rem] font-medium text-ink">{name}</p>
      {role && <p className="text-[0.75rem] text-muted">{role}</p>}
    </div>
  );
}
