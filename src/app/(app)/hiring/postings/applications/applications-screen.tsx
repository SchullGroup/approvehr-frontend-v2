"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Copy, Inbox, Lock, Mail, Phone } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
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
  Textarea,
  TextLink,
  useToast,
  type AppliedFilter,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { LoadMore } from "@/components/portal/load-more";
import { OpenCv } from "@/components/hiring/open-cv";
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
import { usePermissions } from "@/lib/permissions";
import { useRequisitions } from "@/lib/store/recruitment";
import {
  useApplications,
  useCareersAnalytics,
  usePostingIndex,
  usePostings,
} from "@/lib/store/careers";
import { useDebounced } from "@/lib/use-debounced";

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
  const [postingId, setPostingId] = useState(initialPostingId);
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [advancing, setAdvancing] = useState<ApiApplication | null>(null);
  const [declining, setDeclining] = useState<ApiApplication | null>(null);

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
  });
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
      ? [{ label: "Heard via", value: source, onClear: () => setSource("") }]
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
  ];
  const narrowed = applied.length > 0 || search.trim() !== "";
  const clearAll = () => {
    setPostingId("");
    setSource("");
    setFrom("");
    setTo("");
    setSearch("");
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
        {DEMO_ENABLED && !applications.editable && (
          <Callout tone="warning" title="Read-only in demo mode">
            Screening somebody in creates a candidate in the hiring pipeline, so
            it needs the API. These applications come from the seed data.
          </Callout>
        )}

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
                      {name}
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
            </FilterBar>

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
              <>
                <div
                  aria-busy={stale}
                  className={
                    stale
                      ? "flex flex-col gap-3 opacity-60 transition-opacity"
                      : "flex flex-col gap-3 transition-opacity"
                  }
                >
                  {applications.applications.map((application) => (
                    <ApplicationRow
                      key={application.id}
                      application={application}
                      posting={index.get(application.postingId)}
                      editable={applications.editable}
                      onAdvance={() => setAdvancing(application)}
                      onDecline={() => setDeclining(application)}
                      onCopyMessage={() => {
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
                  ))}
                </div>
                <LoadMore
                  shown={applications.applications.length}
                  total={applications.total}
                  noun={["application", "applications"]}
                  hasMore={applications.hasMore}
                  loading={applications.loadingMore}
                  error={applications.moreError}
                  onLoadMore={applications.loadMore}
                />
              </>
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

      <DeclineDialog
        open={declining !== null}
        application={declining}
        onClose={() => setDeclining(null)}
        onConfirm={async (reason) => {
          if (!declining) return;
          try {
            await applications.decline(
              declining.id,
              reason.trim() === "" ? undefined : reason.trim(),
            );
            toast.push({
              title: `${declining.name} turned down`,
              tone: "success",
              detail: "Nothing was sent to them. Use Copy message to write.",
            });
            setDeclining(null);
          } catch (error) {
            fail(error);
          }
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
  onAdvance,
  onDecline,
  onCopyMessage,
}: {
  application: ApiApplication;
  /** Absent only if the advert is outside the page of adverts that was loaded. */
  posting: ApiPosting | undefined;
  editable: boolean;
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

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
            {application.name}
            <Badge tone={STATUS_TONE[application.status]} size="sm" dot>
              {STATUS_LABEL[application.status]}
            </Badge>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted">
            <span>{application.postingTitle}</span>
            <TextLink
              href={`mailto:${application.email}`}
              className="inline-flex items-center gap-1 font-normal"
            >
              <Mail aria-hidden="true" className="size-3.5" />
              {application.email}
            </TextLink>
            {application.phone && (
              <TextLink
                href={`tel:${application.phone}`}
                className="tabular inline-flex items-center gap-1 font-normal"
              >
                <Phone aria-hidden="true" className="size-3.5" />
                {application.phone}
              </TextLink>
            )}
            <span className="tabular">
              Applied {application.appliedAt.slice(0, 10)}
            </span>
            {application.source && <span>Heard: {application.source}</span>}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
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
          {editable && waiting && (
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

function DeclineDialog({
  open,
  application,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** Null while closed — the caller stays mounted rather than gating on this. */
  application: ApiApplication | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        application
          ? `Turn down ${application.name}?`
          : "Turn down application?"
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => {
              setBusy(true);
              void onConfirm(reason).finally(() => setBusy(false));
            }}
          >
            Turn them down
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-body">
          Nothing is sent to them: ApproveHR does not email applicants yet.
          Afterwards,
          <span className="font-medium text-ink"> Copy message</span> gives you
          a short note to send from your own inbox.
        </p>
        <Field
          label="Why, for your own records"
          help="Only your team sees this. It is what stops the same CV being screened twice."
        >
          <Textarea
            rows={3}
            value={reason}
            placeholder="Wants twice the band."
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

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
