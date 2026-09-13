"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileSignature, FileText, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Spinner,
  useToast,
} from "@/components/ui";
import { ExportButton } from "@/components/portal/export-button";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import type { ApiDocument, ApiDocumentRequest } from "@/lib/api/documents";
import {
  STATUS_LABELS,
  signaturesApi,
  type ApiSignature,
} from "@/lib/api/signatures";
import { useEmployeeFile } from "@/lib/store/documents";
import { useSignatures } from "@/lib/store/signatures";
import { TONE, overdueBy } from "../signatures/signatures-screen";
import {
  AddDocumentModal,
  AttachDocumentModal,
  RemindModal,
  WaiveModal,
} from "./dialogs";
import { DocumentRow, readableDate, RequestRow } from "./document-rows";

/**
 * One person's file, in a drawer.
 *
 * Opened from the register, and it holds both halves of the answer: what is on
 * file and what is still outstanding. That pairing is the whole reason the API
 * returns them in one response — a file that lists five documents and hides the
 * missing work permit reads as complete.
 *
 * Everything in here needs `EDIT_RECORDS`, which the register has already
 * checked before it renders this. Removing a document needs it even for your
 * own, deliberately: letting somebody archive the certificate they submitted is
 * how proof of a qualification quietly disappears.
 *
 * ## A signatures section, read-only, never merged with the documents above
 *
 * Signing and filing are different workflows — one tracks expiry, the other
 * sends a document for a legal, fingerprinted signature — and merging their
 * screens would force one mental model onto both. What was missing was
 * cheaper than a merge: this file's own signature requests, so HR looking at
 * somebody's record does not have to separately remember to check
 * `/people/signatures` for them. `useSignatures()` with no status filter is
 * what an `EDIT_RECORDS` holder already gets back as the **whole company's**
 * list — this drawer is already gated on that permission — so filtering it to
 * `signerId === employeeId` costs no extra request. Absent, not empty-stated,
 * when there are none: most files will have zero, and "0 signatures" for
 * every person who has never been sent a contract is noise the "Still waiting"
 * and "On file" sections already avoid.
 */
