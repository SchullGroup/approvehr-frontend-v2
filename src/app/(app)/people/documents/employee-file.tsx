"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Spinner,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiDocument, ApiDocumentRequest } from "@/lib/api/documents";
import { useEmployeeFile } from "@/lib/store/documents";
import { AddDocumentModal, AttachDocumentModal, RemindModal, WaiveModal } from "./dialogs";
import { DocumentRow, RequestRow } from "./document-rows";

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

  const [adding, setAdding] = useState(false);
  const [attaching, setAttaching] = useState<ApiDocumentRequest | null>(null);
  const [reminding, setReminding] = useState<ApiDocumentRequest | null>(null);
  const [waiving, setWaiving] = useState<ApiDocumentRequest | null>(null);
  const [removing, setRemoving] = useState<ApiDocument | null>(null);
  const [busy, setBusy] = useState(false);

  const documents = file.file?.documents ?? [];
  const outstanding = file.file?.outstandingRequests ?? [];
  const name = file.file?.employeeName ?? "";

  const report = (error: unknown) =>
    toast.push({
      title: "That did not work",
      tone: "danger",
      detail:
        error instanceof ApiError ? error.message : "Something went wrong. Try again.",
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            {file.file ? (
              <Link
                href={`/people/${file.file.employeeId}`}
                className="text-[0.875rem] text-accent-text underline-offset-4 hover:underline"
              >
                Open their record
              </Link>
            ) : (
              <span />
            )}
            {file.editable && (
              <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" className="size-4" />
                Add a document
              </Button>
            )}
          </div>
        }
      >
        {file.loading ? (
          <div className="flex items-center gap-2 py-8 text-[0.875rem] text-muted">
            <Spinner size="sm" />
            Loading the file
          </div>
        ) : file.error ? (
          <p role="alert" className="py-6 text-[0.875rem] text-danger-text">
            {file.error.message}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {outstanding.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-[0.875rem] font-semibold text-ink">
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
                <h3 className="text-[0.875rem] font-semibold text-ink">On file</h3>
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
                  description="Add a contract, an ID, a certificate — or ask them for one."
                />
              ) : (
                documents.map((document) => (
                  <DocumentRow
                    key={document.id}
                    document={document}
                    action={
                      file.editable && !document.archived ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRemoving(document)}
                        >
                          Remove
                        </Button>
                      ) : undefined
                    }
                  />
                ))
              )}
            </section>
          </div>
        )}
      </Drawer>

      {adding && file.file && (
        <AddDocumentModal
          whose={`${file.file.employeeName.split(" ")[0] ?? name}’s`}
          onClose={() => setAdding(false)}
          onAdd={async (body) => {
            await file.add(body);
            setAdding(false);
            onChanged();
            toast.push({ title: "Added to the file", tone: "success" });
          }}
        />
      )}

      {attaching && (
        <AttachDocumentModal
          request={attaching}
          onFile={documents}
          subject="other"
          onClose={() => setAttaching(null)}
          onAttach={async (body) => {
            await file.fulfil(attaching.id, body);
            setAttaching(null);
            onChanged();
            toast.push({ title: "Attached", tone: "success" });
          }}
        />
      )}

      {reminding && (
        <RemindModal request={reminding} onClose={() => setReminding(null)} />
      )}

      {waiving && (
        <WaiveModal
          request={waiving}
          onClose={() => setWaiving(null)}
          onWaive={async (reason) => {
            await file.waive(waiving.id, reason);
            setWaiving(null);
            onChanged();
            toast.push({ title: "Dropped", tone: "success" });
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ""}?`}
        confirmLabel="Remove"
        tone="danger"
        loading={busy}
        body="Archived, not deleted — it stays under past documents. Refused if it is the answer to a request that was received."
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
