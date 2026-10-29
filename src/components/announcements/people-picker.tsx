"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useEmployeeDirectory } from "@/lib/store/employees-api";

/** Somebody chosen, by id, with the name to show on their chip. */
export type ChosenPerson = { id: string; name: string };

/**
 * Who a notice for named people goes to.
 *
 * A search over the staff list rather than a select of everybody: a company of
 * four hundred is not a dropdown. Only people who can sign in can be added,
 * because the API refuses anybody else (a notice on a board they cannot open),
 * and saying so here is cheaper than finding out on Publish.
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
  const { employees: results, loading } = useEmployeeDirectory({
    q,
    pageSize: 8,
  });

  return (
    <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
      {loading && results.length === 0 ? (
        <li className="px-3 py-2 text-body-sm text-muted">Searching…</li>
      ) : results.length === 0 ? (
        <li className="px-3 py-2 text-body-sm text-muted">
          Nobody on the staff list matches “{q}”.
        </li>
      ) : (
        results.map((person) => {
          const name = `${person.firstName} ${person.lastName}`;
          /* Absent `access` is "not known" (demo mode), not "no account". */
          const cannotSignIn =
            person.access !== undefined && person.access.state !== "ACCEPTED";
          const added = chosen.has(person.id);
          return (
            <li
              key={person.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-body-sm text-ink">
                  {name}
                </span>
                <span className="block truncate text-meta text-muted">
                  {cannotSignIn
                    ? "Cannot sign in yet, so cannot be sent a message"
                    : [person.employeeNo, person.jobTitle]
                        .filter(Boolean)
                        .join(" · ")}
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={added || cannotSignIn}
                onClick={() => onAdd({ id: person.id, name })}
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
