"use client";

import { useState } from "react";
import { FileSignature, Info, Send, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  EmptyState,
  Field,
  Input,
  Modal,
  SegmentedControl,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import { ExportButton } from "@/components/portal/export-button";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SendDialog } from "./send-dialog";
import { ApiError } from "@/lib/api/client";
import {
  SIGNATURE_KIND,
  SIGNING_WORDING,
  STATUS_LABELS,
  fingerprintHalves,
  signaturesApi,
  type ApiSignature,
  type ApiSignatureStatus,
} from "@/lib/api/signatures";
import {
  useMySignatures,
  useSignatureMutations,
  useSignatures,
} from "@/lib/store/signatures";
import { useCan } from "@/lib/permissions";

/**
 * Documents to sign, and documents sent for signature.
 *
 * ## The Sign button is rendered on `mine`, never on a permission
 *
 * `ApiSignature.mine` is the API's own answer to "is this the caller's to
 * sign", and it is the only thing that puts the button on screen. There is no
 * `useCan` here that could open it, because on the API there is no permission
 * that opens it either — an administrator holding the whole enum is refused,
 * and a signature somebody else applied is not a signature.
 *
 * ## The two roles, and why only one of them is a permission
 *
 * **Sending** needs `EDIT_RECORDS` — it puts a document in front of a named
 * member of staff over the company's name. **Signing** needs no permission and
 * cannot be granted one: the API refuses everybody but the named signer,
 * including an administrator holding the whole enum, because a signature
 * somebody else applied is not a signature.
 *
 * So the Send button is gated on a `useCan` and the Sign button never is.
 *
 * ## What was missing, and what it did to the module
 *
 * There was no way to send. `POST /signatures` was complete, `signaturesApi.send`
 * was written, `useSignatureMutations().send` was written, and **nothing called
 * it** — so nothing could ever be sent, so every tab here was permanently empty
 * for everybody. The feedback was the only thing it could have been: *"Why did
 * we add signatures? I can't find any flows for signature, it is just showing at
 * the side bar for both HR and Employee."* See `send-dialog.tsx`.
 *
 * ## The fingerprint is available, not ambient
 *
 * Somebody being asked to adopt a document needs to know it names the exact
 * bytes, so in the **Sign dialog** the fingerprint is prominent and unavoidable:
 * that is where the decision happens.
 *
 * On a **card in a list** it was two full-width monospace lines in every row —
 * so a queue of ten documents was twenty lines of hex, given more of the screen
 * than the ten titles. That is the reading of "the styling feels weird" that
 * held up: a verification detail with the visual weight of the subject. It is
 * behind a disclosure now, named, one press away, and still on the same screen.
 * `SIGNATURE_KIND` stays wherever a signature is explained.
 */

const TONE: Record<
  ApiSignatureStatus,
  "warning" | "success" | "danger" | "neutral"
> = {
  PENDING: "warning",
  SIGNED: "success",
  DECLINED: "danger",
  CANCELLED: "neutral",
};

/**
 * How many days late a pending document is, or null.
 *
 * Null for three different reasons and they all mean "do not say overdue":
 * there is no due date, it has not arrived, or the document is already settled.
 * A signed document with a due date in the past was not late — it was signed.
 *
 * Dates only, both sides. `dueDate` is a date with no time on it, so comparing
 * it against a timestamp makes a document due today read as overdue from one
 * minute past midnight, and the reader is looking at a calendar rather than a
 * clock.
 */
function overdueBy(record: ApiSignature): number | null {
  if (record.status !== "PENDING" || !record.dueDate) return null;
  const due = Date.parse(`${record.dueDate}T00:00:00Z`);
  if (Number.isNaN(due)) return null;
  const now = new Date();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const days = Math.round((today - due) / 86_400_000);
  return days >= 0 ? days : null;
}

