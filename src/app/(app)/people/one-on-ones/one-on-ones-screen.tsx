"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, Lock, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Modal,
  SegmentedControl,
  Select,
  Spinner,
  Stat,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  COVERAGE_LABELS,
  COVERAGE_MEANING,
  type ApiCadence,
  type ApiCoverageRow,
  type ApiCoverageState,
  type ApiOneOnOne,
} from "@/lib/api/one-on-ones";
import { fullName } from "@/lib/types";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import {
  useMyOneOnOnes,
  useOneOnOneCoverage,
  useOneOnOneMutations,
} from "@/lib/store/one-on-ones";
import { useCan } from "@/lib/permissions";

/**
 * One-to-ones — mine, and (for HR) who is having them.
 *
 * ## Two tabs that answer two different questions, on purpose
 *
 * *Mine* is the conversations the reader is in. *Coverage* is whether they are
 * happening at all, across the company. The second exists **because** the first
 * is closed: HR cannot read a word of anybody's 1:1, and the honest answer to
 * that is not "so HR gets nothing" — it is that nobody has to read a private
 * conversation to know it is not happening.
 *
 * The Coverage tab is absent without `EDIT_RECORDS` rather than present and
 * refusing.
 *
 * ## Nothing here is derived from the reading permission
 *
 * Whether somebody may open a 1:1 is a property of the row — are they one of
 * the two people — and no permission can say it. So the list is whatever the
 * API returns, and the detail screen renders the API's own 403 sentence.
 */

const CADENCES: readonly ApiCadence[] = [
  "WEEKLY",
  "FORTNIGHTLY",
  "MONTHLY",
  "QUARTERLY",
];

const CADENCE_WORDS: Record<ApiCadence, string> = {
  WEEKLY: "Weekly",
  FORTNIGHTLY: "Every two weeks",
  MONTHLY: "Monthly",
  QUARTERLY: "Every quarter",
};

const STATE_TONE: Record<
  ApiCoverageState,
  "success" | "warning" | "danger" | "neutral"
> = {
  UP_TO_DATE: "success",
  OVERDUE: "danger",
  NEVER_MET: "warning",
  NO_SERIES: "warning",
  NO_MANAGER: "neutral",
};