export function EmployeeFileDrawer({
  employeeId,
  onClose,
  onChanged,
}: {
  employeeId: string | null;
  onClose: () => void;
  /** The register's counts move when a request is answered in here. */
  onChanged: () => void;
}) {
  const [includeArchived, setIncludeArchived] = useState(false);
  const file = useEmployeeFile(employeeId, includeArchived);
  const toast = useToast();

  /* See the header: the whole company's list when connected with
     EDIT_RECORDS, which this drawer already requires — filtered here rather
     than asked for narrower, since there is no per-signer query param and
     asking would be a second permission question this screen has already
     answered. `null` (not connected, or nothing loaded yet) reads as none. */
  const signatures = useSignatures();
  const mySignatures = useMemo(
    () =>
      (signatures.data ?? []).filter(
        (record) => record.signerId === employeeId,
      ),
    [signatures.data, employeeId],
  );

  const [adding, setAdding] = useState(false);
  const [attaching, setAttaching] = useState<ApiDocumentRequest | null>(null);
  const [reminding, setReminding] = useState<ApiDocumentRequest | null>(null);
  const [waiving, setWaiving] = useState<ApiDocumentRequest | null>(null);
  const [removing, setRemoving] = useState<ApiDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const documents = file.file?.documents ?? [];
  const outstanding = file.file?.outstandingRequests ?? [];
  const name = file.file?.employeeName ?? "";

  const report = (error: unknown) =>
    toast.push({
      title: "That did not work",
      tone: "danger",
      detail:
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
    });

  return (
    <>
      <Drawer
        open={employeeId !== null}
        onClose={onClose}
        title={name === "" ? "Documents" : `${name}’s documents`}
        {...(file.file
          ? { description: `Staff number ${file.file.employeeNo}` }
          : {})}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {file.file ? (
              <Link
                href={`/people/${file.file.employeeId}`}
                className="text-body-sm text-accent-text underline-offset-4 hover:underline"
              >
                Open their record
              </Link>
            ) : (
              <span />
            )}
            {file.editable && (
              <Button
                variant="accent"
                size="sm"
                onClick={() => setAdding(true)}
              >
                <Plus aria-hidden="true" className="size-4" />
                Add a document
              </Button>
            )}
          </div>
        }
      >
        {file.loading ? (
          <div className="flex items-center gap-2 py-8 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading the file
          </div>
        ) : file.error ? (
          <div role="alert" className="py-6">
            <LoadFailure
              subject="this person's document file"
              error={file.error}
              onRetry={file.reload}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {outstanding.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-body-sm font-semibold text-ink">
                  Still waiting on {outstanding.length}
                </h3>
                {outstanding.map((request) => (
                  <RequestRow
                    key={request.id}
                    request={request}
                    actions={
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setReminding(request)}
                        >
                          Remind
                        </Button>
                        {file.editable && (
                          <>
                            <Button
                              variant="approve"
                              size="sm"
                              onClick={() => setAttaching(request)}
                            >
                              Attach
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setWaiving(request)}
                            >
                              Drop
                            </Button>
                          </>
                        )}
                      </>
                    }
                  />
                ))}
              </section>
            )}

            <section className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-body-sm font-semibold text-ink">On file</h3>
                <Checkbox
                  label="Show past documents"
                  checked={includeArchived}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setIncludeArchived(next);
                  }}
                />
              </div>

              {documents.length === 0 ? (
                <EmptyState
                  compact
                  icon={<FileText aria-hidden="true" />}
                  title="Nothing on file"
                  description="Add a contract, an ID, a certificate, or ask them for one."
                />
              ) : (
                documents.map((document) => (
                  <DocumentRow
                    key={document.id}
                    document={document}
                    action={
                      file.editable && !document.archived ? (
                        <>
                          {!document.verified && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={verifyingId === document.id}
                              onClick={() => {
                                setVerifyingId(document.id);
                                void file
                                  .verify(document.id)
                                  .then(() => {
                                    onChanged();
                                    toast.push({
                                      title: "Marked as checked",
                                      tone: "success",
                                    });
                                  })
                                  .catch(report)
                                  .finally(() => setVerifyingId(null));
                              }}
                            >
                              Mark as checked
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRemoving(document)}
                          >
                            Remove
                          </Button>
                        </>
                      ) : undefined
                    }
                  />
                ))
              )}
            </section>

            {mySignatures.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-body-sm font-semibold text-ink">
                  Signatures
                </h3>
                {mySignatures.map((record) => (
                  <SignatureRow key={record.id} record={record} />
                ))}
              </section>
            )}
          </div>
        )}
      </Drawer>

      <AddDocumentModal
        open={adding && file.file !== null}
        whose={`${file.file?.employeeName.split(" ")[0] ?? name}’s`}
        onClose={() => setAdding(false)}
        onAdd={async (body) => {
          await file.add(body);
          setAdding(false);
          onChanged();
          toast.push({ title: "Added to the file", tone: "success" });
        }}
      />

      <AttachDocumentModal
        open={attaching !== null}
        request={attaching}
        onFile={documents}
        subject="other"
        onClose={() => setAttaching(null)}
        onAttach={async (body) => {
          if (!attaching) return;
          await file.fulfil(attaching.id, body);
          setAttaching(null);
          onChanged();
          toast.push({ title: "Attached", tone: "success" });
        }}
      />

      <RemindModal
        open={reminding !== null}
        request={reminding}
        onClose={() => setReminding(null)}
        onRemind={file.remind}
      />

      <WaiveModal
        open={waiving !== null}
        request={waiving}
        onClose={() => setWaiving(null)}
        onWaive={async (reason) => {
          if (!waiving) return;
          await file.waive(waiving.id, reason);
          setWaiving(null);
          onChanged();
          toast.push({ title: "Dropped", tone: "success" });
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ""}?`}
        confirmLabel="Remove"
        tone="danger"
        loading={busy}
        body="Archived, not deleted: it stays under past documents. Refused if it is the answer to a request that was received."
        onConfirm={() => {
          if (!removing) return;
          setBusy(true);
          void file
            .remove(removing.id)
            .then(() => {
              setRemoving(null);
              onChanged();
              toast.push({ title: "Moved to past documents", tone: "success" });
            })
            .catch(report)
            .finally(() => setBusy(false));
        }}
      />
    </>
  );
}

/**
 * One signature request, in the compact row shape `document-rows.tsx` already
 * established for this drawer — not the full `Card` `/people/signatures`
 * itself renders, which carries a fingerprint disclosure and dialogs this
 * read-only list has no use for. Status and dates only; sending a new one, or
 * acting on a pending one, stays on that screen.
 */
function SignatureRow({ record }: { record: ApiSignature }) {
  const overdueDays = overdueBy(record);

  const secondary = [
    record.status === "SIGNED" && record.signedAt
      ? `Signed ${readableDate(record.signedAt)}`
      : null,
    record.status === "DECLINED" && record.declineReason
      ? `Declined: ${record.declineReason}`
      : null,
    record.status === "PENDING" && record.dueDate
      ? `Due ${readableDate(record.dueDate)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border p-3",
        overdueDays !== null && overdueDays > 0
          ? "border-danger-line bg-danger-soft/40"
          : "border-line",
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-muted [&>svg]:size-4"
      >
        <FileSignature />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
          {record.title}
          {overdueDays !== null && overdueDays > 0 && (
            <Badge tone="danger" size="sm" dot>
              {overdueDays === 0
                ? "Due today"
                : `${String(overdueDays)} ${overdueDays === 1 ? "day" : "days"} overdue`}
            </Badge>
          )}
          <Badge tone={TONE[record.status]} size="sm" dot>
            {STATUS_LABELS[record.status]}
          </Badge>
        </p>
        {secondary && (
          <p className="mt-0.5 text-body-sm text-muted">{secondary}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        <ExportButton
          label="Read"
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
      </div>
    </div>
  );
}
