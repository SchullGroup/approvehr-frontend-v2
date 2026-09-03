"use client";

import { useMemo, useState } from "react";
import { Paperclip } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  formatMoney,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { policyBreach } from "@/lib/api/reimbursements";
import {
  today,
  type Claim,
  type EditClaimInput,
  type ExpenseType,
  type SubmitClaimInput,
} from "@/lib/store/reimbursements";

/**
 * The claim form. Four questions and a receipt reference.
 *
 * ## The two limits are shown before submit, never after
 *
 * A claim form that accepts everything and then refuses on the server is a form
 * that wastes somebody's afternoon. Both of a type's rules are enforced here at
 * the moment they become relevant:
 *
 * - **The cap sits beside the amount and updates as they type.** Under it, it
 *   says what is left. Over it, it says by how much and the submit button goes
 *   dead. The sentence is the same one the API would have sent back.
 * - **A receipt requirement appears the instant the type is chosen**, on the
 *   field and again as the reason the submit button is disabled. Nobody should
 *   discover that fuel needs a receipt by pressing Send.
 *
 * The API checks both again, of course — a browser check is not enforcement.
 * This is about not making a person guess.
 *
 * ## The receipt field is honest about what it is
 *
 * There is no upload pipeline. Not in the API, not in storage, nowhere. So this
 * is a text field for a reference — a file name, a folder, the number printed on
 * the paper — and it says exactly that. A drop zone would look better in a
 * screenshot and would lose somebody's receipt, which is worse than asking them
 * to type where it is. When `POST /reimbursements/receipt-upload-url` exists
 * (it is a named TODO in the API's router), this field becomes an uploader and
 * the copy goes with it.
 */

