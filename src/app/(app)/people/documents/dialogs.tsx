"use client";

import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  SegmentedControl,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  CATEGORY_LABEL,
  DOCUMENT_CATEGORIES,
  type ApiDocument,
  type ApiDocumentRequest,
  type CreateRequestBody,
  type DocumentCategory,
  type FulfilBody,
} from "@/lib/api/documents";
import { chaseMessage, firstNameOf } from "@/lib/store/documents";

/**
 * The four things anybody does with a document, as four dialogs.
 *
 * Kept together because they share one hard problem: **there is no upload
 * pipeline**, and three of them have to take a file from somebody anyway.
 *
 * ## The reference field, and why it is not a drop zone
 *
 * Nothing in this stack stores or serves a file. The API takes an
 * object-storage key and refuses anything that looks like a link, so a drop
 * zone here would accept a certificate, appear to succeed, and hold nothing —
 * which is worse than not offering it. What it takes instead is where the file
 * is kept: a folder path, a file name, a document reference. One short line
 * says so, and the field is usable today.
 *
 * When `POST /api/v1/documents/upload-url` exists (named in a TODO at the top
 * of the API's `src/modules/documents/router.ts`), `ReferenceField` is the one
 * place that changes: it presigns, uploads, and passes on the key it got back.
 */

/* --------------------------------------------------------------- the field */

/** The seam. One line of honesty, and a field that works. */
function ReferenceField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: string | undefined;
}) {
  return (
    <Field
      label="Where the file is kept"
      required
      help="We cannot hold the file itself yet — put the folder path or file name. Not a web link."
      {...(error ? { error } : {})}
    >
      <Input
        value={value}
        placeholder="hr/contracts/adaeze-okonkwo-2026.pdf"
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
        }}
      />
    </Field>
  );
}

