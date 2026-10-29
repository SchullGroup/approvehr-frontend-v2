"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Pencil,
  Plus,
  Trash2,
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
  IconButton,
  RowActions,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
  LoadState,
} from "@/components/ui";
import { NOTICE_LINK, NoticeLine } from "@/components/portal/notice-line";
import { ApiError } from "@/lib/api/client";
import {
  HOLIDAY_DELETE_EFFECTS,
  UNCONFIRMED_HOLIDAY_EFFECT,
  type PublicHolidayRow,
} from "@/lib/api/leave";
import { useCan } from "@/lib/permissions";
import { usePublicHolidays, useHolidayMutations } from "@/lib/store/holidays";
import { HolidayForm } from "./holiday-form";

/**
 * Managing the public holiday calendar.
 *
 * ## Why this is not a preferences panel
 *
 * Five services on the API read `PublicHoliday`: attendance's day status,
 * overtime rates, payroll's unpaid-day count, the help desk's working-hours SLA
 * and the attendance analytics window. Adding a date changes what somebody is
 * paid. That is why writing needs `MANAGE_SETTINGS` and why this card states the
 * consequence rather than assuming somebody reads a tooltip.
 *
 * ## Deleting is the dangerous one, and not for the reason it looks like
 *
 * There is no foreign key from a leave request, a payslip or a timesheet to a
 * holiday — every reader matches on the date — so `DELETE /leave/holidays/:id`
 * has nothing to check, checks nothing, and succeeds. **The API will not stop
 * you deleting a date that a leave request has already been costed against.**
 *
 * What actually happens is a split worth spelling out, and it is in
 * `HOLIDAY_DELETE_EFFECTS` so this dialog and the calendar card cannot drift:
 * the request keeps its stored day count, an approved payroll run keeps its own
 * figures, and everything that recomputes live — the timesheet, overtime, the
 * unpaid days a future run prorates against — quietly starts treating the day as
 * ordinary. A confirm dialog reading "are you sure?" would be a lie by omission,
 * so this one lists all four.
 *
 * The alternative — refusing the delete — is not this screen's to make. The API
 * allows it, an unconfirmed date wrongly added is a real thing that has to be
 * removable, and a UI that pretends an endpoint is stricter than it is teaches
 * somebody the wrong model of their own data.
 */

