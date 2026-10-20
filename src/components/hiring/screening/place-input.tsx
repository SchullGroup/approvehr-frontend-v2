"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { placesFromText, tidy } from "@/lib/hiring/screening/criteria";

/**
 * The places that count: cities, states or countries, one chip each.
 *
 * Typed the same way as the skills (Enter or a comma, a pasted list makes several
 * chips), but plain: a place has no other spellings to manage.
 */
export function PlaceInput({
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
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [typed, setTyped] = useState("");

  function commit(text: string) {
    const next = placesFromText(text, value);
    setTyped("");
    if (next.length !== value.length) onChange(next);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Field
        label={label}
        optional
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
            Add <span className="sr-only">a place</span>
          </Button>
        </div>
      </Field>
      {value.length > 0 && (
        <ul className="flex list-none flex-wrap gap-1.5 p-0" aria-label={label}>
          {value.map((place) => (
            <li
              key={place}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas py-0.5 pl-3 pr-1 text-body-sm font-medium text-ink"
            >
              {place}
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange(value.filter((other) => other !== place))
                }
                aria-label={`Remove ${place}`}
                className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-text [@media(pointer:coarse)]:size-9"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
