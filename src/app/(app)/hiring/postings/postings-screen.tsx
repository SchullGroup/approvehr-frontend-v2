"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  ExternalLink,
  Lock,
  Megaphone,
  Plus,
  Search,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Input,
  SegmentedControl,
  Skeleton,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  formatMoney,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  EMPLOYMENT_TYPE_LABEL,
  careersPath,
  careersUrl,
  naira,
  type ApiPosting,
  type ApiPostingTally,
  type CreatePostingBody,
  type PostingStatus,
  type UpdatePostingBody,
} from "@/lib/api/careers";
import { usePermissions } from "@/lib/permissions";
import { useCareersAnalytics, usePostings } from "@/lib/store/careers";
import { PostingEditor } from "./posting-editor";

/**
 * Job adverts.
 *
 * The list, the editor, and the link to hand somebody. Applications live one
 * route across at `/hiring/postings/applications`, because a queue is worked
 * top-down by whoever is screening and an advert is written once by whoever is
 * hiring — different jobs, different days.
 *
 * ## What the row says, and why
 *
 * Three facts decide what to do next with an advert and all three are on the
 * row: whether it is live, how many people are waiting to be screened, and
 * whether there is an approved role behind it. The last one is the quiet one —
 * an advert with no approved role collects applications perfectly well and then
 * cannot pass anybody into the pipeline, so it is flagged on the row rather than
 * discovered at the moment somebody presses Advance.
 */
export function PostingsScreen() {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader
          title="Job adverts"
          breadcrumb={[{ href: "/hiring", label: "Hiring" }]}
        />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading your adverts</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader
          title="Job adverts"
          breadcrumb={[{ href: "/hiring", label: "Hiring" }]}
        />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot see the adverts"
              description="Applications hold a stranger's phone number and salary expectation, so they are kept to whoever hires. Ask whoever manages access to add hiring to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Adverts />;
}

/* -------------------------------------------------------------------------- */

const STATUS_FILTERS: { value: PostingStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PUBLISHED", label: "Live" },
  { value: "DRAFT", label: "Drafts" },
  { value: "CLOSED", label: "Closed" },
];

const STATUS_LABEL: Record<PostingStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Live",
  CLOSED: "Closed",
};

const STATUS_TONE: Record<PostingStatus, "neutral" | "success" | "warning"> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  CLOSED: "warning",
};

/**
 * A pay range, written out in full.
 *
 * Two decimals and thousands separators, never abbreviated: somebody reconciles
 * a band against an offer letter, and ₦4.2m is not a figure you can do that
 * with. Returns null when neither end is set, which is normal here — plenty of
 * Nigerian adverts do not quote pay.
 */
function salaryBand(minKobo: number | null, maxKobo: number | null): string | null {
  const min = minKobo === null ? null : formatMoney(naira(minKobo), "NGN", { decimals: true });
  const max = maxKobo === null ? null : formatMoney(naira(maxKobo), "NGN", { decimals: true });
  if (min && max) return min === max ? min : `${min} – ${max}`;
  if (min) return `${min} and up`;
  if (max) return `Up to ${max}`;
  return null;
}