function CategoryField({
  value,
  onChange,
}: {
  value: DocumentCategory;
  onChange: (next: DocumentCategory) => void;
}) {
  return (
    <Field label="Kind">
      <Select
        value={value}
        onChange={(e) => {
          const next = e.target.value as DocumentCategory;
          onChange(next);
        }}
      >
        {DOCUMENT_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {CATEGORY_LABEL[category]}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Every dialog reports its own failure — the API's message is the useful part. */
function messageOf(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Something went wrong. Try again.";
}

/* ------------------------------------------------------ ask for a document */

export function AskForDocumentModal({
  people,
  initial,
  onClose,
  onAsk,
}: {
  people: { id: string; name: string }[];
  initial?: { employeeId?: string; name?: string; category?: DocumentCategory };
  onClose: () => void;
  onAsk: (body: CreateRequestBody) => Promise<void>;
}) {
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<DocumentCategory>(
    initial?.category ?? "OTHER",
  );
  const [reason, setReason] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = employeeId !== "" && name.trim().length >= 2;

  return (
    <Modal
      open
      onClose={onClose}
      title="Ask for a document"
      description="They get it in their ApproveHR inbox with a link to attach it."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!ready || busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void onAsk({
                employeeId,
                name: name.trim(),
                category,
                ...(reason.trim() ? { reason: reason.trim() } : {}),
                ...(dueOn ? { dueOn } : {}),
              })
                .catch((e: unknown) => setError(messageOf(e)))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Asking…" : "Ask for it"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="text-body-sm text-danger-text">
            {error}
          </p>
        )}

        <Field label="Who" required>
          <Select
            value={employeeId}
            onChange={(e) => {
              const next = e.target.value;
              setEmployeeId(next);
            }}
          >
            <option value="">Pick somebody</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="What you need" required help="Work permit, NYSC certificate, degree.">
          <Input
            value={name}
            autoFocus
            onChange={(e) => {
              const next = e.target.value;
              setName(next);
            }}
          />
        </Field>

        <CategoryField value={category} onChange={setCategory} />

        <Field label="Why you need it" help="They see this. One line is enough.">
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => {
              const next = e.target.value;
              setReason(next);
            }}
          />
        </Field>

        <Field optional label="Needed by" help="Leave it blank and nobody gets chased for it.">
          <Input
            type="date"
            value={dueOn}
            onChange={(e) => {
              const next = e.target.value;
              setDueOn(next);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ attach to one */

/**
 * Answer a request.
 *
 * Two ways in, because both happen: point at something already on the file, or
 * give the reference of something just handed over. The API takes exactly one
 * of the two, so the control is a switch rather than two optional fields — and
 * when the file holds nothing yet there is nothing to switch to, so the switch
 * is not drawn.
 */
export function AttachDocumentModal({
  request,
  onFile,
  onClose,
  onAttach,
  /** "You" on your own screen, the person's first name on HR's. */
  subject,
}: {
  request: ApiDocumentRequest;
  onFile: ApiDocument[];
  onClose: () => void;
  onAttach: (body: FulfilBody) => Promise<void>;
  subject: "self" | "other";
}) {
  const candidates = onFile.filter((d) => !d.archived && d.fulfilsRequestId === null);
  const [mode, setMode] = useState<"existing" | "new">(
    candidates.length > 0 ? "existing" : "new",
  );
  const [documentId, setDocumentId] = useState(candidates[0]?.id ?? "");
  const [storageKey, setStorageKey] = useState("");
  const [name, setName] = useState(request.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    mode === "existing" ? documentId !== "" : storageKey.trim().length > 0;

  const who =
    subject === "self" ? "your" : `${firstNameOf(request.employeeName)}’s`;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Attach ${who} ${request.name.toLowerCase()}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="approve"
            disabled={!ready || busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              const body: FulfilBody =
                mode === "existing"
                  ? { documentId }
                  : {
                      storageKey: storageKey.trim(),
                      name: name.trim() || request.name,
                      category: request.category,
                    };
              void onAttach(body)
                .catch((e: unknown) => setError(messageOf(e)))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Attaching…" : "Attach it"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="text-body-sm text-danger-text">
            {error}
          </p>
        )}

        {candidates.length > 0 && (
          <SegmentedControl
            label="Where it comes from"
            value={mode}
            onChange={setMode}
            options={[
              { value: "existing", label: "Already on file" },
              { value: "new", label: "Something new" },
            ]}
          />
        )}

        {mode === "existing" ? (
          <Field label="Which document" required>
            <Select
              value={documentId}
              onChange={(e) => {
                const next = e.target.value;
                setDocumentId(next);
              }}
            >
              {candidates.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.name} · {CATEGORY_LABEL[document.category]}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <>
            <Field label="Name it" required>
              <Input
                value={name}
                onChange={(e) => {
                  const next = e.target.value;
                  setName(next);
                }}
              />
            </Field>
            <ReferenceField value={storageKey} onChange={setStorageKey} />
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------ put one on the file */

/** A document nobody asked for: a contract, an ID, whatever arrives. */
export function AddDocumentModal({
  whose,
  onClose,
  onAdd,
}: {
  /** Already possessive: `your`, or `Adaeze’s`. */
  whose: string;
  onClose: () => void;
  onAdd: (body: {
    name: string;
    category: DocumentCategory;
    storageKey: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("OTHER");
  const [storageKey, setStorageKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().length >= 2 && storageKey.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add a document to ${whose} file`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!ready || busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void onAdd({
                name: name.trim(),
                category,
                storageKey: storageKey.trim(),
              })
                .catch((e: unknown) => setError(messageOf(e)))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Adding…" : "Add it"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="text-body-sm text-danger-text">
            {error}
          </p>
        )}
        <Field label="Name it" required>
          <Input
            value={name}
            autoFocus
            placeholder="Employment contract"
            onChange={(e) => {
              const next = e.target.value;
              setName(next);
            }}
          />
        </Field>
        <CategoryField value={category} onChange={setCategory} />
        <ReferenceField value={storageKey} onChange={setStorageKey} />
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- the nudge */

/**
 * Chase somebody.
 *
 * There is no remind route — see the TODO on `chaseMessage` in
 * `lib/store/documents.ts`. So this writes the message and hands it over
 * instead of claiming to send it: the text is here, selectable, with a copy
 * button. In a thirty-person company that is what happens anyway, and it works
 * with no server behind it.
 */
export function RemindModal({
  request,
  onClose,
}: {
  /* Structural rather than `ApiDocumentRequest`: the compliance list opens this
     too, and a `ComplianceRow` carries these four fields but is not a request. */
  request: {
    employeeName: string;
    name: string;
    dueOn: string | null;
    daysLeft: number | null;
  };
  onClose: () => void;
}) {
  const toast = useToast();
  const message = useMemo(() => chaseMessage(request), [request]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Remind ${firstNameOf(request.employeeName)}`}
      description="Copy this into WhatsApp or email — ApproveHR cannot send it yet."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
          <Button
            variant="accent"
            onClick={() => {
              void navigator.clipboard
                .writeText(message)
                .then(() => toast.push({ title: "Copied", tone: "success" }))
                .catch(() =>
                  toast.push({
                    title: "Copy did not work",
                    tone: "warning",
                    detail: "Select the message and copy it.",
                  }),
                );
            }}
          >
            <Copy aria-hidden="true" className="size-4" />
            Copy
          </Button>
        </div>
      }
    >
      <Field label="Message" hideLabel>
        <Textarea readOnly rows={4} value={message} />
      </Field>
    </Modal>
  );
}

/* ----------------------------------------------------------------- the drop */

/** Dropping a requirement. The reason is stored, so it is asked for properly. */
export function WaiveModal({
  request,
  onClose,
  onWaive,
}: {
  request: ApiDocumentRequest;
  onClose: () => void;
  onWaive: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Stop asking for ${request.name.toLowerCase()}?`}
      description={`${firstNameOf(request.employeeName)} is told to stop looking for it.`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Keep asking
          </Button>
          <Button
            variant="danger"
            disabled={reason.trim().length < 3 || busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void onWaive(reason.trim())
                .catch((e: unknown) => setError(messageOf(e)))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Dropping…" : "Drop it"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="text-body-sm text-danger-text">
            {error}
          </p>
        )}
        <Field
          label="Why it is no longer needed"
          required
          help="Kept on the record. A gap nobody can explain is worse than the missing document."
        >
          <Textarea
            rows={3}
            value={reason}
            autoFocus
            onChange={(e) => {
              const next = e.target.value;
              setReason(next);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
