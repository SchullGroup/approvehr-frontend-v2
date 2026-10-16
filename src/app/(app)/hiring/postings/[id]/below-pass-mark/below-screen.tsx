"use client";

import { useState } from "react";
import { Flag, Inbox, Lock, Mail } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  FilterBar,
  Input,
  Select,
  Skeleton,
  TextLink,
  useToast,
  type AppliedFilter,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { LoadMore } from "@/components/portal/load-more";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  BulkBar,
  BulkResults,
  type BulkChoice,
} from "@/components/hiring/bulk-bar";
import { EveryoneDialog } from "@/components/hiring/bulk-dialogs";
import { OpenCv, useCanOpenCv } from "@/components/hiring/open-cv";
import { RejectDialog } from "@/components/hiring/reject-dialog";
import { ExplanationDisclosure } from "@/components/hiring/screening/explanation-panel";
import {
  AssessmentBadge,
  BelowBadge,
  FitBadge,
} from "@/components/hiring/screening/fit-badge";
import { KeepDialog } from "@/components/hiring/screening/keep-dialog";
import { careersApi } from "@/lib/api/careers";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import { useEmailReadiness } from "@/lib/hiring/pipeline/use-comms";
import { useBulkSelection } from "@/lib/hiring/pipeline/use-bulk-selection";
import { useRejectionReasons } from "@/lib/hiring/pipeline/use-pipeline";
import type {
  BelowFilters,
  BelowKind,
  BelowOutcome,
  BelowRow,
  BelowTarget,
} from "@/lib/hiring/screening/model";
import { count } from "@/lib/hiring/screening/score";
import { useScreeningGateway } from "@/lib/hiring/screening/use-gateway";
import {
  useBelowCount,
  useBelowList,
  usePassMark,
} from "@/lib/hiring/screening/use-screening";
import { usePermissions } from "@/lib/permissions";
import { usePosting } from "@/lib/store/careers-form";
import { formatDateShort } from "@/lib/time";
import { useDebounced } from "@/lib/use-debounced";

/**
 * The people below the pass mark, for a person to confirm.
 *
 * ## Nobody is rejected until you press the button
 *
 * The pass mark and the knockout answers **flag** people. This is where they are
 * gathered, with the reason each one is here, and a person reads them, keeps the
 * ones who should stay, and rejects the rest in bulk, with a reason from the
 * company's own list. The line at the top says so, and so does the dialog.
 *
 * ## The same dialog as everywhere else
 *
 * Rejecting here is the rejecting the board and the queue do: a structured reason
 * is required, and the **"Send decline emails" tick starts off every time it
 * opens**. Nothing is emailed by a selection, by a pass mark or by a count.
 *
 * ## "Everyone" is a number somebody confirmed
 *
 * Ticking everything shown offers to take everyone the filters match, names the
 * exact count, and asks. The action then carries that count, and if the list
 * changed in the meantime nothing is done and the person is told.
 */

const BREADCRUMB = [
  { href: "/hiring", label: "Hiring" },
  { href: "/hiring/postings", label: "Job adverts" },
];

const REASON_OPTIONS: { value: BelowKind; label: string }[] = [
  { value: "FIT", label: "Fit score" },
  { value: "ASSESSMENT", label: "Assessment score" },
  { value: "KNOCKOUT", label: "A flagged answer" },
];

/** One per click. The same key is the same action, so a double click is one. */
const newKey = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export function BelowScreen({ id }: { id: string }) {
  const { can, loading } = usePermissions();
  if (loading) {
    return (
      <>
        <PageHeader title="Below the pass mark" breadcrumb={BREADCRUMB} />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading</span>
        </PageBody>
      </>
    );
  }
  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader title="Below the pass mark" breadcrumb={BREADCRUMB} />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot open this list"
              description="It holds applicants' details and is where people are turned down, so it is kept to whoever hires. Ask whoever manages access to add hiring to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }
  return <Below id={id} />;
}

