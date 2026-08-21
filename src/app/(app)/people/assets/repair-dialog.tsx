"use client";

import { useState } from "react";
import { Button, Callout, Field, Input, Modal, Textarea } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  today,
  type EquipmentItem,
  type RepairInput,
} from "@/lib/store/assets";

/**
 * Log a repair.
 *
 * ## The one sentence this dialog has to be honest about
 *
 * Sending a laptop for repair does **not** take it off the holder's record. If
 * Adaeze has it and it goes to Computer Village, it is still hers to account
 * for — she is the one who dropped it off, and a register that quietly let her
 * off would be worse than no register. So the copy says which of the two will
 * happen, once, before the button — because the alternative is somebody
 * discovering it on the exit checklist.
 *
 * ## Both dates at once
 *
 * "Finished on" is here because most repairs get written down after the fact.
 * Filling both in logs a repair that already happened and leaves the item where
 * it is. Leaving it blank opens the job, and the item moves to the workshop if
 * nobody is holding it.
 */
export function RepairDialog({
  item,
  onClose,
  onLog,
}: {
  item: EquipmentItem;
  onClose: () => void;
  onLog: (input: RepairInput) => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const [startedOn, setStartedOn] = useState(today());
  const [completedOn, setCompletedOn] = useState("");
  const [cost, setCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const costNumber = cost.trim() === "" ? null : Number(cost);
  const costInvalid =
    costNumber !== null && (Number.isNaN(costNumber) || costNumber < 0);
  const datesWrong = completedOn !== "" && completedOn < startedOn;

  const ready = description.trim().length >= 3 && !costInvalid && !datesWrong;

  async function submit() {
    setBusy(true);
    setRefusal(null);
    try {
      await onLog({
        description: description.trim(),
        startedOn,
        ...(completedOn ? { completedOn } : {}),
        ...(costNumber === null ? {} : { cost: costNumber }),
        ...(vendor.trim() ? { vendor: vendor.trim() } : {}),
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
      title={`Repair ${item.name}`}
      description={`Tag ${item.tag}`}
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
            {busy ? "Saving…" : "Log the repair"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {refusal && (
          <Callout tone="warning" title="Not logged">
            {refusal}
          </Callout>
        )}

        <p className="text-body-sm leading-relaxed text-body">
          {item.holder
            ? `${item.holder.name} keeps it on their record while it is being fixed.`
            : completedOn === ""
              ? "It moves to the workshop, so nobody can be handed it until this is finished."
              : "Already finished, so it stays where it is."}
        </p>

        <Field label="What is being fixed" required>
          <Textarea
            rows={2}
            autoFocus
            value={description}
            placeholder="Cracked screen — panel replacement"
            onChange={(e) => {
              const value = e.target.value;
              setDescription(value);
            }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Went in on">
            <Input
              type="date"
              value={startedOn}
              max={today()}
              onChange={(e) => {
                const value = e.target.value;
                setStartedOn(value);
              }}
            />
          </Field>

          <Field
            label="Finished on"
            help="Leave blank while it is still being fixed."
            {...(datesWrong
              ? { error: "It cannot be finished before it went in." }
              : {})}
          >
            <Input
              type="date"
              value={completedOn}
              min={startedOn}
              max={today()}
              onChange={(e) => {
                const value = e.target.value;
                setCompletedOn(value);
              }}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="What it cost, in naira"
            {...(costInvalid ? { error: "Enter a figure like 145000." } : {})}
          >
            <Input
              inputMode="decimal"
              value={cost}
              placeholder="145000"
              onChange={(e) => {
                const value = e.target.value;
                setCost(value);
              }}
            />
          </Field>

          <Field label="Who is fixing it">
            <Input
              value={vendor}
              placeholder="Computer Village, Ikeja"
              onChange={(e) => {
                const value = e.target.value;
                setVendor(value);
              }}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
