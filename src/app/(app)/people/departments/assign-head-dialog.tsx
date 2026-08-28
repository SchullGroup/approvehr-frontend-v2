"use client";

import { useState } from "react";
import { Button, Field, Modal, Select } from "@/components/ui";

/**
 * Give one department a head. Split out of the general edit form because a
 * head is the one field on a department everybody actually wants to set
 * quickly, and burying it behind "Edit" alongside name, parent and cost centre
 * made a common action the slowest one on the row.
 */
export function AssignHeadDialog({
  departmentName,
  currentHeadId,
  employees,
  busy = false,
  onClose,
  onAssign,
}: {
  departmentName: string;
  currentHeadId: string | null;
  employees: { id: string; name: string; jobTitle?: string | null }[];
  busy?: boolean;
  onClose: () => void;
  onAssign: (headId: string | null) => void;
}) {
  const [headId, setHeadId] = useState(currentHeadId ?? "");
  const unchanged = headId === (currentHeadId ?? "");

  return (
    <Modal
      open
      onClose={onClose}
      title={`Head of ${departmentName}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={busy || unchanged}
            onClick={() => onAssign(headId === "" ? null : headId)}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      {/* A plain `<select>`, not `Picker`: this dialog is one field tall, and
          `Picker`'s dropdown is absolutely positioned inside the modal's own
          scrollable body — which clips it the moment the list is taller than
          the field above it. A native select has nothing to clip. */}
      <Field
        label="Head"
        help="Responsible for everyone in the unit, including its sub-departments."
      >
        <Select
          value={headId}
          onChange={(e) => setHeadId(e.target.value)}
        >
          <option value="">Nobody assigned</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
              {employee.jobTitle ? ` — ${employee.jobTitle}` : ""}
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}
