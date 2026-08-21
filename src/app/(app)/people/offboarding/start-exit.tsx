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
 * HR recording somebody's exit.
 *
 * Four fields, and every one of them is used: who, what kind, when their last
 * day is, and why. `reason` is required because "why did they leave" is the
 * field every report and every unfair-dismissal question comes back to, and a
 * nullable column collects nulls.
 *
 * The employee themselves gets a shorter form — see `<Resign />`. This one is
 * longer only because it has to name a person and can record a dismissal.
 */
export function StartExitDialog({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: (exitId: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { start } = useStartExit();
  const { employees, loading: loadingPeople } = useEmployeeDirectory({
    pageSize: 200,
  });

  const [employeeId, setEmployeeId] = useState("");
  const [kind, setKind] = useState<ExitKind>("RESIGNATION");
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      title="Record a leaver"
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

        <Field label="Who is leaving" required>
          <Select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">
              {loadingPeople ? "Loading people…" : "Choose somebody"}
            </option>
            {employees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.firstName} {person.lastName} · {person.jobTitle}
              </option>
            ))}
          </Select>
        </Field>

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
