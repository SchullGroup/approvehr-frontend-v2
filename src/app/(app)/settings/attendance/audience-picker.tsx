"use client";

import { useMemo, useState } from "react";
import { Checkbox, Input } from "@/components/ui";
import { useEmployeeDirectory } from "@/lib/store/employees-api";

/**
 * Choosing departments and people, for a schedule.
 *
 * Both are plain ticked lists, not a search box: a company of forty is a short
 * list, and the people are grouped under their department because that is how
 * anybody remembers them ("the production lot"). A filter appears only once the
 * list is long enough to need one.
 */

/** Past this many people a filter box appears above the list. */
const FILTER_FROM = 25;

export type PersonOption = {
  id: string;
  name: string;
  departmentId: string | null;
  /** The department's name. Null for nobody's. */
  department: string | null;
};

/**
 * Everybody who can be picked: the directory, plus anybody the schedule already
 * names that the directory did not return.
 *
 * The second half matters. The directory answers a page of two hundred, and a
 * person on a schedule who is not in it (a large company, or somebody since
 * archived) would otherwise be dropped from the set the next time it is saved.
 * They stay visible and can be unticked.
 */
export function usePeopleOptions(
  already: readonly { id: string; name: string; departmentId: string | null }[],
): { people: PersonOption[]; loading: boolean } {
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const people = useMemo(() => {
    const listed: PersonOption[] = directory.people.map((person) => ({
      id: person.id,
      name: person.fullName,
      departmentId: person.departmentId ?? null,
      department: person.department,
    }));
    const have = new Set(listed.map((person) => person.id));
    const missing: PersonOption[] = already
      .filter((person) => !have.has(person.id))
      .map((person) => ({
        id: person.id,
        name: person.name,
        departmentId: person.departmentId,
        department: null,
      }));
    return [...listed, ...missing];
  }, [directory.people, already]);
  return {
    people,
    loading: directory.loading && directory.people.length === 0,
  };
}

const NO_DEPARTMENT = "No department";

/** People under their department, departments A to Z, the unassigned last. */
export function groupByDepartment(
  people: readonly PersonOption[],
): { name: string; people: PersonOption[] }[] {
  const groups = new Map<string, PersonOption[]>();
  for (const person of people) {
    const key = person.department ?? NO_DEPARTMENT;
    groups.set(key, [...(groups.get(key) ?? []), person]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === NO_DEPARTMENT) return 1;
      if (b === NO_DEPARTMENT) return -1;
      return a.localeCompare(b);
    })
    .map(([name, members]) => ({
      name,
      people: members.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

const toggle = (list: readonly string[], id: string, on: boolean): string[] =>
  on
    ? list.includes(id)
      ? [...list]
      : [...list, id]
    : list.filter((x) => x !== id);

export function DepartmentChecklist({
  departments,
  value,
  onChange,
}: {
  departments: readonly { id: string; name: string }[];
  value: readonly string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2">
      {departments.map((department) => (
        <Checkbox
          key={department.id}
          label={department.name}
          checked={value.includes(department.id)}
          onChange={(event) => {
            const on = event.target.checked;
            onChange(toggle(value, department.id, on));
          }}
        />
      ))}
    </div>
  );
}

export function PeopleChecklist({
  people,
  value,
  onChange,
}: {
  people: readonly PersonOption[];
  value: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const [typed, setTyped] = useState("");
  const needle = typed.trim().toLowerCase();
  const groups = useMemo(
    () =>
      groupByDepartment(
        needle
          ? people.filter((person) =>
              person.name.toLowerCase().includes(needle),
            )
          : people,
      ),
    [people, needle],
  );

  return (
    <div className="flex flex-col gap-2.5">
      {people.length > FILTER_FROM && (
        <Input
          value={typed}
          aria-label="Filter people"
          placeholder="Filter by name"
          onChange={(event) => {
            const next = event.target.value;
            setTyped(next);
          }}
        />
      )}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
        {groups.map((group) => (
          <div
            key={group.name}
            role="group"
            aria-label={group.name}
            className="border-b border-line last:border-b-0"
          >
            <p className="sticky top-0 bg-canvas px-3 py-1.5 text-meta font-medium text-muted">
              {group.name}
            </p>
            <div className="flex flex-col gap-2 px-3 py-2.5">
              {group.people.map((person) => (
                <Checkbox
                  key={person.id}
                  label={person.name}
                  checked={value.includes(person.id)}
                  onChange={(event) => {
                    const on = event.target.checked;
                    onChange(toggle(value, person.id, on));
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
