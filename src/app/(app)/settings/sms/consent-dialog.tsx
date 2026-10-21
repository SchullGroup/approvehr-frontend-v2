"use client";

import { useMemo, useState } from "react";
import { Button, Field, Input, Modal, Picker } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  EVIDENCE_MAX,
  EVIDENCE_MIN,
  EVIDENCE_PROBLEM,
  smsApi,
  type ApiSmsChange,
} from "@/lib/api/sms";
import { useEmployeeDirectory } from "@/lib/store/employees-api";

/**
 * HR records consent that a signed form backs.
 *
 * ## What is asked for, and why each part
 *
 * - **Where the form is filed.** Required, five characters at least. There is no
 *   verbal option on purpose: consent that cannot be shown later is not consent,
 *   and this reference is what lets HR show it. It is kept with the consent
 *   record on the API; the people list does not show it back, which is a gap
 *   named in the handover note and not something this dialog can fix.
 * - **A number, optional.** Left empty, the number on the employee's record is
 *   used if it is a Nigerian mobile. A number typed here is the number texted,
 *   and the one the employee is taken to have agreed to.
 * - **Who.** From a row, the person is fixed. From the page, HR picks one, which
 *   is the only way to record a first consent for somebody with no row yet.
 *
 * ## What it cannot do
 *
 * It cannot undo an opt-out the employee made. The API refuses that with a 422 and
 * the row menu says so before it gets here; the sentence arrives in the dialog if
 * a person who is not on the list turns out to be one of them.
 *
 * Refusals are shown in the dialog in the API's own sentence, beside the field it
 * is about when it names one.
 */

export type ConsentTarget = { id: string; name: string };

export function RecordConsentDialog({
  target,
  onClose,
  onDone,
}: {
  /** Fixed when opened from a row, absent when HR is to choose. */
  target: ConsentTarget | null;
  onClose: () => void;
  onDone: (result: ApiSmsChange) => void;
}) {
  const [chosen, setChosen] = useState("");
  const [phone, setPhone] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);

  const employeeId = target?.id ?? chosen;
  const trimmedEvidence = evidence.trim();
  /* Said as soon as there is something short to say it about, and not on an empty
     box that nobody has touched. */
  const evidenceShort =
    trimmedEvidence.length > 0 && trimmedEvidence.length < EVIDENCE_MIN;
  const ready = employeeId !== "" && trimmedEvidence.length >= EVIDENCE_MIN;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setProblem(null);
    try {
      const phoneNumber = phone.trim();
      onDone(
        await smsApi.recordConsent(employeeId, {
          ...(phoneNumber ? { phone: phoneNumber } : {}),
          evidence: trimmedEvidence,
        }),
      );
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? error
          : new ApiError(0, "unknown", "Something went wrong. Try again."),
      );
      setBusy(false);
    }
  }

  const general =
    problem && problem.fieldErrors.length === 0 ? problem.message : null;
  const evidenceError =
    problem?.messageFor("evidence") ??
    (evidenceShort ? EVIDENCE_PROBLEM : null);
  const phoneError = problem?.messageFor("phone") ?? null;

  return (
    <Modal
      open
      onClose={onClose}
      title={
        target ? `Record written consent for ${target.name}` : "Record consent"
      }
      description="Only when you hold a signed form."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={!ready}
            onClick={() => void submit()}
          >
            Record consent
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {!target && <EmployeeField value={chosen} onChange={setChosen} />}

        <Field
          label="Where the signed form is filed"
          required
          help="A form number or a folder, for example HR/TEXT/0042. It stays with the consent record."
          {...(evidenceError ? { error: evidenceError } : {})}
        >
          <Input
            value={evidence}
            maxLength={EVIDENCE_MAX}
            onChange={(event) => setEvidence(event.currentTarget.value)}
          />
        </Field>

        <Field
          label="Mobile number"
          optional
          help="Leave it empty to use the number on their record."
          {...(phoneError ? { error: phoneError } : {})}
        >
          <Input
            type="tel"
            autoComplete="off"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.currentTarget.value)}
          />
        </Field>

        {general && (
          <p role="alert" className="text-body-sm text-danger-text">
            {general}
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * Who, when HR is choosing.
 *
 * Its own component so the directory is only asked for when there is a choice to
 * make: from a row the person is already known, and a request for two hundred
 * names to fill a picker nobody sees would be waste. The first two hundred are what
 * the directory hook hands back; the picker filters those, which is the same limit
 * the documents screen works to.
 */
function EmployeeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { employees, loading } = useEmployeeDirectory({ pageSize: 200 });
  const options = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label: `${employee.firstName} ${employee.lastName}`,
        hint: employee.jobTitle
          ? `${employee.employeeNo}, ${employee.jobTitle}`
          : employee.employeeNo,
      })),
    [employees],
  );
  return (
    <Field label="Employee" required>
      <Picker
        value={value}
        onChange={onChange}
        options={options}
        loading={loading}
        placeholder="Choose a person"
        searchable
      />
    </Field>
  );
}
