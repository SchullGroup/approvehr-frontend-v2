"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Copy,
  Flag,
  Inbox,
  Link2,
  Lock,
  Mail,
  Phone,
} from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  Field,
  FilterBar,
  Input,
  LinkedText,
  Modal,
  Picker,
  SegmentedControl,
  Select,
  Skeleton,
  TextLink,
  useToast,
  type AppliedFilter,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { LoadMore } from "@/components/portal/load-more";
import {
  BulkBar,
  BulkResults,
  type BulkChoice,
} from "@/components/hiring/bulk-bar";
import { EveryoneDialog } from "@/components/hiring/bulk-dialogs";
import { RejectDialog } from "@/components/hiring/reject-dialog";
import { OpenCv, useCanOpenCv } from "@/components/hiring/open-cv";
import { RowAnswers } from "@/components/hiring/row-answers";
import { ExplanationDisclosure } from "@/components/hiring/screening/explanation-panel";
import { ScreeningBadges } from "@/components/hiring/screening/fit-badge";
import { PostingScreeningNote } from "@/components/hiring/screening/posting-note";
import {
  ScoreFilterFields,
  useScoreFilterState,
} from "@/components/hiring/screening/score-filters";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  careersApi,
  kobo,
  requisitionClosedNote,
  type AdvanceBody,
  type ApiApplication,
  type ApiPosting,
  type ApplicationStatus,
} from "@/lib/api/careers";
import { sourceLabel, summaryFromRow } from "@/lib/hiring/form-wire";
import { DUPLICATE_REASON } from "@/lib/hiring/answers-view";
import { usePermissions } from "@/lib/permissions";
import { useRequisitions } from "@/lib/store/recruitment";
import {
  queueMatching,
  useApplications,
  useCareersAnalytics,
  usePostingIndex,
  usePostings,
  useScreeningActions,
  type ApplicationFilters,
} from "@/lib/store/careers";
import { useDebounced } from "@/lib/use-debounced";
import { downloadCsv, toCsv } from "@/lib/csv";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import type { BulkOutcome, BulkProgress } from "@/lib/hiring/pipeline/model";
import {
  QUEUE_BULK_MAX,
  confirmedRows,
  queueCsvRows,
  runQueue,
} from "@/lib/hiring/pipeline/queue-bulk";
import { useBulkSelection } from "@/lib/hiring/pipeline/use-bulk-selection";
import { useRejectionReasons } from "@/lib/hiring/pipeline/use-pipeline";

/**
 * The screening queue.
 *
 * Everybody who filled in the public form, newest first, with the two decisions
 * on the row: screen them in, or turn them down.
 *
 * ## Advance is not a status change
 *
 * It creates a `Candidate` and a pipeline `Application` in one transaction and
 * links back, so the person ends up somewhere — and the screen says where, in
 * the API's own words, because a sentence composed here could disagree with what
 * actually happened.
 *
 * It also needs an approved role to put them on. Most adverts have one; the ones
 * that do not are flagged on the row, and pressing Advance on them asks for the
 * one missing thing rather than failing.
 *
 * ## A page at a time, and the server does the filtering
 *
 * The queue used to load the newest hundred and filter, search and count them in
 * the browser, so a campus drive's two-hundredth applicant was invisible and the
 * search box could only find the hundred it had. Every filter here — status,
 * advert, source, the dates somebody applied between, and the search — is now a
 * question to the API, the count in the bar is the API's, and "Load more" fetches
 * the next fifty. The search waits for a pause in typing before it asks.
 *
 * ## Two things this screen says plainly
 *
 * - **A CV opens on request.** A row carries no link; "Open CV" asks the API for
 *   one short-lived address for that person's file, and the API records who
 *   asked. See `OpenCv`.
 * - **Declining sends nothing.** ApproveHR does not email applicants yet. So the
 *   dialog says that before you press it, and the row afterwards hands you a
 *   message to send yourself.
 */
/** Every status value a link into this screen may legitimately name. */
const LINKABLE_STATUSES = new Set<string>([
  "ALL",
  "RECEIVED",
  "ADVANCED",
  "DECLINED",
]);

