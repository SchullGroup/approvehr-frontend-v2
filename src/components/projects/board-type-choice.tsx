"use client";

import { useId } from "react";
import { Radio } from "@/components/ui";
import { PROJECT_TYPE_HELP, PROJECT_TYPE_LABEL } from "@/lib/projects/terms";
import { PROJECT_TYPES, type ProjectType } from "@/lib/projects/types";

/**
 * The board type, as two radios with one plain line under each.
 *
 * Used wherever the type is chosen (a new project, a project's Settings), so the
 * two places say the same thing. A select hid the line for the option not
 * chosen, which is the one a person needs to read to decide.
 */
export function BoardTypeChoice({
  value,
  onChange,
  disabled = false,
  error,
  help,
}: {
  value: ProjectType;
  onChange: (next: ProjectType) => void;
  disabled?: boolean;
  /** Shown under the choices, in the error colour: a change that was refused. */
  error?: string | null;
  /** A line under the choices, when there is no error. */
  help?: string;
}) {
  const name = useId();
  const noteId = `${name}-note`;
  const note = error || help;
  return (
    <fieldset
      className="flex flex-col gap-2.5"
      {...(note ? { "aria-describedby": noteId } : {})}
    >
      <legend className="mb-1 text-body-sm font-medium text-ink">
        Board type
      </legend>
      {/* Simple first: it is the default, and what most projects want. */}
      {[...PROJECT_TYPES]
        .sort((a, b) => Number(a === "SCRUM") - Number(b === "SCRUM"))
        .map((type) => (
          <Radio
            key={type}
            name={name}
            value={type}
            label={PROJECT_TYPE_LABEL[type]}
            description={PROJECT_TYPE_HELP[type]}
            checked={value === type}
            disabled={disabled}
            onChange={() => onChange(type)}
          />
        ))}
      {note && (
        <p
          id={noteId}
          {...(error ? { role: "alert" } : {})}
          className={
            error ? "text-body-sm text-danger-text" : "text-body-sm text-muted"
          }
        >
          {note}
        </p>
      )}
    </fieldset>
  );
}