function Adverts() {
  const [status, setStatus] = useState<PostingStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ApiPosting | null>(null);
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<ApiPosting | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const postings = usePostings(status === "ALL" ? {} : { status });
  const analytics = useCareersAnalytics();
  const toast = useToast();

  /** Per-advert waiting counts, so the row can carry the badge with no second call. */
  const tallies = useMemo(() => {
    const byId = new Map<string, ApiPostingTally>();
    for (const entry of analytics.analytics?.perPosting ?? [])
      byId.set(entry.postingId, entry);
    return byId;
  }, [analytics.analytics]);

  /* Filtered here rather than on the server: the whole list is already loaded,
     and a request per keystroke would be slower than the filter. */
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return postings.postings;
    return postings.postings.filter(
      (posting) =>
        posting.title.toLowerCase().includes(needle) ||
        posting.summary.toLowerCase().includes(needle) ||
        (posting.location ?? "").toLowerCase().includes(needle),
    );
  }, [postings.postings, search]);

  /** Every write reports its own failure — the API's message is the useful part. */
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.push({ title: success, tone: "success" });
      return true;
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
      return false;
    }
  };

  async function copyLink(posting: ApiPosting) {
    const url = careersUrl(posting.publicPath);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(posting.id);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      toast.push({
        title: "Could not copy it",
        tone: "warning",
        detail: url,
      });
    }
  }

  const totals = analytics.analytics?.totals;

  return (
    <>
      <PageHeader
        title="Job adverts"
        description="What is on your careers page, and the link to share."
        breadcrumb={[{ href: "/hiring", label: "Hiring" }]}
        action={
          <>
            <ButtonLink href="/hiring/postings/applications" variant="secondary" size="sm">
              Applications
              {totals && totals.waiting > 0 ? ` (${totals.waiting})` : ""}
            </ButtonLink>
            {postings.editable && (
              <Button variant="accent" size="sm" onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" className="size-4" />
                New advert
              </Button>
            )}
          </>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {DEMO_ENABLED && !postings.editable && (
          <Callout tone="warning" title="Read-only in demo mode">
            These adverts come from the seeded roles. Writing one needs the API,
            because publishing puts a statement out in the company&rsquo;s name.
          </Callout>
        )}

        {postings.error && (
          <LoadFailure subject="your adverts" error={postings.error} />
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Live adverts"
            value={totals ? String(totals.live) : "—"}
            hint={totals ? `${totals.postings} written in total` : undefined}
          />
          <Stat
            label="Applications"
            value={totals ? String(totals.applications) : "—"}
          />
          <Stat
            label="Waiting to screen"
            value={totals ? String(totals.waiting) : "—"}
            trend={
              totals && totals.waiting > 0
                ? { direction: "down", label: "Nobody has looked" }
                : undefined
            }
          />
          <Stat
            label="Screened in"
            value={
              totals
                ? totals.advanceRate === null
                  ? "—"
                  : `${totals.advanceRate}%`
                : "—"
            }
            hint={
              totals && totals.advanceRate === null
                ? "Nobody screened yet"
                : "of everyone screened"
            }
          />
        </div>

        <Card>
          <CardHeader
            title="Your adverts"
            description="A draft is private. Publishing puts it on your careers page."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  label="Filter adverts by status"
                  options={STATUS_FILTERS}
                  value={status}
                  onChange={setStatus}
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find an advert"
                  aria-label="Find an advert"
                  icon={<Search aria-hidden="true" />}
                  className="w-48"
                />
              </div>
            }
          />

          {postings.loading ? (
            <CardBody>
              <Skeleton className="h-32 w-full" />
              <span className="sr-only-focusable">Loading your adverts</span>
            </CardBody>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Megaphone aria-hidden="true" />}
              title={
                postings.postings.length === 0
                  ? "No adverts yet"
                  : "Nothing matches that"
              }
              description={
                postings.postings.length === 0
                  ? "Write one, publish it, and applications arrive here instead of in your inbox."
                  : undefined
              }
              action={
                postings.editable && postings.postings.length === 0 ? (
                  <Button variant="accent" onClick={() => setCreating(true)}>
                    <Plus aria-hidden="true" className="size-4" />
                    New advert
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableWrap caption="Every job advert, newest first">
              <THead>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH align="right">Applications</TH>
                <TH>Pay</TH>
                <TH>Closes</TH>
                <TH>
                  <span className="sr-only-focusable">Actions</span>
                </TH>
              </THead>
              <TBody>
                {rows.map((posting) => (
                  <AdvertRow
                    key={posting.id}
                    posting={posting}
                    waiting={tallies.get(posting.id)?.waiting ?? 0}
                    editable={postings.editable}
                    copied={copied === posting.id}
                    onCopy={() => void copyLink(posting)}
                    onEdit={() => setEditing(posting)}
                    onPublish={() =>
                      void run(
                        () => postings.publish(posting.id),
                        `${posting.title} is live`,
                      )
                    }
                    onClose={() => setClosing(posting)}
                  />
                ))}
              </TBody>
            </TableWrap>
          )}

          {postings.total > postings.postings.length && (
            <CardBody className="border-t border-line">
              <p className="text-body-sm text-muted">
                Showing the newest {postings.postings.length} of {postings.total}.
              </p>
            </CardBody>
          )}
        </Card>

        <SourceTable
          rows={analytics.analytics?.perSource ?? []}
          loading={analytics.loading}
        />
      </PageBody>

      {(creating || editing) && (
        <PostingEditor
          {...(editing ? { posting: editing } : {})}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onCreate={(body: CreatePostingBody) =>
            run(() => postings.create(body), "Draft saved")
          }
          onUpdate={(id: string, body: UpdatePostingBody) =>
            run(() => postings.update(id, body), "Advert saved")
          }
        />
      )}

      <ConfirmDialog
        open={closing !== null}
        onClose={() => setClosing(null)}
        title={`Take ${closing?.title ?? ""} down?`}
        confirmLabel="Close advert"
        tone="danger"
        onConfirm={() => {
          if (!closing) return;
          const advert = closing;
          void (async () => {
            try {
              const waiting = await postings.close(advert.id);
              setClosing(null);
              toast.push({
                title: `${advert.title} is off your careers page`,
                tone: "success",
                detail:
                  waiting > 0
                    ? `${waiting} ${waiting === 1 ? "person is" : "people are"} still waiting to be screened.`
                    : undefined,
              });
            } catch (error) {
              toast.push({
                title: "That did not work",
                tone: "danger",
                detail:
                  error instanceof ApiError
                    ? error.message
                    : "Something went wrong. Try again.",
              });
            }
          })();
        }}
        body="Nobody new can apply. Everyone who already did stays in the queue."
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function AdvertRow({
  posting,
  waiting,
  editable,
  copied,
  onCopy,
  onEdit,
  onPublish,
  onClose,
}: {
  posting: ApiPosting;
  waiting: number;
  editable: boolean;
  copied: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onClose: () => void;
}) {
  const isLive = posting.status === "PUBLISHED";
  /* Never abbreviated. Somebody reconciles a salary band against an offer
     letter, and ₦4.2m is not a figure you can do that with. */
  const band = salaryBand(posting.salaryMinKobo, posting.salaryMaxKobo);

  return (
    <TR>
      <TDPrimary
        title={
          <span className="flex flex-wrap items-center gap-2">
            {posting.title}
            {posting.requisitionReference ? (
              <span className="tabular text-meta font-normal text-muted">
                {posting.requisitionReference}
              </span>
            ) : (
              <Badge tone="warning" size="sm">
                No approved role
              </Badge>
            )}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{EMPLOYMENT_TYPE_LABEL[posting.employmentType]}</span>
            {posting.location && <span>· {posting.location}</span>}
            {isLive && (
              <Link
                href={careersPath(posting.publicPath)}
                className="tabular inline-flex items-center gap-1 text-accent-text hover:underline underline-offset-4"
              >
                {careersPath(posting.publicPath)}
                <ExternalLink aria-hidden="true" className="size-3" />
              </Link>
            )}
          </span>
        }
      />

      <TD>
        <Badge tone={STATUS_TONE[posting.status]} size="sm" dot>
          {STATUS_LABEL[posting.status]}
        </Badge>
      </TD>

      <TD align="right">
        <span className="tabular text-body-sm text-ink">{posting.applicationCount}</span>
        {waiting > 0 && (
          <Link
            href={`/hiring/postings/applications?posting=${posting.id}`}
            className="mt-0.5 block text-meta text-accent-text hover:underline underline-offset-4"
          >
            {waiting} waiting
          </Link>
        )}
      </TD>

      <TD>
        {band === null ? (
          <span className="text-body-sm text-faint">Not stated</span>
        ) : (
          <span className="flex flex-col">
            <span className="tabular text-body-sm text-ink">{band}</span>
            {!posting.showSalary && (
              <span className="text-meta text-muted">Hidden on the advert</span>
            )}
          </span>
        )}
      </TD>

      <TD>
        {posting.closesOn ? (
          <span className="tabular text-body-sm text-body">
            {posting.closesOn}
            {!posting.acceptingApplications && posting.status === "PUBLISHED" && (
              <span className="mt-0.5 block text-meta text-warning-text">
                Date has passed
              </span>
            )}
          </span>
        ) : (
          <span className="text-body-sm text-faint">Open</span>
        )}
      </TD>

      <TD align="right">
        <div className="flex justify-end gap-1.5">
          {isLive && (
            <Button variant="ghost" size="sm" onClick={onCopy}>
              {copied ? (
                <Check aria-hidden="true" className="size-3.5" />
              ) : (
                <Copy aria-hidden="true" className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy link"}
            </Button>
          )}
          {editable && (
            <>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                Edit
              </Button>
              {posting.status === "DRAFT" && (
                <Button variant="accent" size="sm" onClick={onPublish}>
                  Publish
                </Button>
              )}
              {posting.status === "CLOSED" && (
                <Button variant="secondary" size="sm" onClick={onPublish}>
                  Publish again
                </Button>
              )}
              {isLive && (
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Close
                </Button>
              )}
            </>
          )}
        </div>
      </TD>
    </TR>
  );
}

/* -------------------------------------------------------------------------- */

/** Where applications come from. The only data that says which channel works. */
function SourceTable({
  rows,
  loading,
}: {
  rows: { source: string; applications: number; share: number }[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader title="Where applications come from" />
        <CardBody>
          <Skeleton className="h-20 w-full" />
        </CardBody>
      </Card>
    );
  }

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Where applications come from"
        description="Answered by whoever applied. Most people leave it blank."
      />
      <TableWrap className="rounded-none border-0">
        <THead>
          <TH>Heard about it from</TH>
          <TH align="right">Applications</TH>
          <TH align="right">Share</TH>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.source}>
              <TDPrimary title={row.source} />
              <TD align="right">
                <span className="tabular">{row.applications}</span>
              </TD>
              <TD align="right">
                <span className="tabular">{row.share}%</span>
              </TD>
            </TR>
          ))}
        </TBody>
      </TableWrap>
    </Card>
  );
}
