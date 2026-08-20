"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
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
import { ApiError } from "@/lib/api/client";
import {
  crossesMidnight,
  shortDay,
  spokenDay,
  timesLabel,
  type ApiSwap,
} from "@/lib/api/shifts";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import {
  SWAP_STATUS_LABEL,
  SWAP_STATUS_TONE,
  swapAsk,
  useShiftMutations,
  useSwaps,
} from "@/lib/store/shifts";

type Filter = "open" | "all";

/**
 * Cover requests, and the two answers each one needs.
 *
 * ## The two-step approval is the point, not friction
 *
 * A swap moves two people's working week, so two people have to say yes: the
 * colleague being asked, and somebody who can edit the rota. The order matters
 * and is enforced by the API — approval is refused until the colleague has
 * agreed, and **a manager cannot agree on their behalf even with permission to
 * edit records.** A shift somebody never agreed to work is a rota written for
 * them by somebody else.
 *
 * So a row shows at most the buttons the person reading it can actually press.
 * The colleague sees Agree and Turn down; the manager sees Approve once it has
 * been agreed; the person who asked sees Withdraw. Nobody sees a greyed control
 * with a tooltip explaining why they cannot use it.
 *
 * ## What the list holds
 *
 * Scoping is the API's. Without permission to edit records you are shown only
 * swaps you asked or were asked; with it, all of them. That is why there is no
 * "only mine" switch here for staff — it would be the only option.
 */
