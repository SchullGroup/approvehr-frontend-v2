"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import {
  Button,
  Checkbox,
  Field,
  Input,
  Modal,
  SegmentedControl,
  Select,
  Textarea,
  useToast,
  FileField,
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
import type { InlineFile } from "@/lib/api/uploads";
import { chaseMessage, firstNameOf } from "@/lib/store/documents";
import { useOpenSession } from "@/lib/use-open-session";

/**
 * The things anybody does with a document, as dialogs.
 *
 * ## The file goes up with the record
 *
 * Two of them take a file from somebody. `FileField` reads the chosen file in
 * the browser and hands over its bytes, and the dialog sends them in the same
 * request that creates the record (`contentBase64`). A document is kept in the
 * database, not in object storage, so no bucket is involved and a deployment
 * without one attaches exactly as well as any other. One request is the point: a
 * row recorded beside the upload, rather than with it, is a personnel file
 * listing a certificate nobody uploaded.
 *
 * A file the API refuses (too large, an unreadable type) is refused in the API's
 * own sentence, and the dialog stays open with what was typed.
 *
 * ## Every one of them starts blank each time it is opened
 *
 * The screens keep these mounted so each can animate out, and `Modal` unmounts
 * its children when it closes, so the controls inside start over while a field
 * held above them does not. The old dialogs held their fields above the `Modal`:
 * after a document was added, "Add a document" opened with the last name and the
 * last file still in it, over a file picker that read "Choose a file". The button
 * was live. One more press made a duplicate; the next request was answered with
 * the previous request's PDF; one person's ID card went onto another's file.
 *
 * So each exported dialog is a thin wrapper that holds nothing but a session
 * number (`useOpenSession`) and renders the real form below it, keyed by it. A
 * new key is a new form, which owns every field. See `lib/use-open-session.ts`
 * for exactly when a session starts and, as importantly, when it does not: a
 * list that refreshes under a half-typed field must not wipe it.
 */

/* --------------------------------------------------------------- the field */

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

type AskProps = {
  people: { id: string; name: string }[];
  /**
   * Read once per open, to seed the form: `null` while closed, and a new object
   * on every open (`{}` for "ask for anything"), which is why it is not read
   * again when it changes under a form that is already open.
   */
  initial?: {
    employeeId?: string;
    name?: string;
    category?: DocumentCategory;
  } | null;
  open: boolean;
  onClose: () => void;
  onAsk: (body: CreateRequestBody) => Promise<void>;
};

export function AskForDocumentModal(props: AskProps) {
  const session = useOpenSession(props.open);
  return <AskForDocumentForm key={session} {...props} />;
}

function AskForDocumentForm({
  people,
  initial,
  open,
  onClose,
  onAsk,
}: AskProps) {
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
      open={open}
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

        <Field
          label="What you need"
          required
          help="Work permit, NYSC certificate, degree."
        >
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

        <Field
          label="Why you need it"
          help="They see this. One line is enough."
        >
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => {
              const next = e.target.value;
              setReason(next);
            }}
          />
        </Field>

        <Field
          optional
          label="Needed by"
          help="Leave it blank and nobody is reminded to bring it in."
        >
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

type AttachProps = {
  /** `null` while closed — see the freeze below for why. */
  request: ApiDocumentRequest | null;
  onFile: ApiDocument[];
  open: boolean;
  onClose: () => void;
  onAttach: (body: FulfilBody) => Promise<void>;
  /** "You" on your own screen, the person's first name on HR's. */
  subject: "self" | "other";
};

/**
 * Answer a request.
 *
 * Two ways in, because both happen: point at something already on the file, or
 * send the file just handed over. The API takes exactly one of the two, so the
 * control is a switch rather than two optional fields — and when the file holds
 * nothing yet there is nothing to switch to, so the switch is not drawn.
 */
export function AttachDocumentModal(props: AttachProps) {
  const { request: requestProp, open } = props;
  /* Remembers the last real request: the parent clears its prop to null the
     instant it closes this, but the modal has to stay mounted with real
     content so `Modal` below can animate its own close off the real `open`. */
  const [request, setRequest] = useState(requestProp);
  if (requestProp && requestProp !== request) setRequest(requestProp);

  /* Keyed by the request's id as well as by opening: a form for one request
     must never go on answering for another. The same request handed over again
     as a new object is not a new session. */
  const session = useOpenSession(open, requestProp?.id);

  if (!request) return null;
  return <AttachDocumentForm key={session} {...props} request={request} />;
}

