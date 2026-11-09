"use client";

import { useState } from "react";
import { Button, Field, Input, Picker } from "@/components/ui";
import { useCan } from "@/lib/permissions";
import { useDepartments } from "@/lib/store/departments";

/**
 * The Department field of a new project or program. Required: every project and
 * program belongs to a department.
 *
 * A picker rather than a `<select>` so it can hold "Add a department": somebody
 * setting up their first program should not have to abandon the dialog, go to
 * Settings and start again. Only people who may manage settings see that action,
 * because creating a department is a `MANAGE_SETTINGS` act on the API. The new one
 * is added inline, under the field, and chosen at once: a dialog on top of a
 * dialog is one dialog too many.
 */
export function DepartmentField({
  value,
  onChange,
  error,
  help,
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string | undefined;
  help?: string | undefined;
}) {
  const departments = useDepartments();
  const canAdd = useCan("MANAGE_SETTINGS");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const live = departments.flat
    .filter((d) => !d.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
  const none = !departments.loading && live.length === 0;

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) {
      setAddError("Give the department a name.");
      return;
    }
    setBusy(true);
    setAddError(null);
    try {
      const made = await departments.create({ name: trimmed });
      onChange(made.id);
      setAdding(false);
      setName("");
    } catch (failure) {
      setAddError(
        failure instanceof Error ? failure.message : "That could not be added.",
      );
    } finally {
      setBusy(false);
    }
  }

  const startAdding = () => {
    setName("");
    setAddError(null);
    setAdding(true);
  };

  const shownHelp =
    none && !adding
      ? canAdd
        ? "Your company has no departments yet. Add the first one here."
        : "Your company has no departments yet. Ask HR to add one, then come back."
      : help;

  return (
    <div className="space-y-3">
      <Field
        label="Department"
        required
        {...(shownHelp ? { help: shownHelp } : {})}
        {...(error && !adding ? { error } : {})}
      >
        <Picker
          value={value}
          onChange={onChange}
          placeholder="Choose a department"
          loading={departments.loading}
          options={live.map((d) => ({ value: d.id, label: d.name }))}
          {...(canAdd
            ? { onCreate: { label: "Add a department", onSelect: startAdding } }
            : {})}
        />
      </Field>
      {canAdd && none && !adding && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={startAdding}
        >
          Add a department
        </Button>
      )}
      {adding && (
        <div className="rounded-md border border-line bg-sunken p-3">
          <Field
            label="New department"
            required
            {...(addError ? { error: addError } : {})}
          >
            <Input
              autoFocus
              value={name}
              placeholder="Operations"
              onChange={(event) => {
                setName(event.target.value);
                setAddError(null);
              }}
              /* Enter adds it rather than submitting the dialog around it. */
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void add();
                }
              }}
            />
          </Field>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAdding(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="accent"
              size="sm"
              loading={busy}
              onClick={() => void add()}
            >
              Add and use it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
