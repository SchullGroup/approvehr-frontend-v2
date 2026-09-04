"use client";

import { useState } from "react";
import { Button, Field, Input, Modal, Select, Switch } from "@/components/ui";
import type { ApiAttendanceDevice, ApiWorkLocation } from "@/lib/api/attendance";

/**
 * Registering or editing one terminal.
 *
 * ## The serial number is frozen after registration
 *
 * It is what the agent puts in `X-ApproveHR-Device`, so it is the device's
 * identity rather than a label. Changing it would silently stop every delivery
 * from a machine somebody is standing next to, with nothing on either side
 * saying why — and the API has no route to change it. Editing shows it, greyed,
 * so the person can read it off the screen and compare it with the sticker.
 *
 * ## Why the office matters more than it looks
 *
 * A punch inherits its work location from the device that recorded it. That is
 * the whole reason the agent never has to know any of our ids: somebody taps a
 * box on a wall, and the timesheet says which branch the day was worked at. A
 * device with no office still records attendance; it just cannot say where.
 *
 * ## `active` is not the same as switching a device off
 *
 * `active` is a temporary state for a unit that is away being repaired — it
 * still exists, it is still yours, and turning it back on is one switch. The
 * archive on the row is the deliberate one, and it is what the ingestion
 * endpoint refuses by name. Both refuse a delivery; only one of them is a
 * sentence somebody wrote down.
 */

type Draft = {
  serialNumber: string;
  label: string;
  workLocationId: string;
  active: boolean;
};

const toDraft = (device?: ApiAttendanceDevice): Draft => ({
  serialNumber: device?.serialNumber ?? "",
  label: device?.label ?? "",
  workLocationId: device?.workLocationId ?? "",
  active: device?.active ?? true,
});

export type DeviceDraft = {
  serialNumber: string;
  label: string;
  /** `null` detaches the office; a string sets it. */
  workLocationId: string | null;
  active: boolean;
};

export function DeviceForm({
  device,
  locations,
  onClose,
  onSave,
}: {
  device?: ApiAttendanceDevice;
  locations: ApiWorkLocation[];
  onClose: () => void;
  onSave: (draft: DeviceDraft) => Promise<void>;
}) {
  const editing = device !== undefined;
  const [draft, setDraft] = useState<Draft>(() => toDraft(device));
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const serialNumber = draft.serialNumber.trim();
  const label = draft.label.trim();
  const canSave = label !== "" && (editing || serialNumber !== "");

  async function save() {
    setBusy(true);
    try {
      await onSave({
        serialNumber,
        label,
        workLocationId: draft.workLocationId === "" ? null : draft.workLocationId,
        active: draft.active,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={editing ? `Edit ${device.label}` : "Register a terminal"}
      description={
        editing
          ? undefined
          : "One for each machine on a wall. Registering it produces the secret its agent signs with."
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!canSave}
            loading={busy}
            onClick={() => void save()}
          >
            {editing ? "Save" : "Register it"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Serial number"
          required={!editing}
          help={
            editing
              ? "Fixed once registered — it is what the agent sends to say which machine a delivery came from."
              : "As printed on the unit. Copy it exactly: this is what the agent sends to identify itself, character for character."
          }
        >
          <Input
            value={draft.serialNumber}
            disabled={editing}
            autoFocus={!editing}
            placeholder="ZK-4500-A1938274"
            onChange={(e) => {
              const value = e.target.value;
              set("serialNumber", value);
            }}
          />
        </Field>

        <Field
          label="Name"
          required
          help="What people here call it. It appears on every refusal the agent gets, so make it findable in a building."
        >
          <Input
            value={draft.label}
            autoFocus={editing}
            placeholder="Front gate"
            onChange={(e) => {
              const value = e.target.value;
              set("label", value);
            }}
          />
        </Field>

        <Field
          optional
          label="Where it stands"
          help="A tap inherits this office, which is how a timesheet says where the day was worked without the agent knowing anything about our records."
        >
          <Select
            value={draft.workLocationId}
            onChange={(e) => set("workLocationId", e.target.value)}
          >
            <option value="">Not set</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
        </Field>

        {editing && (
          <div className="rounded-lg border border-line bg-canvas p-4">
            <Switch
              label="Accepting deliveries"
              description={
                draft.active
                  ? "Taps from this terminal are recorded."
                  : "Deliveries are refused while this is off. Use it for a unit away being repaired — nothing it already sent is affected, and anything its agent buffers arrives when you turn it back on."
              }
              checked={draft.active}
              onChange={(e) => {
                const next = e.target.checked;
                set("active", next);
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
