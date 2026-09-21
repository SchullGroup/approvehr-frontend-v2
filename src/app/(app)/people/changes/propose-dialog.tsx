"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Callout,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type {
  ApiFieldSnapshot,
  EmploymentChangeBody,
} from "@/lib/api/endpoints";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useDepartments } from "@/lib/store/departments";
import { useEmploymentChangeActions } from "@/lib/store/employment-changes";
import { money } from "@/lib/pay/flags";

type Kind = EmploymentChangeBody["kind"];

const KINDS: { id: Kind; label: string; hint: string }[] = [
  {
    id: "PROMOTION",
    label: "Promotion",
    hint: "A new job title, usually a grade, usually more money.",
  },
  {
    id: "TRANSFER",
    label: "Transfer",
    hint: "Another department, office or manager. No more money implied — a move that also pays more is a promotion.",
  },
  {
    id: "GRADE_CHANGE",
    label: "Grade change",
    hint: "The grade moves and the job title does not. A regrade after a job evaluation is an ordinary act.",
  },
  {
    id: "PAY_CHANGE",
    label: "Pay change",
    hint: "Pay moves and nothing else does. A rise, a market correction, a cut.",
  },
];

/**
 * Propose a promotion, transfer, regrade or pay change.
 *
 * ## Only the fields you fill in are part of the change
 *
 * Every input starts blank and blank means "leave it alone". That is the one
 * thing on this form somebody could get wrong in a way that costs money: a
 * shape where every field carried the current value and was submitted whole
 * would make every proposal a claim about all six, so approving a transfer
 * would also re-affirm a salary nobody discussed. The API stores only what
 * moves, and this form only sends what was typed.
 *
 * ## The effective date leads, and it is not today by default
 *
 * `effectiveOn` is the whole feature — the change is written on that day and
 * not before — so it is the second field rather than a detail at the bottom.
 * It defaults to the first of next month, which is what a promotion effective
 * date almost always is and, more to the point, is never accidentally today:
 * a date left at today's would apply the moment it is approved, which is the
 * behaviour this design exists to avoid doing by accident.
 */
export function ProposeChangeDialog({ onClose }: { onClose: () => void }) {
  const { propose, readOnly } = useEmploymentChangeActions();
  const directory = useEmployeeDirectory();
  const departments = useDepartments();
  const toast = useToast();

  const [employeeId, setEmployeeId] = useState("");
  const [kind, setKind] = useState<Kind>("PROMOTION");
  const [effectiveOn, setEffectiveOn] = useState(firstOfNextMonth);
  const [jobTitle, setJobTitle] = useState("");
  const [grossMonthly, setGrossMonthly] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const person = useMemo(
    () => directory.employees.find((row) => row.id === employeeId),
    [directory.employees, employeeId],
  );

  const kindHint = KINDS.find((k) => k.id === kind)?.hint ?? "";

  /* Built once, read twice — for the submit guard and for the summary. A
     second copy assembled at submit time is how a form comes to send something
     other than what it showed. */
  const to = useMemo<ApiFieldSnapshot>(() => {
    const next: ApiFieldSnapshot = {};
    if (jobTitle.trim()) next.jobTitle = jobTitle.trim();
    if (grossMonthly.trim()) {
      const naira = Number(grossMonthly);
      if (Number.isFinite(naira) && naira >= 0) {
        /* Kobo, and rounded once. Typing 450000.005 is not a salary, and a
           float reaching the API would be the one money bug this codebase has
           already paid for twice. */
        next.grossMonthlyKobo = Math.round(naira * 100);
      }
    }
    if (departmentId) next.departmentId = departmentId;
    return next;
  }, [jobTitle, grossMonthly, departmentId]);

  const movesSomething = Object.keys(to).length > 0;
  const canSave =
    !saving &&
    !readOnly &&
    employeeId !== "" &&
    movesSomething &&
    note.trim() !== "";

  async function save() {
    setSaving(true);
    setFailure(null);
    try {
      await propose({ employeeId, kind, effectiveOn, to, note: note.trim() });
      toast.push({
        tone: "success",
        title: `Proposed for ${person ? `${person.firstName} ${person.lastName}` : "them"}`,
        detail:
          "It is waiting for somebody who can approve employment changes.",
      });
      onClose();
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Something went wrong. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Propose an employment change"
      description="It goes to somebody who can approve it, and is written on the date you set — not before."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!canSave}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Send for approval"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Who" required>
          <Select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.currentTarget.value)}
          >
            <option value="">Choose somebody</option>
            {directory.employees.map((row) => (
              <option key={row.id} value={row.id}>
                {row.firstName} {row.lastName} — {row.jobTitle}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="What kind of change" help={kindHint}>
          <Select
            value={kind}
            onChange={(e) => setKind(e.currentTarget.value as Kind)}
          >
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Takes effect on"
          required
          help="Their record is written on this day and not before. A date in the past is refused — payslips already issued were worked out on the old figures."
        >
          <Input
            type="date"
            value={effectiveOn}
            onChange={(e) => setEffectiveOn(e.currentTarget.value)}
          />
        </Field>

        {/* The rule, said once, above the fields it applies to. */}
        <Callout tone="info" title="Fill in only what changes">
          A transfer that leaves the pay box empty does not touch their pay.
        </Callout>

        <Field
          label="New job title"
          {...(person ? { help: `Currently ${person.jobTitle}.` } : {})}
          optional
        >
          <Input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.currentTarget.value)}
            placeholder="Leave blank to keep it"
          />
        </Field>

        <Field
          label="New monthly pay"
          optional
          {...(person?.grossMonthly
            ? {
                help: `Currently ${money(Math.round(person.grossMonthly * 100))}.`,
              }
            : { help: "In naira." })}
        >
          <Input
            type="number"
            min={0}
            step="0.01"
            value={grossMonthly}
            onChange={(e) => setGrossMonthly(e.currentTarget.value)}
            placeholder="Leave blank to keep it"
          />
        </Field>

        <Field label="New department" optional>
          <Select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.currentTarget.value)}
          >
            <option value="">Leave it as it is</option>
            {departments.flat.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Why"
          required
          help="This is the part somebody reads back in a dispute years later."
        >
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
        </Field>

        {!movesSomething && employeeId !== "" && (
          <Callout tone="warning" title="Nothing is being changed">
            Fill in at least one of the three boxes above, or there is nothing
            for anybody to approve.
          </Callout>
        )}

        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}

/**
 * The first of next month.
 *
 * Never today, deliberately: a date left at today's applies the moment it is
 * approved, and this whole feature exists so that does not happen by accident.
 */
function firstOfNextMonth(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return next.toISOString().slice(0, 10);
}