function Below({ id }: { id: string }) {
  const gateway = useScreeningGateway();
  const advert = usePosting(id);
  const toast = useToast();
  const reasons = useRejectionReasons();
  const readiness = useEmailReadiness(true);
  const canOpenFiles = useCanOpenCv();
  const passMark = usePassMark(id);
  const total = useBelowCount(id);

  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim(), 300);
  const [reason, setReason] = useState<BelowKind | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const backwards = from !== "" && to !== "" && from > to;

  const filters: BelowFilters = {
    ...(query ? { q: query } : {}),
    ...(reason ? { reason } : {}),
    ...(from && !backwards ? { from } : {}),
    ...(to && !backwards ? { to } : {}),
  };
  const list = useBelowList(id, filters);
  const scope = JSON.stringify([id, filters]);
  const selection = useBulkSelection(scope);

  const [rejecting, setRejecting] = useState(false);
  const [everyoneAsk, setEveryoneAsk] = useState(false);
  const [keeping, setKeeping] = useState<BelowRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [keepError, setKeepError] = useState<string | null>(null);
  const [keepBusy, setKeepBusy] = useState(false);
  const [results, setResults] = useState<{
    what: string;
    outcome: BelowOutcome;
  } | null>(null);

  const title = advert.posting?.title ?? "this advert";
  const crumbs = [
    ...BREADCRUMB,
    {
      href: `/hiring/postings/${id}?tab=screening`,
      label: advert.posting?.title ?? "Advert",
    },
  ];

  const stale = list.settling || search.trim() !== query;
  const rows = list.rows;
  const ids = rows.map((row) => row.id);
  const shownTotal = list.total ?? rows.length;
  const emailsSupported = readiness.data?.supported === true;

  const applied: AppliedFilter[] = [
    ...(reason
      ? [
          {
            label: "Below because of",
            value: REASON_OPTIONS.find((o) => o.value === reason)?.label ?? "",
            onClear: () => setReason(""),
          },
        ]
      : []),
    ...(from
      ? [{ label: "Applied from", value: from, onClear: () => setFrom("") }]
      : []),
    ...(to
      ? [{ label: "Applied to", value: to, onClear: () => setTo("") }]
      : []),
  ];
  const narrowed = applied.length > 0 || search.trim() !== "";
  const clearAll = () => {
    setSearch("");
    setReason("");
    setFrom("");
    setTo("");
  };

  const offer =
    !selection.everyone &&
    list.hasMore &&
    shownTotal > rows.length &&
    selection.allOf(ids)
      ? { count: shownTotal }
      : null;

  const target = (): BelowTarget =>
    selection.everyone
      ? {
          kind: "filter",
          postingId: id,
          filters,
          expected: selection.everyone.count,
        }
      : { kind: "ids", postingId: id, ids: [...selection.picked] };

  async function reject(choice: {
    reasonId: string;
    note: string | null;
    sendEmail: boolean;
  }) {
    setBusy(true);
    setProgress(null);
    setRejectError(null);
    setResults(null);
    try {
      const outcome = await gateway.below.reject({
        target: target(),
        decision: {
          reasonId: choice.reasonId,
          note: choice.note,
          /* Only ever true when the person ticked it in the dialog. */
          sendEmails: choice.sendEmail,
        },
        idempotencyKey: newKey(),
        signal: new AbortController().signal,
        onProgress: setProgress,
      });
      setResults({ what: "Rejected", outcome });
      selection.clear();
      setRejecting(false);
      list.reload();
      total.reload();
    } catch (error) {
      setRejectError(sentenceOf(error));
      toast.push({
        title: "Nobody was rejected",
        tone: "danger",
        detail: sentenceOf(error),
      });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function keep(row: BelowRow, why: string) {
    setKeepBusy(true);
    setKeepError(null);
    try {
      await gateway.below.keep(row.id, why);
      list.remove(row.id);
      list.reload();
      total.reload();
      setKeeping(null);
      toast.push({
        title: `${row.name} is kept in the running`,
        tone: "success",
        detail: "Your reason is on their record.",
      });
    } catch (error) {
      setKeepError(sentenceOf(error));
    } finally {
      setKeepBusy(false);
    }
  }

  function choose(choice: BulkChoice) {
    if (choice === "reject") {
      setRejectError(null);
      setRejecting(true);
    } else if (choice === "everyone") setEveryoneAsk(true);
    else if (choice === "clear") selection.clear();
  }

  const n = selection.size.toLocaleString("en-NG");
  const people = `${n} ${selection.size === 1 ? "person" : "people"}`;
  const noPassMark =
    passMark.mark !== null &&
    passMark.mark.fitMin === null &&
    passMark.mark.assessmentMin === null;

  return (
    <>
      <PageHeader
        title="Below the pass mark"
        breadcrumb={crumbs}
        meta={
          total.count ? (
            <Badge tone="warning" size="sm" className="tabular">
              {count(total.count.below)} of {count(total.count.total)} waiting
            </Badge>
          ) : undefined
        }
        action={
          <ButtonLink
            href={`/hiring/postings/${id}?tab=screening`}
            variant="secondary"
            size="sm"
          >
            Change the pass mark
          </ButtonLink>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <Callout tone="info" title="A person decides">
          These people are below the pass mark. Nobody is rejected until you
          confirm. Read their applications, keep in the running anybody who
          should stay, then reject the rest with a reason.
        </Callout>

        <Card>
          <CardHeader
            title={`Applicants to ${title}`}
            description="The clearest cases first: the lowest fit scores at the top."
          />
          <CardBody className="flex flex-col gap-4">
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Find a name or email"
              searchLabel="Find an applicant by name or email"
              applied={applied}
              onClearAll={clearAll}
              count={list.total ?? undefined}
              noun={["person", "people"]}
            >
              <Field label="Below because of">
                <Select
                  value={reason}
                  onChange={(event) =>
                    setReason(event.target.value as BelowKind | "")
                  }
                >
                  <option value="">Any reason</option>
                  {REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Applied from" optional>
                <Input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </Field>
              <Field
                label="Applied to"
                optional
                {...(backwards
                  ? {
                      error:
                        "That is before the start date, so no dates are applied.",
                    }
                  : {})}
              >
                <Input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => setTo(event.target.value)}
                />
              </Field>
            </FilterBar>

            {results && (
              <BulkResults
                what={results.what}
                outcome={results.outcome}
                onDismiss={() => setResults(null)}
              />
            )}

            {list.loading ? (
              <div>
                <Skeleton className="h-32 w-full" />
                <span className="sr-only-focusable">Loading the list</span>
              </div>
            ) : list.error ? (
              <LoadFailure
                subject="this list"
                error={list.error}
                onRetry={() => list.reload()}
              />
            ) : rows.length === 0 && !stale ? (
              <EmptyState
                icon={<Inbox aria-hidden="true" />}
                title={
                  narrowed
                    ? "Nobody matches"
                    : noPassMark
                      ? "There is no pass mark yet"
                      : "Nobody is below the pass mark"
                }
                description={
                  narrowed
                    ? "Nobody fits the search and filters above."
                    : noPassMark
                      ? "Set one on the advert's Screening tab, and anybody under it appears here for a person to look at."
                      : "Everybody waiting is at or above it, or has already been decided on."
                }
                action={
                  narrowed ? (
                    <Button variant="secondary" size="sm" onClick={clearAll}>
                      Clear the search and filters
                    </Button>
                  ) : noPassMark ? (
                    <ButtonLink
                      href={`/hiring/postings/${id}?tab=screening`}
                      variant="accent"
                      size="sm"
                    >
                      Set a pass mark
                    </ButtonLink>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  <Checkbox
                    label="Select everyone shown"
                    checked={selection.allOf(ids)}
                    indeterminate={selection.someOf(ids)}
                    disabled={Boolean(selection.everyone) || busy}
                    onChange={() => selection.toggleMany(ids)}
                  />
                  <BulkBar
                    selection={selection}
                    busy={busy}
                    progress={progress}
                    offer={
                      offer
                        ? { count: offer.count, where: "in this list" }
                        : null
                    }
                    onChoose={choose}
                    choices={["reject", "clear"]}
                  />
                </div>

                <ul
                  aria-busy={stale}
                  className={
                    stale
                      ? "flex list-none flex-col gap-3 p-0 opacity-60 transition-opacity"
                      : "flex list-none flex-col gap-3 p-0 transition-opacity"
                  }
                >
                  {rows.map((row) => (
                    <li key={row.id}>
                      <BelowRowView
                        row={row}
                        selected={selection.isSelected(row.id)}
                        selectable={!selection.everyone && !busy}
                        onToggle={() => selection.toggle(row.id)}
                        onKeep={() => {
                          setKeepError(null);
                          setKeeping(row);
                        }}
                        canOpenFile={gateway.mode === "api" && canOpenFiles}
                        criteriaHref={`/hiring/postings/${id}?tab=screening`}
                      />
                    </li>
                  ))}
                </ul>
                <LoadMore
                  shown={rows.length}
                  total={list.total}
                  noun={["person", "people"]}
                  hasMore={list.hasMore}
                  loading={list.loadingMore}
                  error={list.moreError}
                  onLoadMore={list.loadMore}
                />
              </>
            )}
          </CardBody>
        </Card>
      </PageBody>

      <RejectDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        subject={people}
        title={`Reject ${people}?`}
        confirmLabel={`Reject ${people}`}
        reasons={reasons.items}
        busy={busy}
        error={rejectError}
        emailOffer={
          emailsSupported
            ? {
                label: "Send decline emails",
                description:
                  "Off unless you tick it. Rejecting never emails anybody by itself.",
                blockedBy: readiness.data?.blockedBy ?? [],
              }
            : null
        }
        onConfirm={(choice) => void reject(choice)}
      />

      <EveryoneDialog
        open={everyoneAsk && offer !== null}
        onClose={() => setEveryoneAsk(false)}
        count={offer?.count ?? 0}
        where="below the pass mark here"
        applied={applied}
        onConfirm={() => {
          if (!offer) return;
          selection.chooseEveryone(offer.count);
          setEveryoneAsk(false);
        }}
      />

      <KeepDialog
        open={keeping !== null}
        onClose={() => setKeeping(null)}
        name={keeping?.name ?? "this person"}
        busy={keepBusy}
        error={keepError}
        onConfirm={(why) => keeping && void keep(keeping, why)}
      />
    </>
  );
}

/* --------------------------------------------------------------------- a row */

function BelowRowView({
  row,
  selected,
  selectable,
  onToggle,
  onKeep,
  canOpenFile,
  criteriaHref,
}: {
  row: BelowRow;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
  onKeep: () => void;
  canOpenFile: boolean;
  criteriaHref: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Checkbox
            className="mt-0.5"
            hiddenLabel={`Select ${row.name}`}
            checked={selected}
            disabled={!selectable}
            onChange={onToggle}
          />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
              <TextLink href={`/hiring/candidates/${row.id}`}>
                {row.name}
              </TextLink>
              <FitBadge fit={row.summary.fit} />
              <AssessmentBadge score={row.summary.assessment} />
              <BelowBadge below />
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted">
              {row.email && (
                <span className="inline-flex max-w-full min-w-0 items-center gap-1 [overflow-wrap:anywhere]">
                  <Mail aria-hidden="true" className="size-3.5" />
                  {row.email}
                </span>
              )}
              <span className="tabular">
                Applied {formatDateShort(row.appliedAt, "Africa/Lagos")}
              </span>
            </p>
          </div>
        </div>
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5">
          {canOpenFile && <OpenCv open={() => careersApi.openCv(row.id)} />}
          <Button variant="secondary" size="sm" onClick={onKeep}>
            Keep in the running
            <span className="sr-only">: {row.name}</span>
          </Button>
        </div>
      </div>

      <div>
        <p className="text-meta font-semibold text-faint">Why they are here</p>
        <ul className="mt-1 list-disc pl-5 text-body-sm text-body">
          {row.reasons.map((reason) => (
            <li key={reason.kind}>{reason.text}</li>
          ))}
        </ul>
      </div>

      {row.flagged.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-meta font-semibold text-faint">
            <Flag aria-hidden="true" className="size-3" />
            Answers that raised a flag
          </p>
          <ul className="mt-1 list-disc pl-5 text-body-sm text-body">
            {row.flagged.map((answer) => (
              <li key={answer.question}>
                {answer.question}{" "}
                <span className="text-muted">Answered {answer.answer}.</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ExplanationDisclosure
        subject={{ kind: "application", id: row.id }}
        criteriaHref={criteriaHref}
      />
    </div>
  );
}
