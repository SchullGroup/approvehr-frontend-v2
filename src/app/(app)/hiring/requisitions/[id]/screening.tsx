"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Inbox, Mail, Megaphone, Phone, UserX } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LinkedText,
  Skeleton,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { LoadMore } from "@/components/portal/load-more";
import { OpenCv, useCanOpenCv } from "@/components/hiring/open-cv";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SourceBadge } from "@/components/hiring/source-badge";
import {
  DeclineDialog,
  ScreenInDialog,
} from "@/components/hiring/screening-dialogs";
import { ApiError } from "@/lib/api/client";
import { careersApi, careersPath } from "@/lib/api/careers";
import type { ScreeningRow } from "@/lib/api/hiring";
import { useRoleQueue, type RoleQueue } from "@/lib/store/hiring";
import { RowMenu, type RowMenuEntry } from "./row-menu";

/**
 * Everybody who applied for this role through the careers page.
 *
 * ## Why this panel is here and not only on the applications queue
 *
 * `POST /careers/applications/:id/advance` creates the candidate and the pipeline
 * application in one transaction, and it needs a requisition to put them on. It
 * takes one from the advert when the advert has one — so the applications queue
 * at `/hiring/postings/applications` has to *ask* whenever an advert was written
 * without an approved role behind it, and there is no picker to ask with.
 *
 * On this page the answer is the page. The requisition is in the URL, so every
 * screening-in from here names it, and an advert with no approved role can still
 * feed a pipeline. That is exactly the seam `AdvanceBody.requisitionId` exists
 * for, and it is the only place in the product that can use it without typing an
 * id in by hand.
 *
 * ## Two sources, one page
 *
 * This panel is live whenever the API is up, and so is the board below it when
 * somebody is signed in (`RealRequisitionWorkspace`). With no session the board
 * is the demo seed while this panel is the careers-page demo applications, so
 * each carries its own badge rather than the page carrying one for both.
 */
export function RequisitionScreening({
  requisitionId,
  roleName,
}: {
  requisitionId: string;
  roleName: string;
}) {
  return (
    <ScreeningCard queue={useRoleQueue(requisitionId)} roleName={roleName} />
  );
}

/**
 * The card itself, given a queue rather than fetching one.
 *
 * Split out because `UnknownRequisition` below needs the adverts to write its own
 * page title, and a second `useRoleQueue` inside the card would fetch the same
 * two endpoints again — two extra requests per render of one page, which is how
 * a screen walks into a rate limiter.
 */
