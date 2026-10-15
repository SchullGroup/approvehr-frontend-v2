"use client";

import { Avatar, Picker, type PickerOption } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { People } from "@/lib/store/project-session";

/**
 * People, wherever a project names one.
 */

export function PersonAvatar({
  people,
  id,
  size = "xs",
  className,
  decorative = false,
}: {
  people: People;
  id: string | null | undefined;
  size?: "xs" | "sm" | "md";
  className?: string;
  /**
   * The person's name is written beside it, so the avatar adds nothing for a
   * screen reader but a second reading of the same name.
   */
  decorative?: boolean;
}) {
  if (!id) {
    return (
      <span
        {...(decorative
          ? { "aria-hidden": true as const }
          : {
              role: "img" as const,
              "aria-label": "Unassigned",
              title: "Unassigned",
            })}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-faint",
          size === "xs" ? "size-6" : size === "sm" ? "size-8" : "size-10",
          className,
        )}
      />
    );
  }
  const name = people.nameOf(id);
  return (
    <span
      {...(decorative ? { "aria-hidden": true as const } : { title: name })}
      className={cn("inline-flex shrink-0", className)}
    >
      <Avatar name={name} size={size} />
      {!decorative && <span className="sr-only">{name}</span>}
    </span>
  );
}

export function PersonName({
  people,
  id,
  className,
}: {
  people: People;
  id: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-2",
        className,
      )}
    >
      <PersonAvatar people={people} id={id} decorative />
      <span className="truncate">{people.nameOf(id)}</span>
    </span>
  );
}

/**
 * A person chosen from a list, with a search box once the list is long.
 *
 * `allowNone` adds an "Unassigned" entry with an empty value. `exclude` removes
 * people already chosen, for "add a member". Options are people, never ids: the
 * name is the label and the job title the hint.
 */
export function PersonPicker({
  people,
  value,
  onChange,
  ids,
  allowNone = false,
  noneLabel = "Unassigned",
  exclude = [],
  placeholder = "Choose a person",
  disabled = false,
  "aria-label": ariaLabel,
}: {
  people: People;
  value: string;
  onChange: (id: string) => void;
  /** Offer only these people. Omitted, everybody in the directory. */
  ids?: readonly string[];
  allowNone?: boolean;
  noneLabel?: string;
  exclude?: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const source = ids
    ? ids.map((id) => ({
        id,
        name: people.nameOf(id),
        jobTitle: people.byId.get(id)?.jobTitle ?? "",
      }))
    : people.people.map((p) => ({
        id: p.id,
        name: p.name,
        jobTitle: p.jobTitle,
      }));
  const options: PickerOption[] = [
    ...(allowNone ? [{ value: "", label: noneLabel }] : []),
    ...source
      .filter((p) => !exclude.includes(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        value: p.id,
        label: p.name,
        ...(p.jobTitle ? { hint: p.jobTitle } : {}),
      })),
  ];
  return (
    <Picker
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      loading={people.loading}
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
    />
  );
}