export function ApplicationsScreen({
  initialPostingId = "",
  initialStatus = "",
}: {
  initialPostingId?: string;
  /** One of `LINKABLE_STATUSES`, when a count elsewhere in the module linked
   *  here to answer a specific question ("how many are screened in" links
   *  with `ADVANCED`, not always "Waiting"); anything else — including no
   *  value at all — falls back to the ordinary "Waiting" default. */
  initialStatus?: string;
}) {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader
          title="Applications"
          breadcrumb={[
            { href: "/hiring", label: "Hiring" },
            { href: "/hiring/postings", label: "Job adverts" },
          ]}
        />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading the queue</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader
          title="Applications"
          breadcrumb={[{ href: "/hiring", label: "Hiring" }]}
        />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot see applications"
              description="Each one holds a stranger's phone number and salary expectation, so they are kept to whoever hires. Ask whoever manages access to add hiring to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return (
    <Queue
      initialPostingId={initialPostingId}
      initialStatus={
        LINKABLE_STATUSES.has(initialStatus)
          ? (initialStatus as ApplicationStatus | "ALL")
          : "RECEIVED"
      }
    />
  );
}

/* -------------------------------------------------------------------------- */

const STATUS_FILTERS: { value: ApplicationStatus | "ALL"; label: string }[] = [
  { value: "RECEIVED", label: "Waiting" },
  { value: "ADVANCED", label: "Screened in" },
  { value: "DECLINED", label: "Turned down" },
  { value: "ALL", label: "Everyone" },
];

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  RECEIVED: "Waiting",
  ADVANCED: "In the pipeline",
  DECLINED: "Turned down",
  WITHDRAWN: "Withdrawn",
};

const STATUS_TONE: Record<
  ApplicationStatus,
  "warning" | "success" | "neutral" | "info"
> = {
  RECEIVED: "warning",
  ADVANCED: "success",
  DECLINED: "neutral",
  WITHDRAWN: "info",
};

