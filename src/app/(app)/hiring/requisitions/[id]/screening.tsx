"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Inbox, Mail, Megaphone, Paperclip, Phone } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  Field,
  Input,
  Modal,
  Skeleton,
  Textarea,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SourceBadge } from "@/components/hiring/source-badge";
import { ApiError } from "@/lib/api/client";
import { careersPath } from "@/lib/api/careers";
import type { ScreenInInput, ScreeningRow } from "@/lib/api/hiring";
import { useRoleQueue, type RoleQueue } from "@/lib/store/hiring";

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
 * This panel is live whenever the API is up. The board below it is not — there
 * is no route for a pipeline `Application` — so each carries its own badge
 * rather than the page carrying one for both.
 */
export function RequisitionScreening({
  requisitionId,
  roleName,
}: {
  requisitionId: string;
  roleName: string;
}) {
  return <ScreeningCard queue={useRoleQueue(requisitionId)} roleName={roleName} />;
}

/**
 * The card itself, given a queue rather than fetching one.
 *
 * Split out because `UnknownRequisition` below needs the adverts to write its own
 * page title, and a second `useRoleQueue` inside the card would fetch the same
 * two endpoints again — two extra requests per render of one page, which is how
 * a screen walks into a rate limiter.
 */
function ScreeningCard({
  queue,
  roleName,
}: {
  queue: RoleQueue;
  roleName: string;
}) {
  const [screening, setScreening] = useState<ScreeningRow | null>(null);
  const [declining, setDeclining] = useState<ScreeningRow | null>(null);
  const toast = useToast();

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
            queue.adverts.length === 0
              ? undefined
              : `${queue.waiting} waiting on a first look.`
          }
          action={<SourceBadge live={queue.live} />}
        />

        {queue.loading ? (
          <CardBody>
            <Skeleton className="h-24 w-full" />
            <span className="sr-only-focusable">Loading applications</span>
          </CardBody>
        ) : queue.error ? (
          <CardBody className="flex flex-wrap items-center gap-3">
            <p className="text-[0.875rem] text-danger-text">
              {queue.error.message}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void queue.reload()}
            >
              Try again
            </Button>
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
          <CardBody className="flex flex-col gap-3">
            {queue.rows.map((row) => (
              <ApplicantRow
                key={row.id}
                row={row}
                editable={queue.editable}
                onScreenIn={() => setScreening(row)}
                onDecline={() => setDeclining(row)}
              />
            ))}
            {!queue.editable && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <p className="text-[0.875rem] text-body">
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
            {queue.cvNote && (
              <p className="text-[0.75rem] text-muted">{queue.cvNote}</p>
            )}
          </CardBody>
        )}
      </Card>

      {screening && (
        <ScreenInDialog
          row={screening}
          roleName={roleName}
          onClose={() => setScreening(null)}
          onConfirm={async (input) => {
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
            } catch (error) {
              fail(error);
            }
          }}
        />
      )}

      {declining && (
        <DeclineDialog
          row={declining}
          onClose={() => setDeclining(null)}
          onConfirm={async (reason) => {
            try {
              await queue.screenOut(
                declining.id,
                reason.trim() === "" ? undefined : reason.trim(),
              );
              toast.push({
                title: `${declining.name} turned down`,
                tone: "success",
                detail: "Nothing was sent to them. Write to them yourself.",
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

/**
 * A requisition this browser has never heard of.
 *
 * Reachable in connected mode: the roles list is built from adverts, and an
 * advert's `requisitionId` is a real database id with no route behind it. Rather
 * than a bare 404 — which is what the applications queue currently walks into —
 * the page still does the one useful thing it can, which is show that role's
 * applications and let somebody screen them in.
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
        description="The advert and its applications, from the database. The role's own details — stages, hiring team, must-haves — have no endpoint yet."
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
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium text-ink">
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
            {row.cvUrl ? (
              <a
                href={row.cvUrl}
                className="inline-flex items-center gap-1 text-[0.875rem] font-medium text-accent-text hover:underline underline-offset-4"
              >
                <Paperclip aria-hidden="true" className="size-3.5" />
                Open CV
              </a>
            ) : (
              <Badge
                tone="neutral"
                size="sm"
                icon={<Paperclip aria-hidden="true" />}
              >
                CV cannot be opened
              </Badge>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.875rem] text-muted">
            <a
              href={`mailto:${row.email}`}
              className="inline-flex items-center gap-1 hover:text-accent-text hover:underline underline-offset-4"
            >
              <Mail aria-hidden="true" className="size-3.5" />
              {row.email}
            </a>
            {row.phone && (
              <a
                href={`tel:${row.phone}`}
                className="tabular inline-flex items-center gap-1 hover:text-accent-text hover:underline underline-offset-4"
              >
                <Phone aria-hidden="true" className="size-3.5" />
                {row.phone}
              </a>
            )}
            <span className="tabular">Applied {row.appliedOn}</span>
            {row.source && <span>Heard: {row.source}</span>}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {!row.waiting && row.candidateId && (
            <Link
              href={`/hiring/candidates/${row.candidateId}`}
              className="inline-flex items-center gap-1 text-[0.875rem] font-medium text-accent-text hover:underline underline-offset-4"
            >
              See their record
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          )}
          {editable && row.waiting && (
            <>
              <Button variant="secondary" size="sm" onClick={onDecline}>
                Turn down
              </Button>
              <Button variant="accent" size="sm" onClick={onScreenIn}>
                Screen in
              </Button>
            </>
          )}
        </div>
      </div>

      {row.coverNote && (
        <p className="whitespace-pre-line rounded-md bg-canvas p-3 text-[0.875rem] leading-relaxed text-body">
          {row.coverNote}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The screening call, in one box.
 *
 * Every field is optional and that is the API's decision, not a shortcut: a
 * first call answers two of the four questions, and refusing to move somebody
 * until all four are known leaves the pipeline empty and the real state of play
 * in somebody's notebook. A blank field is "not asked yet" and the next call
 * fills it.
 *
 * Salaries are typed in naira. `toAdvanceBody` in `lib/api/hiring.ts` turns them
 * into kobo — nothing on this screen multiplies by 100.
 */
function ScreenInDialog({
  row,
  roleName,
  onClose,
  onConfirm,
}: {
  row: ScreeningRow;
  roleName: string;
  onClose: () => void;
  onConfirm: (input: ScreenInInput) => Promise<void>;
}) {
  const [noticeDays, setNoticeDays] = useState("");
  const [current, setCurrent] = useState("");
  const [expected, setExpected] = useState("");
  const [busy, setBusy] = useState(false);

  /** Blank means "not asked". Zero is a real answer and survives. */
  const number = (value: string): number | undefined => {
    const cleaned = value.replace(/[^0-9.]/g, "");
    if (cleaned === "") return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };

  async function confirm() {
    setBusy(true);
    const notice = number(noticeDays);
    try {
      await onConfirm({
        ...(notice === undefined ? {} : { noticeDays: Math.round(notice) }),
        ...(number(current) === undefined ? {} : { currentSalary: number(current) }),
        ...(number(expected) === undefined
          ? {}
          : { expectedSalary: number(expected) }),
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
      title={`Screen ${row.name} in for ${roleName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void confirm()}>
            Screen in
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <DescriptionList
          items={[
            { term: "Applied for", value: row.postingTitle },
            { term: "Goes onto", value: roleName },
          ]}
        />
        <p className="text-[0.875rem] text-body">
          They go into the first stage of this role. Their candidate record is
          created from this application, so nothing is retyped.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Notice (days)" help="Leave blank if you have not asked.">
            <Input
              inputMode="numeric"
              value={noticeDays}
              placeholder="30"
              onChange={(event) => setNoticeDays(event.target.value)}
            />
          </Field>
          <Field label="On now (₦ a month)" help="Optional.">
            <Input
              inputMode="decimal"
              value={current}
              placeholder="650000"
              onChange={(event) => setCurrent(event.target.value)}
            />
          </Field>
          <Field label="Wants (₦ a month)" help="Optional.">
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
  row,
  onClose,
  onConfirm,
}: {
  row: ScreeningRow;
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
      title={`Turn down ${row.name}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => {
              setBusy(true);
              void onConfirm(reason).finally(() => setBusy(false));
            }}
          >
            Turn down
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[0.875rem] text-body">
          Nothing is sent to them. The reason stays on the record so the next
          person to read it knows what happened.
        </p>
        <Field label="Reason" help="Kept internal.">
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Not enough Nigerian payroll experience for this level."
          />
        </Field>
      </div>
    </Modal>
  );
}
