"use client";

import { useState } from "react";
import { Scale } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  EmptyState,
  SegmentedControl,
  Spinner,
  Stat,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  Tabs,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import type {
  ApiFairness,
  ApiFairnessDimension,
  FairnessPeriods,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { FAIRNESS_OFFLINE, useCycleFairness } from "@/lib/store/performance";
import { BandBars, RangeChart, pct, points } from "./charts";

type Tab = "groups" | "managers" | "calibration";
type View = "average" | "bands" | "table";

export function FairnessScreen({ cycleId }: { cycleId: string }) {
  const allowed = useCan("VIEW_FAIRNESS");
  const [periods, setPeriods] = useState<FairnessPeriods>(1);
  const [tab, setTab] = useState<Tab>("groups");
  const detail = useCycleFairness(cycleId, periods, allowed);
  const data = detail.fairness;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/performance", label: "Performance" },
          {
            href: `/performance/periods/${cycleId}`,
            label: detail.cycle?.name ?? "Appraisal period",
          },
        ]}
        title="Fairness check"
        meta={
          detail.cycle ? (
            <Badge tone="neutral" size="sm" dot>
              {detail.cycle.stageLabel}
            </Badge>
          ) : undefined
        }
        action={
          allowed ? (
            <SegmentedControl
              label="Periods counted"
              value={String(periods) as "1" | "3"}
              onChange={(value) => setPeriods(value === "3" ? 3 : 1)}
              options={[
                { value: "1", label: "This period" },
                { value: "3", label: "Last 3 periods" },
              ]}
            />
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {!allowed ? (
          <Card>
            <EmptyState
              icon={<Scale aria-hidden="true" />}
              title="You don't have access to the fairness check"
              description="It needs the “See the fairness check” permission."
              action={
                <ButtonLink
                  href={`/performance/periods/${cycleId}`}
                  variant="secondary"
                >
                  Back to the period
                </ButtonLink>
              }
            />
          </Card>
        ) : !detail.available ? (
          <Callout tone="neutral">{FAIRNESS_OFFLINE}</Callout>
        ) : null}

        <LoadFailure
          subject="the fairness check"
          error={detail.error}
          onRetry={detail.reload}
        />

        {detail.loading && !data && (
          <Card>
            <CardBody className="flex items-center gap-2 text-body-sm text-muted">
              <Spinner size="sm" />
              Working out the fairness check
            </CardBody>
          </Card>
        )}

        {data && (
          <>
            <Summary data={data} periods={periods} />
            <Tabs
              items={[
                {
                  id: "groups",
                  label: "Groups",
                  count: flagCount(data) || undefined,
                },
                { id: "managers", label: "Managers" },
                { id: "calibration", label: "Calibration moves" },
              ]}
              value={tab}
              onChange={(id) => setTab(id as Tab)}
            >
              {tab === "groups" && <Groups data={data} />}
              {tab === "managers" && <Managers data={data} />}
              {tab === "calibration" && <Calibration data={data} />}
            </Tabs>
            <Disclosure title="How flags work" region={false}>
              <ul className="list-disc space-y-1 pl-5 text-body-sm text-body">
                <li>
                  Marks are compared before calibration. Calibration moves are
                  on their own tab.
                </li>
                <li>
                  A group is flagged when its gap is at least{" "}
                  {pct(data.rules.minGapBp).replace("%", "")} points and the
                  likely range doesn’t cross zero.
                </li>
                <li>
                  Groups under {data.rules.minGroup} people are hidden. Religion
                  and state of origin aren’t checked.
                </li>
                <li>
                  A manager is flagged at{" "}
                  {pct(data.managers.rules.apartBp).replace("%", "")} points
                  from everyone else, or when their marks barely vary.
                </li>
              </ul>
            </Disclosure>
          </>
        )}
      </PageBody>
    </>
  );
}

function flagCount(data: ApiFairness) {
  return data.dimensions.reduce((n, d) => n + d.flags.length, 0);
}

function Summary({
  data,
  periods,
}: {
  data: ApiFairness;
  periods: FairnessPeriods;
}) {
  const hidden = data.dimensions.reduce((n, d) => n + d.hidden.length, 0);
  const flags = flagCount(data);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Marks compared"
          value={String(data.compared)}
          hint={
            periods === 3
              ? `Across ${data.periods.map((p) => p.name).join(", ")}`
              : `Of ${String(data.inPeriod)} people in the period`
          }
        />
        <Stat
          label="Gaps flagged"
          value={String(flags)}
          hint={flags ? "See the Groups tab" : "None this time"}
        />
        <Stat
          label="Groups hidden"
          value={String(hidden)}
          hint={`Under ${String(data.rules.minGroup)} people`}
        />
        <Stat
          label="Company average"
          value={data.averageBp === null ? "No marks yet" : pct(data.averageBp)}
        />
      </div>
      {data.skipped.length > 0 && (
        <Callout tone="neutral">
          Not counted:{" "}
          {data.skipped
            .map((s) => `${s.name} (${s.reason.toLowerCase()})`)
            .join(", ")}
          .
        </Callout>
      )}
    </div>
  );
}

