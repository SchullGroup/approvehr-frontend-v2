"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Link2, UserCheck } from "lucide-react";
import {
  Button,
  Callout,
  Card,
  Checkbox,
  EmptyState,
  Field,
  FilterBar,
  Input,
  SegmentedControl,
  Select,
  TableWrap,
  TBody,
  TD,
  TDPrimary,
  TextLink,
  THead,
  TH,
  TR,
  useToast,
  type AppliedFilter,
  LoadState,
} from "@/components/ui";
import {
  BulkBar,
  BulkResults,
  type BulkChoice,
} from "@/components/hiring/bulk-bar";
import { EveryoneDialog } from "@/components/hiring/bulk-dialogs";
import { LoadMore } from "@/components/portal/load-more";
import { ApiError } from "@/lib/api/client";
import { downloadCsv } from "@/lib/csv";
import { dayOf, STATE_LABEL, whyNoEmployee } from "@/lib/hiring/hired/copy";
import {
  EmployeeExistsError,
  existingEmployeeOf,
} from "@/lib/hiring/hired/errors";
import {
  SORT_LABEL,
  type BulkOutcome,
  type ExportExtra,
  type HireState,
  type HiredCounts,
  type HiredFilters,
  type HiredPerson,
  type HiredSort,
  type HiredTarget,
} from "@/lib/hiring/hired/model";
import {
  useHiredGateway,
  useHiredSettings,
} from "@/lib/hiring/hired/use-hired";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import { channelLabel } from "@/lib/hiring/pipeline/filters";
import type { BulkProgress } from "@/lib/hiring/pipeline/model";
import { useBulkSelection } from "@/lib/hiring/pipeline/use-bulk-selection";
import { usePagedList } from "@/lib/store/paged-list";
import { useOrgTimezone } from "@/lib/store/session";
import { useDebounced } from "@/lib/use-debounced";
import { useLoaded } from "@/lib/use-loaded";
import {
  BulkCreateDialog,
  CreateEmployeeDialog,
  DidNotJoinDialog,
  LinkEmployeeDialog,
  type LinkOffer,
} from "./hired-dialogs";
import { ExportDialog } from "./export-dialog";
import { HireStateBadge } from "./state-badge";

/**
 * The Hired list: everybody whose offer was accepted, and what became of them.
 *
 * ## Hired is not employed
 *
 * Accepting an offer puts a person here. Making an employee of them is a separate,
 * deliberate step, offered only where the company has Core HR, and it is one press for
 * one person or one confirmed action for many. A company without Core HR has no such
 * step at all: the list is complete in itself and can be exported.
 *
 * ## What it will not do
 *
 * - **Say an employee exists when one does not.** The state comes from the API.
 * - **Offer what would be refused.** Create employee is absent where there is no Core
 *   HR, and off, with the reason beside it, where this person cannot be made one.
 * - **Merge by accident.** An existing employee with the same email is shown, by name,
 *   and linking is its own explicit choice.
 * - **Act on a list nobody looked at.** "Everyone matching" is confirmed by its exact
 *   count, and the API refuses if the count has moved.
 */

const STATES: HireState[] = ["HIRED", "EMPLOYEE_CREATED", "DID_NOT_JOIN"];

const SORTS = Object.keys(SORT_LABEL) as HiredSort[];

type Pending =
  | { kind: "create"; person: HiredPerson }
  | { kind: "link"; offer: LinkOffer }
  | { kind: "not-joined"; person: HiredPerson };

