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
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import {
  CONDITIONS,
  CONDITION_LABEL,
  today,
  type AssetCondition,
  type EquipmentItem,
  type HandOverInput,
} from "@/lib/store/assets";

/**
 * Hand a piece of equipment to somebody.
 *
 * Three fields and a note: who, when, and what state it is in on the way out.
 *
 * ## Why the date is editable and defaults to today
 *
 * Handovers get recorded on Monday for something that happened on Friday. A
 * date the form fixes to "now" makes the register disagree with the signature
 * on the paper form, and the register is the thing an exit checklist is built
 * from. The API refuses a date in the future and says so.
 *
 * ## Why the condition is asked for here as well as on the way back
 *
 * The difference between the two is the entire evidence trail for "it was fine
 * when we gave it to him". Asking once produces an argument later.
 *
 * ## Why a refusal is shown inside this dialog
 *
 * If somebody already has it, the API answers with their name and staff number.
 * That sentence is the most useful thing the register ever says, so it is shown
 * where the action was taken rather than as a toast that scrolls away.
 */
export function HandOverDialog({
  item,
  onClose,
  onHandOver,
}: {
  item: EquipmentItem;
  onClose: () => void;
  onHandOver: (input: HandOverInput) => Promise<void>;
}) {
  const { employees, loading: peopleLoading } = useEmployeeDirectory({
    pageSize: 200,
  });

  const [employeeId, setEmployeeId] = useState("");
  const [assignedOn, setAssignedOn] = useState(today());
  const [condition, setCondition] = useState<AssetCondition>(item.condition);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const colleagues = useMemo(
    () =>
      employees
        .map((employee) => ({
          id: employee.id,
          name: `${employee.firstName} ${employee.lastName}`,
          detail: `${employee.employeeNo} · ${employee.jobTitle}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees],
  );

  async function submit() {
    setBusy(true);
    setRefusal(null);
    try {
      await onHandOver({
        employeeId,
        assignedOn,
        condition,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onClose();
    } catch (error) {
      setRefusal(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Hand over ${item.name}`}
      description={`Tag ${item.tag}${item.kind ? ` · ${item.kind}` : ""}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={employeeId === "" || busy}
            onClick={() => void submit()}
          >
            {busy ? "Recording…" : "Hand it over"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {refusal && (
          <Callout tone="warning" title="Not handed over">
            {refusal}
          </Callout>
        )}

        <Field
          label="Who is taking it"
          required
          help={peopleLoading ? "Loading the staff list." : undefined}
        >
          <Select
            value={employeeId}
            autoFocus
            placeholder="Choose somebody"
            onChange={(e) => {
              const value = e.target.value;
              setEmployeeId(value);
            }}
          >
            {colleagues.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} — {person.detail}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Handed over on" help="Not today? Put the real date.">
            <Input
              type="date"
              value={assignedOn}
              max={today()}
              onChange={(e) => {
                const value = e.target.value;
                setAssignedOn(value);
              }}
            />
          </Field>

          <Field
            label="What state it is in"
            help="Recorded again when it comes back."
          >
            <Select
              value={condition}
              onChange={(e) => {
                const value = e.target.value as AssetCondition;
                setCondition(value);
              }}
            >
              {CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {CONDITION_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Note" help="Anything worth remembering. Optional.">
          <Textarea
            rows={3}
            value={note}
            placeholder="Charger and case included."
            onChange={(e) => {
              const value = e.target.value;
              setNote(value);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
