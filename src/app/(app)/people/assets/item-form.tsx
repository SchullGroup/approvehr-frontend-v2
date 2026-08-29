"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Callout,
  Disclosure,
  Field,
  Input,
  Modal,
  Picker,
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
import { useDepartments } from "@/lib/store/departments";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useWorkLocations } from "@/lib/store/work-locations";

/**
 * Add or edit one piece of equipment.
 *
 * ## Two required fields, and the rest optional
 *
 * The tag and what it is. Everything a stock-take or a departmental cost
 * report needs — location, department, make, model, serial, what it cost — can
 * be filled in later, because the alternative is an owner with thirty laptops
 * abandoning the form on the first one. A tag that is already on something is
 * refused by name: "Tag AHR-LT-01 is already on MacBook Air". Those fields sit
 * behind "More details", closed by default, so the form somebody actually
 * fills in — register it, say who has it — is five fields, not twelve.
 *
 * ## Assigning it here is the hand-over flow, run once, at creation
 *
 * "Assign to" only appears while adding: creating and handing over is one
 * click, not two screens, for the ordinary case of a laptop bought for a named
 * person. It calls the exact same write `HandOverDialog` does, which is why
 * editing an *existing* item still uses that dialog rather than a second copy
 * of an assignee field here — reassigning something already on the register is
 * a decision with a "who has it now" history behind it, which belongs on the
 * item panel where that history is visible.
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
  onCreateKind,
  onClose,
  onCreate,
  onSave,
}: {
  /** Absent means "add". Present means "edit this one". */
  item?: EquipmentItem;
  kinds: EquipmentKind[];
  /**
   * Opens the add-a-kind dialog over this form.
   *
   * Optional: where it is absent the picker has no create row, which is right
   * for a reader who may not change the company's list.
   */
  onCreateKind?: () => void;
  onClose: () => void;
  onCreate?: (
    input: ItemInput,
    assignTo?: { employeeId: string },
  ) => Promise<void>;
  onSave?: (patch: ItemPatch) => Promise<void>;
}) {
  const editing = item !== undefined;

  const departments = useDepartments();
  const locations = useWorkLocations();
  /* Fetched the same way regardless of create/edit, same as departments and
     locations above — a directory read is no heavier than either of those. */
  const { employees, loading: peopleLoading } = useEmployeeDirectory({
    pageSize: 200,
  });
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

  const [tag, setTag] = useState(item?.tag ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [assigneeId, setAssigneeId] = useState("");
  const [kindId, setKindId] = useState(item?.kindId ?? "");
  const [departmentId, setDepartmentId] = useState(item?.departmentId ?? "");
  const [workLocationId, setWorkLocationId] = useState(
    item?.workLocationId ?? "",
  );
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
          departmentId: departmentId === "" ? null : departmentId,
          workLocationId: workLocationId === "" ? null : workLocationId,
          make: make.trim() === "" ? null : make.trim(),
          model: model.trim() === "" ? null : model.trim(),
          serialNumber: serialNumber.trim() === "" ? null : serialNumber.trim(),
          purchasedOn: purchasedOn === "" ? null : purchasedOn,
          cost: costNumber,
          condition,
          notes: notes.trim() === "" ? null : notes.trim(),
        });
      } else if (onCreate) {
        await onCreate(
          {
            tag: tag.trim(),
            name: name.trim(),
            ...(kindId ? { kindId } : {}),
            ...(departmentId ? { departmentId } : {}),
            ...(workLocationId ? { workLocationId } : {}),
            ...(make.trim() ? { make: make.trim() } : {}),
            ...(model.trim() ? { model: model.trim() } : {}),
            ...(serialNumber.trim()
              ? { serialNumber: serialNumber.trim() }
              : {}),
            ...(purchasedOn ? { purchasedOn } : {}),
            ...(costNumber === null ? {} : { cost: costNumber }),
            condition,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          },
          assigneeId ? { employeeId: assigneeId } : undefined,
        );
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
          : "A tag, what it is, and who has it if you already know. Everything else can wait."
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

        {!editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Only while adding — see the header on why reassigning an
                existing item stays on `HandOverDialog` instead of here. */}
            <Field
              label="Assign to"
              optional
              help={peopleLoading ? "Loading the staff list." : undefined}
            >
              <Select
                value={assigneeId}
                placeholder="Leave it in the store room"
                onChange={(e) => {
                  const value = e.target.value;
                  setAssigneeId(value);
                }}
              >
                {colleagues.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} — {person.detail}
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
        )}

        {editing && (
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
        )}

        <Field
          label="Kind"
          help="Decides whether it must be handed back when somebody leaves."
        >
          {/*
            `Picker`, not a native `<Select>`. The native one rendered the
            platform's own wheel on a phone and, more to the point, had
            nowhere to put "add a new kind" — so somebody with a kind of kit
            the list did not cover had to abandon a half-filled form, find the
            Kinds tab, add it, and start again. The create row is last in the
            list, which is where the rest of the app puts it.
          */}
          <Picker
            value={kindId}
            onChange={setKindId}
            placeholder="Not sorted into a kind"
            options={kinds.map((kind) => ({
              value: kind.id,
              label: kind.returnRequired
                ? kind.name
                : `${kind.name} — nobody has to hand it back`,
            }))}
            {...(onCreateKind
              ? { onCreate: { label: "Add a new kind", onSelect: onCreateKind } }
              : {})}
          />
        </Field>

        <Disclosure
          title="More details"
          hint="Location, department, make, model, serial, what it cost."
          keepMounted
          region={false}
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Where it lives, and whose budget it is on — independent of
                  each other and of who is holding it (that's the handover
                  flow above). What a stock-take and a departmental cost
                  report read. */}
              <Field label="Work location" optional>
                <Picker
                  value={workLocationId}
                  onChange={setWorkLocationId}
                  placeholder="Not set"
                  loading={locations.loading}
                  options={locations.locations.map((l) => ({
                    value: l.id,
                    label: l.name,
                  }))}
                />
              </Field>

              <Field label="Department" optional>
                <Picker
                  value={departmentId}
                  onChange={setDepartmentId}
                  placeholder="Not assigned"
                  loading={departments.loading}
                  options={departments.flat.map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                />
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
                optional
                label="What it cost, in naira"
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
        </Disclosure>
      </div>
    </Modal>
  );
}
