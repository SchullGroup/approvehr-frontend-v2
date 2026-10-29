"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { noticeReach } from "@/lib/api/announcements";
import { useEmployeeDirectory } from "@/lib/store/employees-api";

/** Somebody chosen, by id, with the name to show on their chip. */
export type ChosenPerson = { id: string; name: string };

/**
 * Who a notice for named people goes to.
 *
 * A search over the staff list rather than a select of everybody: a company of
 * four hundred is not a dropdown. Somebody with no account, or with an archived
 * one, cannot be added, because the API refuses them (a notice on a board they
 * cannot open), and saying so here is cheaper than finding out on Publish.
 * `noticeReach` is that rule, and it is the API's rule rather than a stricter one:
 * somebody who was invited and has not accepted yet is added.
 */
export function PeoplePicker({
  value,
  onChange,
}: {
  value: ChosenPerson[];
  onChange: (next: ChosenPerson[]) => void;
}) {
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");

  /* Settles the query a moment after typing stops, so each keystroke is not a
     request. */
  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);

  return (
    <div className="flex flex-col gap-2.5">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen people">
          {value.map((person) => (
            <li
              key={person.id}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas py-0.5 pl-2.5 pr-1 text-body-sm text-ink"
            >
              {person.name}
              <button
                type="button"
                className="rounded-full p-0.5 text-muted hover:text-ink"
                aria-label={`Remove ${person.name}`}
                onClick={() =>
                  onChange(value.filter((p) => p.id !== person.id))
                }
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Input
        value={typed}
        placeholder="Search by name or staff number"
        aria-label="Search for a person to add"
        onChange={(event) => {
          const next = event.target.value;
          setTyped(next);
        }}
      />

      {q.length >= 2 && (
        <Results
          q={q}
          chosen={new Set(value.map((p) => p.id))}
          onAdd={(person) => {
            onChange([...value, person]);
            setTyped("");
          }}
        />
      )}
    </div>
  );
}

/**
 * The search results. Its own component so the directory is only asked once
 * somebody has typed: a hook cannot be skipped, but a component can go
 * unmounted (the note on `StartExitDialog` makes the same move).
 */
function Results({
  q,
  chosen,
  onAdd,
}: {
  q: string;
  chosen: ReadonlySet<string>;
  onAdd: (person: ChosenPerson) => void;
}) {
  const { employees, people, loading } = useEmployeeDirectory({
    q,
    pageSize: 8,
  });
  /* The list is the lookup rows, because everybody is sent those. The full rows
     are read only for what they add: the staff number and the sign-in state. A
     caller without `EDIT_RECORDS` (somebody who holds `MANAGE_SETTINGS` alone) is
     sent lookup rows and no full ones, so reading `employees` here gave them a
     picker that found nobody. */
  const full = new Map(employees.map((employee) => [employee.id, employee]));

  return (
    <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
      {loading && people.length === 0 ? (
        <li className="px-3 py-2 text-body-sm text-muted">Searching…</li>
      ) : people.length === 0 ? (
        <li className="px-3 py-2 text-body-sm text-muted">
          Nobody on the staff list matches “{q}”.
        </li>
      ) : (
        people.map((person) => {
          const row = full.get(person.id);
          /* Absent `access` is "not known", not "no account": the API decides. */
          const reach = noticeReach(row?.access);
          const identity = [row?.employeeNo, person.jobTitle]
            .filter(Boolean)
            .join(" · ");
          /* Somebody who cannot be added is described by why. Somebody who can
             keeps their identity, because it is what tells two people of one name
             apart, with the note after it. */
          const subline = reach.can
            ? [identity, reach.line].filter(Boolean).join(" · ")
            : reach.line;
          const added = chosen.has(person.id);
          return (
            <li
              key={person.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-body-sm text-ink">
                  {person.fullName}
                </span>
                <span className="block truncate text-meta text-muted">
                  {subline}
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={added || !reach.can}
                onClick={() => onAdd({ id: person.id, name: person.fullName })}
              >
                {added ? "Added" : "Add"}
              </Button>
            </li>
          );
        })
      )}
    </ul>
  );
}
