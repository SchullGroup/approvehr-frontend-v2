"use client";

import { useState } from "react";
import { ArrowDownToLine, Ban, Send } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Modal,
  Textarea,
  formatMoney,
} from "@/components/ui";
import { naira, type ApiBatchDetail } from "@/lib/api/payments";
import { BATCH_STATUS } from "@/lib/store/payments";
import { people } from "../format";

/**
 * Approving, releasing, and stopping a batch.
 *
 * ## Bank transfers are not connected, and this screen has to be honest about it
 *
 * With no payment provider registered, **Release is disabled and says why in one
 * line**, and `Download payment file` is the primary action. The file endpoint
 * works today and is what customers actually use: download it, sign in to the
 * bank's corporate portal, upload it, authorise the batch there.
 *
 * A green "Paid" that moved no money is the worst thing this product could ship.
 * The audit of the incumbent found that class of failure, and it is why the API
 * answers `POST /submit` with a refusal rather than a `200` carrying
 * `submitted: false` — a client rendering that as success would put a tick on a
 * payment nobody made.
 *
 * ## Release names the amount, and takes two presses
 *
 * "Release ₦4,233,291.88 to 7 people", then a confirmation that repeats the
 * figure and the account it leaves. Never a bare "Submit": the whole point of
 * this screen is that nobody presses it without having read what it does.
 *
 * ## Approving and releasing are separate decisions
 *
 * They are separate permissions on the API and separate presses here. Approving
 * says the figures are right; releasing hands them to a bank. One signature for
 * both is how the wrong file goes out.
 */
