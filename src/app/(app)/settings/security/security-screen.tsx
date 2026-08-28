"use client";

import { useEffect, useState } from "react";
import { Copy, ShieldCheck, ShieldOff } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  Modal,
  Spinner,
  Switch,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { auth } from "@/lib/api/endpoints";
import { STEP_UP_ACTIONS, type StepUpAction } from "@/lib/api/setup";
import { useCan } from "@/lib/permissions";
import { useFeatureSettings } from "@/lib/store/features";
import { useSession } from "@/lib/store/session";

/**
 * Two-factor: the company's switch, and this person's own.
 *
 * ## Two switches, and the screen says why
 *
 * The company decides whether anybody is **asked**. Each person decides whether
 * they have anything to be asked for. Both have to be true before a sign-in is
 * challenged — which is what makes the company switch safe to turn on before
 * everybody has enrolled. A single org-level flag would lock out every employee
 * who had not set themselves up yet, and on a payroll product that is a company
 * that cannot pay anybody.
 *
 * Both are off by default. A five-person shop signing in from one office does
 * not need a code to look at a payslip, and a security control nobody chose is
 * one they turn off the first time it is inconvenient — which teaches them to
 * turn the next one off too.
 *
 * ## The recovery codes are shown once and the screen behaves like it
 *
 * They come back from the enrol call and are never retrievable again. So the
 * dialog cannot be dismissed by clicking away, the acknowledgement is a real
 * checkbox rather than a Close button, and the copy says plainly that this is
 * the only time they will be visible.
 *
 * That is not ceremony. On a deployment with **no mail transport** the emailed
 * code never arrives, and these ten strings are the only way into the account.
 * `emailWorks` is read from the API precisely so this screen can say that
 * before somebody commits to it rather than after.
 */

const ACTION_COPY: Record<StepUpAction, { label: string; line: string }> = {
  PAYROLL_APPROVE: {
    label: "Approving a payroll",
    line: "The one-way door that releases money. A code is asked for once per payroll, not once per click.",
  },
  PAYMENT_SUBMIT: {
    label: "Sending a payment batch",
    line: "Where money actually leaves the account.",
  },
  ROLE_CHANGE: {
    label: "Changing who can do what",
    line: "Creating a role, changing its permissions, or putting somebody into one. Somebody granting themselves payroll approval is how a fraud usually starts.",
  },
  BANK_DETAILS: {
    label: "Changing bank details",
    line: "Adding or editing an account money is paid from. A classic redirection fraud.",
  },
};

