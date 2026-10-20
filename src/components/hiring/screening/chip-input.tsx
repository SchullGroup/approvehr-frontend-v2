"use client";

import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Button, Field, FieldRow, Input, Select } from "@/components/ui";
import {
  LIMITS,
  aliasesFromText,
  chipsFromText,
  sameWord,
  tidy,
} from "@/lib/hiring/screening/criteria";
import type { Keyword } from "@/lib/hiring/screening/model";

/**
 * Skills as chips, each with the other ways a CV might write it.
 *
 * ## Typing
 *
 * Type a skill and press Enter or a comma. Paste a list and each line, comma or
 * semicolon makes its own chip; anything already in the list is left out, so
 * pasting twice adds once. There is an Add button for a phone keyboard, which has
 * no easy comma.
 *
 * ## Other spellings
 *
 * "Node.js", "NodeJS" and "Node" are one skill. Pressing the pencil on a chip opens
 * its name and its other spellings: the score looks for any of them, and the
 * explanation says which one it found.
 */
export function ChipInput({
  label,
  help,
  error,
  placeholder,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  help?: string;
  error?: string | undefined;
  placeholder?: string;
  value: Keyword[];
  onChange: (next: Keyword[]) => void;
  disabled?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  /** Turn what is typed into chips. Returns whether anything was added. */
  function commit(text: string) {
    const fresh = chipsFromText(text, value);
    if (fresh.length === 0) {
      setTyped("");
      return false;
    }
    onChange([...value, ...fresh].slice(0, LIMITS.keywords + 5));
    setTyped("");
    return true;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Field
        label={label}
        {...(help ? { help } : {})}
        {...(error ? { error } : {})}
      >
        <div className="flex gap-2">
          <Input
            value={typed}
            disabled={disabled}
            placeholder={placeholder}
            autoComplete="off"
            onChange={(event) => {
              const text = event.target.value;
              /* A comma or a new line ends a chip; pasting a list ends several. */
              if (/[,;\n]/.test(text)) commit(text);
              else setTyped(text);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit(typed);
              }
            }}
            onBlur={() => {
              if (tidy(typed) !== "") commit(typed);
            }}
          />
          <Button
            variant="secondary"
            disabled={disabled || tidy(typed) === ""}
            onClick={() => commit(typed)}
            className="shrink-0"
          >
            <Plus aria-hidden="true" className="size-4" />
            Add <span className="sr-only">to {label}</span>
          </Button>
        </div>
      </Field>

      {value.length > 0 && (
        <ul className="flex list-none flex-col gap-1.5 p-0" aria-label={label}>
          {value.map((chip) => (
            <li key={chip.id} className="min-w-0">
              {editing === chip.id ? (
                <ChipEditor
                  chip={chip}
                  taken={value.filter((other) => other.id !== chip.id)}
                  onDone={(next) => {
                    onChange(
                      value.map((existing) =>
                        existing.id === chip.id ? next : existing,
                      ),
                    );
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex min-w-0 items-center gap-1 rounded-md border border-line bg-canvas py-1 pl-3 pr-1">
                  <span className="min-w-0 flex-1 text-body-sm [overflow-wrap:anywhere]">
                    <span className="font-medium text-ink">{chip.label}</span>
                    {chip.aliases.length > 0 && (
                      <span className="text-muted">
                        {" "}
                        also {chip.aliases.join(", ")}
                      </span>
                    )}
                    {chip.weight > 1 && (
                      <span className="text-muted">
                        {" "}
                        counts {chip.weight} times as much
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setEditing(chip.id)}
                    aria-label={`Edit ${chip.label} and its other spellings`}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-text [@media(pointer:coarse)]:size-10"
                  >
                    <Pencil aria-hidden="true" className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange(value.filter((other) => other.id !== chip.id))
                    }
                    aria-label={`Remove ${chip.label}`}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-text [@media(pointer:coarse)]:size-10"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChipEditor({
  chip,
  taken,
  onDone,
  onCancel,
}: {
  chip: Keyword;
  taken: Keyword[];
  onDone: (next: Keyword) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(chip.label);
  const [aliases, setAliases] = useState(chip.aliases.join(", "));
  const [weight, setWeight] = useState(chip.weight);
  const label = tidy(name).slice(0, LIMITS.label);
  const clash = taken.some((other) => sameWord(other.label, label));
  const problem =
    label === ""
      ? "A skill needs a name."
      : clash
        ? `"${label}" is already in this list.`
        : undefined;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-accent-line bg-accent-soft/40 p-3">
      <FieldRow>
        <Field label="Skill" {...(problem ? { error: problem } : {})}>
          <Input
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field
          label="Other ways it is written"
          optional
          help="Separate with commas."
        >
          <Input
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
          />
        </Field>
      </FieldRow>
      <Field
        label="How much it counts"
        help="Within its list. One is normal; five counts five times as much."
      >
        <Select
          value={String(weight)}
          onChange={(event) => setWeight(Number(event.target.value))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "1 (normal)" : String(n)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="accent"
          size="sm"
          disabled={problem !== undefined}
          onClick={() =>
            onDone({
              ...chip,
              label,
              aliases: aliasesFromText(aliases, label),
              weight,
            })
          }
        >
          Done
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
