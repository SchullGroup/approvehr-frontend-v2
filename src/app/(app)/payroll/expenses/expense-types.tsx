"use client";

import { useState } from "react";
import { Plus, RotateCcw, Tags, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Money,
  Switch,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import type {
  CreateTypeInput,
  ExpenseType,
  UpdateTypeInput,
} from "@/lib/store/reimbursements";
import { parseAmount } from "./claim-form";

/**
 * What people are allowed to claim for.
 *
 * Small on purpose. A type is a name, a cap and whether a receipt is needed —
 * three decisions, and every one of them is enforced on the claim form the
 * moment somebody picks the type. There is nothing else worth configuring here,
 * and PARITY.md's Rule 3 says the list ships populated: a business should not
 * have to invent "Transport" before their driver can claim a bus fare.
 *
 * ## Archive, never delete
 *
 * A past claim references the type it was made under, so deleting one would
 * leave old money with nothing to explain it. Archiving hides it from the claim
 * form and keeps the history readable. The API refuses to archive a type while
 * claims of that kind are still undecided, and names how many — and switching an
 * archived type back on un-archives it, which is how a freed name gets reused.
 */
export function ExpenseTypes({
  types,
  loading,
  canManage,
  includeArchived,
  onIncludeArchivedChange,
  onCreate,
  onUpdate,
  onArchive,
}: {
  types: ExpenseType[];
  loading: boolean;
  canManage: boolean;
  includeArchived: boolean;
  onIncludeArchivedChange: (value: boolean) => void;
  onCreate: (input: CreateTypeInput) => Promise<boolean>;
  onUpdate: (id: string, input: UpdateTypeInput) => Promise<boolean>;
  onArchive: (type: ExpenseType) => Promise<boolean>;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ExpenseType | null>(null);
  const [archiving, setArchiving] = useState<ExpenseType | null>(null);

  return (
    <>
      <Card>
        <CardHeader
          title="Expense types"
          description="Each one carries its own cap and receipt rule."
          action={
            <div className="flex flex-wrap items-center gap-4">
              <Checkbox
                label="Show archived"
                checked={includeArchived}
                onChange={(e) => onIncludeArchivedChange(e.target.checked)}
              />
              {canManage && (
                <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                  <Plus aria-hidden="true" className="size-3.5" />
                  Add a type
                </Button>
              )}
            </div>
          }
        />

        {types.length === 0 ? (
          <EmptyState
            icon={<Tags aria-hidden="true" />}
            title={loading ? "Loading…" : "No expense types yet"}
            description={
              loading
                ? "Reading your types."
                : "Add the first one — transport and fuel are what most companies start with."
            }
            {...(canManage && !loading
              ? {
                  action: (
                    <Button variant="accent" size="sm" onClick={() => setCreating(true)}>
                      Add a type
                    </Button>
                  ),
                }
              : {})}
          />
        ) : (
          <TableWrap className="rounded-none border-0" caption="Expense types">
            <THead>
              <TH>Type</TH>
              <TH>Receipt</TH>
              <TH align="right">Cap a claim</TH>
              <TH align="right">Claims</TH>
              {canManage && <TH align="right">Change</TH>}
            </THead>
            <TBody>
              {types.map((type) => (
                <TR key={type.id}>
                  <TD className="max-w-[24rem]">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{type.name}</span>
                      {type.archived && (
                        <Badge tone="neutral" size="sm">
                          Archived
                        </Badge>
                      )}
                      {!type.archived && !type.active && (
                        <Badge tone="warning" size="sm">
                          Switched off
                        </Badge>
                      )}
                    </span>
                    {type.description && (
                      <span className="mt-0.5 block text-body-sm text-muted">
                        {type.description}
                      </span>
                    )}
                  </TD>

                  <TD>
                    {type.requiresReceipt ? (
                      <Badge tone="warning" size="sm">
                        Needed
                      </Badge>
                    ) : (
                      <span className="text-body-sm text-muted">Not needed</span>
                    )}
                  </TD>

                  <TD align="right" className="tabular text-ink">
                    {type.cap === null ? (
                      <span className="text-muted">No cap</span>
                    ) : (
                      <Money amount={type.cap} decimals />
                    )}
                  </TD>

                  <TD align="right" className="tabular text-body">
                    {type.claimCount}
                  </TD>

                  {canManage && (
                    <TD align="right">
                      <div className="flex justify-end gap-1.5">
                        {type.archived ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void onUpdate(type.id, { active: true })}
                          >
                            <RotateCcw aria-hidden="true" className="size-3.5" />
                            Switch back on
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(type)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Archive ${type.name}`}
                              onClick={() => setArchiving(type)}
                            >
                              <Trash2 aria-hidden="true" className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
      </Card>

      {creating && (
        <TypeDialog
          onClose={() => setCreating(false)}
          onSave={async (input) => {
            const ok = await onCreate(input);
            if (ok) setCreating(false);
          }}
        />
      )}

      {editing && (
        <TypeDialog
          type={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const ok = await onUpdate(editing.id, input);
            if (ok) setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title={`Archive ${archiving?.name ?? ""}?`}
        confirmLabel="Archive"
        tone="danger"
        body={
          archiving
            ? `Nobody will be able to claim ${archiving.name} again. Its ${archiving.claimCount} past ${archiving.claimCount === 1 ? "claim stays" : "claims stay"} on the record, and anything already approved still gets paid.`
            : ""
        }
        onConfirm={() => {
          if (!archiving) return;
          void onArchive(archiving).then((ok) => {
            if (ok) setArchiving(null);
          });
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function TypeDialog({
  type,
  onClose,
  onSave,
}: {
  type?: ExpenseType;
  onClose: () => void;
  onSave: (input: CreateTypeInput) => Promise<void>;
}) {
  const [name, setName] = useState(type?.name ?? "");
  const [description, setDescription] = useState(type?.description ?? "");
  const [requiresReceipt, setRequiresReceipt] = useState(
    type?.requiresReceipt ?? true,
  );
  const [capText, setCapText] = useState(
    type?.cap === null || type?.cap === undefined ? "" : type.cap.toFixed(2),
  );
  const [busy, setBusy] = useState(false);

  const cap = capText.trim() === "" ? null : parseAmount(capText);
  const capBroken = capText.trim() !== "" && cap === null;
  const blocked = name.trim().length < 2 || capBroken;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={type ? `Edit ${type.name}` : "Add an expense type"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={busy || blocked}
            onClick={() => {
              setBusy(true);
              void onSave({
                name: name.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
                requiresReceipt,
                cap,
              }).finally(() => setBusy(false));
            }}
          >
            {type ? "Save" : "Add type"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required>
          <Input
            autoFocus
            value={name}
            maxLength={60}
            placeholder="Transport"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label="What it covers"
          help="Shown on the claim form, so somebody picks the right one."
        >
          <Input
            value={description}
            maxLength={300}
            placeholder="Buses, keke and ride-hailing for work trips around town"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <Field
          label="Cap a claim, in naira"
          help="Leave it empty for no cap. Anything over this is refused on the claim form, with the figure shown."
          {...(capBroken ? { error: "Enter an amount like 25000 or 25000.00." } : {})}
        >
          <Input
            className="w-40"
            inputMode="decimal"
            autoComplete="off"
            placeholder="No cap"
            value={capText}
            onChange={(e) => setCapText(e.target.value)}
          />
        </Field>

        <Switch
          label="A receipt is needed"
          description="Turn this off for things that produce no paper — a keke fare, a recharge card."
          checked={requiresReceipt}
          onChange={(e) => setRequiresReceipt(e.target.checked)}
        />
      </div>
    </Modal>
  );
}
