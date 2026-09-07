"use client";

import { useState } from "react";
import { FileSignature, Info, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
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
 * ## The fingerprint is on screen, not buried
 *
 * Somebody is being asked to adopt a document. What makes that record mean
 * anything later is that it names the exact bytes, so the fingerprint is beside
 * the document rather than in a detail panel — and `SIGNATURE_KIND` says in as
 * many words that this is not a cryptographic digital signature.
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

export function SignaturesScreen() {
  const canManage = useCan("EDIT_RECORDS");
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const mine = useMySignatures();
  const all = useSignatures();
  const [signing, setSigning] = useState<ApiSignature | null>(null);

  const read = tab === "mine" ? mine : all;

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/people", label: "People" }]}
        title="Signatures"
        meta={
          <span className="inline-flex items-center gap-1 text-meta text-faint">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            Each one names the exact document by its fingerprint
          </span>
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
                ? "When somebody sends you a document to sign, it appears here."
                : "A contract, an offer letter or a policy can be sent to somebody to sign."
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

  return (
    <Card>
      <CardHeader
        level={2}
        title={record.title}
        description={
          record.mine
            ? `Sent to you${record.dueDate ? ` · due ${record.dueDate}` : ""}`
            : `For ${record.signerName}${record.dueDate ? ` · due ${record.dueDate}` : ""}`
        }
        action={
          <Badge tone={TONE[record.status]} size="sm" dot>
            {STATUS_LABELS[record.status]}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-4">
        {record.message && (
          <p className="text-body-sm text-body">{record.message}</p>
        )}

        <div className="flex flex-col gap-1">
          <p className="text-meta text-faint">Document fingerprint (SHA-256)</p>
          {/* On screen rather than in a panel: it is what makes the record mean
              anything later, and the certificate splits it the same way. */}
          <p className="font-mono text-meta text-body">{first}</p>
          <p className="font-mono text-meta text-body">{second}</p>
        </div>

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
