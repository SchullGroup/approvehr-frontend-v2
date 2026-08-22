"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { EXIT_KINDS, type ExitKind } from "@/lib/api/offboarding";
import { useStartExit } from "@/lib/store/offboarding";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { TODAY } from "@/lib/today";

/**
 * Who this exit is about, when the caller already knows.
 *
 * `employeeId` alone would be enough to *submit*, and not enough to *render*:
 * the dialog has to say whose exit this is, and an id is not a sentence. So the
 * two travel together, and the union makes the id-without-a-name combination
 * unwriteable rather than something this file has to have a fallback for.
 *
 * The other half of the union is the plain "opened from the exit register" case,
 * where nobody has been chosen and the picker asks.
 */
type Subject =
  | { employeeId: string; employeeName: string }
  | { employeeId?: undefined; employeeName?: undefined };

/**
 * HR recording somebody's exit.
 *
 * Four fields, and every one of them is used: who, what kind, when their last
 * day is, and why. `reason` is required because "why did they leave" is the
 * field every report and every unfair-dismissal question comes back to, and a
 * nullable column collects nulls.
 *
 * The employee themselves gets a shorter form — see `<Resign />`. This one is
 * longer only because it has to name a person and can record a dismissal.
 *
 * ## Arriving from somebody's record
 *
 * Pass `employeeId` and `employeeName` and the dialog stops asking who. Two
 * things follow, and both are the point rather than side effects:
 *
 * 1. **The picker is not rendered, so the directory is never fetched.** It lives
 *    in `<PersonPicker />` below precisely so that the hook inside it does not
 *    run — a record page should not pull two hundred employees to record one
 *    person's exit, and a `<Select>` holding a preselected id with no matching
 *    option yet renders *blank* while the list is in flight, which is a wrong
 *    name on a consequential form.
 * 2. **The person is stated, not offered.** You opened this from their record;
 *    a picker there is a way to start the wrong person's exit from the right
 *    page. Cancel and open the register if it was somebody else.
 *
 * Nothing here pre-checks whether they already have an exit open. The API
 * refuses that by name — "…already has an exit in progress. Open that one
 * instead of starting a second." — and the demo store refuses in the same
 * words, so the refusal is shown rather than guessed at.
 */
export function StartExitDialog({
  onClose,
  onStarted,
  employeeId: fixedId,
  employeeName: fixedName,
}: {
  onClose: () => void;
  onStarted: (exitId: string) => void;
} & Subject) {
  const router = useRouter();
  const toast = useToast();
  const { start } = useStartExit();

  const [chosenId, setChosenId] = useState("");
  const [kind, setKind] = useState<ExitKind>("RESIGNATION");
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* The fixed subject wins outright. It is a prop, so it cannot be edited into
     disagreement with what the picker last held. */
  const employeeId = fixedId ?? chosenId;

  const ready =
    employeeId !== "" && lastWorkingDay !== "" && reason.trim().length >= 3;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const id = await start({
        employeeId,
        kind,
        reason: reason.trim(),
        lastWorkingDay,
      });
      toast.push({ title: "Exit started", tone: "success" });
      onStarted(id);
      router.push(`/people/offboarding/${id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not work. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Start an exit"
      description="This builds their leaving checklist straight away."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            {busy ? "Starting…" : "Start the checklist"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-danger-text">
            {error}
          </p>
        )}

        {fixedName === undefined ? (
          <PersonPicker value={chosenId} onChange={setChosenId} />
        ) : (
          /* Not a `<Field>`: it renders a `<label htmlFor>` against an id it
             generates, and with no control to carry that id the label points at
             nothing — the same defect the employee wizard had on six labels.
             There is nothing to fill in here, so there is nothing to label. */
          <div className="flex flex-col gap-1.5">
            <p className="text-body-sm font-medium text-ink">Who is leaving</p>
            <p className="rounded-md border border-line bg-canvas px-3 py-2 text-body text-ink">
              {fixedName}
            </p>
          </div>
        )}

        <Field label="What happened" required>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as ExitKind)}
          >
            {EXIT_KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Last working day"
          required
          help={`Their final day on the payroll. Today is ${TODAY}.`}
        >
          <Input
            type="date"
            value={lastWorkingDay}
            onChange={(e) => setLastWorkingDay(e.target.value)}
          />
        </Field>

        <Field label="Why" required help="A line is enough.">
          <Textarea
            rows={3}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Resigned to join another company."
          />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * The directory, as a picker.
 *
 * Its own component so that the fetch inside it is *not made* when the caller
 * already knows who is leaving — a hook cannot be called conditionally, but a
 * component can go unmounted. See the note on `StartExitDialog`.
 */
function PersonPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { employees, loading } = useEmployeeDirectory({ pageSize: 200 });

  return (
    <Field label="Who is leaving" required>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{loading ? "Loading people…" : "Choose somebody"}</option>
        {employees.map((person) => (
          <option key={person.id} value={person.id}>
            {person.firstName} {person.lastName} · {person.jobTitle}
          </option>
        ))}
      </Select>
    </Field>
  );
}
