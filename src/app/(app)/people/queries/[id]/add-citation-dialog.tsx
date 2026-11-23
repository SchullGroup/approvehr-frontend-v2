"use client";

import { useState } from "react";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  useToast,
} from "@/components/ui";
import {
  CITATION_KINDS,
  CITATION_KIND_LABEL,
  type ApiCitation,
  type CitationKind,
  type CiteBody,
} from "@/lib/api/query-ties";
import { useCitationOptions } from "@/lib/store/query-citation-options";
import { dayLabel } from "@/lib/store/conduct";
import { useQueryActions } from "@/lib/store/queries";
import { actionMessage } from "@/lib/use-action";
import { useOpenSession } from "@/lib/use-open-session";

/**
 * Add a reference to a draft.
 *
 * ## What it offers
 *
 * Six kinds. Four are a choice from the person's own records, read through each module's own
 * route (so a reader is offered only what they may already read there); two are a date (an
 * attendance day and a rota day have nothing to list). **The server copies the record** and is the
 * authority on what may be cited: a record that belongs to somebody else, a policy that is not
 * published, a day with no attendance. Its sentence is shown as it comes, with what was chosen
 * still there.
 *
 * ## What it says before the press
 *
 * One line per kind about what is copied and, for leave, what is deliberately not: the dates and
 * the status, never the type of leave or the reason, because either can be health information.
 *
 * A dialog that stays mounted starts blank each time it opens (`useOpenSession`): a reference
 * for one person must never be left chosen when it is opened for another letter.
 */
export function AddCitationDialog(props: {
  open: boolean;
  queryId: string;
  subject: { id: string; name: string };
  citations: ApiCitation[];
  onClose: () => void;
  /** Reads the query again, so the draft's warnings about the cited day follow. */
  onAdded: () => Promise<void>;
}) {
  const session = useOpenSession(props.open, props.queryId);
  return <AddCitationForm key={session} {...props} />;
}

const WHAT_IS_COPIED: Record<CitationKind, string> = {
  POLICY:
    "The policy and the version in force now, and whether this person accepted that version. The handbook keeps no earlier versions.",
  EQUIPMENT:
    "One item given to them: what it is, when it was given and handed back, its condition, and whether they confirmed receipt.",
  ATTENDANCE_DAY:
    "What that day showed and where each time came from. A time they clocked themselves is a claim, and a clock-out the system filled in is not a recorded time.",
  LEAVE_REQUEST:
    "The dates, the number of days and the status only. Never the type of leave and never the reason: either can be health information.",
  ROTA_DAY: "Their shift on that day and what became of it.",
  DOCUMENT_REQUEST:
    "A document that was asked of them: its name, when it is due and whether it was sent.",
};

const IS_DATE: readonly CitationKind[] = ["ATTENDANCE_DAY", "ROTA_DAY"];

function AddCitationForm({
  open,
  queryId,
  subject,
  onClose,
  onAdded,
}: {
  open: boolean;
  queryId: string;
  subject: { id: string; name: string };
  citations: ApiCitation[];
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const toast = useToast();
  const actions = useQueryActions();
  const [kind, setKind] = useState<CitationKind | "">("");
  const [chosen, setChosen] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const isDate = kind !== "" && IS_DATE.includes(kind);
  const options = useCitationOptions(kind, subject.id, dayLabel);

  const body: CiteBody | null =
    kind === ""
      ? null
      : kind === "ATTENDANCE_DAY" || kind === "ROTA_DAY"
        ? date === ""
          ? null
          : { kind, date }
        : chosen === ""
          ? null
          : kind === "POLICY"
            ? { kind, policyId: chosen }
            : kind === "EQUIPMENT"
              ? { kind, assignmentId: chosen }
              : kind === "LEAVE_REQUEST"
                ? { kind, leaveRequestId: chosen }
                : { kind, documentRequestId: chosen };

  async function add() {
    if (!body) return;
    setBusy(true);
    setProblem(null);
    try {
      await actions.addCitation(queryId, body);
      await onAdded();
      /* An act, never what was cited. */
      toast.push({ tone: "success", title: "Reference added" });
      onClose();
    } catch (error) {
      /* The server's own sentence, with what was chosen still on the form. */
      setProblem(actionMessage(error, "that reference"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Add a reference about ${subject.name}`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void add()} disabled={!body} loading={busy}>
            Add the reference
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="What kind of record" required>
          <Select
            value={kind}
            onChange={(event) => {
              const next = CITATION_KINDS.find(
                (candidate) => candidate === event.target.value,
              );
              setKind(next ?? "");
              setChosen("");
              setDate("");
              setProblem(null);
            }}
          >
            <option value="">Choose a kind of record</option>
            {CITATION_KINDS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {CITATION_KIND_LABEL[candidate]}
              </option>
            ))}
          </Select>
        </Field>

        {kind !== "" && (
          <p className="-mt-2 text-body-sm text-muted">{WHAT_IS_COPIED[kind]}</p>
        )}

        {isDate && (
          <Field label="Which day" required>
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
        )}

        {kind !== "" && !isDate && (
          <Field label="Which one" required>
            {options.loading ? (
              <span className="flex items-center gap-2 text-body-sm text-muted">
                <Spinner size="sm" /> Reading their records
              </span>
            ) : (
              <Select
                value={chosen}
                onChange={(event) => setChosen(event.target.value)}
              >
                <option value="">
                  {options.error
                    ? "Their records could not be read"
                    : options.options.length === 0
                      ? "There is nothing of this kind to cite"
                      : "Choose one"}
                </option>
                {options.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {kind !== "" && !isDate && options.cut && (
          <p className="-mt-2 text-meta text-muted">
            Only the first hundred are listed.
          </p>
        )}

        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