function Queue({
  initialPostingId,
  initialStatus,
}: {
  initialPostingId: string;
  initialStatus: ApplicationStatus | "ALL";
}) {
  const [status, setStatus] = useState<ApplicationStatus | "ALL">(
    initialStatus,
  );
  const [postingId, setPostingIdRaw] = useState(initialPostingId);
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [search, setSearch] = useState("");
  const [advancing, setAdvancing] = useState<ApiApplication | null>(null);
  const [declining, setDeclining] = useState<ApiApplication | null>(null);
  const score = useScoreFilterState();
  /* A score range and a score sort only mean something against one advert, so
     letting go of the advert lets go of them. */
  const setPostingId = (next: string) => {
    setPostingIdRaw(next);
    if (next === "") score.dropAdvertOnly();
  };
  const [results, setResults] = useState<{
    what: string;
    outcome: BulkOutcome;
  } | null>(null);
  const [decliningBusy, setDecliningBusy] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const reasons = useRejectionReasons();

  /* A keystroke is faster than a request: ask once the typing pauses. */
  const query = useDebounced(search.trim(), 300);

  /* Start after end is nobody's question. Say so and ask for neither, rather
     than sending a range the API can only answer with nothing. */
  const rangeBackwards = from !== "" && to !== "" && from > to;

  const postings = usePostings();
  const index = usePostingIndex(postings.postings);
  const sources = useCareersAnalytics();
  const applications = useApplications({
    ...(status === "ALL" ? {} : { status }),
    ...(postingId ? { postingId } : {}),
    ...(source ? { source } : {}),
    ...(query ? { q: query } : {}),
    ...(from && !rangeBackwards ? { from } : {}),
    ...(to && !rangeBackwards ? { to } : {}),
    ...(flagged ? { flagged } : {}),
    ...(duplicate ? { duplicate } : {}),
    ...score.filters,
    sort: score.sort,
  });
  /* What narrows the queue, as the one object the list, the "select everyone
     matching" count and the action all read, so they cannot disagree. */
  const queueFilters: ApplicationFilters = {
    ...(status === "ALL" ? {} : { status }),
    ...(postingId ? { postingId } : {}),
    ...(source ? { source } : {}),
    ...(query ? { q: query } : {}),
    ...(from && !rangeBackwards ? { from } : {}),
    ...(to && !rangeBackwards ? { to } : {}),
    ...(flagged ? { flagged } : {}),
    ...(duplicate ? { duplicate } : {}),
    ...score.filters,
    sort: score.sort,
  };
  /* A different question is a different list, and a selection belongs to one. */
  const selectionScope = JSON.stringify(queueFilters);
  const canOpenFiles = useCanOpenCv();
  const toast = useToast();
  const router = useRouter();

  /* Rows on screen answer an earlier question: filters changed, or the search
     has been typed but not yet sent. Shown dimmed rather than swapped for a
     skeleton, so the list does not collapse and jump. */
  const stale = applications.settling || search.trim() !== query;

  const sourceOptions = useMemo(
    () =>
      (sources.analytics?.perSource ?? [])
        .map((entry) => entry.source)
        /* "Not given" is a bucket the tally invents for the blanks; it is not a
           value the API can filter on. */
        .filter((name) => name !== "Not given"),
    [sources.analytics],
  );

  const applied: AppliedFilter[] = [
    ...(postingId
      ? [
          {
            label: "Advert",
            value: index.get(postingId)?.title ?? "Selected advert",
            onClear: () => setPostingId(""),
          },
        ]
      : []),
    ...(source
      ? [
          {
            label: "Heard via",
            value: sourceLabel(source) ?? source,
            onClear: () => setSource(""),
          },
        ]
      : []),
    ...(from
      ? [
          {
            label: "Applied from",
            value: from,
            onClear: () => setFrom(""),
          },
        ]
      : []),
    ...(to
      ? [{ label: "Applied to", value: to, onClear: () => setTo("") }]
      : []),
    ...(flagged
      ? [
          {
            label: "Showing",
            value: "Needs a look",
            onClear: () => setFlagged(false),
          },
        ]
      : []),
    ...(duplicate
      ? [
          {
            label: "Showing",
            value: "Possible duplicates",
            onClear: () => setDuplicate(false),
          },
        ]
      : []),
    ...score.chips,
  ];
  const narrowed = applied.length > 0 || search.trim() !== "";
  const clearAll = () => {
    setPostingId("");
    setSource("");
    setFrom("");
    setTo("");
    setFlagged(false);
    setDuplicate(false);
    setSearch("");
    score.clear();
  };

  const fail = (error: unknown) =>
    toast.push({
      title: "That did not work",
      tone: "danger",
      detail:
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
    });

  return (
    <>
      <PageHeader
        title="Applications"
        breadcrumb={[
          { href: "/hiring", label: "Hiring" },
          { href: "/hiring/postings", label: "Job adverts" },
        ]}
      />

      <PageBody className="flex flex-col gap-6">
        <Card>
          <CardHeader
            title="Applications"
            description="Newest first, which is the order to work it in."
            action={
              <SegmentedControl
                label="Filter applications by status"
                options={STATUS_FILTERS}
                value={status}
                onChange={setStatus}
              />
            }
          />

          <CardBody className="flex flex-col gap-4">
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Find a name or email"
              searchLabel="Find an applicant by name or email"
              applied={applied}
              onClearAll={clearAll}
              count={applications.total ?? undefined}
              noun={["application", "applications"]}
            >
              <Field label="Advert">
                <Select
                  value={postingId}
                  onChange={(event) => setPostingId(event.target.value)}
                >
                  <option value="">Every advert</option>
                  {postings.postings.map((posting) => (
                    <option key={posting.id} value={posting.id}>
                      {posting.title}
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
                  {sourceOptions.map((name) => (
                    <option key={name} value={name}>
                      {sourceLabel(name) ?? name}
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
                {...(rangeBackwards
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
              <ScoreFilterFields state={score} needsAdvert={postingId === ""} />
              <div className="flex flex-col justify-end gap-2.5 pb-1.5">
                <Checkbox
                  label="Needs a look"
                  description="A knockout answer was given."
                  checked={flagged}
                  onChange={(event) => setFlagged(event.target.checked)}
                />
                <Checkbox
                  label="Possible duplicates"
                  description="Same email or phone as an earlier one."
                  checked={duplicate}
                  onChange={(event) => setDuplicate(event.target.checked)}
                />
              </div>
            </FilterBar>

            {postingId && (
              <PostingScreeningNote
                postingId={postingId}
                rows={applications.applications}
              />
            )}

            {results && (
              <BulkResults
                what={results.what}
                outcome={results.outcome}
                onDismiss={() => setResults(null)}
              />
            )}

            {applications.loading ? (
              <div>
                <Skeleton className="h-32 w-full" />
                <span className="sr-only-focusable">Loading the queue</span>
              </div>
            ) : applications.error ? (
              <LoadFailure
                subject="the queue"
                error={applications.error}
                onRetry={() => void applications.reload()}
              />
            ) : applications.applications.length === 0 && !stale ? (
              <EmptyState
                icon={<Inbox aria-hidden="true" />}
                title={
                  narrowed
                    ? "Nobody matches"
                    : status === "RECEIVED"
                      ? "Nobody is waiting"
                      : "Nothing to show"
                }
                description={
                  narrowed
                    ? "Nobody fits the search and filters above."
                    : status === "RECEIVED"
                      ? "New applications land here the moment somebody sends the form."
                      : undefined
                }
                {...(narrowed
                  ? {
                      action: (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={clearAll}
                        >
                          Clear the search and filters
                        </Button>
                      ),
                    }
                  : {})}
              />
            ) : (
              <QueueResults
                key={selectionScope}
                applications={applications}
                index={index}
                canOpenFiles={canOpenFiles}
                filters={queueFilters}
                chips={applied}
                stale={stale}
                onResults={setResults}
                onAdvance={setAdvancing}
                onDecline={setDeclining}
                onCopyMessage={(application) => {
                  void copyText(
                    declineMessage(application),
                    () =>
                      toast.push({
                        title: "Message copied",
                        tone: "success",
                        detail: `Send it to ${application.email}.`,
                      }),
                    fail,
                  );
                }}
              />
            )}
          </CardBody>
        </Card>
      </PageBody>

      {/* Always mounted: `Modal` reads `open` and decides for itself whether
          to render, so it can see it go false and play its exit animation.
          `application` stays nullable rather than gating the mount — both
          dialogs below already guard every place they touch it. */}
      <AdvanceDialog
        open={advancing !== null}
        application={advancing}
        posting={advancing ? index.get(advancing.postingId) : undefined}
        onClose={() => setAdvancing(null)}
        onConfirm={async (body) => {
          if (!advancing) return;
          try {
            const result = await applications.advance(advancing.id, body);
            setAdvancing(null);
            toast.push({
              title: `${advancing.name} is in the pipeline`,
              tone: "success",
              detail: result.note,
            });
            /* Land on their record rather than leaving the reader on a queue
               that just lost a row — this is where Schedule interview lives,
               and it is the thing screening somebody in is usually for. */
            router.push(`/hiring/candidates/${result.candidateId}`);
          } catch (error) {
            fail(error);
          }
        }}
      />

      <RejectDialog
        open={declining !== null}
        onClose={() => setDeclining(null)}
        subject={declining?.name ?? "this applicant"}
        title={
          declining
            ? `Turn down ${declining.name}?`
            : "Turn down this applicant?"
        }
        confirmLabel="Turn them down"
        reasons={reasons.items}
        busy={decliningBusy}
        error={declineError}
        onConfirm={(choice) => {
          if (!declining) return;
          setDecliningBusy(true);
          setDeclineError(null);
          void applications
            .decline(declining.id, reasonText(reasons.items, choice))
            .then(() => {
              toast.push({
                title: `${declining.name} turned down`,
                tone: "success",
                detail: "Nothing was sent to them. Use Copy message to write.",
              });
              setDeclining(null);
            })
            .catch((error: unknown) => setDeclineError(sentenceOf(error)))
            .finally(() => setDecliningBusy(false));
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** The reason as the queue keeps it: the company's wording, and a note if there is one. */
function reasonText(
  reasons: readonly { id: string; label: string }[],
  choice: { reasonId: string; note: string | null },
): string {
  const label =
    reasons.find((reason) => reason.id === choice.reasonId)?.label ??
    "No reason given";
  return choice.note ? `${label}: ${choice.note}` : label;
}

type QueueApplications = ReturnType<typeof useApplications>;

/**
 * The list, and what can be done to several people in it.
 *
 * ## Why it is keyed by the question
 *
 * Its parent gives it a `key` made of the filters, so asking a different question
 * mounts a fresh one and the selection starts empty. Nobody carries "everyone
 * matching" from one list to another, and a tick never outlives the rows it was
 * made on.
 *
 * ## What the queue can and cannot do in bulk
 *
 * Advance and decline, a hundred at a time, one request each. Tags are the
 * pipeline's: they belong to a candidate, and an applicant waiting in the queue is
 * not one yet, so there are none here.
 */
function QueueResults({
  applications,
  index,
  canOpenFiles,
  filters,
  chips,
  stale,
  onResults,
  onAdvance,
  onDecline,
  onCopyMessage,
}: {
  applications: QueueApplications;
  index: ReturnType<typeof usePostingIndex>;
  canOpenFiles: boolean;
  filters: ApplicationFilters;
  chips: AppliedFilter[];
  stale: boolean;
  /**
   * Where the answer goes. The results live in the parent, not here: when the last
   * person waiting is done the list gives way to "Nobody is waiting", and a panel
   * that listed who could not be done must not go with it.
   */
  onResults: (results: { what: string; outcome: BulkOutcome } | null) => void;
  onAdvance: (application: ApiApplication) => void;
  onDecline: (application: ApiApplication) => void;
  onCopyMessage: (application: ApiApplication) => void;
}) {
  const toast = useToast();
  const reasons = useRejectionReasons();
  const screening = useScreeningActions();
  const selection = useBulkSelection("queue");
  const [dialog, setDialog] = useState<
    "advance" | "decline" | "everyone" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const rows = applications.applications;
  const waiting = rows.filter((row) => row.status === "RECEIVED");
  const waitingIds = waiting.map((row) => row.id);
  const total = applications.total ?? rows.length;

  const offer =
    !selection.everyone &&
    applications.hasMore &&
    total > rows.length &&
    total <= QUEUE_BULK_MAX &&
    selection.allOf(waitingIds)
      ? { count: total }
      : null;
  const tooMany =
    !selection.everyone &&
    applications.hasMore &&
    total > QUEUE_BULK_MAX &&
    selection.allOf(waitingIds);

  /** Who the next action is for. "Everyone" is checked against the count confirmed. */
  async function whoIsSelected(): Promise<ApiApplication[]> {
    if (selection.everyone) {
      const found = await queueMatching(
        filters,
        QUEUE_BULK_MAX + 1,
        new AbortController().signal,
      );
      return confirmedRows(found, selection.everyone.count).filter(
        (row) => row.status === "RECEIVED",
      );
    }
    return rows.filter((row) => selection.picked.has(row.id));
  }

  async function run(
    what: string,
    act: (row: ApiApplication) => Promise<void>,
  ) {
    setBusy(true);
    setProgress(null);
    onResults(null);
    setProblem(null);
    try {
      const chosen = await whoIsSelected();
      const outcome = await runQueue({
        rows: chosen,
        act,
        onProgress: setProgress,
      });
      onResults({ what, outcome });
      selection.clear();
      setDialog(null);
      await applications.reload();
    } catch (error) {
      setProblem(sentenceOf(error));
      toast.push({
        title: "Nothing was changed",
        tone: "danger",
        detail: sentenceOf(error),
      });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function exportSelected() {
    try {
      const chosen = await whoIsSelected();
      const sheet = queueCsvRows(chosen);
      downloadCsv("applicants.csv", toCsv(sheet.headers, sheet.rows));
      toast.push({ title: "Downloaded applicants.csv", tone: "success" });
    } catch (error) {
      toast.push({
        title: "Nothing was downloaded",
        tone: "danger",
        detail: sentenceOf(error),
      });
    }
  }

  function choose(choice: BulkChoice) {
    if (choice === "move") setDialog("advance");
    else if (choice === "reject") {
      setProblem(null);
      setDialog("decline");
    } else if (choice === "everyone") setDialog("everyone");
    else if (choice === "export") void exportSelected();
    else if (choice === "clear") selection.clear();
  }

  const n = selection.size.toLocaleString("en-NG");
  const people = `${n} ${selection.size === 1 ? "person" : "people"}`;

  return (
    <>
      {applications.canScreen && waiting.length > 0 && (
        <div className="flex flex-col gap-3">
          <Checkbox
            label="Select everyone shown who is waiting"
            checked={selection.allOf(waitingIds)}
            indeterminate={selection.someOf(waitingIds)}
            disabled={Boolean(selection.everyone) || busy}
            onChange={() => selection.toggleMany(waitingIds)}
          />
          <BulkBar
            selection={selection}
            busy={busy}
            progress={progress}
            offer={offer ? { count: offer.count, where: "in this list" } : null}
            onChoose={choose}
            choices={["move", "reject", "export", "clear"]}
            labels={{ move: "Advance…", reject: "Turn down…" }}
          />
          {tooMany && (
            <p className="text-body-sm text-muted">
              {total.toLocaleString("en-NG")} people match. The queue does{" "}
              {QUEUE_BULK_MAX} at a time, so narrow the filters, or work through
              them in parts.
            </p>
          )}
          {problem && (
            <p role="alert" className="text-body-sm text-danger-text">
              {problem}
            </p>
          )}
        </div>
      )}

      <div
        aria-busy={stale}
        className={
          stale
            ? "flex flex-col gap-3 opacity-60 transition-opacity"
            : "flex flex-col gap-3 transition-opacity"
        }
      >
        {rows.map((application) => (
          <ApplicationRow
            key={application.id}
            application={application}
            posting={index.get(application.postingId)}
            editable={applications.editable}
            canScreen={applications.canScreen}
            selected={selection.isSelected(application.id)}
            selectable={!selection.everyone && !busy}
            onToggle={() => selection.toggle(application.id)}
            canOpenFiles={canOpenFiles}
            onAdvance={() => onAdvance(application)}
            onDecline={() => onDecline(application)}
            onCopyMessage={() => onCopyMessage(application)}
          />
        ))}
      </div>
      <LoadMore
        shown={rows.length}
        total={applications.total}
        noun={["application", "applications"]}
        hasMore={applications.hasMore}
        loading={applications.loadingMore}
        error={applications.moreError}
        onLoadMore={applications.loadMore}
      />

      <ConfirmDialog
        open={dialog === "advance"}
        onClose={() => setDialog(null)}
        title={`Move ${people} into the pipeline?`}
        body="Each goes into the first stage of the role their advert is for. Anybody whose advert has no approved role, or who has already been decided on, is listed afterwards with the reason."
        confirmLabel={`Move ${people}`}
        tone="primary"
        loading={busy}
        onConfirm={() =>
          void run("Moved into the pipeline", async (row) => {
            await screening.advance(row.id, {});
          })
        }
      />

      <RejectDialog
        open={dialog === "decline"}
        onClose={() => setDialog(null)}
        subject={people}
        title={`Turn down ${people}?`}
        confirmLabel={`Turn down ${people}`}
        reasons={reasons.items}
        busy={busy}
        error={problem}
        onConfirm={(choice) =>
          void run("Turned down", async (row) => {
            await screening.decline(row.id, reasonText(reasons.items, choice));
          })
        }
      />

      <EveryoneDialog
        open={dialog === "everyone" && offer !== null}
        onClose={() => setDialog(null)}
        count={offer?.count ?? 0}
        where="in this list"
        applied={chips}
        onConfirm={() => {
          if (!offer) return;
          selection.chooseEveryone(offer.count);
          setDialog(null);
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function ApplicationRow({
  application,
  posting,
  editable,
  canScreen,
  selected,
  selectable,
  onToggle,
  canOpenFiles,
  onAdvance,
  onDecline,
  onCopyMessage,
}: {
  application: ApiApplication;
  /** Absent only if the advert is outside the page of adverts that was loaded. */
  posting: ApiPosting | undefined;
  editable: boolean;
  /** Somebody can be screened in or turned down here (a demo can, in its own book). */
  canScreen: boolean;
  selected: boolean;
  /** The tick is shown and works: waiting rows only, and not in "everyone" mode. */
  selectable: boolean;
  onToggle: () => void;
  canOpenFiles: boolean;
  onAdvance: () => void;
  onDecline: () => void;
  onCopyMessage: () => void;
}) {
  const waiting = application.status === "RECEIVED";
  const noApprovedRole =
    posting !== undefined && posting.requisitionId === null;
  const closedNote =
    posting !== undefined
      ? requisitionClosedNote(posting.requisitionStatus)
      : null;
  const summary = summaryFromRow(application);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {canScreen && waiting && (
            <Checkbox
              className="mt-0.5"
              hiddenLabel={`Select ${application.name}`}
              checked={selected}
              disabled={!selectable}
              onChange={onToggle}
            />
          )}
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
              {application.name}
              <Badge tone={STATUS_TONE[application.status]} size="sm" dot>
                {STATUS_LABEL[application.status]}
              </Badge>
              {summary.flagCount > 0 && (
                <Badge tone="warning" size="sm">
                  <Flag aria-hidden="true" className="size-3" />
                  Needs a look
                </Badge>
              )}
              {summary.duplicate && (
                <Badge tone="neutral" size="sm">
                  <Link2 aria-hidden="true" className="size-3" />
                  Possible duplicate
                </Badge>
              )}
              <ScreeningBadges summary={application.fit} />
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted">
              <span>{application.postingTitle}</span>
              <TextLink
                href={`mailto:${application.email}`}
                /* An address has no space to break at: without `anywhere` a
                   long one is the widest thing on a 320px screen. */
                className="inline-flex max-w-full min-w-0 items-center gap-1 font-normal [overflow-wrap:anywhere]"
              >
                <Mail aria-hidden="true" className="size-3.5" />
                {application.email}
              </TextLink>
              {application.phone && (
                <TextLink
                  href={`tel:${application.phone}`}
                  className="tabular inline-flex max-w-full min-w-0 items-center gap-1 font-normal [overflow-wrap:anywhere]"
                >
                  <Phone aria-hidden="true" className="size-3.5" />
                  {application.phone}
                </TextLink>
              )}
              <span className="tabular">
                Applied {application.appliedAt.slice(0, 10)}
              </span>
              {application.source && (
                <span>Heard: {sourceLabel(application.source)}</span>
              )}
              {summary.reference && (
                <span className="tabular">Ref {summary.reference}</span>
              )}
            </p>
            {summary.duplicate && (
              <p className="mt-1 text-body-sm text-muted">
                Gave {DUPLICATE_REASON[summary.duplicate.reason]} as an earlier
                application.{" "}
                <TextLink
                  href={`/hiring/candidates/${summary.duplicate.ofId}`}
                  className="text-body-sm"
                >
                  See the earlier one
                </TextLink>
              </p>
            )}
          </div>
        </div>

        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5">
          {/* Only where there is a file to open: connected, and the applicant
              attached one. The demo's CVs have a filename and nothing behind it. */}
          {editable && application.cv?.scanStatus === "INFECTED" && (
            <Badge tone="danger" size="sm">
              CV flagged by the virus check
            </Badge>
          )}
          {editable &&
            application.cv !== null &&
            application.cv.scanStatus !== "INFECTED" && (
              <OpenCv open={() => careersApi.openCv(application.id)} />
            )}
          {application.status === "ADVANCED" && application.candidateId && (
            <TextLink
              href={`/hiring/candidates/${application.candidateId}`}
              className="inline-flex items-center gap-1 text-body-sm"
            >
              See them in the pipeline
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </TextLink>
          )}
          {application.status === "DECLINED" && (
            <Button variant="ghost" size="sm" onClick={onCopyMessage}>
              <Copy aria-hidden="true" className="size-3.5" />
              Copy message
            </Button>
          )}
          {canScreen && waiting && (
            <>
              <Button variant="secondary" size="sm" onClick={onDecline}>
                Decline
              </Button>
              <Button variant="accent" size="sm" onClick={onAdvance}>
                Advance
              </Button>
            </>
          )}
        </div>
      </div>

      {application.coverNote && (
        <p className="whitespace-pre-line rounded-md bg-canvas p-3 text-body-sm leading-relaxed text-body">
          <LinkedText>{application.coverNote}</LinkedText>
        </p>
      )}

      <RowAnswers
        applicationId={application.id}
        connected={editable}
        canOpenFiles={canOpenFiles}
      />

      {application.fit && (
        <ExplanationDisclosure
          subject={{ kind: "application", id: application.id }}
          criteriaHref={`/hiring/postings/${application.postingId}?tab=screening`}
        />
      )}

      {waiting && noApprovedRole && (
        <p className="text-body-sm text-warning-text">
          {application.postingTitle} has no approved role behind it. Advancing
          will ask you for one.
        </p>
      )}

      {waiting && closedNote && (
        <p className="text-body-sm text-danger-text">
          {posting?.requisitionReference}: {closedNote}. Advancing will be
          refused — edit the advert to link a different open role first.
        </p>
      )}

      {application.status === "DECLINED" && application.declineReason && (
        <p className="text-body-sm text-muted">
          Reason kept on file: {application.declineReason}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Screening somebody in.
 *
 * One press is enough — everything in here is optional. The dialog exists for
 * two reasons: to name where they are going before they go, and to catch the one
 * case that would otherwise fail, an advert with no approved role behind it.
 */
function AdvanceDialog({
  open,
  application,
  posting,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** Null while closed — the caller stays mounted rather than gating on this. */
  application: ApiApplication | null;
  posting: ApiPosting | undefined;
  onClose: () => void;
  onConfirm: (body: AdvanceBody) => Promise<void>;
}) {
  const [requisitionId, setRequisitionId] = useState("");
  const [noticeDays, setNoticeDays] = useState("");
  const [expected, setExpected] = useState("");
  const [busy, setBusy] = useState(false);

  const requisitions = useRequisitions({ pageSize: 100 });
  const requisitionOptions = useMemo(
    () =>
      requisitions.requisitions.map((r) => {
        const closed = requisitionClosedNote(r.status);
        return {
          value: r.id,
          label: `${r.reference} · ${r.jobTitle}`,
          hint: closed ?? undefined,
          disabled: closed !== null,
        };
      }),
    [requisitions.requisitions],
  );

  /**
   * Only ask when we know there is nothing to land on.
   *
   * `posting` is undefined when the advert fell outside the page of adverts that
   * was loaded — rare, and not the same fact as "it has no approved role". In
   * that case the request goes as it stands and the API's own refusal names the
   * blocker, which beats demanding an id the advert may already have.
   */
  const needsRole = posting !== undefined && posting.requisitionId === null;
  const closedNote =
    posting !== undefined
      ? requisitionClosedNote(posting.requisitionStatus)
      : null;
  const ready =
    closedNote === null && (!needsRole || requisitionId.trim().length > 0);

  const number = (value: string): number | null => {
    const cleaned = value.replace(/[^0-9.]/g, "");
    if (cleaned === "") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

  async function confirm() {
    setBusy(true);
    const notice = number(noticeDays);
    const expectedNaira = number(expected);
    try {
      await onConfirm({
        ...(needsRole ? { requisitionId: requisitionId.trim() } : {}),
        ...(notice === null ? {} : { noticeDays: Math.round(notice) }),
        ...(expectedNaira === null
          ? {}
          : { expectedSalaryKobo: kobo(expectedNaira) }),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        application
          ? `Move ${application.name} into the pipeline`
          : "Move into the pipeline"
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={!ready}
            onClick={() => void confirm()}
          >
            Advance
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <DescriptionList
          items={[
            { term: "Applied for", value: application?.postingTitle ?? "—" },
            {
              term: "Approved role",
              value: posting?.requisitionReference ?? "None on this advert",
            },
          ]}
        />

        {closedNote ? (
          <Callout tone="danger" title="This role cannot take anybody new">
            {posting?.requisitionReference}: {closedNote}. Close this dialog and
            edit the advert from the Job adverts list to link a different, open
            role before advancing anybody through it.
          </Callout>
        ) : needsRole ? (
          <Field
            label="Approved role"
            required
            help={
              requisitions.error
                ? `${requisitions.error.message} Roles are unavailable.`
                : "They have to land on an approved role."
            }
          >
            <Picker
              value={requisitionId}
              onChange={setRequisitionId}
              placeholder="Choose a role"
              loading={requisitions.loading}
              options={requisitionOptions}
            />
          </Field>
        ) : (
          <p className="text-body-sm text-body">
            They go into the first stage of {posting?.requisitionReference}.
            Their record is created from this application.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field optional label="Notice period (days)">
            <Input
              inputMode="numeric"
              value={noticeDays}
              placeholder="30"
              onChange={(event) => setNoticeDays(event.target.value)}
            />
          </Field>
          <Field optional label="Salary they want (₦ a month)">
            <Input
              inputMode="decimal"
              value={expected}
              placeholder="750000"
              onChange={(event) => setExpected(event.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */

/**
 * The note to send yourself.
 *
 * Written here rather than sent by the API, because there is no mail transport —
 * the same position `store/documents.ts` takes on chasing a document. Short,
 * plain, and it does not promise a future vacancy nobody has agreed to.
 */
function declineMessage(application: ApiApplication): string {
  return (
    `Hello ${application.firstName},\n\n` +
    `Thank you for applying for ${application.postingTitle}. ` +
    `We will not be taking your application further this time.\n\n` +
    `We appreciate the time you spent on it, and we wish you well.\n`
  );
}

async function copyText(
  text: string,
  onDone: () => void,
  onFail: (error: unknown) => void,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    onDone();
  } catch (error) {
    onFail(error);
  }
}