export function SwapPanel({
  onChanged,
  className,
}: {
  /** Called after anything that moves the rota, so the grid can reload. */
  onChanged?: () => void;
  className?: string;
}) {
  const toast = useToast();
  const { employeeId } = useSession();
  const canEdit = useCan("EDIT_RECORDS");
  const [filter, setFilter] = useState<Filter>("open");
  /**
   * Two requests, by status, rather than one unfiltered list filtered here.
   *
   * "Open" is genuinely two statuses — waiting on the colleague and waiting on a
   * manager — and a person answering them wants both. Reading everything and
   * filtering in the browser looks cheaper and is wrong at the size that
   * matters: the list is paged, so a company with two hundred settled swaps
   * would push the three open ones off page one, which is the exact case this
   * panel exists for. The ACCEPTED request is unconditional so the two calls are
   * never the same query twice.
   */
  const { swaps, loading, error, reload } = useSwaps(
    filter === "open" ? { status: "PENDING" } : {},
  );
  const accepted = useSwaps({ status: "ACCEPTED" });
  const { acceptSwap, approveSwap, declineSwap, cancelSwap } =
    useShiftMutations();

  const [declining, setDeclining] = useState<ApiSwap | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /* "Open" is two statuses — waiting on the colleague and waiting on a manager —
     and a person answering them wants both in one list, newest first. */
  const rows =
    filter === "open"
      ? [...swaps, ...accepted.swaps].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        )
      : swaps;

  const run = async (id: string, action: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try {
      await action();
      toast.push({ title: done, tone: "success" });
      reload();
      accepted.reload();
      onChanged?.();
    } catch (caught) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card className={className}>
        <CardHeader
          title="Cover requests"
          description="Somebody asking a colleague to take a shift."
          level={3}
          action={
            <SegmentedControl<Filter>
              label="Which requests to show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "open", label: "Open" },
                { value: "all", label: "All" },
              ]}
            />
          }
        />

        {error ? (
          <CardBody>
            <p className="text-[0.875rem] text-ink">{error.message}</p>
          </CardBody>
        ) : loading || accepted.loading ? (
          <CardBody>
            <span className="flex items-center gap-2 text-[0.875rem] text-muted">
              <Spinner size="sm" />
              Loading
            </span>
          </CardBody>
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            icon={<ArrowLeftRight aria-hidden="true" />}
            title={filter === "open" ? "Nothing waiting" : "No requests yet"}
            description={
              filter === "open"
                ? "Nobody has asked to be covered."
                : "Cover requests will show here."
            }
          />
        ) : (
          <CardBody className="flex flex-col gap-2.5">
            {rows.map((swap) => {
              const isCounterparty =
                employeeId !== null &&
                swap.counterparty.employeeId === employeeId;
              const isRequester =
                employeeId !== null &&
                swap.requester?.employeeId === employeeId;
              const working = busy === swap.id;

              return (
                <div
                  key={swap.id}
                  className="flex flex-wrap items-start gap-3 rounded-md border border-line bg-surface px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.875rem] font-medium text-ink">
                      {swap.requester?.name ?? "Somebody"} → {swap.counterparty.name}
                    </p>
                    <p className="mt-0.5 text-[0.875rem] text-body">
                      {swapAsk(swap)}
                    </p>
                    {swap.requesterShift && (
                      <p className="tabular mt-0.5 text-[0.75rem] text-muted">
                        {spokenDay(swap.requesterShift.date)} ·{" "}
                        {/* `ApiSwapSide` carries the times and not the flag. */}
                        {timesLabel({
                          ...swap.requesterShift,
                          crossesMidnight: crossesMidnight(
                            swap.requesterShift.startTime,
                            swap.requesterShift.endTime,
                          ),
                        })}
                      </p>
                    )}
                    {swap.reason && (
                      <p className="mt-1 text-[0.875rem] italic text-muted">
                        “{swap.reason}”
                      </p>
                    )}
                    {swap.declinedReason && (
                      <p className="mt-1 text-[0.875rem] text-ink">
                        {swap.declinedReason}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge tone={SWAP_STATUS_TONE[swap.status]} size="sm">
                      {SWAP_STATUS_LABEL[swap.status]}
                    </Badge>

                    {swap.status === "PENDING" && isCounterparty && (
                      <>
                        <Button
                          variant="approve"
                          size="sm"
                          loading={working}
                          onClick={() =>
                            void run(
                              swap.id,
                              () => acceptSwap(swap.id),
                              "Agreed. Your manager can approve it now.",
                            )
                          }
                        >
                          Agree
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setDeclining(swap)}
                          disabled={working}
                        >
                          Turn down
                        </Button>
                      </>
                    )}

                    {swap.status === "ACCEPTED" && canEdit && (
                      <>
                        <Button
                          variant="approve"
                          size="sm"
                          loading={working}
                          onClick={() =>
                            void run(
                              swap.id,
                              () => approveSwap(swap.id),
                              "Rota updated for both of them.",
                            )
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setDeclining(swap)}
                          disabled={working}
                        >
                          Turn down
                        </Button>
                      </>
                    )}

                    {(swap.status === "PENDING" || swap.status === "ACCEPTED") &&
                      (isRequester || canEdit) &&
                      !isCounterparty && (
                        <Button
                          size="sm"
                          loading={working}
                          onClick={() =>
                            void run(
                              swap.id,
                              () => cancelSwap(swap.id),
                              "Withdrawn.",
                            )
                          }
                        >
                          Withdraw
                        </Button>
                      )}
                  </div>
                </div>
              );
            })}
          </CardBody>
        )}
      </Card>

      <DeclineSwapModal
        swap={declining}
        onClose={() => setDeclining(null)}
        onDecline={async (reason) => {
          if (!declining) return;
          const target = declining;
          setDeclining(null);
          await run(
            target.id,
            () => declineSwap(target.id, reason),
            "Turned down. They have been told why.",
          );
        }}
      />
    </>
  );
}

/**
 * Turning a swap down.
 *
 * The reason is required, and the API enforces a minimum of three characters.
 * "Declined" with nothing attached is the message that generates a phone call
 * asking why — so the field that avoids the phone call is not optional.
 */
export function DeclineSwapModal({
  swap,
  onClose,
  onDecline,
}: {
  swap: ApiSwap | null;
  onClose: () => void;
  onDecline: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await onDecline(reason.trim());
      setReason("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={swap !== null}
      onClose={onClose}
      title="Turn this down"
      description={
        swap?.requesterShift
          ? `${swap.requester?.name ?? "Somebody"} · ${swap.requesterShift.shiftName}, ${shortDay(swap.requesterShift.date)}`
          : undefined
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Keep it open
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={busy}
            disabled={reason.trim().length < 3}
          >
            Turn down
          </Button>
        </>
      }
    >
      <Field label="Why" help="They will see this." required>
        <Textarea
          rows={3}
          maxLength={300}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="I am on the early that morning."
        />
      </Field>
    </Modal>
  );
}
