"use client";

import { useState } from "react";
import { CheckCircle2, Wrench } from "lucide-react";
import {
  Button,
  Callout,
  Field,
  FieldSet,
  Input,
  Modal,
  RadioCard,
  Select,
  Textarea,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  CONDITIONS,
  CONDITION_LABEL,
  dayLabel,
  today,
  type AssetCondition,
  type EquipmentItem,
  type ReturnOutcome,
  type TakeBackInput,
} from "@/lib/store/assets";

/**
 * Take a piece of equipment back.
 *
 * ## Two outcomes, not a condition dropdown pretending to be one
 *
 * "Came back fine" puts it back in the store, ready for the next person. "Came
 * back broken" sends it to the workshop instead — because a register that calls
 * a cracked laptop available will hand it to somebody, and then the register is
 * the reason a new starter got a broken laptop on day one.
 *
 * The API refuses `outcome: RETURNED` together with `condition: DAMAGED` at the
 * schema, so the two cannot contradict each other. This form makes that
 * impossible rather than merely refused: choosing "broken" fixes the condition
 * to Broken and the picker below only appears on the other branch.
 *
 * ## The note is added to the handover note, not over it
 *
 * Both are evidence. What was said when it went out and what was said when it
 * came back are the two halves of the same conversation.
 */
export function TakeBackDialog({
  item,
  onClose,
  onTakeBack,
}: {
  item: EquipmentItem;
  onClose: () => void;
  onTakeBack: (input: TakeBackInput) => Promise<void>;
}) {
  const [outcome, setOutcome] = useState<ReturnOutcome>("RETURNED");
  const [condition, setCondition] = useState<AssetCondition>(
    item.holder?.conditionOut ?? item.condition,
  );
  const [returnedOn, setReturnedOn] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const damaged = outcome === "DAMAGED";
  const holderName = item.holder?.name ?? "whoever has it";

  async function submit() {
    setBusy(true);
    setRefusal(null);
    try {
      await onTakeBack({
        outcome,
        returnedOn,
        /* On the damaged branch the API defaults the condition to Broken, so
           sending nothing is both correct and impossible to contradict. */
        ...(damaged ? {} : { condition }),
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
      title={`Take ${item.name} back`}
      description={
        item.holder
          ? `${holderName} has had it since ${dayLabel(item.holder.assignedOn)}.`
          : undefined
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" disabled={busy} onClick={() => void submit()}>
            {busy ? "Recording…" : "Take it back"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {refusal && (
          <Callout tone="warning" title="Not taken back">
            {refusal}
          </Callout>
        )}

        <FieldSet legend="How did it come back?">
          <div className="grid gap-3 sm:grid-cols-2">
            <RadioCard
              name="take-back-outcome"
              value="RETURNED"
              checked={outcome === "RETURNED"}
              onChange={() => setOutcome("RETURNED")}
              icon={<CheckCircle2 aria-hidden="true" />}
              label="Came back fine"
              description="Goes back in the store, ready for the next person."
            />
            <RadioCard
              name="take-back-outcome"
              value="DAMAGED"
              checked={damaged}
              onChange={() => setOutcome("DAMAGED")}
              icon={<Wrench aria-hidden="true" />}
              label="Came back broken"
              description="Goes to the workshop instead. Nobody can be handed it until it is fixed."
            />
          </div>
        </FieldSet>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Handed back on" help="Not today? Put the real date.">
            <Input
              type="date"
              value={returnedOn}
              max={today()}
              {...(item.holder ? { min: item.holder.assignedOn } : {})}
              onChange={(e) => {
                const value = e.target.value;
                setReturnedOn(value);
              }}
            />
          </Field>

          {!damaged && (
            <Field
              label="What state it is in"
              help={
                item.holder
                  ? `It went out ${CONDITION_LABEL[
                      item.holder.conditionOut
                    ].toLowerCase()}.`
                  : undefined
              }
            >
              <Select
                value={condition}
                onChange={(e) => {
                  const value = e.target.value as AssetCondition;
                  setCondition(value);
                }}
              >
                {CONDITIONS.filter((value) => value !== "DAMAGED").map((value) => (
                  <option key={value} value={value}>
                    {CONDITION_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <Field
          label="Note"
          help="Added to the handover note, not over it. Optional."
        >
          <Textarea
            rows={3}
            value={note}
            placeholder={
              damaged ? "Screen cracked in the car." : "Charger came back too."
            }
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