/** Naira from what somebody typed, or null. Refuses more precision than kobo. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/,/g, "").replace(/\s/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const money = (amount: number) => formatMoney(amount, "NGN", { decimals: true });

export function ClaimForm({
  open,
  onClose,
  types,
  /** Present when editing. Only a claim awaiting a decision can be edited. */
  claim,
  /** Who is signed in. The default claimant, and the one who cannot be changed. */
  myEmployeeId,
  /** Non-empty only for somebody who may file on another person's behalf. */
  colleagues = [],
  onSubmit,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  types: ExpenseType[];
  claim?: Claim | undefined;
  myEmployeeId: string | null;
  colleagues?: { id: string; name: string }[];
  onSubmit: (input: SubmitClaimInput) => Promise<void>;
  onEdit?: (id: string, input: EditClaimInput) => Promise<void>;
}) {
  const editing = claim !== undefined;

  const [typeId, setTypeId] = useState(claim?.typeId ?? "");
  const [amountText, setAmountText] = useState(
    claim ? claim.amount.toFixed(2) : "",
  );
  const [incurredOn, setIncurredOn] = useState(claim?.incurredOn ?? today());
  const [description, setDescription] = useState(claim?.description ?? "");
  const [receiptKey, setReceiptKey] = useState(claim?.receiptKey ?? "");
  const [forWhom, setForWhom] = useState(claim?.employeeId ?? myEmployeeId ?? "");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(
    null,
  );

  /* An edited claim keeps its own type in the picker even if that type has
     since been switched off, so the picker never silently rewrites the claim. */
  const options = useMemo(() => {
    const claimable = types.filter((type) => type.claimable);
    const current = types.find((type) => type.id === claim?.typeId);
    return current && !claimable.some((type) => type.id === current.id)
      ? [current, ...claimable]
      : claimable;
  }, [types, claim?.typeId]);

  const type = options.find((option) => option.id === typeId);
  const amount = parseAmount(amountText);

  const overCap =
    type?.cap !== null && type?.cap !== undefined && amount !== null
      ? amount > type.cap
      : false;

  const needsReceipt = type?.requiresReceipt === true && receiptKey.trim() === "";
  const futureDated = incurredOn > today();

  /* The one reason the button is dead, in words, shown beside it. Ordered so
     the first thing to fix is the first thing named. */
  const blocker: string | null = !type
    ? "Choose what the expense was for."
    : description.trim().length < 3
      ? "Say what the money went on."
      : amount === null
        ? "Enter the amount, in naira and kobo."
        : overCap
          ? `That is over the cap for ${type.name}.`
          : needsReceipt
            ? `${type.name} needs a receipt. Add the reference.`
            : futureDated
              ? "That date is in the future."
              : null;

  const capNote = (() => {
    if (!type) return null;
    if (type.cap === null) {
      return { tone: "muted" as const, text: `No cap on ${type.name}` };
    }
    if (amount === null) {
      return { tone: "muted" as const, text: `Cap ${money(type.cap)} a claim` };
    }
    if (amount > type.cap) {
      return {
        tone: "danger" as const,
        text: `${money(amount - type.cap)} over the ${money(type.cap)} cap`,
      };
    }
    return {
      tone: "muted" as const,
      text: `${money(type.cap - amount)} left of the ${money(type.cap)} cap`,
    };
  })();

  async function send() {
    if (!type || amount === null) return;
    setBusy(true);
    setFailure(null);
    setFieldError(null);

    const reference = receiptKey.trim();

    try {
      if (editing && onEdit) {
        /* `null`, not absent, when the field has been cleared. Absent means
           "leave it alone" — so without this, emptying the box would look like
           it detached the receipt and silently keep the old reference. */
        await onEdit(claim.id, {
          typeId: type.id,
          amount,
          incurredOn,
          description: description.trim(),
          receiptKey: reference === "" ? null : reference,
        });
      } else {
        await onSubmit({
          typeId: type.id,
          amount,
          incurredOn,
          description: description.trim(),
          ...(reference ? { receiptKey: reference } : {}),
          ...(forWhom && forWhom !== myEmployeeId ? { employeeId: forWhom } : {}),
        });
      }
      onClose();
    } catch (error) {
      const breach = policyBreach(error);
      if (breach?.limit === "capAmount") {
        setFieldError({
          field: "amount",
          message:
            error instanceof ApiError
              ? error.message
              : `Over the cap for ${breach.typeName}.`,
        });
      } else if (breach?.limit === "requiresReceipt") {
        setFieldError({
          field: "receipt",
          message:
            error instanceof ApiError
              ? error.message
              : `${breach.typeName} needs a receipt.`,
        });
      } else {
        setFailure(
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit this claim" : "Claim an expense"}
      description={
        editing
          ? "You can change it while it is still waiting for a decision."
          : "Money you spent for work, and want back."
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {blocker && (
            <p className="mr-auto text-body-sm text-warning-text">{blocker}</p>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={busy || blocker !== null}
            onClick={() => void send()}
          >
            {editing ? "Save changes" : "Send for approval"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {failure && (
          <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2.5 text-body-sm text-danger-text">
            {failure}
          </p>
        )}

        {!editing && colleagues.length > 0 && (
          <Field
            label="Who is claiming"
            help="Yourself by default. Filing for somebody else is an HR action and is recorded as one."
          >
            <Select value={forWhom} onChange={(e) => setForWhom(e.target.value)}>
              {colleagues.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.id === myEmployeeId ? `${person.name} (you)` : person.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="What was it for" required>
          <Select
            value={typeId}
            placeholder="Choose one"
            onChange={(e) => {
              setTypeId(e.target.value);
              setFieldError(null);
            }}
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>
        </Field>

        {/* No badge stating a receipt is or is not needed, or what the cap
            is — a category with no rule set has neither yet, and a badge
            reading "No cap" or "No receipt needed" would read as a decision
            somebody made rather than the absence of one. The amount field's
            own cap note (below) and the receipt field's own asterisk still
            say the real rule the moment the company sets one. */}
        {type?.description && (
          <p className="-mt-2 text-body-sm text-muted">{type.description}</p>
        )}

        <Field
          label="What the money went on"
          required
          help="One line. Whoever approves it reads this and nothing else."
        >
          <Textarea
            rows={2}
            value={description}
            maxLength={300}
            placeholder="Diesel for the office generator during the outage"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <Field
          label="How much, in naira"
          required
          {...(fieldError?.field === "amount"
            ? { error: fieldError.message }
            : overCap && type
              ? {
                  error: `${type.name} is capped at ${money(type.cap ?? 0)} a claim. Split this into two, or ask for the cap to be raised.`,
                }
              : {})}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Input
              className="w-40"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amountText}
              onChange={(e) => {
                setAmountText(e.target.value);
                setFieldError(null);
              }}
            />
            {capNote && (
              <span
                className={
                  capNote.tone === "danger"
                    ? "text-body-sm font-medium text-danger-text"
                    : "text-body-sm text-muted"
                }
              >
                {capNote.text}
              </span>
            )}
          </div>
        </Field>

        <Field
          label="When the money went out"
          required
          help="The day you spent it, not today."
          {...(futureDated
            ? { error: "That date is in the future. Claim it once the money has gone out." }
            : {})}
        >
          <Input
            type="date"
            className="w-48"
            max={today()}
            value={incurredOn}
            onChange={(e) => setIncurredOn(e.target.value)}
          />
        </Field>

        <Field
          label="Receipt reference"
          required={type?.requiresReceipt === true}
          help="Attachments are not turned on yet, so there is nothing to upload to. Type where the receipt is: the file name, the folder, or the number printed on it."
          {...(fieldError?.field === "receipt"
            ? { error: fieldError.message }
            : {})}
        >
          <Input
            icon={<Paperclip aria-hidden="true" />}
            value={receiptKey}
            maxLength={512}
            autoComplete="off"
            placeholder="Total filling station, 12 Aug, no. 0912"
            onChange={(e) => {
              setReceiptKey(e.target.value);
              setFieldError(null);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