const WEEKDAY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTH = [
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

/** `2026-10-01` → `1 Oct 2026`. UTC, like every other date helper here. */
function longDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return `${date.getUTCDate()} ${MONTH[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function weekdayOf(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? "" : (WEEKDAY[date.getUTCDay()] ?? "");
}

/* Text, not a colour. The calendar card carries the same distinction as fill
   against dashed outline. */
function HolidayStatusBadge({ holiday }: { holiday: PublicHolidayRow }) {
  /* Neutral for the ordinary case: twelve green pills down a column say
     "all good" about a list that has no good or bad in it, and leave the one
     that needs attention no louder than the rest. */
  return holiday.confirmed ? (
    <Badge tone="neutral" size="sm">
      Gazetted
    </Badge>
  ) : (
    <Badge tone="warning" size="sm" dot>
      Awaiting proclamation
    </Badge>
  );
}

/** Mark confirmed (unconfirmed only), Edit, Remove — one menu on every row, on
    both layouts. Three buttons on a row was the busiest column on the screen
    for the least-used acts; "Mark confirmed" is the one that is a task, and it
    is first. */
function HolidayRowMenu({
  holiday,
  busy,
  onConfirm,
  onEdit,
  onDelete,
}: {
  holiday: PublicHolidayRow;
  busy: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <RowActions
      label={`More actions for ${holiday.name}`}
      items={[
        ...(holiday.confirmed
          ? []
          : [
              {
                label: "Mark confirmed",
                icon: <CalendarCheck aria-hidden="true" />,
                disabled: busy,
                onSelect: onConfirm,
              },
            ]),
        {
          label: "Edit",
          icon: <Pencil aria-hidden="true" />,
          onSelect: onEdit,
        },
        "separator" as const,
        {
          label: "Remove",
          icon: <Trash2 aria-hidden="true" />,
          tone: "danger" as const,
          onSelect: onDelete,
        },
      ]}
    />
  );
}

export function HolidaysPanel({ defaultYear }: { defaultYear: number }) {
  const canManage = useCan("MANAGE_SETTINGS");
  const [year, setYear] = useState(defaultYear);
  const calendar = usePublicHolidays(year);
  const mutations = useHolidayMutations();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PublicHolidayRow | null>(null);
  const [deleting, setDeleting] = useState<PublicHolidayRow | null>(null);
  const [busy, setBusy] = useState(false);

  /** Every write reports its own failure. The API's wording is the useful part. */
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      calendar.reload();
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
    } finally {
      setBusy(false);
    }
  }

  const awaiting = calendar.awaitingProclamation;
  const suggested = calendar.suggested;

  return (
    <>
      <Card>
        <CardHeader
          /* Wraps rather than squeezing the description to one word per line:
             `CardHeader` gives `action` `shrink-0`, and the year nav plus the add
             button are wider than a phone leaves for prose. */
          className="flex-wrap"
          title="Public holidays"
          description="Attendance status, overtime rates, payroll proration and the help desk's response clock all read these dates. Adding one changes what people are paid."
          action={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <IconButton
                  label={`Show ${year - 1}`}
                  size="sm"
                  className="size-11 sm:size-8"
                  onClick={() => setYear((y) => y - 1)}
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </IconButton>
                <span className="tabular min-w-14 text-center text-body-sm font-medium text-ink">
                  {year}
                </span>
                <IconButton
                  label={`Show ${year + 1}`}
                  size="sm"
                  className="size-11 sm:size-8"
                  onClick={() => setYear((y) => y + 1)}
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </IconButton>
              </div>
              {canManage && (
                <ButtonLink
                  variant="secondary"
                  size="sm"
                  className="min-h-11 sm:min-h-8"
                  href={`/settings/leave/holidays/import?year=${year}`}
                >
                  <FileUp aria-hidden="true" className="size-4" />
                  Import from Excel
                </ButtonLink>
              )}
              {canManage && (
                <Button
                  variant="accent"
                  size="sm"
                  className="min-h-11 sm:min-h-8"
                  onClick={() => setAdding(true)}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add a holiday
                </Button>
              )}
            </div>
          }
        />

        <CardBody className="flex flex-col gap-3 pb-3">
          {/* Demo mode has one honest gap the connected product does not, and it
              is exactly the kind of thing somebody would otherwise discover by
              wondering why a timesheet disagreed with a calendar they just
              edited. `lib/workflows/attendance.ts` reads the seed array, not this
              store. */}
          {DEMO_ENABLED && calendar.source === "demo" && (
            <Callout tone="warning" title="Demo calendar, this browser only">
              These are Nigeria&rsquo;s 2026 dates, seeded so the product can be
              shown without a database. Edits stay in this browser, and the demo
              attendance timesheet keeps reading the seeded dates rather than
              these, so a date you add here will not appear on it. Connected
              there is no such gap: attendance, overtime, payroll and the help
              desk all read the one table this screen writes to.
            </Callout>
          )}

          {awaiting !== null && awaiting > 0 && (
            /* Plain text, so it is one quiet line with the consequence behind
               an info icon rather than a coloured block of three paragraphs. */
            <Callout
              tone="info"
              title={`${awaiting} ${awaiting === 1 ? "date is" : "dates are"} awaiting proclamation`}
            >
              {[
                UNCONFIRMED_HOLIDAY_EFFECT.acts,
                UNCONFIRMED_HOLIDAY_EFFECT.waits,
                canManage
                  ? "Confirm one as soon as it is gazetted and both catch up."
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            </Callout>
          )}

          {canManage && suggested !== null && suggested > 0 && (
            <NoticeLine tone="accent">
              <span>
                {suggested} suggested{" "}
                {suggested === 1 ? "holiday is" : "holidays are"} waiting in
                Approvals. None changes anybody&rsquo;s pay until it is
                approved.
              </span>
              <Link href="/approvals" className={NOTICE_LINK}>
                Open approvals
              </Link>
            </NoticeLine>
          )}

          {!canManage && (
            <p className="text-body-sm text-muted">
              Changing the calendar is a settings permission, because it moves
              pay. Ask whoever manages settings.
            </p>
          )}
        </CardBody>

        <LoadState
          loading={calendar.loading}
          error={calendar.error}
          subject={`the ${year} holiday calendar`}
          onRetry={calendar.reload}
          hasData={calendar.holidays.length > 0}
          skeleton="table"
        >
          {calendar.holidays.length === 0 ? (
            <EmptyState
              icon={<CalendarDays aria-hidden="true" />}
              title={`Nothing on the calendar for ${year}`}
              description="Until a date is here, attendance treats it as an ordinary working day and payroll prorates it as one."
              action={
                canManage ? (
                  <Button variant="accent" onClick={() => setAdding(true)}>
                    <Plus aria-hidden="true" className="size-4" />
                    Add a holiday
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="hidden sm:block">
                <TableWrap
                  className="rounded-none border-0"
                  caption={`Public holidays for ${year}`}
                >
                  <THead>
                    <TH>Holiday</TH>
                    <TH>Date</TH>
                    <TH>Status</TH>
                    {canManage && (
                      <TH align="right">
                        <span className="sr-only">Actions</span>
                      </TH>
                    )}
                  </THead>
                  <TBody>
                    {calendar.holidays.map((holiday) => (
                      <TR key={holiday.id}>
                        <TDPrimary
                          title={holiday.name}
                          subtitle={weekdayOf(holiday.date)}
                        />
                        <TD className="tabular">{longDate(holiday.date)}</TD>
                        <TD>
                          <HolidayStatusBadge holiday={holiday} />
                        </TD>
                        {canManage && (
                          <TD align="right">
                            <HolidayRowMenu
                              holiday={holiday}
                              busy={busy}
                              onConfirm={() =>
                                void run(
                                  () => mutations.confirm(holiday.id),
                                  `${holiday.name} confirmed`,
                                )
                              }
                              onEdit={() => setEditing(holiday)}
                              onDelete={() => setDeleting(holiday)}
                            />
                          </TD>
                        )}
                      </TR>
                    ))}
                  </TBody>
                </TableWrap>
              </div>

              {/* Two lines a row, as on the desktop: the name and its date on the
                left, the status and the menu on the right. Five lines of label
                and value pairs per holiday was thirteen holidays of them. */}
              <ul className="divide-y divide-line sm:hidden">
                {calendar.holidays.map((holiday) => (
                  <li
                    key={holiday.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-medium text-ink">
                        {holiday.name}
                      </p>
                      <p className="tabular truncate text-meta text-muted">
                        {weekdayOf(holiday.date).slice(0, 3)},{" "}
                        {longDate(holiday.date)}
                      </p>
                    </div>
                    <HolidayStatusBadge holiday={holiday} />
                    {canManage && (
                      <HolidayRowMenu
                        holiday={holiday}
                        busy={busy}
                        onConfirm={() =>
                          void run(
                            () => mutations.confirm(holiday.id),
                            `${holiday.name} confirmed`,
                          )
                        }
                        onEdit={() => setEditing(holiday)}
                        onDelete={() => setDeleting(holiday)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </LoadState>
      </Card>

      <HolidayForm
        open={adding}
        onClose={() => setAdding(false)}
        onSave={async (body) => {
          const ok = await run(
            () => mutations.create(body),
            `${body.name} added to ${body.date.slice(0, 4)}`,
          );
          if (ok) setAdding(false);
        }}
      />

      <HolidayForm
        open={editing !== null}
        holiday={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSave={async (body) => {
          const target = editing;
          if (!target) return;
          const ok = await run(
            () => mutations.update(target.id, body),
            "Saved",
          );
          if (ok) setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        loading={busy}
        tone="danger"
        title={`Remove ${deleting?.name ?? "this holiday"}?`}
        confirmLabel="Remove the date"
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await run(
            () => mutations.remove(deleting.id),
            `${deleting.name} removed from the calendar`,
          );
          if (ok) setDeleting(null);
        }}
        body={
          <span className="flex flex-col gap-2.5">
            <span>
              This is a hard delete: the row goes and nothing keeps a trace of
              it. Four things follow, and none of them is a refusal:
            </span>
            <span className="flex flex-col gap-1.5">
              {HOLIDAY_DELETE_EFFECTS.map((effect) => (
                <span key={effect} className="flex gap-2">
                  <span aria-hidden="true" className="text-faint">
                    &bull;
                  </span>
                  <span>{effect}</span>
                </span>
              ))}
            </span>
            {deleting && !deleting.confirmed && (
              <span>
                {deleting.name} is not gazetted yet, so the timesheet and the
                help desk&rsquo;s clock never counted it. Payroll proration and
                overtime did.
              </span>
            )}
          </span>
        }
      />
    </>
  );
}
