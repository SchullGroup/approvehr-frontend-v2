"use client";

import { useState } from "react";
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
import {
  CONDITIONS,
  CONDITION_LABEL,
  today,
  type AssetCondition,
  type EquipmentItem,
  type EquipmentKind,
  type ItemInput,
  type ItemPatch,
} from "@/lib/store/assets";

/**
 * Add or edit one piece of equipment.
 *
 * ## Two required fields, and the rest optional
 *
 * The tag and what it is. Everything else — serial, make, model, what it cost —
 * can be filled in later, because the alternative is an owner with thirty
 * laptops abandoning the form on the first one. A tag that is already on
 * something is refused by name: "Tag AHR-LT-01 is already on MacBook Air".
 *
 * ## Why status is not on this form
 *
 * "Where it is" is not a fact somebody types. It follows from what has happened
 * to the thing: handing it over makes it assigned, taking it back makes it
 * available, a repair makes it a workshop item. The three changes a person
 * genuinely decides — it is lost, it turned up, it is written off — are buttons
 * on the item panel, where each one says what it does.
 */
export function ItemForm({
  item,
  kinds,
  onClose,
  onCreate,
  onSave,
}: {
  /** Absent means "add". Present means "edit this one". */
  item?: EquipmentItem;
  kinds: EquipmentKind[];
  onClose: () => void;
  onCreate?: (input: ItemInput) => Promise<void>;
  onSave?: (patch: ItemPatch) => Promise<void>;
}) {
  const editing = item !== undefined;

  const [tag, setTag] = useState(item?.tag ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [kindId, setKindId] = useState(item?.kindId ?? "");
  const [make, setMake] = useState(item?.make ?? "");
  const [model, setModel] = useState(item?.model ?? "");
  const [serialNumber, setSerialNumber] = useState(item?.serialNumber ?? "");
  const [purchasedOn, setPurchasedOn] = useState(item?.purchasedOn ?? "");
  const [cost, setCost] = useState(item?.cost === null || item?.cost === undefined ? "" : String(item.cost));
  const [condition, setCondition] = useState<AssetCondition>(
    item?.condition ?? "GOOD",
  );
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  /* Naira in the box, kobo on the wire — and the conversion happens in the
     store, not here. An empty box means "nobody knows", which is different
     from zero and is why this is a string until the moment it is sent. */
  const costNumber = cost.trim() === "" ? null : Number(cost);
  const costInvalid =
    costNumber !== null && (Number.isNaN(costNumber) || costNumber < 0);

  const ready = tag.trim().length > 0 && name.trim().length >= 2 && !costInvalid;

  async function submit() {
    setBusy(true);
    setRefusal(null);
    try {
      if (editing && onSave) {
        await onSave({
          tag: tag.trim(),
          name: name.trim(),
          kindId: kindId === "" ? null : kindId,
          make: make.trim() === "" ? null : make.trim(),
          model: model.trim() === "" ? null : model.trim(),
          serialNumber: serialNumber.trim() === "" ? null : serialNumber.trim(),
          purchasedOn: purchasedOn === "" ? null : purchasedOn,
          cost: costNumber,
          condition,
          notes: notes.trim() === "" ? null : notes.trim(),
        });
      } else if (onCreate) {
        await onCreate({
          tag: tag.trim(),
          name: name.trim(),
          ...(kindId ? { kindId } : {}),
          ...(make.trim() ? { make: make.trim() } : {}),
          ...(model.trim() ? { model: model.trim() } : {}),
          ...(serialNumber.trim() ? { serialNumber: serialNumber.trim() } : {}),
          ...(purchasedOn ? { purchasedOn } : {}),
          ...(costNumber === null ? {} : { cost: costNumber }),
          condition,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
      }
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
      size="lg"
      title={editing ? `Edit ${item.name}` : "Add equipment"}
      description={
        editing
          ? undefined
          : "A tag and what it is. The rest can wait until you have it in front of you."
      }
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
            {busy ? "Saving…" : editing ? "Save" : "Add it"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {refusal && (
          <Callout tone="warning" title="Not saved">
            {refusal}
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tag" required help="The label you would read off the case.">
            <Input
              value={tag}
              autoFocus={!editing}
              placeholder="AHR-LT-06"
              onChange={(e) => {
                const value = e.target.value;
                setTag(value);
              }}
            />
          </Field>

          <Field label="What it is" required>
            <Input
              value={name}
              placeholder="HP ProBook 450"
              onChange={(e) => {
                const value = e.target.value;
                setName(value);
              }}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Kind"
            help="Decides whether a leaver has to hand it back."
          >
            <Select
              value={kindId}
              onChange={(e) => {
                const value = e.target.value;
                setKindId(value);
              }}
            >
              <option value="">Not sorted into a kind</option>
              {kinds.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.name}
                  {kind.returnRequired ? "" : " — nobody has to hand it back"}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="What state it is in">
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

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Make">
            <Input
              value={make}
              placeholder="HP"
              onChange={(e) => {
                const value = e.target.value;
                setMake(value);
              }}
            />
          </Field>
          <Field label="Model">
            <Input
              value={model}
              placeholder="ProBook 450 G9"
              onChange={(e) => {
                const value = e.target.value;
                setModel(value);
              }}
            />
          </Field>
          <Field label="Serial number">
            <Input
              value={serialNumber}
              placeholder="5CD1207QZK"
              onChange={(e) => {
                const value = e.target.value;
                setSerialNumber(value);
              }}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bought on">
            <Input
              type="date"
              value={purchasedOn}
              max={today()}
              onChange={(e) => {
                const value = e.target.value;
                setPurchasedOn(value);
              }}
            />
          </Field>

          <Field
            label="What it cost, in naira"
            help="Leave it blank if nobody knows."
            {...(costInvalid ? { error: "Enter a figure like 780000." } : {})}
          >
            <Input
              inputMode="decimal"
              value={cost}
              placeholder="780000"
              onChange={(e) => {
                const value = e.target.value;
                setCost(value);
              }}
            />
          </Field>
        </div>

        <Field label="Notes" help="Where it lives, what came with it. Optional.">
          <Textarea
            rows={3}
            value={notes}
            placeholder="Kept at the Ikeja office. Charger and sleeve included."
            onChange={(e) => {
              const value = e.target.value;
              setNotes(value);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
