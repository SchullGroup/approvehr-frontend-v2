"use client";

import { Fragment, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Select,
  SegmentedControl,
  Skeleton,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import type { ApiDelivery } from "@/lib/api/webhooks";
import { fullStamp } from "@/lib/audit/language";
import type { useDeliveryLog } from "@/lib/store/webhooks";
import { PayloadBlock } from "../code";

/**
 * The delivery log — every attempt, with the reason it failed in words.
 *
 * ## This is the reason the module is worth shipping
 *
 * "Failed" is not a debuggable answer. `503`, "No answer within 10 seconds",
 * "That host name does not resolve", "The endpoint's HTTPS certificate has
 * expired" are, and the API takes the trouble to produce them, so this screen
 * prints them verbatim rather than reducing them to a red dot.
 *
 * ## Three states, and the difference matters
 *
 * `pending` is still inside its retry schedule and may well arrive. `failed` is
 * given up on: every attempt used, nothing landed. `delivered` landed. Collapsing
 * the first two into "failed" is how somebody ends up re-sending a payroll event
 * that was about to succeed on its own.
 *
 * ## Retry is per delivery, and always available
 *
 * One attempt, now, ignoring the schedule, and it works on a switched-off
 * endpoint — it is the button somebody presses immediately after fixing their
 * server. Nothing about it starts a fresh schedule.
 */

export type LogFilters = {
  status: "all" | "delivered" | "failed" | "pending";
  event: string;
  page: number;
};

export function DeliveryLog({
  log,
  filters,
  onFilters,
  events,
  editable,
  retriesRunning,
  onRetry,
}: {
  log: ReturnType<typeof useDeliveryLog>;
  filters: LogFilters;
  onFilters: (next: LogFilters) => void;
  /** The events this endpoint subscribes to, for the filter. */
  events: string[];
  editable: boolean;
  /** False: nothing retries on its own here, so say so next to the buttons. */
  retriesRunning: boolean;
  onRetry: (deliveryId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const retry = async (id: string) => {
    setRetrying(id);
    try {
      await onRetry(id);
    } finally {
      setRetrying(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Delivery log"
        description={
          log.total === 1 ? "1 attempt recorded." : `${log.total} attempts recorded.`
        }
        level={2}
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            label="Show"
            value={filters.status}
            onChange={(status) => onFilters({ ...filters, status, page: 1 })}
            options={[
              { value: "all", label: "All" },
              { value: "delivered", label: "Delivered" },
              { value: "pending", label: "Waiting" },
              { value: "failed", label: "Given up" },
            ]}
          />
          <div className="min-w-[12rem]">
            <Select
              aria-label="Filter by event"
              value={filters.event}
              onChange={(e) =>
                onFilters({ ...filters, event: e.target.value, page: 1 })
              }
            >
              <option value="">Every event</option>
              {events.map((event) => (
                <option key={event} value={event}>
                  {event}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {!retriesRunning && (
          <p className="flex items-start gap-2 rounded-md border border-warning-line bg-warning-soft p-3 text-body-sm text-warning-text">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Automatic retries are not running on this server. Fix your endpoint,
              then press Retry on the deliveries below.
            </span>
          </p>
        )}

        {/* `useDeliveryLog` flattens the error to a string before a screen sees
            it, so there is no `ApiError` left to classify and this renders the
            general advice. Widening that state to `ApiError | null` is what
            would let the API's own sentence through. */}
        <LoadFailure subject="the delivery log" error={log.error}  onRetry={log.reload}/>

        {log.loading ? (
          <Skeleton className="h-40 w-full" />
        ) : log.rows.length === 0 ? (
          <EmptyState
            compact
            icon={<Clock aria-hidden="true" />}
            title="Nothing here yet"
            description="Send a test event and it will appear at the top of this list."
          />
        ) : (
          <TableWrap caption="Every delivery attempt for this endpoint, newest first">
            <THead>
              <TH>Event</TH>
              <TH>When</TH>
              <TH>Result</TH>
              <TH>Attempt</TH>
              <TH className="text-right">Payload</TH>
            </THead>
            <TBody>
              {log.rows.map((row) => {
                const open = expanded.has(row.id);
                return (
                  <Fragment key={row.id}>
                  <TR className="align-top">
                    <TDPrimary
                      title={
                        <span className="font-mono text-body-sm">
                          {row.event}
                        </span>
                      }
                      subtitle={
                        <span className="font-mono">{row.id.slice(0, 8)}…</span>
                      }
                    />
                    <TD className="whitespace-nowrap tabular">
                      {fullStamp(row.createdAt)}
                    </TD>
                    <TD>
                      <Outcome row={row} />
                    </TD>
                    <TD className="whitespace-nowrap tabular">
                      {row.attempt} of {row.maxAttempts}
                    </TD>
                    <TD align="right">
                      <div className="flex flex-col items-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-expanded={open}
                          onClick={() => toggle(row.id)}
                        >
                          {open ? (
                            <ChevronDown aria-hidden="true" className="size-4" />
                          ) : (
                            <ChevronRight aria-hidden="true" className="size-4" />
                          )}
                          {open ? "Hide" : "Show"}
                        </Button>
                        {editable && row.state !== "delivered" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={retrying === row.id}
                            onClick={() => void retry(row.id)}
                          >
                            <RotateCcw aria-hidden="true" className="size-4" />
                            Retry now
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                  {open && (
                    <TR>
                      <TD colSpan={5}>
                        <Detail row={row} />
                      </TD>
                    </TR>
                  )}
                  </Fragment>
                );
              })}
            </TBody>
          </TableWrap>
        )}

        {(filters.page > 1 || log.hasMore) && (
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() =>
                onFilters({ ...filters, page: Math.max(1, filters.page - 1) })
              }
            >
              Newer
            </Button>
            <span className="text-body-sm text-muted">Page {filters.page}</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!log.hasMore}
              onClick={() => onFilters({ ...filters, page: filters.page + 1 })}
            >
              Older
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ----------------------------------------------------------------- one row */

/**
 * What happened, as a shape, a word and a number.
 *
 * The status code is on the badge line rather than in a column of its own,
 * because `503` on its own is not the answer — "given up on, after a 503" is.
 */
function Outcome({ row }: { row: ApiDelivery }) {
  if (row.state === "delivered") {
    return (
      <span className="flex flex-col gap-1">
        <Badge tone="success" icon={<CheckCircle2 aria-hidden="true" />}>
          Delivered
        </Badge>
        <span className="text-meta tabular text-muted">
          HTTP {row.statusCode ?? "200"}
        </span>
      </span>
    );
  }

  if (row.state === "pending") {
    return (
      <span className="flex flex-col gap-1">
        <Badge tone="warning" icon={<Clock aria-hidden="true" />}>
          Waiting
        </Badge>
        <span className="text-meta text-muted">
          {row.retryAt ? `Next try ${fullStamp(row.retryAt)}` : "Queued"}
        </span>
      </span>
    );
  }

  return (
    <span className="flex flex-col gap-1">
      <Badge tone="danger" icon={<XCircle aria-hidden="true" />}>
        Given up
      </Badge>
      <span className="max-w-[22rem] text-meta text-danger-text">
        {row.error ?? `HTTP ${row.statusCode ?? "?"}`}
      </span>
    </span>
  );
}

function Detail({ row }: { row: ApiDelivery }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-canvas p-3">
      <dl className="flex flex-col gap-1 text-body-sm">
        <Line term="Delivery id">
          <span className="font-mono text-meta break-all">{row.id}</span>
        </Line>
        <Line term="Status code">
          {row.statusCode === null ? "No response" : String(row.statusCode)}
        </Line>
        {row.error && <Line term="Error">{row.error}</Line>}
        {row.deliveredAt && (
          <Line term="Delivered">{fullStamp(row.deliveredAt)}</Line>
        )}
        {row.retryAt && <Line term="Next attempt">{fullStamp(row.retryAt)}</Line>}
      </dl>
      <PayloadBlock title="Payload sent" value={row.payload} />
    </div>
  );
}

function Line({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-muted">{term}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}