export function SecurityScreen() {
  const { isConnected } = useSession();
  const canManage = useCan("MANAGE_SETTINGS");
  /* The settings hook, not the read-only one: this screen writes. It also
     carries `editable`, which is `MANAGE_SETTINGS` on the connected path. */
  const features = useFeatureSettings();
  const toast = useToast();

  const [status, setStatus] = useState<{
    enabled: boolean;
    recoveryCodesLeft: number;
    emailWorks: boolean;
  } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await auth.twoFactorStatus();
        if (!cancelled) setStatus(result);
      } catch {
        /* Nothing here is worth a banner: the page still explains the feature,
           and the enrol button reports its own failure if pressed. */
        if (!cancelled) setStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, revision]);

  if (!isConnected) {
    return (
      <>
        <PageHeader title="Sign-in security" />
        <PageBody>
          {/* Worded for what is true in a production build, where there is no
              demo mode — the server simply cannot be reached. `verify-demo`
              catches the other wording, correctly: it would have shipped a
              sentence about a mode that does not exist. */}
          <Callout tone="neutral" title="Cannot reach the server">
            Two-factor protects a real account against a real sign-in, so there
            is nothing to set up until this page can reach the server.
          </Callout>
        </PageBody>
      </>
    );
  }

  const enrol = async () => {
    setBusy(true);
    try {
      const result = await auth.enrolTwoFactor();
      /* Held in state and rendered immediately. There is no second chance to
         fetch these — the API stores only their hashes. */
      setCodes(result.recoveryCodes);
      setRevision((n) => n + 1);
    } catch (caught) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          caught instanceof ApiError ? caught.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await auth.disableTwoFactor();
      setDisabling(false);
      setRevision((n) => n + 1);
      toast.push({ title: "Two-factor is off", tone: "success" });
    } catch (caught) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          caught instanceof ApiError ? caught.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  };

  const setActions = async (next: StepUpAction[]) => {
    try {
      await features.setStepUpActions(next);
    } catch (caught) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          caught instanceof ApiError ? caught.message : "Try again in a moment.",
      });
    }
  };

  return (
    <>
      <PageHeader title="Sign-in security" />

      <PageBody className="flex flex-col gap-6">
        {/* ---- The person's own ------------------------------------------ */}
        <Card>
          <CardHeader
            title="Your account"
            description="A six-digit code from your email, on top of your password."
            action={
              status?.enabled ? (
                <Badge tone="success" size="sm" icon={<ShieldCheck aria-hidden="true" />}>
                  On
                </Badge>
              ) : (
                <Badge tone="neutral" size="sm" icon={<ShieldOff aria-hidden="true" />}>
                  Off
                </Badge>
              )
            }
          />
          <CardBody className="flex flex-col gap-4">
            {status === null ? (
              <span className="flex items-center gap-2 text-body-sm text-muted">
                <Spinner size="sm" />
                Loading
              </span>
            ) : status.enabled ? (
              <>
                <p className="text-body-sm text-body">
                  You will be asked for a code when you sign in.{" "}
                  <strong>{status.recoveryCodesLeft}</strong> of your ten
                  recovery codes {status.recoveryCodesLeft === 1 ? "is" : "are"}{" "}
                  still unused.
                </p>
                {status.recoveryCodesLeft <= 2 && (
                  <Callout tone="warning" title="You are low on recovery codes">
                    Turn two-factor off and on again to get a fresh set of ten.
                    Doing that stops the old ones working.
                  </Callout>
                )}
                <div>
                  <Button variant="secondary" onClick={() => setDisabling(true)}>
                    Turn it off
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* Said before they commit, not after. On a server with no mail
                    transport the recovery codes are not a fallback — they are
                    the only way in, and somebody who closes that dialog without
                    saving them is locked out. */}
                {!status.emailWorks && (
                  <Callout tone="warning" title="This server cannot send email">
                    Codes will not arrive in your inbox. The ten recovery codes
                    you are about to be shown would be your <strong>only</strong>{" "}
                    way to sign in — save them somewhere safe before you close
                    that dialog.
                  </Callout>
                )}
                <p className="text-body-sm text-body">
                  Turning this on gives you ten recovery codes. They are shown
                  once and cannot be looked up again.
                </p>
                <div>
                  <Button variant="accent" loading={busy} onClick={() => void enrol()}>
                    Turn on two-factor
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        {/* ---- The company's ---------------------------------------------- */}
        {canManage && (
          <Card>
            <CardHeader
              title="For everybody"
              description="Whether this company asks for a code at all. Off by default."
            />
            <CardBody className="flex flex-col gap-4">
              <Switch
                label="Ask for a code at sign-in"
                description="Only affects people who have set two-factor up on their own account. Anybody who has not is unaffected, so turning this on cannot lock anybody out."
                checked={features.flags.twoFactor}
                disabled={features.loading || !features.editable}
                onChange={(event) => {
                  void features.setFeature("twoFactor", event.target.checked);
                }}
              />

              {/* Absent rather than disabled while the switch is off — a list of
                  greyed-out actions invites somebody to tick them and wonder
                  why nothing happens. */}
              {features.flags.twoFactor && (
                <div className="flex flex-col gap-3 border-t border-line pt-4">
                  <span>
                    <span className="block text-body-sm font-medium text-ink">
                      Actions that also need a code
                    </span>
                    <span className="mt-0.5 block text-meta text-muted">
                      None of these is required. Sign-in alone is a reasonable
                      choice — every one you add is a code somebody types under
                      time pressure.
                    </span>
                  </span>

                  {STEP_UP_ACTIONS.map((action) => (
                    <Checkbox
                      key={action}
                      label={ACTION_COPY[action].label}
                      description={ACTION_COPY[action].line}
                      checked={features.stepUpActions.includes(action)}
                      onChange={(event) => {
                        /* Whole-set, because the API takes the whole set — a
                           removal cannot be expressed as a patch. */
                        void setActions(
                          event.target.checked
                            ? [...features.stepUpActions, action]
                            : features.stepUpActions.filter(
                                (existing: StepUpAction) => existing !== action,
                              ),
                        );
                      }}
                    />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        )}
      </PageBody>

      {codes && (
        <RecoveryCodesDialog codes={codes} onDone={() => setCodes(null)} />
      )}

      {disabling && (
        <ConfirmDialog
          open
          onClose={() => setDisabling(false)}
          onConfirm={() => void disable()}
          title="Turn two-factor off?"
          confirmLabel="Turn it off"
          tone="danger"
          loading={busy}
          body="Your remaining recovery codes are destroyed. You will sign in with your password alone."
        />
      )}
    </>
  );
}

/**
 * The one time these are ever visible.
 *
 * No close button in the corner and no click-away: the only way out is the
 * acknowledgement, because the alternative is somebody dismissing this by
 * reflex and losing the only way into their account. That is a deliberate
 * exception to how every other dialog in this product behaves, and the reason
 * is that every other dialog can be reopened.
 */
function RecoveryCodesDialog({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [saved, setSaved] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.push({ title: "Copied", tone: "success" });
    } catch {
      toast.push({
        title: "Could not reach the clipboard",
        tone: "info",
        detail: "Select the codes and copy them by hand.",
      });
    }
  };

  return (
    <Modal
      open
      /* Deliberately a no-op. See the header — dismissing this by reflex is the
         failure the whole dialog exists to prevent. */
      onClose={() => undefined}
      title="Save these recovery codes"
      size="sm"
      footer={
        <Button variant="accent" disabled={!saved} onClick={onDone}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-body">
          Each one works once, in place of the emailed code. This is the only
          time they are shown — they are stored scrambled and cannot be looked
          up again.
        </p>

        <ul className="grid grid-cols-2 gap-1.5 rounded-md border border-line bg-canvas p-3">
          {codes.map((code) => (
            <li key={code} className="font-mono text-body-sm text-ink">
              {code}
            </li>
          ))}
        </ul>

        <div>
          <Button variant="secondary" size="sm" onClick={() => void copy()}>
            <Copy aria-hidden="true" className="size-3.5" />
            Copy all ten
          </Button>
        </div>

        <Checkbox
          label="I have saved these somewhere safe"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
        />
      </div>
    </Modal>
  );
}
