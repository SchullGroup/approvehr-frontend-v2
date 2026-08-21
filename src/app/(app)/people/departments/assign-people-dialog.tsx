"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, Button, Callout, Checkbox, Input, Modal } from "@/components/ui";

/**
 * Put a set of people into a department, or onto a team.
 *
 * ## Select, not drag
 *
 * The brief asked for "drag-or-select". This is select, and the choice is not
 * laziness. Assigning staff is a **bulk** act — "move these nine into Sales" —
 * and a drag moves one thing at a time; nine drags is nine chances to drop
 * somebody in the wrong unit with no record of it. Select-many-then-confirm also
 * gets keyboard and screen-reader support for free from a native checkbox,
 * where a drag surface needs a parallel keyboard path built and maintained
 * beside it. The one thing drag genuinely gives you — seeing the whole tree
 * while you move somebody — is what the count line at the bottom does instead.
 *
 * ## The consequence is stated before the write, not after
 *
 * `effect` is the sentence saying what this assignment does to somebody's pay
 * reporting, and it comes from the API wrapper so the dialog and the toast that
 * follows cannot describe the same act differently. It renders **above** the
 * list, because after is where a warning is useless.
 *
 * ## Already-there people are shown, ticked and disabled
 *
 * Not filtered out. "Who is already in Sales" is most of what somebody needs to
 * know while choosing, and a list that silently omits them makes the count at
 * the bottom look wrong.
 */

export type AssignCandidate = {
  id: string;
  name: string;
  jobTitle?: string | null;
  /** Where they are now. Rendered so nobody is moved out of somewhere blind. */
  currentLabel?: string | null;
  /** Already in this unit: ticked, disabled, and not sent. */
  already?: boolean;
};

export function AssignPeopleDialog({
  title,
  description,
  effect,
  candidates,
  confirmLabel,
  busy = false,
  failed,
  onClose,
  onAssign,
}: {
  title: string;
  description?: string;
  /** What this does to pay reporting. Always rendered when present. */
  effect?: string;
  candidates: AssignCandidate[];
  confirmLabel: string;
  busy?: boolean;
  failed?: string | null;
  onClose: () => void;
  onAssign: (employeeIds: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return candidates;
    return candidates.filter(
      (person) =>
        person.name.toLowerCase().includes(term) ||
        (person.jobTitle ?? "").toLowerCase().includes(term) ||
        (person.currentLabel ?? "").toLowerCase().includes(term),
    );
  }, [candidates, query]);

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* Only the people whose unit actually changes. Sending somebody who is
     already here would make the API's "moved" count a lie. */
  const chosen = [...picked];
  const moving = candidates.filter(
    (person) => picked.has(person.id) && !person.already,
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      {...(description ? { description } : {})}
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.875rem] text-muted">
            {moving.length === 0
              ? "Nobody chosen yet"
              : moving.length === 1
                ? "1 person will move"
                : `${moving.length} people will move`}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              loading={busy}
              disabled={moving.length === 0 || busy}
              onClick={() => onAssign(moving.map((person) => person.id))}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {effect && (
          <Callout tone="info" title="What this changes">
            {effect}
          </Callout>
        )}

        {failed && (
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-[0.875rem] text-ink"
          >
            {failed}
          </p>
        )}

        {/* `Input` has no `prefix` prop — wrapped by hand, the same way the
            directory's search box does it. */}
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            value={query}
            placeholder="Search by name, job title or where they are now"
            className="pl-9"
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
            }}
          />
        </div>

        {candidates.length === 0 ? (
          <p className="text-[0.875rem] text-body">
            There is nobody to assign. Add people to the company first.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-[0.875rem] text-body">
            Nobody matches &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          <ul className="flex max-h-[22rem] flex-col divide-y divide-line overflow-y-auto rounded-md border border-line">
            {visible.map((person) => (
              <li
                key={person.id}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2.5",
                  person.already && "bg-canvas",
                )}
              >
                <Checkbox
                  label={person.name}
                  {...(person.jobTitle ? { description: person.jobTitle } : {})}
                  checked={person.already === true || picked.has(person.id)}
                  disabled={person.already === true || busy}
                  onChange={() => toggle(person.id)}
                />
                {person.already ? (
                  <Badge tone="neutral" size="sm">
                    Already here
                  </Badge>
                ) : person.currentLabel ? (
                  <span className="shrink-0 text-[0.75rem] text-muted">
                    Now in {person.currentLabel}
                  </span>
                ) : (
                  <span className="shrink-0 text-[0.75rem] text-faint">
                    No department
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {chosen.length > moving.length && (
          <p className="text-[0.875rem] text-muted">
            People already here are ticked and will not be sent again.
          </p>
        )}
      </div>
    </Modal>
  );
}
