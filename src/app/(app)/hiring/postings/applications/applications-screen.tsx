"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Copy,
  Inbox,
  Lock,
  Mail,
  Paperclip,
  Phone,
  Search,
} from "lucide-react";
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
  Input,
  Modal,
  SegmentedControl,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  kobo,
  type AdvanceBody,
  type ApiApplication,
  type ApiPosting,
  type ApplicationStatus,
} from "@/lib/api/careers";
import { usePermissions } from "@/lib/permissions";
import {
  useApplications,
  usePostingIndex,
  usePostings,
} from "@/lib/store/careers";

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
 * ## Two things this screen cannot do, and says so
 *
 * - **A CV cannot be opened.** The form records where a file was meant to go and
 *   there is no upload pipeline behind it. What arrives instead is the applicant's
 *   own note, which is shown in full.
 * - **Declining sends nothing.** There is no mail transport. So the dialog says
 *   that before you press it, and the row afterwards hands you a message to send
 *   yourself.
 */
export function ApplicationsScreen({
  initialPostingId = "",
}: {
  initialPostingId?: string;
}) {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader
          title="Applications"
          breadcrumb={[
            { href: "/hiring", label: "Pipeline" },
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
          breadcrumb={[{ href: "/hiring", label: "Pipeline" }]}
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

  return <Queue initialPostingId={initialPostingId} />;
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

function Queue({ initialPostingId }: { initialPostingId: string }) {
  const [status, setStatus] = useState<ApplicationStatus | "ALL">("RECEIVED");
  const [postingId, setPostingId] = useState(initialPostingId);
  const [search, setSearch] = useState("");
  const [advancing, setAdvancing] = useState<ApiApplication | null>(null);
  const [declining, setDeclining] = useState<ApiApplication | null>(null);

  const postings = usePostings();
  const index = usePostingIndex(postings.postings);
  const applications = useApplications({
    ...(status === "ALL" ? {} : { status }),
    ...(postingId ? { postingId } : {}),
  });
  const toast = useToast();

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return applications.applications;
    return applications.applications.filter(
      (application) =>
        application.name.toLowerCase().includes(needle) ||
        application.email.toLowerCase().includes(needle),
    );
  }, [applications.applications, search]);

  /** One line, from the API, whenever a CV reference cannot be opened. */
  const cvNote =
    applications.applications.find((a) => a.cv?.note)?.cv?.note ?? null;

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
          { href: "/hiring", label: "Pipeline" },
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

        {applications.error && (
          <LoadFailure subject="the queue" error={applications.error}  onRetry={applications.reload}/>
        )}

        {cvNote && (
          <p className="text-body-sm text-muted">
            Attached CVs cannot be opened: file upload is not connected. The
            applicant&rsquo;s own note is below each row instead.
          </p>
        )}

        <Card>
          <CardHeader
            title={`${applications.total} ${applications.total === 1 ? "application" : "applications"}`}
            description="Newest first, which is the order to work it in."
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <SegmentedControl
                  label="Filter applications by status"
                  options={STATUS_FILTERS}
                  value={status}
                  onChange={setStatus}
                />
                <Select
                  value={postingId}
                  aria-label="Filter by advert"
                  className="w-48"
                  onChange={(event) => setPostingId(event.target.value)}
                >
                  <option value="">Every advert</option>
                  {postings.postings.map((posting) => (
                    <option key={posting.id} value={posting.id}>
                      {posting.title}
                    </option>
                  ))}
                </Select>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find a name"
                  aria-label="Find a name"
                  icon={<Search aria-hidden="true" />}
                  className="w-40"
                />
              </div>
            }
          />

          {applications.loading ? (
            <CardBody>
              <Skeleton className="h-32 w-full" />
              <span className="sr-only-focusable">Loading the queue</span>
            </CardBody>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Inbox aria-hidden="true" />}
              title={
                status === "RECEIVED" ? "Nobody is waiting" : "Nothing to show"
              }
              description={
                status === "RECEIVED"
                  ? "New applications land here the moment somebody sends the form."
                  : undefined
              }
            />
          ) : (
            <CardBody className="flex flex-col gap-3">
              {rows.map((application) => (
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
            </CardBody>
          )}
        </Card>
      </PageBody>

      {advancing && (
        <AdvanceDialog
          application={advancing}
          posting={index.get(advancing.postingId)}
          onClose={() => setAdvancing(null)}
          onConfirm={async (body) => {
            try {
              const result = await applications.advance(advancing.id, body);
              toast.push({
                title: `${advancing.name} is in the pipeline`,
                tone: "success",
                detail: result.note,
              });
              setAdvancing(null);
            } catch (error) {
              fail(error);
            }
          }}
        />
      )}

      {declining && (
        <DeclineDialog
          application={declining}
          onClose={() => setDeclining(null)}
          onConfirm={async (reason) => {
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
      )}
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
  const noApprovedRole = posting !== undefined && posting.requisitionId === null;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
            {application.name}
            <Badge tone={STATUS_TONE[application.status]} size="sm" dot>
              {STATUS_LABEL[application.status]}
            </Badge>
            {/* A CV reference with nothing behind it says so. If a store is ever
                wired the same field carries a real URL and this becomes a link,
                which is the whole point of `cvAccess` returning both. */}
            {application.cv && application.cv.url === null && (
              <Badge tone="neutral" size="sm" icon={<Paperclip aria-hidden="true" />}>
                CV cannot be opened
              </Badge>
            )}
            {application.cv?.url && (
              <a
                href={application.cv.url}
                className="inline-flex items-center gap-1 text-body-sm font-medium text-accent-text hover:underline underline-offset-4"
              >
                <Paperclip aria-hidden="true" className="size-3.5" />
                Open CV
              </a>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted">
            <span>{application.postingTitle}</span>
            <a
              href={`mailto:${application.email}`}
              className="inline-flex items-center gap-1 hover:text-accent-text hover:underline underline-offset-4"
            >
              <Mail aria-hidden="true" className="size-3.5" />
              {application.email}
            </a>
            {application.phone && (
              <a
                href={`tel:${application.phone}`}
                className="tabular inline-flex items-center gap-1 hover:text-accent-text hover:underline underline-offset-4"
              >
                <Phone aria-hidden="true" className="size-3.5" />
                {application.phone}
              </a>
            )}
            <span className="tabular">
              Applied {application.appliedAt.slice(0, 10)}
            </span>
            {application.source && <span>Heard: {application.source}</span>}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {application.status === "ADVANCED" && application.candidateId && (
            <Link
              href={`/hiring/candidates/${application.candidateId}`}
              className="inline-flex items-center gap-1 text-body-sm font-medium text-accent-text hover:underline underline-offset-4"
            >
              See them in the pipeline
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
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
          {application.coverNote}
        </p>
      )}

      {waiting && noApprovedRole && (
        <p className="text-body-sm text-warning-text">
          {application.postingTitle} has no approved role behind it. Advancing
          will ask you for one.
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
  application,
  posting,
  onClose,
  onConfirm,
}: {
  application: ApiApplication;
  posting: ApiPosting | undefined;
  onClose: () => void;
  onConfirm: (body: AdvanceBody) => Promise<void>;
}) {
  const [requisitionId, setRequisitionId] = useState("");
  const [noticeDays, setNoticeDays] = useState("");
  const [expected, setExpected] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * Only ask when we know there is nothing to land on.
   *
   * `posting` is undefined when the advert fell outside the page of adverts that
   * was loaded — rare, and not the same fact as "it has no approved role". In
   * that case the request goes as it stands and the API's own refusal names the
   * blocker, which beats demanding an id the advert may already have.
   */
  const needsRole = posting !== undefined && posting.requisitionId === null;
  const ready = !needsRole || requisitionId.trim().length > 0;

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
      open
      onClose={onClose}
      size="md"
      title={`Move ${application.name} into the pipeline`}
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
            { term: "Applied for", value: application.postingTitle },
            {
              term: "Approved role",
              value: posting?.requisitionReference ?? "None on this advert",
            },
          ]}
        />

        {needsRole ? (
          <Field
            label="Approved role ID"
            required
            help="They have to land on an approved role. There is no picker for this yet. Paste the ID."
          >
            <Input
              autoFocus
              value={requisitionId}
              onChange={(event) => setRequisitionId(event.target.value)}
            />
          </Field>
        ) : (
          <p className="text-body-sm text-body">
            They go into the first stage of {posting?.requisitionReference}. Their
            record is created from this application.
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
  application,
  onClose,
  onConfirm,
}: {
  application: ApiApplication;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`Turn down ${application.name}?`}
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
          Nothing is sent to them: email is not connected. Afterwards,
          <span className="font-medium text-ink"> Copy message</span> gives you a
          short note to send from your own inbox.
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