export function ReleasePanel({
  batch,
  providerConnected,
  providerKnown,
  canApprove,
  onApprove,
  onRelease,
  onCancel,
  onDownload,
  busy,
}: {
  batch: ApiBatchDetail;
  providerConnected: boolean;
  /**
   * Whether we have been told yet.
   *
   * Until the summary lands, the release control is not rendered at all — a
   * disabled button with no reason beside it is as bad as an enabled one that
   * fails, and "not connected" is a claim worth waiting half a second to make
   * truthfully. The download is on screen throughout, and it is the action that
   * works.
   */
  providerKnown: boolean;
  /** Whether this reader holds `APPROVE_PAYROLL`. */
  canApprove: boolean;
  onApprove: () => Promise<void>;
  onRelease: () => Promise<void>;
  onCancel: (reason: string) => Promise<void>;
  onDownload: () => Promise<void>;
  busy: boolean;
}) {
  const [confirming, setConfirming] = useState<"approve" | "release" | null>(null);
  const [stopping, setStopping] = useState(false);

  const total = formatMoney(naira(batch.computedTotalKobo), "NGN", { decimals: true });
  const headcount = people(batch.itemCount);
  const status = BATCH_STATUS[batch.status];

  const blockers = batch.check.discrepancies.filter((d) => d.severity === "BLOCKER");

  return (
    <>
      <Card>
        <CardHeader
          level={2}
          title={
            batch.can.approve
              ? "Approve this batch"
              : batch.can.submit
                ? "Pay these people"
                : status.label
          }
          description={
            batch.can.approve
              ? "Nothing leaves the account until somebody approves it."
              : batch.can.submit
                ? undefined
                : status.hint
          }
        />

        <CardBody className="flex flex-col gap-4">
          {/* Waiting on the check. A refusal with the count in it, and the
              button that clears it is in the check card above. */}
          {batch.can.approve && blockers.length > 0 && (
            <p className="text-sm text-body">
              {blockers.length === 1
                ? "One problem above has to be fixed first."
                : `${blockers.length} problems above have to be fixed first.`}
            </p>
          )}

          {batch.can.approve && blockers.length === 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {canApprove ? (
                <Button
                  variant="approve"
                  disabled={busy}
                  onClick={() => setConfirming("approve")}
                >
                  Approve {total} for {headcount}
                </Button>
              ) : (
                <p className="text-sm text-body">
                  Somebody who can approve payments has to sign this off. It is
                  waiting for them.
                </p>
              )}
            </div>
          )}

          {batch.can.submit && (
            <div className="flex flex-col gap-3">
              {/* The primary action, because it is the one that works. */}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="accent"
                  loading={busy}
                  onClick={() => void onDownload()}
                >
                  <ArrowDownToLine aria-hidden="true" className="size-4" />
                  Download payment file
                </Button>
                <span className="text-[0.875rem] text-muted">
                  {batch.itemCount} rows · {total}
                </span>
              </div>

              {providerKnown && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    disabled={!providerConnected || !canApprove || busy}
                    onClick={() => setConfirming("release")}
                  >
                    <Send aria-hidden="true" className="size-4" />
                    Release {total} to {headcount}
                  </Button>
                  {!providerConnected && (
                    <p className="max-w-md text-[0.875rem] text-muted">
                      Bank transfers are not connected yet. Download the payment
                      file and upload it to your bank.
                    </p>
                  )}
                  {providerConnected && !canApprove && (
                    <p className="max-w-md text-[0.875rem] text-muted">
                      Only somebody who can approve payments can release money.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {!batch.can.approve && !batch.can.submit && batch.can.downloadFile && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" loading={busy} onClick={() => void onDownload()}>
                <ArrowDownToLine aria-hidden="true" className="size-4" />
                Download payment file
              </Button>
            </div>
          )}

          {batch.can.cancel && canApprove && (
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Button variant="ghost" size="sm" onClick={() => setStopping(true)}>
                <Ban aria-hidden="true" className="size-3.5" />
                Stop this batch
              </Button>
              <span className="text-[0.875rem] text-muted">
                Nothing goes out and the run can be paid from a new batch.
              </span>
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirming === "approve"}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          void onApprove();
        }}
        title={`Approve ${total}?`}
        confirmLabel={`Approve ${total}`}
        tone="primary"
        loading={busy}
        body={
          <span className="flex flex-col gap-2">
            <span>
              {headcount} will be paid from {batch.sourceBankName}{" "}
              {batch.sourceAccountMasked}.
            </span>
            <span>
              Your name goes on this approval. No money moves — the payment file
              is the next step.
            </span>
          </span>
        }
      />

      {/* Step two of two. The figure and the account are repeated here on
          purpose: the first press is a decision, this one is a signature. */}
      <ConfirmDialog
        open={confirming === "release"}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          void onRelease();
        }}
        title={`Release ${total} to ${headcount}?`}
        confirmLabel={`Release ${total}`}
        tone="primary"
        loading={busy}
        body={
          <span className="flex flex-col gap-2">
            <span>
              Leaving {batch.sourceBankName} {batch.sourceAccountMasked}, reference{" "}
              {batch.reference}.
            </span>
            <span>This cannot be undone once a bank has taken it.</span>
          </span>
        }
      />

      {stopping && (
        <StopDialog
          reference={batch.reference}
          busy={busy}
          onClose={() => setStopping(false)}
          onStop={async (reason) => {
            await onCancel(reason);
            setStopping(false);
          }}
        />
      )}
    </>
  );
}

/**
 * Stopping a batch, with the reason recorded.
 *
 * The reason is asked for rather than optional-in-practice because next month
 * somebody will want to know why a batch stopped, and "cancelled" with nothing
 * against it is a support call.
 */
function StopDialog({
  reference,
  busy,
  onClose,
  onStop,
}: {
  reference: string;
  busy: boolean;
  onClose: () => void;
  onStop: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");

  return (
    <Modal
      open
      onClose={onClose}
      title={`Stop ${reference}?`}
      description="Nothing goes out. Build a new batch when the records are fixed."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            disabled={reason.trim().length < 3 || busy}
            loading={busy}
            onClick={() => void onStop(reason.trim())}
          >
            Stop this batch
          </Button>
        </div>
      }
    >
      <Field label="Why are you stopping it?" required>
        <Textarea
          rows={3}
          value={reason}
          autoFocus
          placeholder="Two people have the wrong account number"
          onChange={(e) => {
            const value = e.target.value;
            setReason(value);
          }}
        />
      </Field>
    </Modal>
  );
}
