"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Modal,
  SegmentedControl,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import type { ApiRepairRequest, RepairRequestStatus } from "@/lib/api/assets";
import { useRepairActions, useRepairRequests } from "@/lib/store/assets";
import { dayLabel } from "@/lib/api/performance";

/**
 * Faults people have reported, and the queue somebody works through.
 *
 * The other half of what the feedback found missing: *"nothing shows up
 * properly on either side: not on the employee's view, and not on the HR/admin
 * view either."* `RepairsPanel` beside this is the **workshop record** — a
 * vendor, a cost, the dates it was away. This is the **queue**: who reported
 * what, and what happens next.
 *
 * ## The buttons come from the server, not from a list here
 *
 * Each row offers exactly `nextStatuses`, which the API computes from
 * `REPAIR_NEXT` and from whether this reader may move anything at all. So a
 * screen cannot offer a transition the server would refuse, and it cannot
 * quietly fall behind when the lifecycle grows a state — the two cannot
 * disagree because only one of them holds the rule.
 *
 * An employee reading this sees no buttons, because their `nextStatuses` is
 * empty. Not disabled buttons: a control that is present and always refuses
 * teaches people the product is broken.
 */

type Filter = "open" | "all";

/** Open means somebody still owes an answer. */
const isOpen = (request: ApiRepairRequest) =>
  request.closedAt === null && request.status !== "REJECTED";

export function FaultQueuePanel() {
  const [filter, setFilter] = useState<Filter>("open");
  const { requests, loading, error } = useRepairRequests();
  const [moving, setMoving] = useState<{
    request: ApiRepairRequest;
    to: RepairRequestStatus;
  } | null>(null);

  const shown = filter === "open" ? requests.filter(isOpen) : requests;
  const openCount = requests.filter(isOpen).length;

  return (
    <Card>
      <CardHeader
        title="Reported faults"
        description={
          openCount === 0
            ? "Nothing is waiting."
            : `${openCount} still to deal with.`
        }
        action={
          <SegmentedControl<Filter>
            label="Filter faults"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: "Open" },
              { value: "all", label: "All" },
            ]}
          />
        }
      />

      <CardBody className="flex flex-col gap-3">
        {loading && (
          <div className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </div>
        )}

        <LoadFailure subject="the reported faults" error={error} />

        {!loading && !error && shown.length === 0 && (
          <EmptyState
            compact
            icon={<Wrench aria-hidden="true" />}
            title={
              filter === "open"
                ? "Nothing is waiting"
                : "Nobody has reported a fault"
            }
            description={
              filter === "open"
                ? "Every reported fault has been dealt with."
                : "Staff report faults from the equipment on their own record."
            }
          />
        )}

        {shown.map((request) => (
          <div
            key={request.id}
            className="flex flex-col gap-2 rounded-md border border-line px-3.5 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                  {request.assetName}
                  <span className="tabular text-meta font-normal text-muted">
                    {request.assetTag}
                  </span>
                  <Badge
                    tone={isOpen(request) ? "warning" : "neutral"}
                    size="sm"
                  >
                    {/* The API's wording, never a second copy of the seven. */}
                    {request.statusLabel}
                  </Badge>
                </p>
                <p className="mt-0.5 text-body-sm text-body">{request.fault}</p>
                <p className="mt-0.5 text-meta text-faint">
                  {request.raisedByName} · {dayLabel(request.raisedAt)}
                </p>
                {request.note && (
                  <p className="mt-1 text-body-sm text-muted">{request.note}</p>
                )}
              </div>
            </div>

            {/* Exactly what the server says this reader may do next. Empty for
                an employee, and empty on a finished request. */}
            {request.nextStatuses.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {request.nextStatuses.map((next) => (
                  <Button
                    key={next}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setMoving({ request, to: next })}
                  >
                    {ACTION_LABEL[next]}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardBody>

      {moving && (
        <MoveDialog
          request={moving.request}
          to={moving.to}
          onClose={() => setMoving(null)}
        />
      )}
    </Card>
  );
}

/**
 * What pressing the button will do, in the imperative.
 *
 * Distinct from `statusLabel`, which names a **state**: "In repair" is where it
 * will be, "Send it for repair" is what you are about to do. A button labelled
 * with a state reads as a filter.
 *
 * The states themselves still come from the server; this is only the verb, and
 * an unrecognised state falls back to the raw member rather than crashing — a
 * lifecycle that grows an eighth state should render an ugly button, not a
 * blank screen.
 */
const ACTION_LABEL: Record<RepairRequestStatus, string> = {
  REPORTED: "Put back to reported",
  UNDER_REVIEW: "Start looking at it",
  IN_REPAIR: "Send it for repair",
  REPAIR_COMPLETED: "Mark it repaired",
  RETURNED: "Give it back",
  CLOSED: "Close it",
  REJECTED: "Not a fault",
};

function MoveDialog({
  request,
  to,
  onClose,
}: {
  request: ApiRepairRequest;
  to: RepairRequestStatus;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { advance } = useRepairActions();
  const toast = useToast();

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await advance(request.id, {
        status: to,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.push({
        title: "Updated",
        tone: "success",
        detail: `${request.raisedByName} has been told.`,
      });
      onClose();
    } catch (caught) {
      /* The API's own refusal. It knows the lifecycle and names what it would
         accept instead; a sentence written here would be a guess at a rule
         held somewhere else. */
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
    <Modal
      open
      onClose={onClose}
      title={ACTION_LABEL[to]}
      description={`${request.assetName} — ${request.assetTag}. ${request.raisedByName} will be told, and will see this on their own record.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            onClick={() => void submit()}
          >
            {ACTION_LABEL[to]}
          </Button>
        </div>
      }
    >
      <Field
        label="Anything to tell them"
        {...(error ? { error } : {})}
        help="Optional, and it is the one place the two sides of this actually talk."
      >
        <Textarea
          value={note}
          rows={3}
          onChange={(event) => setNote(event.target.value)}
          placeholder="With the vendor — they think it is the display cable."
        />
      </Field>
    </Modal>
  );
}
