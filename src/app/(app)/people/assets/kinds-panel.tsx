"use client";

import { useState } from "react";
import { Boxes, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  Switch,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { EquipmentKind, KindInput } from "@/lib/store/assets";

/**
 * Kinds of equipment — laptop, phone, SIM card.
 *
 * ## Why this is not a settings page somewhere else
 *
 * One switch on this table decides whether an exit checklist insists on getting
 * a thing back. That is the only reason kinds exist: a laptop has to come back,
 * a branded backpack does not, and a checklist that demands the backpack is a
 * checklist people learn to tick without reading. Burying that switch two
 * screens away from the register would hide the one decision on it that matters.
 *
 * ## Switched off, not deleted
 *
 * Switching a kind off takes it out of the picker and leaves it on everything
 * already recorded against it. Nothing here can delete a kind, because the
 * laptops filed under it would lose the flag that says they have to come back.
 */
export function KindsPanel({
  kinds,
  loading,
  canManage,
  includeInactive,
  onIncludeInactiveChange,
  onAdd,
  onEdit,
}: {
  kinds: EquipmentKind[];
  loading: boolean;
  /** `EDIT_RECORDS`. Everybody may read the list — a picker needs it. */
  canManage: boolean;
  includeInactive: boolean;
  onIncludeInactiveChange: (value: boolean) => void;
  onAdd: (input: KindInput) => Promise<boolean>;
  onEdit: (
    id: string,
    input: { name?: string; returnRequired?: boolean; active?: boolean },
  ) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <>
      <Card>
        <CardHeader
          title="Kinds of equipment"
          description="Whether a leaver has to hand one back is decided here."
          action={
            <div className="flex flex-wrap items-center gap-4">
              <Checkbox
                label="Show switched off"
                checked={includeInactive}
                onChange={(e) => {
                  const value = e.target.checked;
                  onIncludeInactiveChange(value);
                }}
              />
              {canManage && (
                <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
                  <Plus aria-hidden="true" className="size-4" />
                  Add a kind
                </Button>
              )}
            </div>
          }
        />

        {kinds.length === 0 ? (
          <EmptyState
            icon={<Boxes aria-hidden="true" />}
            title={loading ? "Loading…" : "No kinds yet"}
            description={
              loading
                ? "Reading the list."
                : "Add Laptop, Phone and SIM card and you have covered most of it."
            }
            {...(canManage && !loading
              ? {
                  action: (
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={() => setAdding(true)}
                    >
                      Add a kind
                    </Button>
                  ),
                }
              : {})}
          />
        ) : (
          <TableWrap className="rounded-none border-0" caption="Kinds of equipment">
            <THead>
              <TH>Kind</TH>
              <TH align="right">Things</TH>
              <TH>Hand back on exit</TH>
              <TH align="right">
                <span className="sr-only">Actions</span>
              </TH>
            </THead>
            <TBody>
              {kinds.map((kind) => (
                <TR key={kind.id} className={kind.active ? undefined : "opacity-60"}>
                  <TDPrimary
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        {kind.name}
                        {!kind.active && (
                          <Badge tone="neutral" size="sm">
                            Switched off
                          </Badge>
                        )}
                      </span>
                    }
                  />
                  <TD align="right" className="tabular text-[0.875rem]">
                    {kind.itemCount}
                  </TD>
                  <TD>
                    {canManage ? (
                      <Switch
                        label={kind.returnRequired ? "Yes" : "No"}
                        checked={kind.returnRequired}
                        onChange={(e) => {
                          const value = e.target.checked;
                          void onEdit(kind.id, { returnRequired: value });
                        }}
                      />
                    ) : (
                      <span className="text-[0.875rem] text-body">
                        {kind.returnRequired ? "Yes" : "No"}
                      </span>
                    )}
                  </TD>
                  <TD align="right">
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void onEdit(kind.id, { active: !kind.active })
                        }
                      >
                        {kind.active ? "Switch off" : "Switch on"}
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
      </Card>

      {adding && (
        <AddKindDialog onClose={() => setAdding(false)} onAdd={onAdd} />
      )}
    </>
  );
}

function AddKindDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (input: KindInput) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [returnRequired, setReturnRequired] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setRefusal(null);
    try {
      const ok = await onAdd({ name: name.trim(), returnRequired });
      if (ok) onClose();
      else setRefusal("That did not save. Try again.");
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
      size="sm"
      title="Add a kind of equipment"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={name.trim().length < 2 || busy}
            onClick={() => void submit()}
          >
            {busy ? "Adding…" : "Add it"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {refusal && (
          <p className="text-[0.875rem] leading-relaxed text-danger-text">
            {refusal}
          </p>
        )}

        <Field label="Name" required>
          <Input
            value={name}
            autoFocus
            placeholder="Laptop"
            onChange={(e) => {
              const value = e.target.value;
              setName(value);
            }}
          />
        </Field>

        <Switch
          label="A leaver has to hand it back"
          description="Off for things you give away — a branded backpack, a T-shirt."
          checked={returnRequired}
          onChange={(e) => {
            const value = e.target.checked;
            setReturnRequired(value);
          }}
        />
      </div>
    </Modal>
  );
}