/** One per click. The same key is the same action, so a double click is one. */
const newKey = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export function HiredList({ initialJob = "" }: { initialJob?: string }) {
  const gateway = useHiredGateway();
  const settings = useHiredSettings();
  const timeZone = useOrgTimezone();
  const toast = useToast();

  /* ---------------------------------------------------------------- the question */
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [job, setJob] = useState(initialJob);
  const [departmentId, setDepartmentId] = useState("");
  const [source, setSource] = useState("");
  const [state, setState] = useState<"" | HireState>("");
  const [acceptedFrom, setAcceptedFrom] = useState("");
  const [acceptedTo, setAcceptedTo] = useState("");
  const [startFrom, setStartFrom] = useState("");
  const [startTo, setStartTo] = useState("");
  const [sort, setSort] = useState<HiredSort>("accepted-desc");

  /* A range that runs backwards matches nobody and says so, instead of sending it. */
  const acceptedBackwards =
    acceptedFrom !== "" && acceptedTo !== "" && acceptedFrom > acceptedTo;
  const startBackwards =
    startFrom !== "" && startTo !== "" && startFrom > startTo;

  const filters = useMemo<HiredFilters>(
    () => ({
      ...(q ? { q } : {}),
      ...(job ? { requisitionId: job } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(state ? { state } : {}),
      ...(source ? { source } : {}),
      ...(acceptedFrom && !acceptedBackwards ? { acceptedFrom } : {}),
      ...(acceptedTo && !acceptedBackwards ? { acceptedTo } : {}),
      ...(startFrom && !startBackwards ? { startFrom } : {}),
      ...(startTo && !startBackwards ? { startTo } : {}),
    }),
    [
      q,
      job,
      departmentId,
      state,
      source,
      acceptedFrom,
      acceptedTo,
      startFrom,
      startTo,
      acceptedBackwards,
      startBackwards,
    ],
  );

  const facets = useLoaded(`hired-facets:${gateway.mode}`, true, (signal) =>
    gateway.facets(signal),
  );
  const exportOptions = useLoaded(
    `hired-export:${gateway.mode}`,
    true,
    (signal) => gateway.exportOptions(signal),
  );

  /* ----------------------------------------------------------------- the rows */
  const [counts, setCounts] = useState<HiredCounts | null>(null);
  const key = JSON.stringify([gateway.mode, filters, sort]);
  const fetchPage = useCallback(
    async (cursor: string | null, signal: AbortSignal) => {
      const page = await gateway.list(
        { filters, sort, cursor, pageSize: 25 },
        signal,
      );
      if (!signal.aborted && page.counts) setCounts(page.counts);
      return { rows: page.rows, total: page.total, next: page.next };
    },
    // The key is the identity of the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, gateway],
  );
  const list = usePagedList<HiredPerson>({
    key,
    fetchPage,
    idOf: (person) => person.id,
  });

  const stale = list.settling || search.trim() !== q;
  const coreHr = settings.settings?.coreHr ?? null;

  /* ------------------------------------------------------------------ selection */
  const selection = useBulkSelection(JSON.stringify([gateway.mode, filters]));
  const ids = list.rows.map((person) => person.id);
  const total = list.total ?? list.rows.length;
  const offer =
    !selection.everyone &&
    ids.length > 0 &&
    list.hasMore &&
    total > ids.length &&
    selection.allOf(ids)
      ? { count: total, where: "on the Hired list" }
      : null;

  const [everyoneOpen, setEveryoneOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [results, setResults] = useState<BulkOutcome | null>(null);

  const targetOf = useCallback(
    (): HiredTarget =>
      selection.everyone
        ? { kind: "filter", filters, expected: selection.everyone.count }
        : { kind: "ids", ids: [...selection.picked] },
    [selection.everyone, selection.picked, filters],
  );

  async function runBulkCreate() {
    setBulkBusy(true);
    setBulkError(null);
    setProgress(null);
    try {
      const outcome = await gateway.bulkCreateEmployees({
        target: targetOf(),
        idempotencyKey: newKey(),
        signal: new AbortController().signal,
        onProgress: setProgress,
      });
      setResults(outcome);
      selection.clear();
      setBulkOpen(false);
      list.reload();
    } catch (error) {
      setBulkError(sentenceOf(error));
    } finally {
      setBulkBusy(false);
      setProgress(null);
    }
  }

  /* --------------------------------------------------------------------- export */
  const [exportTarget, setExportTarget] = useState<{
    target: HiredTarget;
    scope: string;
    count: number;
  } | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function runExport(extras: ExportExtra[]) {
    if (!exportTarget) return;
    setExportBusy(true);
    setExportError(null);
    try {
      const file = await gateway.exportFile({
        target: exportTarget.target,
        extras,
      });
      downloadCsv(file.filename, file.body);
      setExportTarget(null);
      toast.push({
        title: `Downloaded ${file.filename}`,
        tone: "success",
        detail: `${exportTarget.count.toLocaleString("en-NG")} ${exportTarget.count === 1 ? "person" : "people"}. The export is logged.`,
      });
    } catch (error) {
      setExportError(sentenceOf(error));
    } finally {
      setExportBusy(false);
    }
  }

  /* ---------------------------------------------------------------- one person */
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const ask = (next: Pending) => {
    setDialogError(null);
    setPending(next);
  };

  /** People an attempt found an existing employee for, so the row offers to link them. */
  const [learned, setLearned] = useState<Record<string, LinkOffer>>({});

  async function act(
    work: () => Promise<void>,
    failed: string,
    /** Handles a refusal that is not a failure. Returns true when it has dealt with it. */
    handled?: (error: unknown) => boolean,
  ) {
    setBusy(true);
    setDialogError(null);
    try {
      await work();
      setPending(null);
      list.reload();
    } catch (error) {
      if (handled?.(error)) return;
      setDialogError(sentenceOf(error));
      /* A refusal often means the row is out of date: the job filled up meanwhile,
         somebody else made the record. Ask again so the row says so. */
      if (error instanceof ApiError && error.status === 409) list.reload();
      toast.push({
        title: failed,
        tone: "danger",
        detail: sentenceOf(error),
      });
    } finally {
      setBusy(false);
    }
  }

  const createFor = (person: HiredPerson) =>
    act(
      async () => {
        const made = await gateway.createEmployee(person);
        toast.push({
          title: `Employee record created for ${made.name ?? person.name}`,
          tone: "success",
        });
      },
      `No employee record was created for ${person.name}`,
      (error) => {
        /* An employee with the same email is not a failure: it is a question. Show
           who it is, and let a person decide whether it is the same human. */
        const existing = existingEmployeeOf(error, person.email);
        if (!existing) return false;
        const offer: LinkOffer = {
          person,
          existing,
          said:
            error instanceof EmployeeExistsError || error instanceof ApiError
              ? error.message
              : "An employee with this email already exists.",
        };
        setLearned((now) => ({ ...now, [person.id]: offer }));
        setPending({ kind: "link", offer });
        return true;
      },
    );

  const linkFor = (person: HiredPerson, employeeId: string, name: string) =>
    act(async () => {
      await gateway.linkEmployee(person, employeeId);
      setLearned(({ [person.id]: _gone, ...rest }) => {
        void _gone;
        return rest;
      });
      toast.push({
        title: `${person.name} is linked to ${name}`,
        tone: "success",
        detail: "Nothing was merged and no new record was created.",
      });
    }, `${person.name} was not linked`);

  const notJoinedFor = (person: HiredPerson, reason: string) =>
    act(async () => {
      const done = await gateway.didNotJoin(person, reason);
      const turned =
        done.othersTurnedAway > 0
          ? ` ${done.othersTurnedAway.toLocaleString("en-NG")} ${done.othersTurnedAway === 1 ? "person was" : "people were"} turned away when it filled and ${done.othersTurnedAway === 1 ? "has" : "have"} not been put back.`
          : "";
      toast.push({
        title: `${person.name} is marked as not joining`,
        tone: "success",
        detail: `${
          done.jobReopened
            ? `${person.role} is open again.`
            : `Their place on ${person.role} is free.`
        }${turned}`,
      });
    }, `${person.name} was not marked`);

  /* ------------------------------------------------------------------ the chips */
  const jobs = facets.data?.jobs ?? [];
  const chips: AppliedFilter[] = [
    ...(job
      ? [
          {
            label: "Job",
            value: jobs.find((entry) => entry.id === job)?.title ?? "Selected",
            onClear: () => setJob(""),
          },
        ]
      : []),
    ...(departmentId
      ? [
          {
            label: "Department",
            value:
              facets.data?.departments.find(
                (entry) => entry.id === departmentId,
              )?.name ?? "Selected",
            onClear: () => setDepartmentId(""),
          },
        ]
      : []),
    ...(source
      ? [
          {
            label: "Heard via",
            value: channelLabel(source),
            onClear: () => setSource(""),
          },
        ]
      : []),
    ...(acceptedFrom
      ? [
          {
            label: "Accepted from",
            value: dayOf(acceptedFrom) ?? acceptedFrom,
            onClear: () => setAcceptedFrom(""),
          },
        ]
      : []),
    ...(acceptedTo
      ? [
          {
            label: "Accepted to",
            value: dayOf(acceptedTo) ?? acceptedTo,
            onClear: () => setAcceptedTo(""),
          },
        ]
      : []),
    ...(startFrom
      ? [
          {
            label: "Starting from",
            value: dayOf(startFrom) ?? startFrom,
            onClear: () => setStartFrom(""),
          },
        ]
      : []),
    ...(startTo
      ? [
          {
            label: "Starting to",
            value: dayOf(startTo) ?? startTo,
            onClear: () => setStartTo(""),
          },
        ]
      : []),
  ];
  const narrowed = chips.length > 0 || search.trim() !== "" || state !== "";

  function clearAll() {
    setSearch("");
    setJob("");
    setDepartmentId("");
    setSource("");
    setState("");
    setAcceptedFrom("");
    setAcceptedTo("");
    setStartFrom("");
    setStartTo("");
  }

  /* ----------------------------------------------------------------- the choices */
  const choices: BulkChoice[] = [
    ...(coreHr ? (["create-employees"] as const) : []),
    "export",
    "clear",
  ];

  function choose(choice: BulkChoice) {
    switch (choice) {
      case "create-employees":
        setBulkError(null);
        setBulkOpen(true);
        return;
      case "everyone":
        setEveryoneOpen(true);
        return;
      case "export":
        setExportError(null);
        setExportTarget({
          target: targetOf(),
          scope: selection.everyone
            ? "everyone on the list under these filters"
            : "the people you ticked",
          count: selection.size,
        });
        return;
      case "clear":
        selection.clear();
        return;
      default:
        return;
    }
  }

  const stateOptions: { value: "all" | HireState; label: string }[] = [
    {
      value: "all",
      label: counts ? `All ${counts.all.toLocaleString("en-NG")}` : "All",
    },
    ...STATES.map((value) => ({
      value,
      label: counts
        ? `${STATE_LABEL[value]} ${counts[value].toLocaleString("en-NG")}`
        : STATE_LABEL[value],
    })),
  ];

  /* ------------------------------------------------------------------ one row */
  /* A practice list has no employee directory to open a record in, so it draws no
     link rather than a dead one. Neither does a company without Core HR. */
  const employeeLink = (person: HiredPerson) =>
    person.employee && coreHr && gateway.mode === "api" ? (
      <TextLink href={`/people/${person.employee.id}`}>
        Open their employee record
      </TextLink>
    ) : null;

  const detail = (person: HiredPerson) => {
    if (person.state === "EMPLOYEE_CREATED") {
      return (
        <div className="mt-1 flex flex-col gap-0.5 text-meta text-muted">
          {person.employeeVia === "LINKED" && (
            <span>Linked to an employee who was already here.</span>
          )}
          {employeeLink(person)}
        </div>
      );
    }
    if (person.state === "DID_NOT_JOIN" && person.didNotJoin) {
      return (
        <p className="mt-1 text-meta text-muted">{person.didNotJoin.reason}</p>
      );
    }
    return null;
  };

  const actions = (person: HiredPerson) => {
    if (person.state !== "HIRED") return null;
    const reason = whyNoEmployee(person, coreHr ?? true);
    return (
      <div className="flex flex-wrap items-start gap-2">
        {coreHr === true &&
          (learned[person.id] ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                const offer = learned[person.id];
                if (offer) ask({ kind: "link", offer });
              }}
            >
              <Link2 aria-hidden="true" className="size-3.5" />
              Link to existing employee
            </Button>
          ) : person.createEmployee.allowed ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => ask({ kind: "create", person })}
              aria-label={`Create employee record for ${person.name}`}
            >
              <UserCheck aria-hidden="true" className="size-3.5" />
              Create employee
            </Button>
          ) : (
            <span className="flex max-w-56 flex-col gap-1">
              <Button
                variant="secondary"
                size="sm"
                disabled
                aria-label={`Create employee record for ${person.name}`}
              >
                <UserCheck aria-hidden="true" className="size-3.5" />
                Create employee
              </Button>
              {reason && <span className="text-meta text-muted">{reason}</span>}
            </span>
          ))}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => ask({ kind: "not-joined", person })}
          aria-label={`Mark ${person.name} as did not join`}
        >
          Did not join
        </Button>
      </div>
    );
  };

  const nameOf = (person: HiredPerson) =>
    person.applicationId ? (
      <TextLink href={`/hiring/candidates/${person.applicationId}`}>
        {person.name}
      </TextLink>
    ) : (
      person.name
    );

  const contact = (person: HiredPerson) =>
    [person.email, person.phone].filter(Boolean).join(" · ");

  /* ------------------------------------------------------------------- the view */
  return (
    <div className="flex flex-col gap-5">
      {DEMO_ENABLED && gateway.mode === "demo" && (
        <Callout tone="info" title="A practice list">
          Employee records, links and did-not-join marks made here are kept in
          this browser and nothing is sent to anybody.
        </Callout>
      )}

      {coreHr === false && (
        <Callout tone="info" title="Your company does not use Core HR">
          People stay on this list, and you can export it. Employee records are
          not made from here, because there is nowhere in your plan to keep
          them.
        </Callout>
      )}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Find a name, email or reference"
        searchLabel="Find somebody on the Hired list"
        applied={chips}
        onClearAll={clearAll}
        count={list.total ?? undefined}
        noun={["person", "people"]}
        sort={
          <Select
            aria-label="Sort the Hired list"
            value={sort}
            onChange={(event) => setSort(event.target.value as HiredSort)}
            className="w-auto"
          >
            {SORTS.map((value) => (
              <option key={value} value={value}>
                {SORT_LABEL[value]}
              </option>
            ))}
          </Select>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={list.total === 0}
            onClick={() => {
              setExportError(null);
              setExportTarget({
                target: {
                  kind: "filter",
                  filters,
                  expected: list.total ?? 0,
                },
                scope: narrowed
                  ? "everyone on the list under these filters"
                  : "everyone on the list",
                count: list.total ?? 0,
              });
            }}
          >
            <Download aria-hidden="true" className="size-3.5" />
            Export…
          </Button>
        }
      >
        <Field label="Job">
          <Select value={job} onChange={(event) => setJob(event.target.value)}>
            <option value="">Any job</option>
            {jobs.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
                {entry.reference ? ` (${entry.reference})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Department">
          <Select
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            <option value="">Any department</option>
            {(facets.data?.departments ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Heard via">
          <Select
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="">Any source</option>
            {(facets.data?.sources ?? []).map((name) => (
              <option key={name} value={name}>
                {channelLabel(name)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Accepted from" optional>
          <Input
            type="date"
            value={acceptedFrom}
            max={acceptedTo || undefined}
            onChange={(event) => setAcceptedFrom(event.target.value)}
          />
        </Field>
        <Field
          label="Accepted to"
          optional
          {...(acceptedBackwards
            ? {
                error:
                  "That is before the start date, so no dates are applied.",
              }
            : {})}
        >
          <Input
            type="date"
            value={acceptedTo}
            min={acceptedFrom || undefined}
            onChange={(event) => setAcceptedTo(event.target.value)}
          />
        </Field>
        <Field label="Starting from" optional>
          <Input
            type="date"
            value={startFrom}
            max={startTo || undefined}
            onChange={(event) => setStartFrom(event.target.value)}
          />
        </Field>
        <Field
          label="Starting to"
          optional
          {...(startBackwards
            ? {
                error:
                  "That is before the start date, so no dates are applied.",
              }
            : {})}
        >
          <Input
            type="date"
            value={startTo}
            min={startFrom || undefined}
            onChange={(event) => setStartTo(event.target.value)}
          />
        </Field>
      </FilterBar>

      <SegmentedControl
        label="Show people who are"
        options={stateOptions}
        value={state === "" ? "all" : state}
        onChange={(value) => setState(value === "all" ? "" : value)}
      />

      <BulkBar
        selection={selection}
        busy={bulkBusy}
        progress={progress}
        offer={offer}
        onChoose={choose}
        choices={choices}
      />

      {results && (
        <BulkResults
          what="Employee records created"
          outcome={results}
          onDismiss={() => setResults(null)}
        />
      )}

      <LoadState
        loading={list.loading}
        subject="the Hired list"
        error={list.error}
        onRetry={list.reload}
        skeleton="table"
      >
        {list.rows.length === 0 && !stale ? (
          <Card>
            <EmptyState
              icon={<UserCheck aria-hidden="true" />}
              title={narrowed ? "Nobody matches" : "Nobody has been hired yet"}
              description={
                narrowed
                  ? "Nobody on the Hired list fits the search and filters above."
                  : "When an offer is recorded as accepted, the person appears here."
              }
            />
          </Card>
        ) : (
          <div
            aria-busy={stale}
            className={
              stale
                ? "flex flex-col gap-3 opacity-60 transition-opacity"
                : "flex flex-col gap-3 transition-opacity"
            }
          >
            <div className="hidden sm:block">
              <TableWrap caption="People who accepted an offer, and what became of them">
                <THead>
                  <TH>
                    <Checkbox
                      hiddenLabel="Select everyone shown"
                      checked={selection.allOf(ids)}
                      indeterminate={selection.someOf(ids)}
                      disabled={Boolean(selection.everyone)}
                      onChange={() => selection.toggleMany(ids)}
                    />
                  </TH>
                  <TH>Person</TH>
                  <TH>Role</TH>
                  <TH>Accepted</TH>
                  <TH>Starts</TH>
                  <TH>State</TH>
                  <TH align="right">
                    <span className="sr-only">Actions</span>
                  </TH>
                </THead>
                <TBody>
                  {list.rows.map((person) => (
                    <TR key={person.id}>
                      <TD>
                        <Checkbox
                          hiddenLabel={`Select ${person.name}`}
                          checked={selection.isSelected(person.id)}
                          disabled={Boolean(selection.everyone)}
                          onChange={() => selection.toggle(person.id)}
                        />
                      </TD>
                      <TDPrimary
                        title={nameOf(person)}
                        subtitle={[contact(person), person.reference]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                      <TD>
                        <span className="block font-medium text-ink">
                          {person.role}
                        </span>
                        <span className="block text-meta text-muted">
                          {[person.requisitionReference, person.department]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </TD>
                      <TD>{dayOf(person.acceptedAt, timeZone) ?? "—"}</TD>
                      <TD>{dayOf(person.startDate) ?? "—"}</TD>
                      <TD>
                        <HireStateBadge state={person.state} />
                        {detail(person)}
                      </TD>
                      <TD align="right">{actions(person)}</TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            </div>

            <ul className="flex flex-col gap-3 sm:hidden">
              {list.rows.map((person) => (
                <li key={person.id}>
                  <Card className="flex flex-col gap-2.5 p-4">
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        hiddenLabel={`Select ${person.name}`}
                        checked={selection.isSelected(person.id)}
                        disabled={Boolean(selection.everyone)}
                        onChange={() => selection.toggle(person.id)}
                      />
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium text-ink">
                          {nameOf(person)}
                        </p>
                        <p className="break-words text-body-sm text-muted">
                          {contact(person)}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-body-sm font-medium text-ink">
                        {person.role}
                      </p>
                      <p className="text-meta text-muted">
                        {[person.requisitionReference, person.department]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <p className="text-meta text-muted">
                      Accepted {dayOf(person.acceptedAt, timeZone) ?? "—"}
                      {person.startDate
                        ? `, starts ${dayOf(person.startDate) ?? person.startDate}`
                        : ""}
                    </p>
                    <div>
                      <HireStateBadge state={person.state} />
                      {detail(person)}
                    </div>
                    {actions(person)}
                  </Card>
                </li>
              ))}
            </ul>

            <LoadMore
              shown={list.rows.length}
              total={list.total}
              noun={["person", "people"]}
              hasMore={list.hasMore}
              loading={list.loadingMore}
              error={list.moreError}
              onLoadMore={list.loadMore}
            />
          </div>
        )}
      </LoadState>

      <CreateEmployeeDialog
        open={pending?.kind === "create"}
        onClose={() => setPending(null)}
        person={pending?.kind === "create" ? pending.person : null}
        busy={busy}
        error={dialogError}
        onConfirm={(person) => void createFor(person)}
      />
      <LinkEmployeeDialog
        open={pending?.kind === "link"}
        onClose={() => setPending(null)}
        offer={pending?.kind === "link" ? pending.offer : null}
        busy={busy}
        error={dialogError}
        onConfirm={(person, employeeId) =>
          void linkFor(
            person,
            employeeId,
            pending?.kind === "link" ? pending.offer.existing.name : "them",
          )
        }
      />
      <DidNotJoinDialog
        open={pending?.kind === "not-joined"}
        onClose={() => setPending(null)}
        person={pending?.kind === "not-joined" ? pending.person : null}
        busy={busy}
        error={dialogError}
        onConfirm={(person, reason) => void notJoinedFor(person, reason)}
      />
      <BulkCreateDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        count={selection.size}
        busy={bulkBusy}
        error={bulkError}
        onConfirm={() => void runBulkCreate()}
      />
      <EveryoneDialog
        open={everyoneOpen}
        onClose={() => setEveryoneOpen(false)}
        onConfirm={() => {
          selection.chooseEveryone(offer?.count ?? total);
          setEveryoneOpen(false);
        }}
        count={offer?.count ?? total}
        where="on the Hired list"
        applied={chips}
      />
      <ExportDialog
        open={exportTarget !== null}
        onClose={() => setExportTarget(null)}
        scope={exportTarget?.scope ?? "everyone on the list"}
        total={exportTarget?.count ?? 0}
        options={exportOptions.data}
        loading={exportOptions.loading}
        loadError={exportOptions.error}
        busy={exportBusy}
        error={exportError}
        onExport={(extras) => void runExport(extras)}
      />
    </div>
  );
}