export function SignaturesScreen() {
  const canManage = useCan("EDIT_RECORDS");
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const mine = useMySignatures();
  const all = useSignatures();
  const [signing, setSigning] = useState<ApiSignature | null>(null);
  const [sending, setSending] = useState(false);

  const read = tab === "mine" ? mine : all;

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/people", label: "People" }]}
        title="Signatures"
        /* Said on the screen, because the name does not say it — and the
           feedback on this module opened with "why did we add signatures".
           Two audiences, two sentences: somebody who can send needs to know
           what sending does, and somebody who cannot needs to know why a
           document is in front of them and that nobody can sign it for them. */
        description={
          canManage
            ? "Send a document to a member of staff and record that they adopted it — a contract, an offer letter, a policy. Only the person it was sent to can sign it: not their manager, and not you."
            : "Documents somebody has asked you to read and adopt as signed. Only you can sign the ones addressed to you, and what you sign is kept exactly as you saw it."
        }
        meta={
          <span className="inline-flex items-center gap-1 text-meta text-faint">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            Each one names the exact document by its fingerprint
          </span>
        }
        action={
          /* Absent without the permission rather than present and refusing —
             the API answers a send from anybody else with a 422 naming
             `EDIT_RECORDS`, and a button whose only outcome is that refusal is
             a design failure two clicks earlier. */
          canManage ? (
            <Button size="sm" variant="accent" onClick={() => setSending(true)}>
              <Send aria-hidden="true" className="size-4" />
              Send for signature
            </Button>
          ) : undefined
        }
        tabs={
          <SegmentedControl
            label="What to show"
            value={tab}
            onChange={(value) => setTab(value as "mine" | "all")}
            options={[
              { value: "mine", label: "Waiting on me" },
              {
                value: "all",
                label: canManage ? "Everything" : "Sent and signed",
              },
            ]}
          />
        }
      />
      <PageBody>
        {!read.available ? (
          <Callout tone="info" title="This needs the API">
            {read.refusal}
          </Callout>
        ) : read.error ? (
          <LoadFailure
            subject="signatures"
            error={read.error}
            onRetry={read.reload}
            /* This screen lists a whole module, so a 404 is the API not
             carrying it rather than a record somebody deleted — see
             `MissingMeans`. Exactly the case that made production look
             broken. */
            missingMeans="module"
          />
        ) : read.loading || !read.data ? (
          <Spinner label="Loading" />
        ) : read.data.length === 0 ? (
          <EmptyState
            title={
              tab === "mine"
                ? "Nothing is waiting on your signature"
                : "Nothing has been sent for signature yet"
            }
            description={
              tab === "mine"
                ? "When somebody sends you a document to sign, it appears here — and nobody else can sign it for you."
                : canManage
                  ? /* Points at the control rather than describing the
                       capability. The old copy said a contract "can be sent",
                       which was true and was not actionable, on a screen that
                       until now had no way to send one. */
                    "Use “Send for signature” above to put a contract, offer letter or policy in front of somebody."
                  : "Documents you send or are asked to sign will be listed here."
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {read.data.map((record) => (
              <SignatureCard
                key={record.id}
                record={record}
                onSign={() => setSigning(record)}
                onChanged={read.reload}
              />
            ))}
          </div>
        )}
      </PageBody>
      {signing && (
        <SignDialog
          record={signing}
          onClose={() => setSigning(null)}
          onDone={() => {
            setSigning(null);
            mine.reload();
            all.reload();
          }}
        />
      )}
      {sending && (
        <SendDialog
          onClose={() => setSending(false)}
          onSent={() => {
            setSending(false);
            /* Both, and then the tab moves. What was just sent is not waiting
               on the sender, so leaving them on "Waiting on me" would answer a
               successful send with an empty screen. */
            mine.reload();
            all.reload();
            setTab("all");
          }}
        />
      )}
    </>
  );
}

