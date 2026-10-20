"use client";

import { X } from "lucide-react";
import { IconButton, Picker } from "@/components/ui";

/**
 * A short list of people, with a way to add and to take off.
 *
 * Used for an interview stage's panel and for who is invited to one interview. It
 * does nothing itself: each add and each removal is handed to the caller, which
 * decides what it means (saved at once, or held until a form is submitted).
 */

export type Person = { id: string; name: string; jobTitle?: string };

export function PeopleEditor({
  label,
  empty,
  members,
  people,
  loading = false,
  disabled = false,
  max = 20,
  addPlaceholder = "Add somebody",
  onAdd,
  onRemove,
}: {
  /** Names the list for a screen reader, and the buttons that change it. */
  label: string;
  /** What to say when nobody is on it. */
  empty: string;
  members: readonly Person[];
  /** Everybody who could be added. */
  people: readonly Person[];
  loading?: boolean;
  disabled?: boolean;
  max?: number;
  addPlaceholder?: string;
  onAdd: (person: Person) => void;
  onRemove: (person: Person) => void;
}) {
  const have = new Set(members.map((member) => member.id));
  const options = people
    .filter((person) => !have.has(person.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((person) => ({
      value: person.id,
      label: person.name,
      ...(person.jobTitle ? { hint: person.jobTitle } : {}),
    }));

  return (
    <div className="flex flex-col gap-2">
      {members.length === 0 ? (
        <p className="text-meta text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center gap-1 rounded-full border border-line py-0.5 pl-3 pr-1 text-body-sm text-ink"
            >
              {member.name}
              <IconButton
                label={`Take ${member.name} off: ${label}`}
                size="sm"
                disabled={disabled}
                onClick={() => onRemove(member)}
              >
                <X aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="max-w-md">
        <Picker
          value=""
          aria-label={`Add somebody: ${label}`}
          placeholder={addPlaceholder}
          options={options}
          loading={loading}
          disabled={disabled || members.length >= max}
          onChange={(id) => {
            const person = people.find((p) => p.id === id);
            if (person) onAdd(person);
          }}
        />
      </div>
      {members.length >= max && (
        <p className="text-meta text-muted">At most {String(max)} people.</p>
      )}
    </div>
  );
}
