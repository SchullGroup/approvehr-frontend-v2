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
import {
  useMyOneOnOnes,
  useOneOnOneCoverage,
  useOneOnOneMutations,
  useWhoICanStartWith,
} from "@/lib/store/one-on-ones";
import { useCan, useIsManager } from "@/lib/permissions";

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
 *
 * ## What *is* derived from the reporting line
 *
 * Starting one, and only starting one. `POST /one-on-ones` accepts a person
 * when they report to the caller, so somebody with no reports cannot start
 * anything — and this screen used to offer them the button anyway, with a
 * picker containing every colleague in the company and a refusal behind each
 * one. That was the feedback, and it was right.
 *
 * `useIsManager()` now decides whether the control exists at all, and
 * `useWhoICanStartWith()` fills the picker from the same column the API
 * checks. Neither is a permission; both are the reporting line, which is the
 * thing that actually governs this module.
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
  /* The reporting line, not a permission — see the header. An administrator
     holding every grant in the catalogue and managing nobody still cannot
     start a one-to-one, and the API is the thing that says so. */
  const isManager = useIsManager();
  const [tab, setTab] = useState<"mine" | "coverage">("mine");
  const [starting, setStarting] = useState(false);

  const mutations = useOneOnOneMutations();
  const mine = useMyOneOnOnes();
  /* Only fetched when the tab is open *and* the permission is held — a
     company-wide read nobody is looking at is a request nobody asked for. */
  const coverage = useOneOnOneCoverage(canSeeCompany && tab === "coverage");

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/people", label: "People" }]}
        title="One-to-ones"
        /* Said on the screen, because the name does not say it.
           ------------------------------------------------------------------
           "One-to-ones" under Core HR, with a padlock reading "private to the
           two people in them", tells somebody what the *permissions* are and
           nothing about what the thing is or why it is theirs. That was the
           feedback, verbatim: "I don't understand the flow and what it means."
           A module whose own name is the only explanation is a module people
           click once. */
        description="A running record of the check-ins between one person and their manager — what was agreed, and what is still open from last time. Either of you can start one; only the two of you can read it."
        meta={
          <span className="inline-flex items-center gap-1 text-meta text-faint">
            <Lock aria-hidden="true" className="size-3.5" />
            Private to the two people in them
          </span>
        }
        action={
          /* Absent, not present-and-refusing — twice over.
             ----------------------------------------------------------------
             With no API `mutations.start` can only ever throw the offline
             refusal. And with nobody reporting to you it can only ever throw
             the API's own "somebody who reports to you" 404, which is the
             failure the feedback described: the button was here for every
             employee and every choice inside it was refused.

             A button whose sole outcome is "that is refused" is a design
             failure two clicks earlier — this file already said that about the
             offline case and then did not apply it to the commoner one. */
          mutations.available && isManager ? (
            <Button
              size="sm"
              variant="accent"
              onClick={() => setStarting(true)}
            >
              <Plus aria-hidden="true" className="size-4" />
              Start one
            </Button>
          ) : undefined
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
          <Mine read={mine} isManager={isManager} />
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

function Mine({
  read,
  isManager,
}: {
  read: ReturnType<typeof useMyOneOnOnes>;
  isManager: boolean;
}) {
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
        missingMeans="module"
      />
    );
  }
  if (read.loading || !read.data) return <Spinner label="Loading" />;
  if (read.data.length === 0) {
    /* Two different nils, and they need two different sentences.
       -------------------------------------------------------------------
       A manager with none has something to do, and the button above says
       what. Somebody with no reports has nothing to do here at all, and the
       old copy — "if you manage somebody, start one with them" — was advice
       they could not follow next to a button that refused them. Say who
       starts it instead, so the screen is an answer rather than a dead end.

       They mostly will not see this: the sidebar row is gone for them now.
       This is the URL, the bookmark and the stale link. */
    return isManager ? (
      <EmptyState
        title="You have not started any yet"
        description="Start one with somebody who reports to you. They will see it too, and so will the notes — there is no private half."
      />
    ) : (
      <EmptyState
        title="You are not in any one-to-ones yet"
        description="A one-to-one follows the reporting line, and the manager starts it. If you would find a regular check-in useful, ask yours to set one up — it will appear here, and only the two of you will ever read it."
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
      <LoadFailure
        subject="coverage"
        error={read.error}
        onRetry={read.reload}
        missingMeans="module"
      />
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

      <div className="hidden sm:block">
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

      <ul className="divide-y divide-line rounded-lg border border-line bg-surface sm:hidden">
        {rows.map((row) => (
          <li key={row.employeeId} className="flex flex-col gap-2 p-4">
            <div>
              <p className="text-body-sm font-medium text-ink">
                {row.employeeName}
              </p>
              <p className="text-meta text-faint">{row.jobTitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted">
              <span>
                Manager:{" "}
                {row.managerName ?? <span className="text-faint">Nobody</span>}
              </span>
              <span>
                {row.cadenceLabel ?? (
                  <span className="text-faint">Not set up</span>
                )}
              </span>
              <span>
                Last met:{" "}
                {row.lastHeldOn ?? <span className="text-faint">Never</span>}
              </span>
            </div>
            <div>
              <Badge tone={STATE_TONE[row.state]} size="sm" dot>
                {COVERAGE_LABELS[row.state]}
              </Badge>
              <p className="mt-0.5 text-meta text-faint">
                {COVERAGE_MEANING[row.state]}
              </p>
            </div>
          </li>
        ))}
      </ul>
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
 * ## The picker is your reports, and that took no second definition
 *
 * It used to be the whole directory, defended like this: *"the API refuses
 * anybody who is not a report, in its own words, and that refusal names the
 * rule. Filtering the list to reports here would need a second definition of
 * 'who reports to me' on this side, and the two would drift."*
 *
 * The premise was right and the conclusion was wrong. There is no second
 * definition, because the filter is not written here: `oneOnOnesApi.reports`
 * asks `/employees?managerId=<me>`, and `managerId` is the same column with
 * the same value that `POST /one-on-ones` compares before it accepts anybody.
 * One predicate, asked twice — see that function's header.
 *
 * What the old design cost: an employee opened a dialog listing every
 * colleague in the company, chose one, and got a 404 reading "somebody who
 * reports to you". Then chose another, and got it again. The refusal did name
 * the rule; naming a rule at the point of failure is not the same as an
 * interface that only offers what will work.
 */
function StartDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const mutations = useOneOnOneMutations();
  /* Fetched because the dialog is open — the hook takes `enabled` so a picker
     nobody has opened costs nothing. */
  const reports = useWhoICanStartWith(true);
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [cadence, setCadence] = useState<ApiCadence>("FORTNIGHTLY");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const people = reports.data ?? [];
  /* Three states, not two. The button that opens this dialog is already gated
     on `useIsManager()`, so a resolved empty list should be impossible — but
     "should be impossible" is how a dialog ends up with a select containing
     one option that says "Choose somebody". A team can also be archived
     between the sidebar answering and this opening. Say which it is. */
  const whoHelp = reports.loading
    ? "Finding who reports to you…"
    : people.length === 0
      ? "Nobody reports to you at the moment, so there is nobody to start one with."
      : "Everybody who reports to you.";
  const whoError =
    reports.error && !reports.loading
      ? "Could not load who reports to you. Close this and try again."
      : null;

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
        <Field
          label="Who"
          help={whoHelp}
          {...(whoError ? { error: whoError } : {})}
        >
          <Select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            disabled={people.length === 0}
          >
            <option value="">
              {reports.loading ? "Loading…" : "Choose somebody"}
            </option>
            {/* Name and job title. The disambiguator a real team needs — two
                Chinedus reporting to the same person is ordinary, and the old
                whole-directory list was least usable in exactly the companies
                big enough for that. */}
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.jobTitle
                  ? `${person.fullName} — ${person.jobTitle}`
                  : person.fullName}
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
          Both of you will see it, and the notes in it. There is no private
          half.
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
