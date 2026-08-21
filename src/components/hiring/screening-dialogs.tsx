"use client";

import { useState } from "react";
import {
  Button,
  DescriptionList,
  Field,
  Input,
  Modal,
  Textarea,
} from "@/components/ui";
import type { ScreenInInput } from "@/lib/api/hiring";

/**
 * The two dialogs that move somebody out of the screening queue.
 *
 * They live here rather than beside one screen because two screens do the same
 * write. The requisition page screens from a queue, and the candidate page
 * screens from the one record it is showing — the same `POST
 * /applications/:id/advance` and `/decline`, so the same questions and the same
 * wording. A second copy on the candidate page would drift: the naira/kobo rule
 * would get re-implemented, and the sentence about a blank field meaning "not
 * asked yet" would end up said two different ways.
 *
 * Both take strings rather than a row, so a caller holding a `ScreeningRow`, an
 * `ApplicantRecord` or neither can use them.
 */

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
export function ScreenInDialog({
  applicantName,
  appliedFor,
  roleName,
  onClose,
  onConfirm,
}: {
  applicantName: string;
  /** The advert they applied through. */
  appliedFor: string;
  /** The role whose pipeline they land in. */
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
    const onNow = number(current);
    const wants = number(expected);
    try {
      await onConfirm({
        ...(notice === undefined ? {} : { noticeDays: Math.round(notice) }),
        ...(onNow === undefined ? {} : { currentSalary: onNow }),
        ...(wants === undefined ? {} : { expectedSalary: wants }),
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
      title={`Screen ${applicantName} in for ${roleName}`}
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
            { term: "Applied for", value: appliedFor },
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

export function DeclineDialog({
  applicantName,
  onClose,
  onConfirm,
}: {
  applicantName: string;
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
      title={`Turn down ${applicantName}?`}
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
