"use client";

import { useState } from "react";
import { FilePlus2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  FieldRow,
  Input,
  Modal,
  Select,
  Textarea,
  TextLink,
  useToast,
} from "@/components/ui";
import {
  CATEGORY_LABEL,
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from "@/lib/api/documents";
import type { ApiQueryDetail } from "@/lib/api/queries";
import {
  ASK_DOCUMENT_LIMITS,
  DOCUMENT_REQUEST_STATUS_WORD,
  type AskDocumentBody,
} from "@/lib/api/query-ties";
import { dayLabel } from "@/lib/store/conduct";
import { useQueryActions } from "@/lib/store/queries";
import { counter } from "@/lib/queries/draft";
import { actionMessage } from "@/lib/use-action";
import { useOpenSession } from "@/lib/use-open-session";

/**
 * Documents asked for under a query.
 *
 * ## It is an ordinary document request
 *
 * What is asked for lands in the documents module like any other request, and the person answers
 * it under **My documents** exactly as they do today. What they attach there is an ordinary
 * personnel-file document: nothing is stored twice and nothing is kept on the query.
 *
 * ## What the person is told
 *
 * The notification is the server's and is neutral: that HR has asked for a document and to open
 * My documents. It names no document, gives no reason and does not say "query". The request's own
 * name and reason are read in My documents, where the person already reads them. So this screen
 * says that before the press, and its toast is about the act and never about the document.
 *
 * `notifiedPerson: false` is said plainly: nobody was told in ApproveHR, either because there is
 * no sign-in or because the company switched that rule off, and the server does not say which.
 *
 * ## Who
 *
 * The button is `can.askForDocument` (the issuer, while the letter is waiting or answered). The
 * list is staff and the person, from the detail; a drafting manager's detail carries none.
 */
export function DocumentsAsked({
  detail,
  isSubject,
  refresh,
}: {
  detail: ApiQueryDetail;
  isSubject: boolean;
  refresh: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const requests = detail.documentRequests;
  const canAsk = detail.can.askForDocument;
  if (requests.length === 0 && !canAsk) return null;

  return (
    <Card>
      <CardHeader
        title="Documents asked for"
        description={
          isSubject
            ? "You send these under My documents."
            : "Asked for under this letter. The person answers under My documents."
        }
        action={
          canAsk ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAsking(true)}
            >
              <FilePlus2 aria-hidden="true" className="size-3.5" />
              Ask for a document
            </Button>
          ) : undefined
        }
      />
      <CardBody className="flex flex-col gap-3">
        {requests.length === 0 ? (
          <p className="text-body-sm text-muted">
            Nothing has been asked for yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-line p-3"
              >
                <span className="min-w-0 break-words text-body-sm font-medium text-ink">
                  {request.name}
                  {request.dueOn && (
                    <span className="ml-2 text-meta font-normal text-muted">
                      due {dayLabel(request.dueOn)}
                    </span>
                  )}
                </span>
                <Badge tone="neutral" size="sm">
                  {DOCUMENT_REQUEST_STATUS_WORD[request.status] ??
                    request.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {isSubject && requests.length > 0 && (
          <TextLink href="/documents">Open My documents</TextLink>
        )}
      </CardBody>

      {canAsk && (
        <AskForDocumentDialog
          open={asking}
          queryId={detail.id}
          subjectName={detail.subject.name}
          onClose={() => setAsking(false)}
          onAsked={refresh}
        />
      )}
    </Card>
  );
}

export function AskForDocumentDialog(props: {
  open: boolean;
  queryId: string;
  subjectName: string;
  onClose: () => void;
  onAsked: () => Promise<void>;
}) {
  const session = useOpenSession(props.open, props.queryId);
  return <AskForm key={session} {...props} />;
}

function AskForm({
  open,
  queryId,
  subjectName,
  onClose,
  onAsked,
}: {
  open: boolean;
  queryId: string;
  subjectName: string;
  onClose: () => void;
  onAsked: () => Promise<void>;
}) {
  const toast = useToast();
  const actions = useQueryActions();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DocumentCategory | "">("");
  const [reason, setReason] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const trimmed = name.trim();
  const nameOk =
    trimmed.length >= ASK_DOCUMENT_LIMITS.name.min &&
    trimmed.length <= ASK_DOCUMENT_LIMITS.name.max;
  const reasonOk = reason.trim().length <= ASK_DOCUMENT_LIMITS.reason.max;

  async function ask() {
    const body: AskDocumentBody = {
      name: trimmed,
      ...(category !== "" ? { category } : {}),
      ...(reason.trim() !== "" ? { reason: reason.trim() } : {}),
      ...(dueOn !== "" ? { dueOn } : {}),
    };
    setBusy(true);
    setProblem(null);
    try {
      const asked = await actions.askForDocument(queryId, body);
      await onAsked();
      /* An act. Never the name of the document or the reason. */
      toast.push({
        tone: asked.notifiedPerson === false ? "warning" : "success",
        title: "Document asked for",
        ...(asked.notifiedPerson === false
          ? {
              detail:
                "Nobody was told in ApproveHR. They have no sign-in, or your company switched that notification off.",
            }
          : {}),
      });
      onClose();
    } catch (error) {
      setProblem(actionMessage(error, "the request"));
    } finally {
      setBusy(false);
    }
  }

  const reasonCounter = counter(reason, ASK_DOCUMENT_LIMITS.reason.max, 240);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Ask ${subjectName} for a document`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void ask()}
            disabled={!nameOk || !reasonOk}
            loading={busy}
          >
            Ask for it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-body">
          This is an ordinary document request: they answer it under My
          documents. The notification they get says only that HR has asked for a
          document. It does not name the document, give the reason or mention
          the letter.
        </p>
        <Field label="The document" required help="What they should send.">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <FieldRow>
          <Field label="Kind of document" optional>
            <Select
              value={category}
              onChange={(event) => {
                const next = DOCUMENT_CATEGORIES.find(
                  (candidate) => candidate === event.target.value,
                );
                setCategory(next ?? "");
              }}
            >
              <option value="">Not stated</option>
              {DOCUMENT_CATEGORIES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {CATEGORY_LABEL[candidate]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Needed by" optional>
            <Input
              type="date"
              value={dueOn}
              onChange={(event) => setDueOn(event.target.value)}
            />
          </Field>
        </FieldRow>
        <Field
          label="Why it is needed"
          optional
          help="They read this in My documents."
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {reasonCounter && (
            <span
              className={
                reasonOk ? "text-meta text-muted" : "text-meta text-danger-text"
              }
            >
              {reasonCounter}
            </span>
          )}
        </Field>
        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