export function ScreeningCard({
  queue,
  roleName,
}: {
  queue: RoleQueue;
  roleName: string;
}) {
  const [screening, setScreening] = useState<ScreeningRow | null>(null);
  const [declining, setDeclining] = useState<ScreeningRow | null>(null);
  const toast = useToast();
  const router = useRouter();

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
      <Card>
        <CardHeader
          title="Applied through the careers page"
          description={
            queue.adverts.length === 0 || queue.waiting === null
              ? undefined
              : `${queue.waiting.toLocaleString("en-NG")} waiting on a first look.`
          }
          action={<SourceBadge live={queue.live} />}
        />

        {queue.loading ? (
          <CardBody>
            <Skeleton className="h-24 w-full" />
            <span className="sr-only-focusable">Loading applications</span>
          </CardBody>
        ) : queue.error ? (
          <CardBody>
            <LoadFailure
              subject="the applications for this role"
              error={queue.error}
              onRetry={queue.reload}
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void queue.reload()}
              >
                Try again
              </Button>
            </LoadFailure>
          </CardBody>
        ) : queue.adverts.length === 0 ? (
          <EmptyState
            compact
            icon={<Megaphone aria-hidden="true" />}
            title="No advert is running for this role"
            description="Write one and candidates can apply to it directly instead of emailing a CV."
            action={
              <ButtonLink href="/hiring/postings" variant="accent" size="sm">
                Write an advert
              </ButtonLink>
            }
          />
        ) : queue.rows.length === 0 ? (
          <EmptyState
            compact
            icon={<Inbox aria-hidden="true" />}
            title="Nobody has applied yet"
            description="Applications land here the moment somebody sends the form."
            action={
              queue.adverts[0] ? (
                <ButtonLink
                  href={careersPath(queue.adverts[0].publicPath)}
                  variant="secondary"
                  size="sm"
                >
                  See the advert
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <CardBody className="flex flex-col divide-y divide-line">
            {queue.rows.map((row) => (
              <ApplicantRow
                key={row.id}
                row={row}
                editable={queue.editable}
                onScreenIn={() => setScreening(row)}
                onDecline={() => setDeclining(row)}
              />
            ))}
            <LoadMore
              shown={queue.rows.length}
              total={queue.total}
              noun={["application", "applications"]}
              hasMore={queue.hasMore}
              loading={queue.loadingMore}
              error={queue.moreError}
              onLoadMore={queue.loadMore}
            />
            {!queue.editable && (
              <div className="flex flex-wrap items-center gap-3 pt-3">
                <p className="text-body-sm text-body">
                  Screening somebody in writes a candidate into the pipeline, so
                  it needs the API.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void queue.reload()}
                >
                  Check again
                </Button>
              </div>
            )}
          </CardBody>
        )}
      </Card>

      <ScreenInDialog
        open={screening !== null}
        applicantName={screening?.name ?? ""}
        appliedFor={screening?.postingTitle ?? ""}
        roleName={roleName}
        onClose={() => setScreening(null)}
        onConfirm={async (input) => {
          if (!screening) return;
          try {
            const result = await queue.screenIn(screening.id, input);
            /* The API writes this sentence and it names the stage they landed
               in. Showing it rather than composing one means the screen cannot
               disagree with what actually happened. */
            toast.push({
              title: `${screening.name} is in the pipeline`,
              tone: "success",
              detail: result.note,
            });
            setScreening(null);
            /* Same fix as the applications queue (PR #357): land on their
               record rather than a list this panel does not itself refresh —
               this queue and the pipeline board on the same page are separate
               reads with no shared reload, so staying here would show a
               success toast against an apparently unchanged screen. */
            router.push(`/hiring/candidates/${result.candidateId}`);
          } catch (error) {
            fail(error);
          }
        }}
      />

      <DeclineDialog
        open={declining !== null}
        applicantName={declining?.name ?? ""}
        onClose={() => setDeclining(null)}
        onConfirm={async (reason) => {
          if (!declining) return;
          try {
            await queue.screenOut(
              declining.id,
              reason.trim() === "" ? undefined : reason.trim(),
            );
            toast.push({
              title: `${declining.name} turned down`,
              tone: "success",
              detail:
                "Nothing was sent to them: ApproveHR does not email applicants yet. Write to them yourself.",
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

/**
 * A requisition this browser has never heard of.
 *
 * Reached only from the demo: a role id the seed does not hold, usually one the
 * demo's own adverts point at. Connected, an unknown id is a genuine 404 — see
 * `RealRequisitionDetail`. Rather than a bare 404 the demo page still does the
 * one useful thing it can, which is show that role's applications and let
 * somebody screen them in.
 */
export function UnknownRequisition({ id }: { id: string }) {
  const queue = useRoleQueue(id);
  const advert = queue.adverts[0];
  const roleName = advert?.title ?? "This role";

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/hiring", label: "Hiring" }]}
        title={roleName}
        meta={
          queue.reference ? (
            <Badge tone="neutral" size="sm">
              {queue.reference}
            </Badge>
          ) : undefined
        }
        action={
          <ButtonLink href="/hiring/postings" variant="secondary" size="sm">
            <Megaphone aria-hidden="true" className="size-4" />
            Job adverts
          </ButtonLink>
        }
      />
      <PageBody className="flex flex-col gap-6">
        <ScreeningCard queue={queue} roleName={roleName} />
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One person who applied, with what is needed to decide on them and the actions to.
 *
 * ## What moved
 *
 * The row carried up to six controls in two styles: an underlined email, an
 * underlined phone number, an underlined "See their record", and two or three
 * buttons, none of them 44px on a phone (the audit counted 23px links and 32px
 * buttons, 17 targets under 44px in four rows). Now:
 *
 * - **The decision is visible**: "Screen in" is the one filled button, and "Open
 *   CV" stays beside it because it is what is opened first to decide.
 * - **Everything else is one menu**: write to them, call them, turn them down.
 *   Turning somebody down is kept in the menu on purpose, apart from the button
 *   that sits next to it; it is the one action here that cannot be un-pressed
 *   from this screen, and it used to be a plain button beside "Screen in".
 * - **The address is plain text**, still selectable and copyable. The menu's
 *   "Email" and "Call" rows show it again as their hint, so the number is on
 *   screen in both places and a mistyped one is easy to see.
 */
function ApplicantRow({
  row,
  editable,
  onScreenIn,
  onDecline,
}: {
  row: ScreeningRow;
  editable: boolean;
  onScreenIn: () => void;
  onDecline: () => void;
}) {
  const canOpenCv = useCanOpenCv();
  const menu: RowMenuEntry[] = [
    {
      label: "Email",
      icon: <Mail />,
      href: `mailto:${row.email}`,
      external: true,
      hint: row.email,
    },
    ...(row.phone
      ? [
          {
            label: "Call",
            icon: <Phone />,
            href: `tel:${row.phone}`,
            external: true,
            hint: row.phone,
          },
        ]
      : []),
    ...(editable && row.waiting
      ? [
          "separator" as const,
          {
            label: "Turn down",
            icon: <UserX />,
            tone: "danger" as const,
            onSelect: onDecline,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
            {row.name}
            {row.waiting ? (
              <Badge tone="warning" size="sm" dot>
                Waiting
              </Badge>
            ) : (
              <Badge tone="success" size="sm" dot>
                Screened
              </Badge>
            )}
            {editable && canOpenCv && row.cvFlagged && (
              <Badge tone="danger" size="sm">
                CV flagged by the virus check
              </Badge>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted">
            <span className="inline-flex min-w-0 items-center gap-1 break-all">
              <Mail aria-hidden="true" className="size-3.5 shrink-0" />
              {row.email}
            </span>
            {row.phone && (
              <span className="tabular inline-flex items-center gap-1">
                <Phone aria-hidden="true" className="size-3.5 shrink-0" />
                {row.phone}
              </span>
            )}
            <span className="tabular">Applied {row.appliedOn}</span>
            {row.source && <span>Heard: {row.source}</span>}
          </p>
        </div>

        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5">
          {editable && canOpenCv && row.hasCv && !row.cvFlagged && (
            <OpenCv
              open={() => careersApi.openCv(row.id)}
              className="max-sm:h-11"
            />
          )}
          {!row.waiting && row.candidateId && (
            <ButtonLink
              href={`/hiring/candidates/${row.candidateId}`}
              variant="secondary"
              size="sm"
              className="max-sm:h-11"
            >
              See their record
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </ButtonLink>
          )}
          {editable && row.waiting && (
            <Button
              variant="accent"
              size="sm"
              className="max-sm:h-11"
              onClick={onScreenIn}
            >
              Screen in
            </Button>
          )}
          <RowMenu label={`More actions for ${row.name}`} items={menu} />
        </div>
      </div>

      {row.coverNote && (
        <p className="whitespace-pre-line rounded-md bg-canvas p-3 text-body-sm leading-relaxed text-body">
          <LinkedText>{row.coverNote}</LinkedText>
        </p>
      )}
    </div>
  );
}
