"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardBody,
  Disclosure,
  useToast,
} from "@/components/ui";
import {
  EVENT_LABEL,
  RECEIPT_IS_NOT_AGREEMENT,
  STATUS_LABEL,
  replyBadgeText,
  timeLeft,
  type ApiQueryDetail,
} from "@/lib/api/queries";
import { useQueryActions } from "@/lib/store/queries";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateTime } from "@/lib/time";
import { actionMessage } from "@/lib/use-action";
import { Fact } from "./letter-view";

/** The current time, to the minute, for "2 days 4 hours left". An elapsed gap, never a calendar day. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date()); // reads-the-clock: elapsed time to an instant (hours left), not a day or a wall time
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000); // reads-the-clock: refreshes the hours-left figure each minute
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Where the query stands, and the receipt.
 *
 * ## The clock, said by the API
 *
 * `replyStateLabel` is the server's own sentence ("No reply by 14 Nov 2026, 5:00 pm."), shown as it
 * came. It is a fact about a clock and the tone is never danger: **silence is not a finding**, and
 * a missing reply can be a missed notification, leave or a phone with no data. The gap in words
 * ("2 days 4 hours left") is worked out from the instants and stops being said once there is a
 * reply, the query is closed or withdrawn.
 *
 * ## Receipt is not agreement
 *
 * Opening is recorded by the server the first time the person reads it. Confirming receipt is a
 * separate act, a button, and **nothing waits on it**: a reply and an outcome are never blocked by
 * a missing confirmation, and the sentence beside the button says so before it is pressed.
 */
export function StatusCard({
  detail,
  isSubject,
  publish,
}: {
  detail: ApiQueryDetail;
  isSubject: boolean;
  publish: (detail: ApiQueryDetail) => void;
}) {
  const timeZone = useOrgTimezone();
  const now = useNow();
  const toast = useToast();
  const actions = useQueryActions();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const badge = replyBadgeText(detail.replyState);
  const left =
    detail.status === "ISSUED" && detail.reply?.sent !== true
      ? timeLeft(detail.replyBy, now)
      : null;

  async function confirm() {
    setBusy(true);
    setProblem(null);
    try {
      publish(await actions.confirmReceipt(detail.id));
      toast.push({ tone: "success", title: "Receipt confirmed" });
    } catch (error) {
      setProblem(actionMessage(error, "the confirmation"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={detail.status === "WITHDRAWN" ? "neutral" : "accent"}>
            {STATUS_LABEL[detail.status]}
          </Badge>
          {badge && detail.replyState !== "waiting" && (
            <Badge tone="neutral">{badge}</Badge>
          )}
          {detail.archived && <Badge tone="neutral">Archived</Badge>}
        </div>

        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {!isSubject && (
            <Fact label="Person">
              <Link
                href={`/people/${detail.subject.id}`}
                className="hover:underline"
              >
                {detail.subject.name}
              </Link>
              <span className="block text-meta text-muted">
                {detail.subject.employeeNo}
              </span>
            </Fact>
          )}
          {!isSubject && detail.draftedByName && (
            <Fact label="Drafted by">
              {detail.draftedByName}
              {detail.status === "DRAFT" && (
                <span className="block text-meta text-muted">
                  A manager wrote this draft. HR reviews it and issues it.
                </span>
              )}
            </Fact>
          )}
          {detail.replyStateLabel && (
            <Fact label="Reply">
              {detail.replyStateLabel}
              {left && (
                <span className="block text-meta text-muted">{left}</span>
              )}
            </Fact>
          )}
          {detail.openedAt && (
            <Fact label={isSubject ? "You opened it" : "Opened by the person"}>
              {formatDateTime(detail.openedAt, timeZone)}
            </Fact>
          )}
          {detail.receiptConfirmedAt && (
            <Fact label="Receipt confirmed">
              {formatDateTime(detail.receiptConfirmedAt, timeZone)}
              {isSubject && (
                <span className="block text-meta text-muted">
                  Receipt is not agreement.
                </span>
              )}
            </Fact>
          )}
          {detail.withdrawn && (
            <Fact label="Withdrawn">
              {detail.withdrawn.at
                ? formatDateTime(detail.withdrawn.at, timeZone)
                : "Withdrawn"}
              {detail.withdrawn.reason && (
                <span className="block text-meta text-muted">
                  {detail.withdrawn.reason}
                </span>
              )}
            </Fact>
          )}
        </dl>

        {detail.can.confirmReceipt && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <p className="text-body-sm text-body">{RECEIPT_IS_NOT_AGREEMENT}</p>
            <div>
              <Button
                variant="secondary"
                onClick={() => void confirm()}
                loading={busy}
              >
                I received this query
              </Button>
            </div>
            {problem && (
              <p role="alert" className="text-body-sm text-danger-text">
                {problem}
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * What happened to the query, oldest first.
 *
 * The server's list carries ids and counts and never a word of the letter, so there is nothing
 * here that could. A kind this build does not know is left out (a server a deploy ahead may add
 * some), and the person is not shown that a draft was started.
 */
export function Timeline({
  detail,
  isSubject,
}: {
  detail: ApiQueryDetail;
  isSubject: boolean;
}) {
  const timeZone = useOrgTimezone();
  const events = detail.events.filter(
    (event) =>
      EVENT_LABEL[event.kind] !== undefined &&
      !(isSubject && event.kind === "DRAFTED"),
  );
  if (events.length === 0) return null;
  return (
    <Disclosure title="What has happened to it" level={3}>
      <ol className="flex flex-col gap-2">
        {events.map((event, index) => (
          <li
            key={`${event.kind}-${event.at}-${String(index)}`}
            className="flex flex-wrap items-baseline justify-between gap-2 text-body-sm"
          >
            <span className="text-ink">{EVENT_LABEL[event.kind]}</span>
            <span className="tabular-nums text-muted">
              {formatDateTime(event.at, timeZone)}
            </span>
          </li>
        ))}
      </ol>
    </Disclosure>
  );
}