function Groups({ data }: { data: ApiFairness }) {
  if (data.compared === 0) {
    return (
      <Card>
        <EmptyState
          compact
          icon={<Scale aria-hidden="true" />}
          title="No marks yet"
          description="Groups appear once people have marks."
        />
      </Card>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {data.dimensions.map((dimension) => (
        <GroupCard
          key={dimension.key}
          dimension={dimension}
          averageBp={data.averageBp}
        />
      ))}
    </div>
  );
}

function GroupCard({
  dimension,
  averageBp,
}: {
  dimension: ApiFairnessDimension;
  averageBp: number | null;
}) {
  const [view, setView] = useState<View>("average");
  const flagged = new Set(
    dimension.flags.flatMap((f) => [
      f.label,
      ...(f.against ? [f.against] : []),
    ]),
  );
  const footer = [
    ...dimension.flags.map((f) => ({
      text: `${f.label}: ${points(f.gapBp)} vs ${f.against ? f.against.toLowerCase() : "everyone else"}`,
      warn: true,
    })),
    ...(dimension.hidden.length
      ? [
          {
            text: `Hidden: ${dimension.hidden.map((h) => `${h.label} (${String(h.people)})`).join(", ")}`,
            warn: false,
          },
        ]
      : []),
    ...(dimension.notRecorded
      ? [{ text: `${String(dimension.notRecorded)} not recorded`, warn: false }]
      : []),
  ];

  return (
    <Card className="min-w-0">
      <CardHeader
        level={3}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap">{dimension.label}</span>
            {dimension.flags.length ? (
              <Badge tone="warning" size="sm" dot>
                Flagged
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm" dot>
                {dimension.groups.length < 2
                  ? "Too few to compare"
                  : "No clear gap"}
              </Badge>
            )}
          </span>
        }
        action={
          dimension.groups.length > 0 ? (
            <SegmentedControl
              label={`Show ${dimension.label.toLowerCase()} as`}
              value={view}
              onChange={setView}
              options={[
                { value: "average", label: "Average" },
                { value: "bands", label: "Bands" },
                { value: "table", label: "Table" },
              ]}
            />
          ) : undefined
        }
      />
      {dimension.groups.length === 0 ? (
        <CardBody className="text-body-sm text-muted">
          Every group here is under the size it can be shown at.
        </CardBody>
      ) : view === "table" ? (
        <TableWrap caption={`${dimension.label} by group`}>
          <THead>
            <TH>Group</TH>
            <TH className="text-right">People</TH>
            <TH className="text-right">Average</TH>
            <TH className="text-right">Gap</TH>
            <TH className="text-right">Above meets</TH>
          </THead>
          <TBody>
            {dimension.groups.map((group) => (
              <TR key={group.label}>
                <TD>{group.label}</TD>
                <TD className="text-right tabular-nums">{group.people}</TD>
                <TD className="text-right tabular-nums">{pct(group.meanBp)}</TD>
                <TD className="text-right tabular-nums">
                  {group.gap ? points(group.gap.gapBp) : "—"}
                </TD>
                <TD className="text-right tabular-nums">
                  {Math.round(
                    ((group.bands.EXCEEDS + group.bands.OUTSTANDING) /
                      group.people) *
                      100,
                  )}
                  %
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      ) : (
        <CardBody>
          {view === "average" ? (
            <RangeChart
              caption={`Average mark by ${dimension.label.toLowerCase()}`}
              referenceBp={averageBp}
              rows={dimension.groups.map((g) => ({
                ...g,
                emphasis: flagged.has(g.label),
              }))}
            />
          ) : (
            <BandBars rows={dimension.groups} />
          )}
        </CardBody>
      )}
      {footer.length > 0 && (
        <div className="border-t border-line px-5 py-3 text-body-sm text-muted">
          {footer.map((item, i) => (
            <span
              key={item.text}
              className={item.warn ? "text-warning-text" : undefined}
            >
              {i > 0 ? " · " : ""}
              {item.text}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function Managers({ data }: { data: ApiFairness }) {
  const [view, setView] = useState<"average" | "table">("average");
  const { managers, hidden } = data.managers;
  const flagged = managers.filter((m) => m.flags.length > 0);
  const pattern = (m: (typeof managers)[number]) =>
    m.flags.includes("apart") && m.gap
      ? `${points(m.gap.gapBp)} vs everyone else`
      : m.flags.includes("flat")
        ? `${String(m.sameBandShare)}% in the same band`
        : "—";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          level={3}
          title="Average mark given, by manager"
          action={
            managers.length > 0 ? (
              <SegmentedControl
                label="Show managers as"
                value={view}
                onChange={setView}
                options={[
                  { value: "average", label: "Average" },
                  { value: "table", label: "Table" },
                ]}
              />
            ) : undefined
          }
        />
        {managers.length === 0 ? (
          <CardBody className="text-body-sm text-muted">
            No manager has rated enough people to show yet.
          </CardBody>
        ) : view === "average" ? (
          <CardBody>
            <RangeChart
              caption="Average mark by manager"
              referenceBp={data.averageBp}
              rows={managers.map((m) => ({
                ...m,
                label: m.name,
                emphasis: m.flags.length > 0,
              }))}
            />
          </CardBody>
        ) : (
          <TableWrap caption="Managers">
            <THead>
              <TH>Manager</TH>
              <TH className="text-right">Rated</TH>
              <TH className="text-right">Average</TH>
              <TH className="text-right">Vs others</TH>
              <TH className="text-right">Spread</TH>
            </THead>
            <TBody>
              {managers.map((m) => (
                <TR key={m.name}>
                  <TD>{m.name}</TD>
                  <TD className="text-right tabular-nums">{m.people}</TD>
                  <TD className="text-right tabular-nums">{pct(m.meanBp)}</TD>
                  <TD className="text-right tabular-nums">
                    {m.gap ? points(m.gap.gapBp) : "—"}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {m.spreadBp === null
                      ? "—"
                      : points(m.spreadBp).replace("+", "")}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
        {hidden.managers > 0 && (
          <div className="border-t border-line px-5 py-3 text-body-sm text-muted">
            {hidden.managers} {hidden.managers === 1 ? "manager" : "managers"}{" "}
            who rated fewer than {data.managers.rules.minRated} people{" "}
            {hidden.managers === 1 ? "isn’t" : "aren’t"} shown
          </div>
        )}
      </Card>

      {flagged.length > 0 && (
        <Card>
          <CardHeader
            level={3}
            title={
              <span className="flex items-center gap-2">
                Flagged
                <Badge tone="warning" size="sm" dot>
                  {flagged.length}
                </Badge>
              </span>
            }
          />
          <TableWrap caption="Flagged managers">
            <THead>
              <TH>Manager</TH>
              <TH className="text-right">Rated</TH>
              <TH className="text-right">Average</TH>
              <TH>Pattern</TH>
            </THead>
            <TBody>
              {flagged.map((m) => (
                <TR key={m.name}>
                  <TD>{m.name}</TD>
                  <TD className="text-right tabular-nums">{m.people}</TD>
                  <TD className="text-right tabular-nums">{pct(m.meanBp)}</TD>
                  <TD className="text-warning-text">{pattern(m)}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}

function Calibration({ data }: { data: ApiFairness }) {
  const { calibration } = data;
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Marks moved" value={String(calibration.moved)} />
        <Stat label="Moved up" value={String(calibration.up)} />
        <Stat label="Moved down" value={String(calibration.down)} />
      </div>

      <Card>
        <CardHeader level={3} title="Moves by group" />
        <TableWrap caption="Calibration moves by group">
          <THead>
            <TH>Grouping</TH>
            <TH>Group</TH>
            <TH className="text-right">Moves</TH>
            <TH className="text-right">Average move</TH>
          </THead>
          <TBody>
            {calibration.byGroup.flatMap((dim) =>
              dim.comparable && dim.groups
                ? dim.groups.map((g) => (
                    <TR key={`${dim.key}-${g.label}`}>
                      <TD>{dim.label}</TD>
                      <TD>{g.label}</TD>
                      <TD className="text-right tabular-nums">{g.moves}</TD>
                      <TD className="text-right tabular-nums">
                        {points(g.averageMoveBp)}
                      </TD>
                    </TR>
                  ))
                : [
                    <TR key={dim.key}>
                      <TD>{dim.label}</TD>
                      <TD className="text-muted" colSpan={3}>
                        Too few moves to compare yet
                      </TD>
                    </TR>,
                  ],
            )}
          </TBody>
        </TableWrap>
      </Card>

      {calibration.latest && (
        <Card>
          <CardHeader level={3} title="Latest moves" />
          {calibration.latest.length === 0 ? (
            <CardBody className="text-body-sm text-muted">
              No marks have been moved in this period.
            </CardBody>
          ) : (
            <TableWrap caption="Latest calibration moves">
              <THead>
                <TH>Date</TH>
                <TH>Employee</TH>
                <TH className="text-right">Mark</TH>
                <TH>By</TH>
                <TH>Reason</TH>
              </THead>
              <TBody>
                {calibration.latest.map((move) => (
                  <TR key={move.id}>
                    <TD className="whitespace-nowrap">{date(move.at)}</TD>
                    <TD>{move.employeeName}</TD>
                    <TD className="whitespace-nowrap text-right tabular-nums">
                      {pct(move.previousBp ?? move.computedBp)} →{" "}
                      {move.calibratedBp === null
                        ? `${pct(move.computedBp)} (put back)`
                        : pct(move.calibratedBp)}
                    </TD>
                    <TD>{move.actorName ?? "—"}</TD>
                    <TD className="text-muted">{move.reason ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </Card>
      )}
    </div>
  );
}
