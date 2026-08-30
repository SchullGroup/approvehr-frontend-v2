"use client";

import Link from "next/link";
import { Building2, Users } from "lucide-react";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  Money,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useDepartment } from "@/lib/store/departments";

/**
 * One department or sub-department, in full.
 *
 * The structure list answers "what units are there". It could not answer "who
 * is in Procurement and what does it cost", which is the question somebody
 * clicking a row is asking — the row offered Assign people, Sub-unit and Edit,
 * all of which are things to *do* to a department rather than a way to look at
 * one.
 *
 * Everything here comes from `GET /departments/:id`, which already returned the
 * unit, its ancestors and its people with their pay. Nothing new was needed on
 * the API; it had simply never been rendered.
 */
export function DepartmentDetailScreen({ id }: { id: string }) {
  const { detail, loading } = useDepartment(id);

  if (loading) {
    return (
      <>
        <PageHeader title="Department" />
        <PageBody>
          <Card>
            <CardBody>
              <p className="text-body-sm text-muted">Reading the unit…</p>
            </CardBody>
          </Card>
        </PageBody>
      </>
    );
  }

  if (!detail) {
    return (
      <>
        <PageHeader
          title="Department"
          breadcrumb={[
            { href: "/people", label: "Employees" },
            { href: "/people/departments", label: "Departments" },
          ]}
        />
        <PageBody>
          <EmptyState
            icon={<Building2 aria-hidden="true" className="size-5" />}
            title="That unit is not here"
            description="It may have been archived, or the link may be out of date. The structure screen lists everything that is there."
            action={
              <Link
                href="/people/departments"
                className="text-body-sm font-medium text-accent-text underline underline-offset-4"
              >
                Back to the structure
              </Link>
            }
          />
        </PageBody>
      </>
    );
  }

  /* A unit with a parent is a sub-department, which is the word the structure
     screen has used since the teams build. `depth` comes from the API. */
  const isSub = detail.parentId !== null;
  const people = detail.employees;
  /* Over the people who have an agreed figure. Somebody added before their pay
     was settled contributes nothing rather than a zero, and the count below
     says how many that is — a total that silently omits people is the defect
     this product is sold against. */
  const withoutPay = people.filter((p) => p.grossMonthlyKobo === null).length;

  return (
    <>
      <PageHeader
        title={detail.name}
        breadcrumb={[
          { href: "/people", label: "Employees" },
          { href: "/people/departments", label: "Departments" },
          /* Every ancestor, so a three-level structure is walkable both ways
             rather than only downwards from the list. */
          ...detail.ancestors.map((a) => ({
            href: `/people/departments/${a.id}`,
            label: a.name,
          })),
        ]}
        meta={
          <>
            <Badge tone={isSub ? "neutral" : "accent"} size="sm">
              {isSub ? "Sub-department" : "Department"}
            </Badge>
            {detail.costCentre && (
              <Badge tone="neutral" size="sm">
                {detail.costCentre}
              </Badge>
            )}
            {detail.archived && (
              <Badge tone="warning" size="sm">
                Switched off
              </Badge>
            )}
          </>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="People" value={String(detail.directEmployees)} />
          {/* Absent, not zeroed, for a reader without `VIEW_SALARIES` — and
              absent means the whole Stat goes, rather than a card headed
              "Monthly" with a dash under it. A labelled blank still asserts
              that there is a figure here somebody is being kept from; no card
              says only that this screen is about structure. */}
          {detail.payrollKobo !== null && (
            <Stat
              label="Monthly"
              value={<Money amount={detail.payrollKobo / 100} compact size="xl" />}
              {...(withoutPay > 0
                ? {
                    hint: `over ${detail.directEmployees - withoutPay} of ${detail.directEmployees} — ${withoutPay} have no pay set`,
                  }
                : { hint: "contractual gross, before deductions" })}
            />
          )}
          <Stat
            label="Units inside"
            value={String(detail.childCount)}
            hint={detail.childCount === 1 ? "sub-department" : "sub-departments"}
          />
          <Stat
            label="Led by"
            value={detail.headName ?? "Nobody"}
            {...(detail.headName ? {} : { hint: "no head assigned" })}
          />
        </div>

        <Card>
          <CardHeader
            title="The people in it"
            level={2}
            description={
              isSub
                ? "Directly in this sub-department."
                : "Directly in this department — not counting anybody in a unit inside it."
            }
          />
          {people.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={<Users aria-hidden="true" className="size-5" />}
                title="Nobody is in this unit yet"
                description="Assign people to it from the structure screen."
                action={
                  <Link
                    href="/people/departments"
                    className="text-body-sm font-medium text-accent-text underline underline-offset-4"
                  >
                    Assign people
                  </Link>
                }
              />
            </CardBody>
          ) : (
            <TableWrap className="rounded-none border-0" caption="People in this unit">
              <THead>
                <TH>Name</TH>
                <TH>Job title</TH>
                <TH align="right">Monthly</TH>
              </THead>
              <TBody>
                {people.map((person) => (
                  <TR key={person.id}>
                    <TDPrimary
                      title={
                        <Link href={`/people/${person.id}`} className="hover:underline">
                          {person.name}
                        </Link>
                      }
                    />
                    <TD>{person.jobTitle}</TD>
                    <TD align="right">
                      <Money
                        amount={
                          person.grossMonthlyKobo === null
                            ? null
                            : person.grossMonthlyKobo / 100
                        }
                        size="sm"
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="What it is" level={2} />
          <CardBody>
            <DescriptionList
              columns={2}
              items={[
                { term: "Cost centre", value: detail.costCentre ?? "Not set" },
                { term: "Head", value: detail.headName ?? "Nobody assigned" },
                {
                  term: "Sits inside",
                  value:
                    detail.ancestors.length > 0
                      ? detail.ancestors[detail.ancestors.length - 1]!.name
                      : "Nothing — it is a top-level department",
                },
                {
                  term: "Rolled up",
                  value: `${detail.totalEmployees} people including every unit inside it`,
                },
              ]}
            />
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
