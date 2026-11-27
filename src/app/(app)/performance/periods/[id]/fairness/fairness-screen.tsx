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
  EmptyState,
  SegmentedControl,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  Tabs,
  LoadState,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import { PageBody, PageHeader } from "@/components/portal/shell";
import type {
  ApiFairness,
  ApiFairnessDimension,
  FairnessPeriods,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import {
  FAIRNESS_OFFLINE,
  useCycleFairness,
  useReviewFlags,
} from "@/lib/store/performance";
import { RangeChart, pct, points } from "./charts";
import { PeopleToReview, flaggedCount } from "./people-to-review";

type Tab = "groups" | "managers" | "people";

export function FairnessScreen({
  cycleId,
  picker,
  initialTab,
}: {
  cycleId: string;
  /** Set when this is the Performance module page rather than one period's. */
  picker?: React.ReactNode;
  initialTab?: "people" | undefined;
}) {
  const allowed = useCan("VIEW_FAIRNESS");
  const [periods, setPeriods] = useState<FairnessPeriods>(1);
  const [chosen, setTab] = useState<Tab | null>(initialTab ?? null);
  const detail = useCycleFairness(cycleId, periods, allowed);
  const data = detail.fairness;
  const review = useReviewFlags(cycleId, allowed);
  /* It opens on the people to review whenever anybody is flagged, because that
     is the one thing to do; the statistics are what you read to understand it. */
  const flagged = flaggedCount(review.flags);
  const tab: Tab = chosen ?? (flagged > 0 ? "people" : "groups");

  return (
    <>
      <PageHeader
        breadcrumb={
          picker
            ? [{ href: "/performance", label: "Performance" }]
            : [
                { href: "/performance", label: "Performance" },
                {
                  href: `/performance/periods/${cycleId}`,
                  label: detail.cycle?.name ?? "Appraisal period",
                },
              ]
        }
        title="Fairness check"
        meta={
          picker || detail.cycle || data ? (
            <span className="flex flex-wrap items-center gap-2">
              {picker}
              {detail.cycle && (
                <Badge tone="neutral" size="sm" dot>
                  {detail.cycle.stageLabel}
                </Badge>
              )}
              {data && (
                <InfoTooltip label="How flags work" text={flagRules(data)} />
              )}
            </span>
          ) : undefined
        }
        action={
          allowed && tab !== "people" ? (
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
              plain
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

        <LoadState
          loading={detail.loading}
          error={detail.error}
          subject="the fairness check"
          onRetry={detail.reload}
          hasData={Boolean(data)}
          skeleton="detail"
        >
          {data && (
            <>
              <Tabs
                items={[
                  {
                    id: "groups",
                    label: "Groups",
                    count: flagCount(data) || undefined,
                  },
                  { id: "managers", label: "Managers" },
                  {
                    id: "people",
                    label: "People to review",
                    count: flagged || undefined,
                  },
                ]}
                value={tab}
                onChange={(id) => setTab(id as Tab)}
              >
                {tab === "groups" && <Groups data={data} />}
                {tab === "managers" && <Managers data={data} />}
                {tab === "people" && (
                  <PeopleToReview
                    cycleId={cycleId}
                    flags={review.flags}
                    loading={review.loading}
                    error={review.error}
                    reload={review.reload}
                    stage={detail.cycle?.stage ?? null}
                  />
                )}
              </Tabs>
            </>
          )}
        </LoadState>
      </PageBody>
    </>
  );
}

function flagCount(data: ApiFairness) {
  return data.dimensions.reduce((n, d) => n + d.flags.length, 0);
}

/**
 * How a flag is decided, and who is left out of the comparison, as one tooltip
 * on the title. Rules are said once and out of the way.
 */
function flagRules(data: ApiFairness): string {
  const skipped =
    data.skipped.length > 0
      ? ` Not counted: ${data.skipped.map((s) => `${s.name} (${s.reason.toLowerCase()})`).join(", ")}.`
      : "";
  return (
    `Scores are compared before calibration. A group is flagged when its gap is at least ${pct(data.rules.minGapBp).replace("%", "")} points and the likely range doesn't cross zero. ` +
    `Groups under ${String(data.rules.minGroup)} people are hidden. Religion and state of origin aren't checked. ` +
    `A manager is flagged at ${pct(data.managers.rules.apartBp).replace("%", "")} points from everyone else, or when their scores barely vary.` +
    skipped
  );
}

function Groups({ data }: { data: ApiFairness }) {
  const flagged = data.dimensions.filter(
    (dimension) => dimension.flags.length > 0,
  );
  const moves = data.calibration.byGroup.filter(
    (dimension) => dimension.comparable && dimension.groups,
  );
  if (data.compared === 0) {
    return (
      <Card>
        <EmptyState
          compact
          icon={<Scale aria-hidden="true" />}
          title="No scores yet"
        />
      </Card>
    );
  }
  if (flagged.length === 0 && (data.calibration.moved === 0 || !moves.length)) {
    return (
      <Card>
        <EmptyState
          compact
          icon={<Scale aria-hidden="true" />}
          title="No gaps flagged"
        />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {flagged.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {flagged.map((dimension) => (
            <GroupCard
              key={dimension.key}
              dimension={dimension}
              averageBp={data.averageBp}
            />
          ))}
        </div>
      )}
      {data.calibration.moved > 0 && moves.length > 0 && (
        <CalibrationByGroup data={data} />
      )}
    </div>
  );
}

/**
 * Who calibration moved, by group. This is fairness analysis, so it is here and
 * not under the period's Scores. Only groups big enough to compare are listed.
 */
function CalibrationByGroup({ data }: { data: ApiFairness }) {
  return (
    <Card>
      <CardHeader level={3} title="Calibration moves" />
      <TableWrap caption="Calibration moves by group">
        <THead>
          <TH>Grouping</TH>
          <TH>Group</TH>
          <TH className="text-right">Moves</TH>
          <TH className="text-right">Average move</TH>
        </THead>
        <TBody>
          {data.calibration.byGroup.flatMap((dimension) =>
            dimension.comparable && dimension.groups
              ? dimension.groups.map((group) => (
                  <TR key={`${dimension.key}-${group.label}`}>
                    <TD>{dimension.label}</TD>
                    <TD>{group.label}</TD>
                    <TD className="text-right tabular-nums">{group.moves}</TD>
                    <TD className="text-right tabular-nums">
                      {points(group.averageMoveBp)}
                    </TD>
                  </TR>
                ))
              : [],
          )}
        </TBody>
      </TableWrap>
    </Card>
  );
}

/**
 * One card for a grouping where a gap was found: the averages on one chart, and
 * who is flagged against whom underneath. Only flagged groupings get a card, so
 * there is no "no clear gap" badge and no switch to a table or bands.
 */
export function GroupCard({
  dimension,
  averageBp,
}: {
  dimension: ApiFairnessDimension;
  averageBp: number | null;
}) {
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
      <CardHeader level={3} title={dimension.label} />
      <CardBody>
        <RangeChart
          caption={`Average score by ${dimension.label.toLowerCase()}`}
          referenceBp={averageBp}
          rows={dimension.groups.map((g) => ({
            ...g,
            emphasis: flagged.has(g.label),
          }))}
        />
      </CardBody>
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

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          level={3}
          title="Average score given, by manager"
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
              caption="Average score by manager"
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
                    {m.gap ? points(m.gap.gapBp) : "No gap"}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {m.spreadBp === null
                      ? "No data"
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
    </div>
  );
}
