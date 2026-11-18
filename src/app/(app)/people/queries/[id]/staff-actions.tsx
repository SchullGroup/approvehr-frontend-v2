"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  FieldRow,
  Input,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import { QUERY_LIMITS, type ApiQueryDetail } from "@/lib/api/queries";
import { counter } from "@/lib/queries/draft";
import { useQueryActions } from "@/lib/store/queries";
import { useOrgTimezone } from "@/lib/store/session";
import {
  formatDateTime,
  instantFromWall,
  wallClockIn,
  zoneLabel,
} from "@/lib/time";
import { actionMessage } from "@/lib/use-action";
import { useOpenSession } from "@/lib/use-open-session";

/**
 * What a worker of queries can do to one: move the reply-by time, withdraw it, archive it, print it.
 *
 * Every button is drawn from `can`, which is computed by the rules the guards enforce, so none is
 * offered that the server will refuse. A refusal that still arrives (the state moved between the
 * page and the press) is the server's own sentence, shown in the dialog with what was typed.
 */
export function StaffActions({
  detail,
  publish,
}: {
  detail: ApiQueryDetail;
  publish: (detail: ApiQueryDetail) => void;
}) {
  const toast = useToast();
  const actions = useQueryActions();
  const [extending, setExtending] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const { can } = detail;
  const issued = detail.status !== "DRAFT";
  const any = can.extend || can.withdraw || can.archive || issued;
  if (!any) return null;

  async function archive() {
    setBusy(true);
    setProblem(null);
    try {
      publish(await actions.archive(detail.id));
      setArchiving(false);
      toast.push({
        tone: "info",
        title: "Archived",
        detail: "It has left the register's default list. Nothing was deleted.",
      });
    } catch (error) {
      setProblem(actionMessage(error, "the query"));
      setArchiving(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Actions" />
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {issued && (
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer aria-hidden="true" className="size-4" />
              <span>Print the letter</span>
            </Button>
          )}
          {can.extend && (
            <Button variant="secondary" onClick={() => setExtending(true)}>
              Extend the reply-by time
            </Button>
          )}
          {can.withdraw && (
            <Button variant="secondary" onClick={() => setWithdrawing(true)}>
              Withdraw
            </Button>
          )}
          {can.archive && (
            <Button variant="secondary" onClick={() => setArchiving(true)}>
              Archive
            </Button>
          )}
        </div>
        {can.extend && (
          <p className="text-meta text-muted">
            The reply-by time can be moved later, with a reason, and never
            earlier. The person is told.
          </p>
        )}
        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </CardBody>

      <ExtendDialog
        open={extending}
        onClose={() => setExtending(false)}
        detail={detail}
        publish={publish}
      />
      <WithdrawDialog
        open={withdrawing}
        onClose={() => setWithdrawing(false)}
        detail={detail}
        publish={publish}
      />
      <Modal
        open={archiving}
        onClose={() => {
          if (!busy) setArchiving(false);
        }}
        title="Archive this query?"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setArchiving(false)}
              disabled={busy}
            >
              Not yet
            </Button>
            <Button onClick={() => void archive()} loading={busy}>
              Archive it
            </Button>
          </>
        }
      >
        <p className="text-body-sm text-body">
          It leaves the register&apos;s default list. Nothing is deleted, and an
          archived query can still be found with Show archived.
        </p>
      </Modal>
    </Card>
  );
}

function ExtendDialog(props: {
  open: boolean;
  onClose: () => void;
  detail: ApiQueryDetail;
  publish: (detail: ApiQueryDetail) => void;
}) {
  const session = useOpenSession(props.open, props.detail.id);
  return <ExtendForm key={session} {...props} />;
}

function ExtendForm({
  open,
  onClose,
  detail,
  publish,
}: {
  open: boolean;
  onClose: () => void;
  detail: ApiQueryDetail;
  publish: (detail: ApiQueryDetail) => void;
}) {
  const toast = useToast();
  const actions = useQueryActions();
  const timeZone = useOrgTimezone();
  const current = wallClockIn(detail.replyBy, timeZone);

  const [day, setDay] = useState(current?.day ?? "");
  const [time, setTime] = useState(current?.time ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const instant = instantFromWall(day, time, timeZone);
  const later =
    instant !== null &&
    detail.replyBy !== null &&
    new Date(instant).getTime() > new Date(detail.replyBy).getTime();
  const reasonText = reason.trim();
  const ready =
    later &&
    reasonText.length >= QUERY_LIMITS.extendReason.min &&
    reasonText.length <= QUERY_LIMITS.extendReason.max;

  function close() {
    if (!busy) onClose();
  }

  async function extend() {
    if (!instant) return;
    setBusy(true);
    setProblem(null);
    try {
      publish(
        await actions.extend(detail.id, {
          replyBy: instant,
          reason: reasonText,
        }),
      );
      toast.push({ tone: "success", title: "Reply-by time extended" });
      onClose();
    } catch (error) {
      setProblem(actionMessage(error, "the new time"));
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Extend the reply-by time"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void extend()}
            disabled={!ready}
            loading={busy}
          >
            Extend it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {detail.replyBy && (
          <p className="text-body-sm text-body">
            Now {formatDateTime(detail.replyBy, timeZone)}. It can only be moved
            later, and the person is told the new time and why.
          </p>
        )}
        <FieldRow>
          <Field label="New date" required help={`In ${zoneLabel(timeZone)}.`}>
            <Input
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
          </Field>
          <Field label="New time" required>
            <Input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </Field>
        </FieldRow>
        {instant !== null && !later && (
          <p className="text-body-sm text-muted">
            That is not later than the current reply-by time.
          </p>
        )}
        <Field
          label="Reason"
          required
          help="The person is told this, so write it for them."
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {counter(reason, QUERY_LIMITS.extendReason.max, 400) && (
            <span className="text-meta text-muted">
              {counter(reason, QUERY_LIMITS.extendReason.max, 400)}
            </span>
          )}
        </Field>
        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}

function WithdrawDialog(props: {
  open: boolean;
  onClose: () => void;
  detail: ApiQueryDetail;
  publish: (detail: ApiQueryDetail) => void;
}) {
  const session = useOpenSession(props.open, props.detail.id);
  return <WithdrawForm key={session} {...props} />;
}

function WithdrawForm({
  open,
  onClose,
  detail,
  publish,
}: {
  open: boolean;
  onClose: () => void;
  detail: ApiQueryDetail;
  publish: (detail: ApiQueryDetail) => void;
}) {
  const toast = useToast();
  const actions = useQueryActions();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const text = reason.trim();
  const ready =
    text.length >= QUERY_LIMITS.withdrawReason.min &&
    text.length <= QUERY_LIMITS.withdrawReason.max;

  function close() {
    if (!busy) onClose();
  }

  async function withdraw() {
    setBusy(true);
    setProblem(null);
    try {
      publish(await actions.withdraw(detail.id, { reason: text }));
      toast.push({ tone: "info", title: "Withdrawn" });
      onClose();
    } catch (error) {
      setProblem(actionMessage(error, "the query"));
      setBusy(false);
    }
  }

  const served = detail.status !== "DRAFT";

  return (
    <Modal
      open={open}
      onClose={close}
      title="Withdraw this query?"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void withdraw()}
            disabled={!ready}
            loading={busy}
          >
            Withdraw it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-body">
          {served
            ? "It stays on the record as withdrawn, with your reason, and the person is told that something has been recorded on it."
            : "A draft that is withdrawn stays on the record as withdrawn. Nobody was told about it."}{" "}
          Nothing is deleted.
        </p>
        <Field label="Reason" required>
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