function SignatureCard({
  record,
  onSign,
  onChanged,
}: {
  record: ApiSignature;
  onSign: () => void;
  onChanged: () => void;
}) {
  const mutations = useSignatureMutations();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [first, second] = fingerprintHalves(record.documentSha256);
  const overdueDays = overdueBy(record);
  /* "due 2026-08-01" for something not yet late, and nothing at all for
     something settled: a due date on a document signed last month is noise,
     and on one taken back it is noise about a document that no longer
     exists. */
  const due =
    record.status === "PENDING" && record.dueDate && overdueDays === null
      ? `due ${record.dueDate}`
      : null;

  return (
    <Card>
      <CardHeader
        level={2}
        title={record.title}
        description={
          record.mine
            ? `Sent to you${due ? ` · ${due}` : ""}`
            : `For ${record.signerName}${due ? ` · ${due}` : ""}`
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Before the status badge, because it is the one thing on this
                card that asks for something today. A row reading "Waiting to
                be signed · due 2026-08-01" made the reader do the date
                arithmetic; nine of them made them do it nine times. */}
            {overdueDays !== null && (
              <Badge tone="danger" size="sm" dot>
                {overdueDays === 0
                  ? "Due today"
                  : `${String(overdueDays)} ${overdueDays === 1 ? "day" : "days"} overdue`}
              </Badge>
            )}
            <Badge tone={TONE[record.status]} size="sm" dot>
              {STATUS_LABELS[record.status]}
            </Badge>
          </div>
        }
      />
      <CardBody className="flex flex-col gap-4">
        {record.message && (
          <p className="text-body-sm text-body">{record.message}</p>
        )}

        {record.status === "SIGNED" && (
          <Callout
            tone="success"
            title={`Signed by ${record.signedName ?? ""}`}
            icon={<ShieldCheck aria-hidden="true" />}
          >
            <p>
              {record.signedAt
                ? `${record.signedAt.replace("T", " ").replace(/\.\d+Z$/, "")} UTC`
                : ""}
            </p>
            {/* The wording that person was actually shown, from the record —
                not today's copy of the constant. */}
            {record.agreedWording && (
              <p className="mt-1 text-meta">{record.agreedWording}</p>
            )}
          </Callout>
        )}

        {record.status === "DECLINED" && record.declineReason && (
          <Callout tone="danger" title="Declined">
            {record.declineReason}
          </Callout>
        )}

        {/* Named, one press away, on the same screen — see the file header for
            why it is no longer two monospace lines in every row. `dense`
            because this sits inside a list of cards rather than heading a
            section of one. */}
        <Disclosure
          dense
          title="Document fingerprint"
          hint="The SHA-256 of the exact bytes. What the signature is over, and how the certificate identifies it."
        >
          <p className="font-mono text-meta text-body">{first}</p>
          <p className="font-mono text-meta text-body">{second}</p>
        </Disclosure>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <ExportButton
            label="Read the document"
            download={() => signaturesApi.document(record.id, record.title)}
          />
          {record.status === "SIGNED" && (
            <ExportButton
              label="Certificate"
              download={() =>
                signaturesApi.certificate(
                  record.id,
                  `certificate-${record.title}`,
                )
              }
            />
          )}
          {/* The API's own answer to "is this yours", never a permission. */}
          {record.mine && record.status === "PENDING" && (
            <>
              <Button variant="accent" onClick={onSign}>
                <FileSignature aria-hidden="true" className="size-4" />
                Sign it
              </Button>
              <DeclineButton record={record} onChanged={onChanged} />
            </>
          )}
          {!record.mine && record.status === "PENDING" && (
            <Button
              variant="ghost"
              loading={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    await mutations.cancel(record.id);
                    toast.push({ tone: "success", title: "Taken back" });
                    onChanged();
                  } catch (error) {
                    toast.push({
                      tone: "danger",
                      title:
                        error instanceof ApiError
                          ? error.message
                          : "Could not take it back.",
                    });
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Take it back
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function DeclineButton({
  record,
  onChanged,
}: {
  record: ApiSignature;
  onChanged: () => void;
}) {
  const mutations = useSignatureMutations();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Decline
      </Button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Decline to sign"
          description="Whoever sent it sees your reason."
          footer={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                loading={busy}
                disabled={reason.trim() === ""}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    setFailure(null);
                    try {
                      await mutations.decline(record.id, reason);
                      toast.push({ tone: "success", title: "Declined" });
                      setOpen(false);
                      onChanged();
                    } catch (error) {
                      setFailure(
                        error instanceof ApiError
                          ? error.message
                          : "Something went wrong. Try again.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                Decline it
              </Button>
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <Field
              label="Why"
              help="Required — it is the only thing the sender gets."
            >
              <Textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            {failure && (
              <Callout tone="danger" title="That was refused">
                {failure}
              </Callout>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Sign it.
 *
 * The wording above the box is the wording the API stores on the record, so the
 * certificate and this screen cannot describe the same act differently. The
 * name must be theirs — the API refuses anything else and the message names
 * what to type.
 */
function SignDialog({
  record,
  onClose,
  onDone,
}: {
  record: ApiSignature;
  onClose: () => void;
  onDone: () => void;
}) {
  const mutations = useSignatureMutations();
  const toast = useToast();
  const [typedName, setTypedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [first, second] = fingerprintHalves(record.documentSha256);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Sign — ${record.title}`}
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="accent"
            loading={busy}
            disabled={typedName.trim() === ""}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setFailure(null);
                try {
                  await mutations.sign(record.id, typedName);
                  toast.push({ tone: "success", title: "Signed" });
                  onDone();
                } catch (error) {
                  setFailure(
                    error instanceof ApiError
                      ? error.message
                      : "Something went wrong. Try again.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <FileSignature aria-hidden="true" className="size-4" />
            Sign
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Callout
          tone="info"
          title="Read it first"
          icon={<Info aria-hidden="true" />}
        >
          Open the document before you sign. What you are signing is the exact
          file with this fingerprint:
          <span className="mt-1 block font-mono text-meta">{first}</span>
          <span className="block font-mono text-meta">{second}</span>
        </Callout>

        <ExportButton
          label="Read the document"
          download={() => signaturesApi.document(record.id, record.title)}
        />

        <p className="text-body-sm text-body">{SIGNING_WORDING}</p>

        <Field
          label="Type your full name"
          help={`As it appears on your record — ${record.signerName}.`}
        >
          <Input
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            placeholder={record.signerName}
          />
        </Field>

        <p className="text-meta text-faint">{SIGNATURE_KIND}</p>

        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
