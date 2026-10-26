"use client";

import { useCallback, useState } from "react";
import { Lock, Star } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  FilterBar,
  Select,
  Skeleton,
  Tag,
  TextLink,
  useToast,
  type AppliedFilter,
  LoadState,
} from "@/components/ui";
import { LoadMore } from "@/components/portal/load-more";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import { channelLabel } from "@/lib/hiring/pipeline/filters";
import type { TalentEntry } from "@/lib/hiring/pipeline/model";
import {
  usePipelineGateway,
  useTags,
} from "@/lib/hiring/pipeline/use-pipeline";
import { usePermissions } from "@/lib/permissions";
import { usePagedList } from "@/lib/store/paged-list";
import { useDebounced } from "@/lib/use-debounced";

/**
 * People kept on file for another role, across every job.
 *
 * ## Why it is its own page
 *
 * A board is one role. The point of keeping somebody is that the right role comes
 * along later, and the person who opens the next requisition needs to ask "who have
 * we already met" without remembering which job they applied for. So this lists
 * people, not applications, and for each one every role they have been in.
 *
 * ## It is a list of decisions about people's data
 *
 * Somebody is here because a person decided to keep them. The page says so, and
 * taking somebody out is one press with a sentence that says what it does and does
 * not do: their applications are not changed.
 */

const CHANNELS = [
  "careers-page",
  "linkedin",
  "referral",
  "agency",
  "sourced",
  "x",
  "whatsapp",
  "facebook",
  "email",
] as const;

const OUTCOME_LABEL: Record<string, string> = {
  IN_PROGRESS: "in progress",
  OFFER_MADE: "offer made",
  HIRED: "hired",
  REJECTED: "rejected",
  WITHDRAWN: "withdrew",
};

const CRUMBS = [{ href: "/hiring", label: "Hiring" }];

export function TalentPoolScreen() {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader title="Talent pool" breadcrumb={CRUMBS} />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading the talent pool</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader title="Talent pool" breadcrumb={CRUMBS} />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot see the talent pool"
              description="It holds people's contact details and notes from applications they made, so it is kept to whoever hires. Ask whoever manages access to add hiring to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Pool />;
}

function Pool() {
  const gateway = usePipelineGateway();
  const tags = useTags();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim(), 300);
  const [tagId, setTagId] = useState("");
  const [source, setSource] = useState("");
  const [leaving, setLeaving] = useState<TalentEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const key = JSON.stringify([gateway.mode, query, tagId, source]);
  const fetchPage = useCallback(
    async (cursor: string | null, signal: AbortSignal) => {
      const page = await gateway.talentPool.list(
        {
          ...(query ? { q: query } : {}),
          ...(tagId ? { tagId } : {}),
          ...(source ? { source } : {}),
          cursor,
          pageSize: 25,
        },
        signal,
      );
      return { rows: page.entries, total: page.total, next: page.next };
    },
    // The key is the identity of the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, gateway],
  );
  const list = usePagedList<TalentEntry>({
    key,
    fetchPage,
    idOf: (entry) => entry.candidateId,
  });

  const stale = list.settling || search.trim() !== query;
  const chips: AppliedFilter[] = [
    ...(tagId
      ? [
          {
            label: "Tag",
            value: tags.items.find((t) => t.id === tagId)?.name ?? "Selected",
            onClear: () => setTagId(""),
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
  ];
  const narrowed = chips.length > 0 || search.trim() !== "";

  async function leave(entry: TalentEntry) {
    setBusy(true);
    try {
      await gateway.talentPool.remove(entry.candidateId);
      list.remove(entry.candidateId);
      setLeaving(null);
      toast.push({
        title: `${entry.name} is out of the talent pool`,
        tone: "success",
        detail: "Their applications are not changed.",
      });
    } catch (error) {
      toast.push({
        title: `${entry.name} was not taken out`,
        tone: "danger",
        detail: sentenceOf(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Talent pool"
        breadcrumb={CRUMBS}
        description="People the company decided to keep on file for another role, across every job."
      />
      <PageBody className="flex flex-col gap-5">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Find a name or email"
          searchLabel="Find somebody in the talent pool"
          applied={chips}
          onClearAll={() => {
            setSearch("");
            setTagId("");
            setSource("");
          }}
          count={list.total ?? undefined}
          noun={["person", "people"]}
        >
          <Field label="Tag">
            <Select
              value={tagId}
              onChange={(event) => setTagId(event.target.value)}
            >
              <option value="">Any tag</option>
              {tags.items.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
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
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channelLabel(channel)}
                </option>
              ))}
            </Select>
          </Field>
        </FilterBar>

        <LoadState
          loading={list.loading}
          subject="the talent pool"
          error={list.error}
          onRetry={list.reload}
          skeleton="table"
        >
          {list.rows.length === 0 && !stale ? (
            <Card>
              <EmptyState
                icon={<Star aria-hidden="true" />}
                title={
                  narrowed ? "Nobody matches" : "Nobody is kept on file yet"
                }
                description={
                  narrowed
                    ? "Nobody in the talent pool fits the search and filters above."
                    : "Keep somebody from a role's board or table, using Keep in the talent pool."
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
              <ul className="flex flex-col gap-3">
                {list.rows.map((entry) => (
                  <li key={entry.candidateId}>
                    <Card className="flex flex-col gap-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-body-sm font-medium text-ink">
                            {entry.name}
                          </p>
                          <p className="text-body-sm text-muted">
                            {[
                              entry.email,
                              entry.source ? channelLabel(entry.source) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => setLeaving(entry)}
                        >
                          Take out of the talent pool
                        </Button>
                      </div>

                      {entry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {entry.tags.map((tag) => (
                            <Tag key={tag.id}>{tag.name}</Tag>
                          ))}
                        </div>
                      )}

                      {entry.note && (
                        <p className="text-body-sm text-body">{entry.note}</p>
                      )}

                      <ul
                        aria-label={`Roles ${entry.name} has been in`}
                        className="flex flex-col gap-1"
                      >
                        {entry.applications.map((application) => (
                          <li
                            key={application.id}
                            className="flex flex-wrap items-center gap-2 text-body-sm"
                          >
                            <TextLink
                              href={`/hiring/candidates/${application.id}`}
                            >
                              {application.role}
                            </TextLink>
                            <Badge tone="neutral" size="sm">
                              {OUTCOME_LABEL[application.outcome] ??
                                application.outcome}
                            </Badge>
                            {application.stageName && (
                              <span className="text-muted">
                                {application.stageName}
                              </span>
                            )}
                            {application.reason && (
                              <span className="text-muted">
                                Reason: {application.reason}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
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
      </PageBody>

      <ConfirmDialog
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        title={
          leaving
            ? `Take ${leaving.name} out of the talent pool?`
            : "Take out of the talent pool?"
        }
        body="They are no longer kept for other roles. Their applications and the tags on them are not changed."
        confirmLabel="Take out"
        tone="primary"
        loading={busy}
        onConfirm={() => {
          if (leaving) void leave(leaving);
        }}
      />
    </>
  );
}
