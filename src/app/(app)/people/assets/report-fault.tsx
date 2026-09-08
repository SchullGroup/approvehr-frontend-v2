"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiRepairRequest } from "@/lib/api/assets";
import { useRepairRequests, useRepairActions } from "@/lib/store/assets";

/**
 * Reporting a fault, from the person holding the broken thing.
 *
 * The feedback asked who is supposed to start a repair — *"is it the employee
 * who raises it?"* — and found that nothing showed up on either side. This is
 * the employee's side: the button, and then the status the request is at.
 *
 * ## Why the status lives beside the item rather than on a queue
 *
 * An employee has one or two things. A queue is the right shape for whoever
 * works through everybody's faults, and the wrong shape for somebody asking
 * "what is happening with my laptop" — the answer belongs next to the laptop.
 * The feedback describes exactly that reading: *"the employee can then see that
 * the request is Under Review, In Repair, Repaired, and finally Returned."*
 *
 * ## Nothing here interprets the status
 *
 * `statusLabel` and the refusal messages are the API's own words. The lifecycle
 * lives in `REPAIR_NEXT` on the server, and a second copy of it here — even
 * just to decide a colour — is how the two come to disagree about what is
 * allowed. The tone below is chosen from whether the request is **open**, which
 * is a fact about any lifecycle rather than a claim about this one.
 */

/** Open means somebody still owes an answer. Closed and rejected do not. */
const OPEN_TONE = "warning" as const;

export function ReportFaultButton({
  assetId,
  assetName,
  onReported,
}: {
  assetId: string;
  assetName: string;
  onReported?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fault, setFault] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { report } = useRepairActions();
  const toast = useToast();

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await report(assetId, fault.trim());
      toast.push({
        title: "Reported",
        tone: "success",
        detail: "Whoever looks after equipment has been told.",
      });
      setOpen(false);
      setFault("");
      onReported?.();
    } catch (caught) {
      /* The API's own sentence. It knows whether this item already has an open
         request, or is archived, or the description is too thin to act on —
         nothing here does. */
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not go through. Try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-1.5"
        onClick={() => setOpen(true)}
      >
        <Wrench aria-hidden="true" className="size-3.5" />
        Report a fault
      </Button>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={`Report a fault — ${assetName}`}
          description="Say what is wrong with it. Somebody who looks after equipment will pick it up, and you will see it move along here."
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="accent"
                loading={saving}
                /* Ten characters, matching the API's own floor rather than a
                   number invented here. "It is broken" is a row somebody has
                   to chase the reporter about, which is the step the request
                   exists to remove. */
                disabled={fault.trim().length < 10}
                onClick={() => void submit()}
              >
                Send it
              </Button>
            </div>
          }
        >
          <Field
            label="What is wrong with it"
            {...(error ? { error } : {})}
            help="Enough for somebody to act on without coming back to ask."
          >
            <Textarea
              value={fault}
              rows={4}
              autoFocus
              onChange={(event) => setFault(event.target.value)}
              placeholder="The screen flickers whenever it is unplugged."
            />
          </Field>
        </Modal>
      )}
    </>
  );
}

/**
 * Where this item's fault report has got to, if it has one.
 *
 * Renders **nothing** when there is no open request — which is the ordinary
 * state for almost every item, almost always. An empty "no repairs" line beside
 * every laptop in a company is noise that teaches people to stop reading the
 * area it sits in.
 */
export function RepairStatusLine({ assetId }: { assetId: string }) {
  const { requests } = useRepairRequests({ assetId });

  /* The newest, because `reportFault` refuses a second open request on one
     item — so there is at most one open, and any others are history. */
  const current = requests[0];
  if (!current) return null;

  const open = !isFinished(current);

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-body-sm text-muted">
      <Badge tone={open ? OPEN_TONE : "neutral"} size="sm">
        {/* The API's wording, not a second copy of the seven states. */}
        {current.statusLabel}
      </Badge>
      <span className="min-w-0">{current.fault}</span>
      {current.note && (
        <span className="w-full text-meta text-faint">{current.note}</span>
      )}
    </p>
  );
}

/**
 * Finished, from the shape of the data rather than from a list of statuses.
 *
 * `closedAt` is stamped by the server when a request ends, so this needs no
 * knowledge of which members are terminal — which is the knowledge that would
 * drift the moment the lifecycle grows an eighth state.
 */
function isFinished(request: ApiRepairRequest): boolean {
  return request.closedAt !== null || request.status === "REJECTED";
}