function AttachDocumentForm({
  request,
  onFile,
  open,
  onClose,
  onAttach,
  subject,
}: Omit<AttachProps, "request"> & { request: ApiDocumentRequest }) {
  const candidates = onFile.filter(
    (d) => !d.archived && d.fulfilsRequestId === null,
  );
  const [chosenMode, setMode] = useState<"existing" | "new">(
    candidates.length > 0 ? "existing" : "new",
  );
  const [chosenDocumentId, setDocumentId] = useState(candidates[0]?.id ?? "");
  const [file, setFile] = useState<InlineFile | null>(null);
  const [name, setName] = useState(request.name);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* What is chosen follows what is on the file now. The file reloads under an
     open dialog, and a document that has been archived or attached elsewhere
     since must not stay selected with a live button. With nothing on file to
     pick from, the only way to answer is a new file, and the switch that would
     say so is not drawn. */
  const mode = candidates.length === 0 ? "new" : chosenMode;
  const documentId = candidates.some((d) => d.id === chosenDocumentId)
    ? chosenDocumentId
    : (candidates[0]?.id ?? "");

  /* The file is set only once it has been read, and `uploading` keeps the
     button shut while it is being read. So a press can never send a record
     with nothing attached. */
  const ready =
    mode === "existing" ? documentId !== "" : file !== null && !uploading;

  const who =
    subject === "self" ? "your" : `${firstNameOf(request.employeeName)}’s`;

  return (
    <Modal
      open={open}
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
                mode === "existing" || file === null
                  ? { documentId }
                  : {
                      contentBase64: file.contentBase64,
                      name: name.trim() || request.name,
                      category: request.category,
                      mimeType: file.mimeType,
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
            <FileField
              label="The file"
              required
              help="A PDF, an image, or an Office document. Up to 10MB."
              onBusyChange={setUploading}
              onAttached={setFile}
            />
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------ put one on the file */

/** What the dialog hands to its caller to save. */
export type NewDocument = {
  name: string;
  category: DocumentCategory;
  contentBase64: string;
  mimeType: string;
  /** Present, and `true`, only when the tick was offered **and** ticked. */
  notifyEmployee?: boolean;
};

type AddProps = {
  /** Already possessive: `your`, or `Adaeze’s`. */
  whose: string;
  /* No `employeeId`. It existed only to scope the presigned upload, and the
     file now goes up with the record — whose file it is, is decided by the
     caller's own save, which was always the gate that mattered. */
  open: boolean;
  onClose: () => void;
  onAdd: (body: NewDocument) => Promise<void>;
  /**
   * Offer the "Tell them" tick. The **caller** decides, because only the caller
   * knows the three things it depends on: that the API is there to send
   * anything, that the reader holds `EDIT_RECORDS`, and that this is somebody
   * else's file. Left out, there is no tick and `notifyEmployee` is never sent:
   * the default is that nobody is told and nothing is offered that cannot work.
   */
  canNotify?: boolean;
};

/** A document nobody asked for: a contract, an ID, whatever arrives. */
export function AddDocumentModal(props: AddProps) {
  /* Some callers derive `whose` from data that is only loaded while their own
     drawer is open (an employee's name); freezing it keeps the title reading
     right while this animates closed, instead of falling back to a
     placeholder the instant the caller's own data disappears. */
  const [whose, setWhose] = useState(props.whose);
  if (props.whose && props.whose !== whose) setWhose(props.whose);

  const session = useOpenSession(props.open);
  return <AddDocumentForm key={session} {...props} whose={whose} />;
}

function AddDocumentForm({
  whose,
  open,
  onClose,
  onAdd,
  canNotify = false,
}: AddProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("OTHER");
  const [file, setFile] = useState<InlineFile | null>(null);
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* `file` is set only once it has been read, so a non-null one means the bytes
     are in hand and go up with the record itself. `uploading` keeps the save
     shut while the read is running. */
  const ready = name.trim().length >= 2 && file !== null && !uploading;

  return (
    <Modal
      open={open}
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
              if (!file) return;
              void onAdd({
                name: name.trim(),
                category,
                contentBase64: file.contentBase64,
                mimeType: file.mimeType,
                /* Sent as `true` or not at all. A tick that was never offered
                   cannot have been ticked, so it is checked here as well as
                   hidden below. */
                ...(canNotify && notify ? { notifyEmployee: true } : {}),
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
        <FileField
          label="The file"
          required
          help="A PDF, an image, or an Office document. Up to 10MB."
          onBusyChange={setUploading}
          onAttached={(attached) => {
            setFile(attached);
            /* Name it after the file if nobody has typed a name — the common
               case is a contract called exactly what the file is called. */
            if (attached && name.trim() === "") {
              setName(attached.filename.replace(/\.[^.]+$/, ""));
            }
          }}
        />
        {canNotify && (
          <Checkbox
            label="Tell them"
            description="Sends them a notification that a document was added to their file. They can open it under Documents."
            checked={notify}
            onChange={(e) => {
              const next = e.target.checked;
              setNotify(next);
            }}
          />
        )}
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- the nudge */

type RemindProps = {
  /* Structural rather than `ApiDocumentRequest`: the compliance list opens this
     too, and a `ComplianceRow` carries these fields but is not a request.
     `id` is nullable for the same reason — a future `kind: "DOCUMENT"` row
     (a renewal date close on a document already on file) has no request
     behind it to remind on, and never will; the copy-paste text is what that
     case has always used and keeps using. `null` at the top level (as against
     `id: null` inside it) means this whole dialog is closed — see the freeze
     below for why that is a separate thing from a row with no request id. */
  request: {
    id: string | null;
    employeeName: string;
    name: string;
    dueOn: string | null;
    daysLeft: number | null;
  } | null;
  open: boolean;
  onClose: () => void;
  onRemind: (id: string) => Promise<{ notifiedEmployee: boolean }>;
};

/**
 * Chase somebody, through their own ApproveHR notifications.
 *
 * Used to be a text box and a Copy button — "copy this into WhatsApp", because
 * there was no route to send anything. There is now: opening this fires the
 * reminder straight into their inbox, the same one `createRequest` used the
 * first time. Nothing to compose, nothing to paste anywhere.
 *
 * The copy-paste text still exists, but only for the one case that is still
 * real: `notifiedEmployee: false` means nobody could be told (the person has no
 * sign-in, or the company switched the notice off), which is a
 * fact about their account rather than a missing feature, and it is the same
 * state `createRequest` can return. Showing it as the default for everybody
 * would misdescribe the other 90% of reminders, which now genuinely send.
 */
export function RemindModal(props: RemindProps) {
  const { request: requestProp, open } = props;
  /* Remembers the last real request: the parent clears its prop to null the
     instant it closes this, but the modal has to stay mounted with real
     content so `Modal` below can animate its own close off the real `open`. */
  const [request, setRequest] = useState(requestProp);
  if (requestProp && requestProp !== request) setRequest(requestProp);

  /* A reminder is sent each time this opens, not once per request: opening it
     again for the same person is asking to nudge them again, and a dialog that
     kept last time's "Sent" would say so without sending anything. */
  const session = useOpenSession(open);

  if (!request) return null;
  return <RemindForm key={session} {...props} request={request} />;
}

function RemindForm({
  request,
  open,
  onClose,
  onRemind,
}: Omit<RemindProps, "request"> & {
  request: NonNullable<RemindProps["request"]>;
}) {
  const toast = useToast();
  const message = useMemo(() => chaseMessage(request), [request]);
  /* No "idle" phase: a request with an id always has a reminder in flight by
     the time anything paints, so there is nothing for an idle state to
     describe. */
  const [state, setState] = useState<
    | { phase: "sending" }
    | { phase: "sent" }
    | { phase: "no-account" }
    | { phase: "failed"; message: string }
  >({ phase: request.id === null ? "no-account" : "sending" });

  /* Bumped by "Try again" to run the effect below a second time against the
     same request id, which does not otherwise change. */
  const [attempt, setAttempt] = useState(0);

  /* The inline-IIFE shape from `lib/store/shifts.ts`, not a named function
     called from the effect: the lint rule that catches a synchronous
     `setState` inside an effect cannot trace one reached through an external
     function reference, only one whose `await` sits lexically between the
     effect running and the state being set — which an inlined async body
     gives it. Every `setState` below is already past that `await`. */
  useEffect(() => {
    if (request.id === null) return;
    const id = request.id;
    let cancelled = false;
    void (async () => {
      try {
        const result = await onRemind(id);
        if (!cancelled) {
          setState({ phase: result.notifiedEmployee ? "sent" : "no-account" });
        }
      } catch (error) {
        if (!cancelled)
          setState({ phase: "failed", message: messageOf(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id, attempt]);

  const firstName = firstNameOf(request.employeeName);
  const showMessage = state.phase === "no-account" || state.phase === "failed";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Remind ${firstName}`}
      description={
        state.phase === "sending"
          ? "Sending…"
          : state.phase === "sent"
            ? `Sent to ${firstName}'s ApproveHR notifications.`
            : state.phase === "no-account"
              ? `Nothing reached ${firstName}'s ApproveHR notifications, and ${firstName} may not have a sign-in yet. Copy this into WhatsApp or email instead.`
              : state.phase === "failed"
                ? state.message
                : undefined
      }
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
          {showMessage && (
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
          )}
          {state.phase === "failed" && request.id !== null && (
            <Button
              variant="accent"
              onClick={() => {
                setState({ phase: "sending" });
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          )}
        </div>
      }
    >
      {showMessage && (
        <Field label="Message" hideLabel>
          <Textarea readOnly rows={4} value={message} />
        </Field>
      )}
    </Modal>
  );
}

/* ----------------------------------------------------------------- the drop */

/** Dropping a requirement. The reason is stored, so it is asked for properly. */
type WaiveProps = {
  /** `null` while closed — see the freeze below for why. */
  request: ApiDocumentRequest | null;
  open: boolean;
  onClose: () => void;
  onWaive: (reason: string) => Promise<void>;
};

export function WaiveModal(props: WaiveProps) {
  const { request: requestProp, open } = props;
  /* Remembers the last real request: the parent clears its prop to null the
     instant it closes this, but the modal has to stay mounted with real
     content so `Modal` below can animate its own close off the real `open`. */
  const [request, setRequest] = useState(requestProp);
  if (requestProp && requestProp !== request) setRequest(requestProp);

  /* The reason is stored with the drop, so a reason typed for one request must
     never be on the button for the next. */
  const session = useOpenSession(open, requestProp?.id);

  if (!request) return null;
  return <WaiveForm key={session} {...props} request={request} />;
}

function WaiveForm({
  request,
  open,
  onClose,
  onWaive,
}: Omit<WaiveProps, "request"> & { request: ApiDocumentRequest }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      open={open}
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
