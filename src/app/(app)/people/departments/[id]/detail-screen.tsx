"use client";

import { useState } from "react";
import { Building2, Users } from "lucide-react";

import {
  Badge,
  Button,
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
  TextLink,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import type { ApiDepartmentDetail } from "@/lib/api/endpoints";
import { useCan } from "@/lib/permissions";
import { useDepartment, useDepartments } from "@/lib/store/departments";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { AssignHeadDialog } from "../assign-head-dialog";

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
  const { detail, loading, reload } = useDepartment(id);
  /* The same permission the structure list asks before offering "Assign a
     head" from its row menu. */
  const canManage = useCan("MANAGE_SETTINGS");

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
            plain
            icon={<Building2 aria-hidden="true" className="size-5" />}
            title="That unit is not here"
            description="It may have been archived, or the link may be out of date. The structure screen lists everything that is there."
            action={
              <TextLink href="/people/departments" className="text-body-sm">
                Back to the structure
              </TextLink>
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
              value={
                <Money amount={detail.payrollKobo / 100} compact size="xl" />
              }
              {...(withoutPay > 0
                ? {
                    hint: `over ${detail.directEmployees - withoutPay} of ${detail.directEmployees}, ${withoutPay} have no pay set`,
                  }
                : { hint: "contractual gross, before deductions" })}
            />
          )}
          <Stat
            label="Units inside"
            value={String(detail.childCount)}
            hint={
              detail.childCount === 1 ? "sub-department" : "sub-departments"
            }
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
                : "Directly in this department, not counting anybody in a unit inside it."
            }
          />
          {people.length === 0 ? (
            <CardBody>
              <EmptyState
                plain
                icon={<Users aria-hidden="true" className="size-5" />}
                title="Nobody is in this unit yet"
                description="Assign people to it from the structure screen."
                action={
                  <TextLink href="/people/departments" className="text-body-sm">
                    Assign people
                  </TextLink>
                }
              />
            </CardBody>
          ) : (
            <>
              <div className="hidden sm:block">
                <TableWrap
                  className="rounded-none border-0"
                  caption="People in this unit"
                >
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
                            <TextLink href={`/people/${person.id}`}>
                              {person.name}
                            </TextLink>
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
              </div>

              <ul className="divide-y divide-line sm:hidden">
                {people.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <TextLink
                        href={`/people/${person.id}`}
                        className="text-body-sm"
                      >
                        {person.name}
                      </TextLink>
                      <p className="mt-0.5 text-meta text-muted">
                        {person.jobTitle}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-body-sm text-body">
                      <Money
                        amount={
                          person.grossMonthlyKobo === null
                            ? null
                            : person.grossMonthlyKobo / 100
                        }
                        size="sm"
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="What it is" level={2} />
          <CardBody>
            <DescriptionList
              columns={2}
              items={[
                { term: "Cost centre", value: detail.costCentre ?? "Not set" },
                {
                  term: "Head",
                  value: canManage ? (
                    <HeadValue detail={detail} onChanged={reload} />
                  ) : (
                    (detail.headName ?? "Nobody assigned")
                  ),
                },
                {
                  term: "Sits inside",
                  value:
                    detail.ancestors.length > 0
                      ? detail.ancestors[detail.ancestors.length - 1]!.name
                      : "Nothing: it is a top-level department",
                },
                {
                  term: "Rolled up",
                  value: `${detail.totalEmployees} ${detail.totalEmployees === 1 ? "person" : "people"} including every unit inside it`,
                },
              ]}
            />
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}

/**
 * The head, and the way to set one, on the unit's own page (UAT 23 Nov, L33:
 * NC-28). It said "Nobody assigned" with nothing to do about it; the only way
 * was the row menu on the structure list. The dialog is that one. Mounted only
 * for somebody who may change the structure, so nobody else reads the staff
 * list for it.
 */
function HeadValue({
  detail,
  onChanged,
}: {
  detail: ApiDepartmentDetail;
  onChanged: () => void;
}) {
  const departments = useDepartments(true);
  const { employees } = useEmployeeDirectory({ pageSize: 200 });
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{detail.headName ?? "Nobody assigned"}</span>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {detail.headName ? "Change the head" : "Assign a head"}
      </Button>
      {open && (
        <AssignHeadDialog
          departmentName={detail.name}
          currentHeadId={detail.headId}
          employees={employees.map((e) => ({
            id: e.id,
            name: `${e.firstName} ${e.lastName}`,
            jobTitle: e.jobTitle,
          }))}
          busy={busy}
          onClose={() => setOpen(false)}
          onAssign={async (headId) => {
            setBusy(true);
            try {
              await departments.update(detail.id, { headId });
              toast.push({
                title:
                  headId === null
                    ? `${detail.name} has no head now`
                    : "Head assigned",
                tone: "success",
              });
              setOpen(false);
              onChanged();
            } catch (error) {
              toast.push({
                title: "That did not work",
                tone: "danger",
                detail:
                  error instanceof ApiError
                    ? error.message
                    : "Something went wrong. Try again.",
              });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </span>
  );
}