export function OneOnOnesScreen() {
  const canSeeCompany = useCan("EDIT_RECORDS");
  const [tab, setTab] = useState<"mine" | "coverage">("mine");
  const [starting, setStarting] = useState(false);

  const mine = useMyOneOnOnes();
  /* Only fetched when the tab is open *and* the permission is held — a
     company-wide read nobody is looking at is a request nobody asked for. */
  const coverage = useOneOnOneCoverage(canSeeCompany && tab === "coverage");

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/people", label: "People" }]}
        title="One-to-ones"
        meta={
          <span className="inline-flex items-center gap-1 text-meta text-faint">
            <Lock aria-hidden="true" className="size-3.5" />
            Private to the two people in them
          </span>
        }
        action={
          <Button size="sm" variant="accent" onClick={() => setStarting(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Start one
          </Button>
        }
        tabs={
          canSeeCompany ? (
            <SegmentedControl
              label="What to show"
              value={tab}
              onChange={(value) => setTab(value as "mine" | "coverage")}
              options={[
                { value: "mine", label: "Mine" },
                { value: "coverage", label: "Coverage" },
              ]}
            />
          ) : undefined
        }
      />
      <PageBody>
        {tab === "mine" ? (
          <Mine read={mine} />
        ) : (
          <Coverage read={coverage} />
        )}
      </PageBody>
      {starting && (
        <StartDialog
          onClose={() => setStarting(false)}
          onDone={() => {
            setStarting(false);
            mine.reload();
          }}
        />
      )}
    </>
  );
}

function Mine({ read }: { read: ReturnType<typeof useMyOneOnOnes> }) {
  if (!read.available) {
    return (
      <Callout tone="info" title="This needs the API">
        {read.refusal}
      </Callout>
    );
  }
  if (read.error) {
    return (
      <LoadFailure
        subject="your one-to-ones"
        error={read.error}
        onRetry={read.reload}
      />
    );
  }
  if (read.loading || !read.data) return <Spinner label="Loading" />;
  if (read.data.length === 0) {
    return (
      <EmptyState
        title="You are not in any one-to-ones yet"
        description="A one-to-one follows the reporting line. If you manage somebody, start one with them — they will see it too, and so will the notes."
      />
    );
  }

  const active = read.data.filter((series) => series.active);
  const stopped = read.data.filter((series) => !series.active);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {active.map((series) => (
          <SeriesCard key={series.id} series={series} />
        ))}
      </div>
      {stopped.length > 0 && (
        <Card>
          <CardHeader
            level={2}
            title="Stopped"
            description="Nothing is deleted — the meetings that happened still happened."
          />
          <CardBody className="flex flex-wrap gap-2">
            {stopped.map((series) => (
              <Link
                key={series.id}
                href={`/people/one-on-ones/${series.id}`}
                className="text-body-sm text-accent-text hover:underline underline-offset-4"
              >
                {series.employeeName}
              </Link>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function SeriesCard({ series }: { series: ApiOneOnOne }) {
  return (
    <Card>
      <CardHeader
        level={2}
        title={
          <Link
            href={`/people/one-on-ones/${series.id}`}
            className="hover:text-accent-text hover:underline underline-offset-4"
          >
            {series.employeeName}
          </Link>
        }
        description={`with ${series.managerName} · ${series.cadenceLabel}`}
        action={<Due series={series} />}
      />
      <CardBody className="flex flex-wrap items-center gap-4">
        <span className="text-meta text-faint">
          {series.meetings === 0
            ? "No meetings yet"
            : `${series.meetings} ${series.meetings === 1 ? "meeting" : "meetings"}`}
        </span>
        {series.openActions > 0 && (
          <Badge tone="info" size="sm">
            {series.openActions} open{" "}
            {series.openActions === 1 ? "action" : "actions"}
          </Badge>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * When the next one is due.
 *
 * **"Never met" is not "up to date"**, and it is not "overdue by nothing"
 * either. The API sends both fields as null for a pair that has never sat down,
 * so this renders a third thing rather than picking one of the two.
 */
function Due({ series }: { series: ApiOneOnOne }) {
  if (series.lastHeldOn === null) {
    return (
      <Badge tone="warning" size="sm" dot>
        Not met yet
      </Badge>
    );
  }
  if ((series.overdueDays ?? 0) > 0) {
    return (
      <Badge tone="danger" size="sm" dot>
        {series.overdueDays} days overdue
      </Badge>
    );
  }
  return (
    <Badge tone="success" size="sm" icon={<CalendarClock aria-hidden="true" />}>
      Due {series.nextDueOn}
    </Badge>
  );
}

/**
 * Who is meeting and who is not — and not a word of what was said.
 *
 * The API carries no note and no item in this response by construction; a
 * backend assertion reads the whole thing as JSON and fails if one appears.
 * This screen therefore cannot leak one, which is the point of putting the
 * boundary there rather than here.
 */
function Coverage({ read }: { read: ReturnType<typeof useOneOnOneCoverage> }) {
  if (!read.available) {
    return (
      <Callout tone="info" title="This needs the API">
        {read.refusal}
      </Callout>
    );
  }
  if (read.error) {
    return (
      <LoadFailure subject="coverage" error={read.error} onRetry={read.reload} />
    );
  }
  if (read.loading || !read.data) return <Spinner label="Loading" />;

  const { rows, counts } = read.data;

  return (
    <div className="flex flex-col gap-6">
      <Callout tone="info" title="This report has no content in it">
        It says who is having one-to-ones and when they last met. Nobody outside
        a one-to-one can read what was said in it, including you.
      </Callout>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Up to date"
          value={String(counts.upToDate)}
          hint={`of ${String(counts.people)} people`}
        />
        <Stat
          label="Overdue"
          value={String(counts.overdue)}
          hint="Have one, and it has slipped"
        />
        <Stat
          label="Never met"
          value={String(counts.neverMet)}
          hint="Set up, never sat down"
        />
        <Stat
          label="None set up"
          value={String(counts.noSeries)}
          hint={
            counts.noManager > 0
              ? `${String(counts.noManager)} more have no manager`
              : "Their manager starts one"
          }
        />
      </div>

      <TableWrap>
        <THead>
          <TR>
            <TH>Person</TH>
            <TH>Manager</TH>
            <TH>Cadence</TH>
            <TH>Last met</TH>
            <TH>State</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <CoverageRow key={row.employeeId} row={row} />
          ))}
        </TBody>
      </TableWrap>
    </div>
  );
}

function CoverageRow({ row }: { row: ApiCoverageRow }) {
  return (
    <TR>
      <TD>
        <span className="font-medium text-body">{row.employeeName}</span>
        <span className="block text-meta text-faint">{row.jobTitle}</span>
      </TD>
      <TD>{row.managerName ?? <span className="text-faint">Nobody</span>}</TD>
      <TD>
        {/* Absent, not "—0 days": a pair with no standing one-to-one has no
            cadence, which is a different fact from one set to weekly. */}
        {row.cadenceLabel ?? <span className="text-faint">Not set up</span>}
      </TD>
      <TD>{row.lastHeldOn ?? <span className="text-faint">Never</span>}</TD>
      <TD>
        <Badge tone={STATE_TONE[row.state]} size="sm" dot>
          {COVERAGE_LABELS[row.state]}
        </Badge>
        <span className="block text-meta text-faint">
          {COVERAGE_MEANING[row.state]}
        </span>
      </TD>
    </TR>
  );
}

/**
 * Start a standing one-to-one with one of your reports.
 *
 * The picker is the whole directory — the API refuses anybody who is not a
 * report, in its own words, and that refusal names the rule. Filtering the list
 * to reports here would need a second definition of "who reports to me" on this
 * side, and the two would drift.
 */
function StartDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const mutations = useOneOnOneMutations();
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [cadence, setCadence] = useState<ApiCadence>("FORTNIGHTLY");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await mutations.start(employeeId, cadence);
      toast.push({ tone: "success", title: "Started" });
      onDone();
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Start a one-to-one"
      description="It follows the reporting line, so it has to be somebody who reports to you."
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="accent"
            loading={busy}
            disabled={employeeId === ""}
            onClick={() => void start()}
          >
            Start it
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Who">
          <Select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">Choose somebody</option>
            {directory.employees.map((person) => (
              <option key={person.id} value={person.id}>
                {fullName(person)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="How often">
          <Select
            value={cadence}
            onChange={(event) => setCadence(event.target.value as ApiCadence)}
          >
            {CADENCES.map((each) => (
              <option key={each} value={each}>
                {CADENCE_WORDS[each]}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-meta text-faint">
          Both of you will see it, and the notes in it. There is no private half.
        </p>
        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
