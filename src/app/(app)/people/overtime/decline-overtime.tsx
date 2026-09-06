"use client";

import { useState } from "react";
import { Button, Field, Modal, Money, Textarea } from "@/components/ui";
import { dayLabel, hoursLabel, naira } from "@/lib/api/overtime";
import type { OvertimeRow } from "@/lib/store/overtime";

/**
 * Turning a day of overtime down.
 *
 * The reason is required because the API requires it — "Say why you are turning
 * it down." — and because the person it belongs to reads it. A decline with no
 * reason is a wage argument next month.
 *
 * Mount it with `key={row.id}` so each decline starts on an empty box rather
 * than the last one's words.
 */
export function DeclineOvertimeModal({
  row,
  onClose,
  onDecline,
}: {
  row: OvertimeRow;
  onClose: () => void;
  onDecline: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const ready = reason.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Turn down ${row.name}'s overtime?`}
      description={`${dayLabel(row.onDate)} · ${hoursLabel(row.minutes)}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!ready}
            onClick={() => {
              setBusy(true);
              void onDecline(reason.trim()).finally(() => setBusy(false));
            }}
          >
            Turn it down
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-body">
          Nothing is paid for this day.{" "}
          <span className="tabular font-medium text-ink">
            <Money amount={naira(row.amountKobo)} decimals />
          </span>{" "}
          comes off the month.
        </p>

        <Field
          label="Why"
          required
          help={`${row.name} sees this. Say what happened, or what to fix.`}
        >
          <Textarea
            value={reason}
            autoFocus
            rows={3}
            maxLength={500}
            placeholder="Forgot to clock out: was not on site after 17:30."
            onChange={(e) => {
              const next = e.target.value;
              setReason(next);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
