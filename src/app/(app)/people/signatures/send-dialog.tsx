"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import {
  Button,
  Callout,
  Field,
  FileField,
  Input,
  Modal,
  Picker,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  MAX_SIGNABLE_BYTES,
  SIGNABLE_ACCEPT,
  SIGNABLE_CONTENT_TYPE,
  SIGNATURE_KIND,
} from "@/lib/api/signatures";
import type { InlineFile } from "@/lib/api/uploads";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useSignatureMutations } from "@/lib/store/signatures";
import { fullName } from "@/lib/types";

/**
 * Send a document for signature.
 *
 * ## This is the half of the flow that did not exist
 *
 * `POST /signatures` was complete — hashing, size and type refusals, filing the
 * signed document onto the personnel file, an audit entry carrying the hash and
 * not the bytes. `signaturesApi.send` was written. `useSignatureMutations().send`
 * was written. **Nothing called it.**
 *
 * So nothing could ever be sent, so both tabs on the Signatures screen were
 * permanently empty for everybody, and the feedback was the only thing it could
 * have been: *"Why did we add signatures? I can't find any flows for signature,
 * it is just showing at the side bar for both HR and Employee."* The sidebar
 * row led to a room with nothing in it and no door out.
 *
 * ## Who can open this
 *
 * `EDIT_RECORDS`, which the API enforces with its own sentence — sending puts a
 * document in front of a named member of staff **over the company's name**, and
 * that is an act with the company's authority behind it rather than a
 * convenience. The screen does not render the button without the permission, so
 * this dialog is never the place somebody discovers they cannot.
 *
 * Note the asymmetry, because it is the point of the whole module: the
 * permission to *send* is an ordinary permission, and the ability to *sign* is
 * not a permission at all. An administrator holding everything can put a
 * contract in front of anybody and cannot sign one on their behalf.
 *
 * ## The picker is the whole directory, and here that is right
 *
 * Unlike a one-to-one, which follows the reporting line, HR sends a contract to
 * whoever the contract is with. The API's only constraint is that the person
 * exists and is not archived. `Picker` searches, which a `<select>` of two
 * hundred people does not.
 */
export function SendDialog({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void;
}) {
  const mutations = useSignatureMutations();
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const toast = useToast();

  const [signerId, setSignerId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [file, setFile] = useState<InlineFile | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /**
   * PDF only, checked on the type the browser reported.
   *
   * Belt to `accept`'s braces: `accept` filters the picker's default view and
   * does not stop a determined choice, and a file renamed to `.pdf` still
   * arrives with its real type. The API refuses either way; catching it here
   * means the refusal names the reason rather than arriving after an upload.
   */
  const wrongType =
    file !== null && file.mimeType !== SIGNABLE_CONTENT_TYPE
      ? `That is a ${file.mimeType || "file of unknown type"}. Only a PDF can be sent for signature — it is the one format that renders the same for the signer as it does for you.`
      : null;

  const ready =
    signerId !== "" &&
    title.trim() !== "" &&
    file !== null &&
    wrongType === null &&
    !reading;

  const send = async () => {
    if (!file) return;
    setBusy(true);
    setFailure(null);
    try {
      await mutations.send({
        title: title.trim(),
        message: message.trim() === "" ? null : message.trim(),
        signerId,
        dueDate: dueDate === "" ? null : dueDate,
        documentBase64: file.contentBase64,
        contentType: file.mimeType,
      });
      /* Who, by name. A toast reading "Sent" after a form with a searchable
         two-hundred-row picker in it does not confirm the thing somebody
         wants confirmed, which is that it went to the right person. */
      const signer = directory.employees.find(
        (person) => person.id === signerId,
      );
      toast.push({
        tone: "success",
        title: "Sent for signature",
        detail: signer
          ? `${fullName(signer)} will see it under Signatures.`
          : "It will appear under Signatures.",
      });
      onSent();
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Send a document for signature"
      description="They are asked to read it and adopt it as their signature. Nobody else can sign it for them."
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="accent"
            loading={busy}
            disabled={!ready}
            onClick={() => void send()}
          >
            <Send aria-hidden="true" className="size-4" />
            Send it
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Who signs it" required>
          <Picker
            value={signerId}
            onChange={setSignerId}
            placeholder="Choose somebody"
            loading={directory.loading}
            aria-label="Who signs it"
            options={directory.employees.map((person) => ({
              value: person.id,
              label: fullName(person),
              /* The second line the picker is built for. Two people with the
                 same name is ordinary; two with the same name and job title is
                 not. */
              ...(person.jobTitle ? { hint: person.jobTitle } : {}),
            }))}
          />
        </Field>

        <Field
          label="What it is"
          required
          help="They see this as the name of the document. “Employment contract” or “Staff handbook 2026”, not the filename."
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Employment contract"
          />
        </Field>

        <FileField
          label="The document"
          required
          accept={SIGNABLE_ACCEPT}
          maxBytes={MAX_SIGNABLE_BYTES}
          help={`PDF, up to ${String(Math.floor(MAX_SIGNABLE_BYTES / 1024 / 1024))}MB. The signature is over these exact bytes, so the file is kept whole with the record.`}
          onAttached={setFile}
          onBusyChange={setReading}
        />
        {wrongType && (
          <Callout tone="danger" title="That file cannot be sent">
            {wrongType}
          </Callout>
        )}

        <Field
          label="A note to them"
          optional
          help="Shown with the document. Say what it is for and what happens after they sign."
        >
          <Textarea
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Please read and sign before your first day."
          />
        </Field>

        <Field
          label="Due by"
          optional
          /* Optional, and it says what it does — because it does less than
             people assume. Nothing expires, nothing is enforced; it is the
             date the screen counts against so a chase has a fact behind it. */
          help="Nothing expires on this date. It is what “overdue” is measured against."
        >
          <Input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
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
