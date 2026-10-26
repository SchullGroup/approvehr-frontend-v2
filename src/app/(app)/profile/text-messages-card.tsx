"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  DescriptionList,
  Field,
  Input,
  LoadState,
  Modal,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { smsApi, type ApiSmsMe } from "@/lib/api/sms";
import { isMissingModule, useMySms } from "@/lib/store/sms";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";
import { useAction } from "@/lib/use-action";

/**
 * The employee's own door to the weekly text, on their profile.
 *
 * ## What it must keep true
 *
 * - **Nobody is texted unless they say so.** The only way to be opted in from here
 *   is the dialog, with the wording in full beside an unticked box and a number the
 *   person has seen. The API refuses the request without the tick, so the button
 *   is off until there is one.
 * - **Opting out is one press.** No confirmation, no reason asked: a stop that
 *   takes two steps is a stop somebody gives up on. It is never refused, with the
 *   company's switch off or with no provider.
 * - **It says plainly when nothing can be sent.** The sentence under the title is
 *   the API's own (`note`), worded for the case: no provider connected, a number
 *   that said STOP, no way to stop a message. It is shown whole and not behind a
 *   tooltip, because "you are on" beside a text that cannot arrive is the failure
 *   this card exists to avoid.
 *
 * ## When it is not there
 *
 * Absent when the company has not switched the digest on and the person is not
 * already opted in: offering a choice that does nothing is clutter. A person who
 * *is* opted in keeps the card when the switch goes off, because opting out must
 * always be reachable. Absent offline and on an API without the routes, where a
 * missing route is a deployment that has not got the feature and not a failure to
 * report on somebody's own profile.
 *
 * ## The wording version
 *
 * `GET /sms/me` sends the current version of the wording and not the one a person
 * agreed to, so the card labels it as the wording and does not say "you agreed to
 * 2026-10-v1". See the API gaps in the handover note.
 */

const STATE_LABEL: Record<ApiSmsMe["state"], string> = {
  NOT_SUBSCRIBED: "Off",
  OPTED_IN: "On",
  OPTED_OUT: "Opted out",
};

export function TextMessagesCard({ phone }: { phone: string | null }) {
  const sms = useMySms();
  const timeZone = useOrgTimezone();
  const toast = useToast();
  const { run, pending } = useAction();
  const [opting, setOpting] = useState(false);

  if (!sms.connected || isMissingModule(sms.error)) return null;
  /* Nothing is said while the first read is on its way: for most companies the
     answer is "not switched on", and a card that appears and then leaves is worse
     than one that arrives late. */
  if (sms.loading) return null;

  const me = sms.data;
  if (me && !me.enabledForOrganisation && me.state !== "OPTED_IN") return null;

  const optedIn = me?.state === "OPTED_IN";

  return (
    <Card>
      <CardHeader
        title="Text messages"
        level={3}
        action={
          me && (
            <Badge tone={optedIn ? "accent" : "neutral"} size="sm">
              {STATE_LABEL[me.state]}
            </Badge>
          )
        }
      />
      <CardBody className="flex flex-col gap-4">
        <LoadState
          loading={false}
          error={sms.error}
          subject="your text message settings"
          onRetry={sms.reload}
        >
          {me && (
            <>
              <p
                className={
                  optedIn && !me.canReceive
                    ? "text-body-sm text-warning-text"
                    : "text-body-sm text-body"
                }
              >
                {me.note}
              </p>

              {me.state !== "NOT_SUBSCRIBED" && (
                <DescriptionList
                  layout="rows"
                  items={[
                    ...(me.phoneMasked
                      ? [{ term: "Number", value: me.phoneMasked }]
                      : []),
                    ...(optedIn && me.optedInAt
                      ? [
                          {
                            term: "Opted in",
                            value: formatDateShort(me.optedInAt, timeZone),
                          },
                        ]
                      : []),
                    { term: "Wording version", value: me.consent.version },
                  ]}
                />
              )}

              <div className="flex flex-wrap gap-2">
                {optedIn ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={pending}
                    onClick={() =>
                      void run(() => smsApi.optOut(), {
                        success: "You will not get any more text messages",
                        subject: "your opt-out",
                        onDone: sms.reload,
                      })
                    }
                  >
                    Opt out
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="accent"
                    disabled={me.numberStopped}
                    onClick={() => setOpting(true)}
                  >
                    Opt in
                  </Button>
                )}
              </div>

              {opting && (
                <OptInDialog
                  me={me}
                  phone={phone}
                  onClose={() => setOpting(false)}
                  onDone={(result) => {
                    setOpting(false);
                    sms.reload();
                    toast.push({
                      tone: result.confirmationQueued ? "success" : "warning",
                      title: result.changed ? "You are opted in" : "Already on",
                      detail: result.note,
                    });
                  }}
                />
              )}
            </>
          )}
        </LoadState>
      </CardBody>
    </Card>
  );
}

/**
 * Opting in: the number, the wording, and a tick.
 *
 * The number starts as the one on the person's record and is theirs to correct:
 * the number consented to is the number texted, and a number somebody else typed
 * is not one they agreed to. The wording is the API's, word for word, as the
 * label of the box, so what is ticked is what is shown.
 *
 * A refusal is shown in the dialog, in the API's own sentence, because every one
 * of them has something to do: a number that is not a Nigerian mobile, one that
 * said STOP, wording that changed while this was open.
 */
function OptInDialog({
  me,
  phone,
  onClose,
  onDone,
}: {
  me: ApiSmsMe;
  phone: string | null;
  onClose: () => void;
  onDone: (result: Awaited<ReturnType<typeof smsApi.optIn>>) => void;
}) {
  const [number, setNumber] = useState(phone ?? "");
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const entered = number.trim();

  async function submit() {
    if (!ticked || entered === "") return;
    setBusy(true);
    setProblem(null);
    try {
      onDone(
        await smsApi.optIn({
          phone: entered,
          textVersion: me.consent.version,
          acknowledged: true,
        }),
      );
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? (error.messageFor("phone") ?? error.message)
          : "Something went wrong. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Get the weekly text"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={!ticked || entered === ""}
            onClick={() => void submit()}
          >
            Opt in
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Your mobile number"
          help="A Nigerian mobile number, like 0803 123 4567. This is the number the text goes to."
          {...(problem ? { error: problem } : {})}
        >
          <Input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={number}
            onChange={(event) => setNumber(event.currentTarget.value)}
          />
        </Field>

        <Checkbox
          checked={ticked}
          onChange={(event) => setTicked(event.currentTarget.checked)}
          label={me.consent.text}
        />

        <p className="text-body-sm text-muted">
          Texts only go out once your company has a text provider connected.
        </p>
      </div>
    </Modal>
  );
}
