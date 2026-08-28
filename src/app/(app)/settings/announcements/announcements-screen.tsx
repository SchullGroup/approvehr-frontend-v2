"use client";

import { useState } from "react";
import { Megaphone, Pin, Plus, Trash2 } from "lucide-react";
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
  IconButton,
  Input,
  SegmentedControl,
  SkeletonText,
  Stat,
  TBody,
  TD,
  TDPrimary,
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
  DELETE_EFFECT,
  DRAFT_EFFECT,
  audienceLabel,
  type ApiAnnouncement,
} from "@/lib/api/announcements";
import { useCan } from "@/lib/permissions";
import {
  useAnnouncementMutations,
  useAnnouncements,
} from "@/lib/store/announcements";
import { useDepartments } from "@/lib/store/departments";
import { AnnouncementForm, type Draft } from "./announcement-form";

/**
 * The noticeboard, from the side that writes it.
 *
 * ## Why this lives in Settings and not under People
 *
 * Its two nearest neighbours in this product are both here: `/settings/policies`
 * is the company telling staff what the rules are, `/settings/knowledge` is the
 * company answering their questions, and a notice is the company telling them
 * something once. All three are governed by `MANAGE_SETTINGS` — the permission
 * that already means "may speak for the company" — and gating this on the same
 * one avoids inventing a `MANAGE_ANNOUNCEMENTS` that, on the day it shipped,
 * nobody would hold and therefore nobody could grant (the permissions module
 * refuses to grant what the granter does not have).
 *
 * People is the register of records **about individuals** — a directory, a file,
 * a leaver. A notice is about nobody in particular, and filing it there would put
 * "everybody" in a list of names.
 *
 * ## Three states, and the middle one is the reason this screen exists
 *
 * A notice is a draft, live, or **published and expired** — live on the row and
 * invisible to staff, because its date has passed. Nothing but the `expired` flag
 * says so, and without surfacing it an editor sees a healthy board while nobody
 * is reading half of it. So expired notices are counted at the top, badged in the
 * table, and offered "Put it back up" rather than being quietly filtered away.
 *
 * ## Publishing and deleting are asked about; editing is not
 *
 * Editing a live notice is the correction people need most (the wrong date on the
 * closure notice), so it saves without a dialog. Taking one down changes what
 * everybody sees, and deleting is the one hard delete in this product — both get
 * a dialog that names the consequence rather than asking "are you sure?".
 */

type Filter = "all" | "published" | "draft";

