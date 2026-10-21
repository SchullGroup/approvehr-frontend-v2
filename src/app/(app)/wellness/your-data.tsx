"use client";

import { useState } from "react";
import { Eraser, Hand, Smartphone } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  FieldSet,
  Modal,
  Radio,
  RowActions,
  useToast,
  type RowActionItem,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { WellnessPurpose } from "@/lib/api/wellness";
import { useWellnessActions } from "@/lib/store/wellness";

/**
 * Walking away: stop tracking, stop syncing, delete what was logged.
 *
 * All three work with the module switched off, which is why this lives apart
 * from the screens that need it on. A company that turned Wellness off the day
 * somebody asked to be forgotten cannot leave their log standing behind a
 * refusal, so the off screen offers the same menu.
 *
 * ## Withdrawing asks, and does not guess
 *
 * Whether the log goes with the consent is the person's call, so the dialog has
 * two answers and neither is chosen for them. The API makes `erase` a required
 * field for the same reason: a client that forgot it would either destroy
 * somebody's history without asking or keep what they asked to be rid of.
 */

const failure = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : "Something went wrong. Try again.";

export function YourDataMenu({
  trackingOn,
  deviceSyncOn = false,
  onChanged,
}: {
  /** Leave it out when it is not known, as on the switched-off screen. */
  trackingOn?: boolean;
  /** Only offered while it is on: it is turned on from the phone app. */
  deviceSyncOn?: boolean;
  onChanged?: () => void;
}) {
  const actions = useWellnessActions();
  const toast = useToast();
  const [stopping, setStopping] = useState<WellnessPurpose | null>(null);
  const [erasing, setErasing] = useState(false);
  const [busy, setBusy] = useState(false);

  const items: RowActionItem[] = [
    ...(trackingOn !== false
      ? [
          {
            key: "stop-tracking",
            label: "Stop tracking",
            icon: <Hand aria-hidden="true" className="size-4" />,
            onSelect: () => setStopping("SELF_TRACKING"),
          },
        ]
      : []),
    ...(deviceSyncOn
      ? [
          {
            key: "stop-sync",
            label: "Stop syncing from my phone",
            icon: <Smartphone aria-hidden="true" className="size-4" />,
            onSelect: () => setStopping("DEVICE_SYNC"),
          },
        ]
      : []),
    {
      key: "erase",
      label: "Delete everything I logged",
      icon: <Eraser aria-hidden="true" className="size-4" />,
      tone: "danger" as const,
      onSelect: () => setErasing(true),
    },
  ];

  const erase = async () => {
    setBusy(true);
    try {
      const result = await actions.eraseLogs();
      toast.push({
        tone: "info",
        title:
          result.deleted === 0
            ? "There was nothing to delete"
            : `Deleted ${String(result.deleted)} ${result.deleted === 1 ? "entry" : "entries"}`,
      });
      setErasing(false);
      onChanged?.();
    } catch (error) {
      toast.push({
        tone: "warning",
        title: "That did not work",
        detail: failure(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <RowActions label="Your data" items={items} />
      {stopping && (
        <StopDialog
          purpose={stopping}
          onClose={() => setStopping(null)}
          onDone={() => {
            setStopping(null);
            onChanged?.();
          }}
        />
      )}
      <ConfirmDialog
        open={erasing}
        onClose={() => setErasing(false)}
        onConfirm={() => void erase()}
        loading={busy}
        title="Delete everything you logged?"
        body="Every water and steps entry goes, and it cannot be brought back. Your consent stays as it is."
        confirmLabel="Delete everything"
      />
    </>
  );
}

function StopDialog({
  purpose,
  onClose,
  onDone,
}: {
  purpose: WellnessPurpose;
  onClose: () => void;
  onDone: () => void;
}) {
  const actions = useWellnessActions();
  const toast = useToast();
  const [erase, setErase] = useState<"keep" | "erase" | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const tracking = purpose === "SELF_TRACKING";

  const submit = async () => {
    if (erase === null) return;
    setBusy(true);
    setProblem(null);
    try {
      await actions.withdrawConsent(purpose, erase === "erase");
      toast.push({
        tone: "info",
        title: tracking ? "Tracking is off" : "Syncing from your phone is off",
      });
      onDone();
    } catch (error) {
      setProblem(failure(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={tracking ? "Stop tracking" : "Stop syncing from your phone"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={erase === "erase" ? "danger" : "primary"}
            loading={busy}
            disabled={erase === null}
            onClick={() => void submit()}
          >
            {tracking ? "Stop tracking" : "Stop syncing"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FieldSet
          legend={
            tracking
              ? "What happens to what you logged"
              : "What happens to the totals sent from your phone"
          }
          {...(tracking
            ? {
                help: "Stopping also takes you out of every challenge you joined.",
              }
            : {})}
        >
          <Radio
            name="erase"
            label="Keep it"
            description="It stays, and only you can see it."
            checked={erase === "keep"}
            onChange={() => setErase("keep")}
          />
          <Radio
            name="erase"
            label="Delete it"
            description="It goes now and cannot be brought back."
            checked={erase === "erase"}
            onChange={() => setErase("erase")}
          />
        </FieldSet>
        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
