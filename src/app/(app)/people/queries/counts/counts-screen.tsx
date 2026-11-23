"use client";

import { useState } from "react";
import { BarChart3, ShieldAlert } from "lucide-react";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  LoadState,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  TextLink,
} from "@/components/ui";
import { isModuleOff } from "@/lib/api/queries";
import {
  COUNT_STATUS_WORD,
  type ApiQueryCounts,
  type CountCell,
} from "@/lib/api/query-ties";
import { useCan } from "@/lib/permissions";
import {
  DEMO_QUERY_HEADING,
  DEMO_QUERY_REASON,
  useQueriesSwitch,
  useQueryCounts,
} from "@/lib/store/queries";

/**
 * How many queries were served in a year, and nothing that can name anybody.
 *
 * ## Counts, never rankings
 *
 * In a team of five, "queries per manager" identifies people and punishes the managers who act.
 * So there is no cut by person, manager or department here, no ranking, no chart and no trend:
 * the server has no parameter for any of them, and this screen offers a year and nothing else.
 *
 * ## A withheld figure is not a nought
 *
 * A cell below the floor is `null` from the server and is drawn as **Withheld**: a zero would be a
 * claim, and a one or a two is nearly a name. The server also withholds another cell beside any
 * it withholds, so none can be worked out by subtraction, which is why a withheld cell may be
 * three or more. **Nothing is added up or subtracted in the browser**: there is no total row,
 * no total column and no sum anywhere on this screen, because a sum is exactly the arithmetic that
 * would reveal a withheld cell. The server's own sentence about the floor is shown as it came.
 */
export function CountsScreen() {
  const canIssue = useCan("ISSUE_QUERIES");
  const canDecide = useCan("DECIDE_QUERIES");
  const canSettings = useCan("MANAGE_SETTINGS");
  const queries = useQueriesSwitch();
  const works = canIssue || canDecide;

  const [year, setYear] = useState<number | undefined>(undefined);
  const counts = useQueryCounts(year, works && queries.on);

  if (counts.unavailable) {
    return (
      <Callout tone="info" title={DEMO_QUERY_HEADING}>
        {DEMO_QUERY_REASON}
      </Callout>
    );
  }

  if (!works) {
    return (
      <EmptyState
        plain
        icon={<ShieldAlert aria-hidden="true" className="size-5" />}
        title="You cannot open the counts"
        description="Counts are for the people given the Issue queries or Decide queries permission."
      />
    );
  }

  if (isModuleOff(counts.error) || (queries.known && !queries.on)) {
    return (
      <EmptyState
        icon={<BarChart3 aria-hidden="true" className="size-5" />}
        title="Queries are switched off for your company"
        description="Nothing has been deleted. An administrator can turn them on under Settings."
        {...(canSettings
          ? {
              action: (
                <TextLink href="/settings/queries">
                  Open Queries settings
                </TextLink>
              ),
            }
          : {})}
      />
    );
  }

  const data = counts.data;
  const shownYear = year ?? data?.year;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-2xl text-body-sm text-body">
          How many queries were served in a year, by where they stand now and by
          the month they were served. Drafts are not counted. There is no
          breakdown by person, manager or department.
        </p>
        {shownYear !== undefined && (
          <div className="w-40">
            <Field label="Year">
              <Select
                value={String(shownYear)}
                onChange={(event) => setYear(Number(event.target.value))}
              >
                {yearsFrom(data?.year ?? shownYear).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </div>

      <LoadState
        loading={counts.loading}
        error={counts.error}
        subject="the counts"
        onRetry={counts.reload}
        hasData={data !== null}
        skeleton="list"
      >
        {data && <CountsBody data={data} />}
      </LoadState>
    </div>
  );
}

/** The year the server answered for and the three before it. */
function yearsFrom(latest: number): number[] {
  return [latest, latest - 1, latest - 2, latest - 3];
}

function CountsBody({ data }: { data: ApiQueryCounts }) {
  const anyWithheld =
    data.byStatus.some((cell) => cell.count === null) ||
    data.byMonth.some((cell) => cell.count === null);
  return (
    <div className="flex flex-col gap-4">
      {/* The server's sentence, as it came. A fallback only for a server that sent none, and it
          states the floor the server gave and nothing else. */}
      <p className="text-body-sm text-muted">
        {data.note ??
          (data.floor !== null
            ? `A figure under ${data.floor} is never shown. There are no totals, and no breakdown by person, manager or department.`
            : "A small figure is never shown. There are no totals, and no breakdown by person, manager or department.")}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <CountTable
          title="Where they stand now"
          head="Status"
          description={`Queries served in ${data.year}`}
          cells={data.byStatus.map((cell) => ({
            ...cell,
            label: COUNT_STATUS_WORD[cell.key],
          }))}
        />
        <CountTable
          title="The month they were served"
          head="Month"
          description={`Queries served in ${data.year}`}
          cells={data.byMonth.map((cell) => ({
            ...cell,
            label: monthLabel(cell.key),
          }))}
        />
      </div>
      {anyWithheld && (
        <p className="text-meta text-muted">
          A cell reading Withheld is not a nought. It is hidden on purpose, and
          it may be three or more.
        </p>
      )}
    </div>
  );
}

function CountTable<K extends string>({
  title,
  head,
  description,
  cells,
}: {
  title: string;
  head: string;
  description: string;
  cells: (CountCell<K> & { label: string })[];
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        <TableWrap caption={title}>
          <THead>
            <TH>{head}</TH>
            <TH align="right">Queries</TH>
          </THead>
          <TBody>
            {cells.map((cell) => (
              <TR key={cell.key}>
                <TD>{cell.label}</TD>
                <TD className="text-right tabular-nums">
                  {cell.count === null ? (
                    <span className="text-muted">Withheld</span>
                  ) : (
                    cell.count
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      </CardBody>
    </Card>
  );
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-03" as "March 2026". Anything else is shown as sent, so a cell is never lost to a format. */
function monthLabel(key: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (!match) return key;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : key;
}
