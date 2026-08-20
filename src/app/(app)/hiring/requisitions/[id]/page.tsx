import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MapPin, Pencil, Share2, Users } from "lucide-react";
import { Badge, Button, Card, CardBody, Money } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { REQUISITIONS, pipelineCards, requisitionById } from "@/lib/mock/hiring";
import { employeeById } from "@/lib/mock/people";
import { fullName } from "@/lib/types";
import { RequisitionWorkspace } from "./workspace";

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

export default async function RequisitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const req = requisitionById(id);
  if (!req) notFound();

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
          <>
            <Button variant="secondary" size="sm">
              <Share2 aria-hidden="true" className="size-3.5" />
              Share job link
            </Button>
            <Button variant="secondary" size="sm">
              <Pencil aria-hidden="true" className="size-3.5" />
              Edit
            </Button>
          </>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {/* Role facts. Kept above the pipeline because a recruiter screening a
            CV needs the band and the must-haves in the same glance. */}
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-x-6 gap-y-3 text-[0.875rem]">
                <Fact label="Salary band">
                  <Money amount={req.salaryMin} compact /> –{" "}
                  <Money amount={req.salaryMax} compact />
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

        <RequisitionWorkspace
          initialCards={cards}
          activeStages={[...req.activeStages]}
        />
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
