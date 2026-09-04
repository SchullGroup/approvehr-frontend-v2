"use client";

import { KeyRound, TriangleAlert } from "lucide-react";
import { Button, Callout, Modal } from "@/components/ui";
import { CodeInline, CopyButton } from "@/app/(app)/settings/webhooks";
import {
  DEVICE_SECRET_EXPLANATION,
  type ApiDeviceSecret,
} from "@/lib/api/attendance";

/**
 * The one moment a device's signing secret is readable.
 *
 * ## Why this is a modal you have to dismiss
 *
 * The plaintext comes back from exactly two calls — registering and rotating —
 * and from no route ever again. A toast would be gone in six seconds with the
 * only copy of a credential in it. So it is a modal, the button says
 * "I have copied it", and the copy control is the primary thing on the panel.
 *
 * ## Monospace, and the same `CopyButton` the webhooks screen uses
 *
 * Imported rather than re-implemented: a person pastes this into an agent's
 * config and then compares it character by character when the agent is refused.
 * `settings/webhooks/code.tsx` makes that argument at length for a webhook
 * secret and every word of it applies here. A second copy would drift.
 *
 * ## Demo mode has no secret, and says so instead of inventing one
 *
 * `secret` comes back empty offline and `secretNote` carries the reason. A
 * `whsec_`-shaped string made up in a browser is indistinguishable from a real
 * credential and its only use would be to be handed to whoever installs the
 * agent — where it would sign deliveries nothing on earth would accept.
 */
export function SecretPanel({
  result,
  rotated,
  onClose,
}: {
  result: ApiDeviceSecret;
  /** Whether this replaced a working secret, which changes what has to be said. */
  rotated: boolean;
  onClose: () => void;
}) {
  const issued = result.secret !== "";

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={rotated ? `New secret for ${result.label}` : `${result.label} is registered`}
      description={
        issued
          ? "This is the only time it is shown."
          : undefined
      }
      footer={
        <div className="flex justify-end">
          <Button variant="accent" onClick={onClose}>
            {issued ? "I have copied it" : "Close"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {issued ? (
          <>
            <div className="flex flex-col gap-3 rounded-lg border border-line bg-sunken p-4">
              <span className="flex items-center gap-2 text-meta font-semibold text-muted">
                <KeyRound aria-hidden="true" className="size-3.5" />
                Signing secret
              </span>
              <CodeInline>{result.secret}</CodeInline>
              <CopyButton value={result.secret} label="Copy the secret" />
            </div>

            <Callout tone="warning" title="It is not shown again">
              {result.secretNote}
            </Callout>

            {rotated && (
              <p className="flex items-start gap-2 text-body-sm text-body">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-warning-text"
                />
                <span>
                  The old secret stopped working the moment this was issued —
                  there is no grace period, because a rotation is what you do
                  when one has leaked. Until the agent is updated its deliveries
                  are refused, and everything it buffers meanwhile arrives once
                  it is.
                </span>
              </p>
            )}

            <div className="flex flex-col gap-2 text-body-sm text-body">
              <p>
                <strong className="text-ink">What to do with it.</strong>{" "}
                {DEVICE_SECRET_EXPLANATION}
              </p>
              <p>
                <strong className="text-ink">And the serial number.</strong> The
                agent sends{" "}
                <CodeInline>{result.serialNumber}</CodeInline> alongside every
                delivery to say which machine it is. Both go into its config.
              </p>
            </div>
          </>
        ) : (
          /* Demo mode. Absent, with the reason — never a fabricated credential. */
          <Callout tone="info" title="No signing secret here">
            {result.secretNote}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