export function AnnouncementsScreen() {
  const canManage = useCan("MANAGE_SETTINGS");
  const toast = useToast();

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const board = useAnnouncements({
    status: filter,
    pageSize: 50,
    sort: "createdAt",
    order: "desc",
    ...(search.trim() ? { q: search.trim() } : {}),
  });
  const mutations = useAnnouncementMutations();
  const departments = useDepartments();

  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState<ApiAnnouncement | null>(null);
  const [takingDown, setTakingDown] = useState<ApiAnnouncement | null>(null);
  const [deleting, setDeleting] = useState<ApiAnnouncement | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Every write reports its own failure, in the API's words.
   *
   * `run` returns whether it worked so a dialog closes only on success — a modal
   * that closes over a refusal takes the explanation with it.
   */
  async function run(
    action: () => Promise<unknown>,
    success: string,
    detail?: string,
  ): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      board.reload();
      toast.push({
        title: success,
        tone: "success",
        ...(detail ? { detail } : {}),
      });
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
    } finally {
      setBusy(false);
    }
  }

  const live = board.announcements.filter((row) => row.published && !row.expired);
  const drafts = board.announcements.filter((row) => !row.published);
  const expired = board.announcements.filter((row) => row.expired);

  /* Only the departments somebody can actually address. An archived one has
     nobody in it — the API refuses it and names the reason — so offering it in
     the picker would be offering a refusal. */
  const pickable = departments.flat
    .filter((department) => !department.archived)
    .map((department) => ({ id: department.id, name: department.name }));

  return (
    <>
      <PageHeader
        title="Noticeboard"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        action={
          <div className="flex items-center gap-2">
            <ButtonLink href="/dashboard" variant="secondary" size="sm">
              See it as staff do
            </ButtonLink>
            {canManage && board.editable && (
              <Button variant="accent" size="sm" onClick={() => setWriting(true)}>
                <Plus aria-hidden="true" className="size-4" />
                Write a notice
              </Button>
            )}
          </div>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {board.source === "demo" && (
          <Callout tone="warning" title="Demo noticeboard, read-only">
            These notices are seeded so the product can be shown without a
            database. Posting one needs the API — a notice written into this
            browser would reach nobody, which is the opposite of what a
            noticeboard is for.
          </Callout>
        )}

        {board.editable && !canManage && (
          <Callout tone="info" title="You can read this, not change it">
            Posting a notice speaks for the whole company, so it needs the
            settings permission. Ask whoever manages settings.
          </Callout>
        )}

        <LoadFailure subject="the noticeboard" error={board.error}  onRetry={board.reload}/>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="On the board" value={String(live.length)} hint="staff see these" />
          <Stat label="Drafts" value={String(drafts.length)} hint="nobody sees these" />
          {/* The state that has no other symptom. See the header. */}
          <Stat
            label="Come down already"
            value={String(expired.length)}
            hint={
              expired.length > 0
                ? "Published, but past their date"
                : "Nothing has expired"
            }
          />
        </div>

        <Card>
          <CardHeader
            title="Every notice"
            description="Newest first. Pinning changes the order staff see, not this one — this is a work list."
          />

          <CardBody className="flex flex-wrap items-center gap-3">
            <SegmentedControl<Filter>
              label="Which notices to show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "published", label: "Published" },
                { value: "draft", label: "Drafts" },
              ]}
            />
            <div className="min-w-[13rem] flex-1">
              <Input
                type="search"
                value={search}
                onChange={(event) => {
                  const next = event.target.value;
                  setSearch(next);
                }}
                placeholder="Find a notice by title or wording"
                aria-label="Find a notice by title or wording"
              />
            </div>
          </CardBody>

          {board.loading ? (
            <CardBody>
              <SkeletonText lines={6} />
            </CardBody>
          ) : board.announcements.length === 0 ? (
            <EmptyState
              icon={<Megaphone aria-hidden="true" />}
              title={
                search.trim()
                  ? "No notice matches that"
                  : filter === "draft"
                    ? "No drafts"
                    : "Nothing on the noticeboard yet"
              }
              description={
                search.trim()
                  ? "This searches the title and the wording."
                  : "The first one is usually the thing people keep asking about — when payday lands, or what happens over Christmas."
              }
              action={
                canManage && board.editable && !search.trim() ? (
                  <Button variant="accent" onClick={() => setWriting(true)}>
                    Write the first notice
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableWrap
              className="rounded-none border-0"
              caption="Every notice, newest first, with who it is for and whether it is on the board"
            >
              <THead>
                <TH>Notice</TH>
                <TH>Who it is for</TH>
                <TH>State</TH>
                {canManage && board.editable && (
                  <TH align="right">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </THead>
              <TBody>
                {board.announcements.map((notice) => (
                  <TR key={notice.id}>
                    <TDPrimary
                      title={
                        <span className="flex flex-wrap items-center gap-2">
                          {notice.title}
                          {notice.pinned && (
                            <Badge
                              tone="accent"
                              size="sm"
                              icon={<Pin aria-hidden="true" className="size-3" />}
                            >
                              Pinned
                            </Badge>
                          )}
                        </span>
                      }
                      subtitle={firstLine(notice.body)}
                    />
                    <TD className="text-muted">
                      {audienceLabel(notice.audience, notice.departmentNames)}
                    </TD>
                    <TD>
                      <State notice={notice} />
                    </TD>
                    {canManage && board.editable && (
                      <TD align="right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => setEditing(notice)}
                          >
                            Edit
                          </Button>

                          {notice.published ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              onClick={() => setTakingDown(notice)}
                            >
                              Take it down
                            </Button>
                          ) : (
                            <Button
                              variant="accent"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  async () => {
                                    const result = await mutations.publish(notice.id);
                                    return result;
                                  },
                                  `${notice.title} is on the board`,
                                  reachSentence(notice),
                                )
                              }
                            >
                              Publish
                            </Button>
                          )}

                          <IconButton
                            label={`Delete ${notice.title}`}
                            size="sm"
                            onClick={() => setDeleting(notice)}
                          >
                            <Trash2 aria-hidden="true" className="size-3.5" />
                          </IconButton>
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}

          {board.announcements.length > 0 &&
            board.total > board.announcements.length && (
              <CardBody className="border-t border-line">
                <p className="text-body-sm text-muted">
                  Showing {board.announcements.length} of {board.total}. Narrow it
                  with the search box above.
                </p>
              </CardBody>
            )}
        </Card>
      </PageBody>

      {writing && (
        <AnnouncementForm
          departments={pickable}
          onClose={() => setWriting(false)}
          onSave={async (draft, publish) => {
            const ok = await run(
              () => mutations.create(bodyFrom(draft, publish)),
              publish ? `${draft.title} is on the board` : "Saved as a draft",
              publish ? undefined : DRAFT_EFFECT,
            );
            if (ok) setWriting(false);
          }}
        />
      )}

      {editing && (
        <AnnouncementForm
          key={editing.id}
          notice={editing}
          departments={pickable}
          onClose={() => setEditing(null)}
          onSave={async (draft, publish) => {
            const target = editing;
            const ok = await run(async () => {
              await mutations.update(target.id, {
                title: draft.title,
                body: draft.body,
                audience: draft.audience,
                departmentIds: draft.departmentIds,
                pinned: draft.pinned,
                /* An empty date clears it. `null` and absent mean different
                   things to the API, and this is the one that means "clear". */
                expiresOn: draft.expiresOn === "" ? null : draft.expiresOn,
              });
              /* Two calls, because they are two acts: the edit stands whether or
                 not the publish is asked for, and publishing has its own
                 refusals (an archived department, a date already past). */
              if (publish) await mutations.publish(target.id);
            }, publish ? `${draft.title} is on the board` : "Saved");
            if (ok) setEditing(null);
          }}
        />
      )}

      {/* Reversible, and the dialog says so — but it changes what every member
          of staff sees, so it is asked first. */}
      <ConfirmDialog
        open={takingDown !== null}
        onClose={() => setTakingDown(null)}
        loading={busy}
        tone="primary"
        title={`Take “${takingDown?.title ?? ""}” off the board?`}
        confirmLabel="Take it down"
        body="Staff stop seeing it straight away. The wording is kept as a draft — publish it again whenever you like."
        onConfirm={() => {
          const target = takingDown;
          if (!target) return;
          void run(
            () => mutations.unpublish(target.id),
            `${target.title} is off the board`,
          ).then((ok) => {
            if (ok) setTakingDown(null);
          });
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        loading={busy}
        tone="danger"
        title={`Delete “${deleting?.title ?? ""}”?`}
        confirmLabel="Delete it"
        body={
          <span className="flex flex-col gap-2.5">
            <span>{DELETE_EFFECT}</span>
            {deleting?.published === true && (
              <span>
                It is on the board now, so it disappears from everybody&rsquo;s
                dashboard as well.
              </span>
            )}
          </span>
        }
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          void run(() => mutations.remove(target.id), `${target.title} deleted`).then(
            (ok) => {
              if (ok) setDeleting(null);
            },
          );
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Draft state and expiry are separate facts and both are shown.
 *
 * "Published" on a notice whose date has passed is technically true and
 * practically a lie — nobody is reading it. That is why `expired` exists on the
 * API shape and why it is a badge here rather than a filter.
 */
function State({ notice }: { notice: ApiAnnouncement }) {
  if (!notice.published) {
    return (
      <Badge tone="warning" size="sm" dot>
        Draft
      </Badge>
    );
  }
  if (notice.expired) {
    return (
      <span className="flex flex-col items-start gap-1">
        <Badge tone="neutral" size="sm">
          Come down
        </Badge>
        <span className="text-meta text-muted">
          Expired {notice.expiresOn ? longDate(notice.expiresOn) : ""}
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone="success" size="sm">
        On the board
      </Badge>
      {notice.expiresOn && (
        <span className="text-meta text-muted">
          Until {longDate(notice.expiresOn)}
        </span>
      )}
    </span>
  );
}

function bodyFrom(draft: Draft, publish: boolean) {
  return {
    title: draft.title,
    body: draft.body,
    audience: draft.audience,
    departmentIds: draft.departmentIds,
    pinned: draft.pinned,
    publish,
    ...(draft.expiresOn ? { expiresOn: draft.expiresOn } : {}),
  };
}

/** What publishing this one will do, said before the toast can count it. */
function reachSentence(notice: ApiAnnouncement): string | undefined {
  if (notice.audience === "EVERYONE") return undefined;
  return notice.departmentNames.length > 0
    ? `Only ${notice.departmentNames.join(", ")} will see it.`
    : undefined;
}

/** The first line of the wording, for the row's subtitle. */
function firstLine(body: string): string {
  const line = body.split("\n").find((candidate) => candidate.trim().length > 0) ?? "";
  return line.length > 110 ? `${line.slice(0, 110).trimEnd()}…` : line;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `2026-10-01` → `1 Oct 2026`. UTC, so the server and the browser agree. */
function longDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}
