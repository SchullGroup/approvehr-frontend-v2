"use client";

import { useMemo, useState } from "react";
import { BulkCreateDialog } from "@/components/bulk-create/bulk-create-dialog";
import type {
  BulkSurface,
  FieldControl,
  FieldGroup,
  FieldOption,
} from "@/lib/bulk-create/surface";
import type { ApiGoal } from "@/lib/api/performance";
import { OBJECTIVES, type ObjectiveField } from "@/lib/imports/objectives";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useSession } from "@/lib/store/session";
import { fullName } from "@/lib/types";
import { quarterOptions, quarterText } from "./goal-dialogs";
import { OBJECTIVES_IMPORT_SURFACE } from "./kpis/import/surface";
import { useObjectiveTemplateLists } from "./kpis/import/lists";

/**
 * "Add multiple" on the KPIs screen: the window for adding several objectives at
 * once, set up for objectives.
 *
 * The window is generic (`components/bulk-create/`) and checks and creates
 * through the same importer an upload uses, so this file is only what is true of
 * objectives: how a card groups the twelve fields, which of them are dropdowns,
 * and where the options come from.
 *
 * ## The options are the upload template's, not a wider set
 *
 * Departments and appraisal periods come from `useObjectiveTemplateLists` — the
 * exact lists the downloaded Excel template turns into dropdowns. A dropdown that
 * offers something the check then refuses puts the refusal further from its cause,
 * and two lists for one question would drift.
 *
 * ## Assigned to is a typed email, with suggestions
 *
 * The importer takes a work email, because two people can share a name. The
 * directory rows a department head can read carry no email at all (see
 * `DirectoryPerson`), so for them there is nothing to suggest and the box is a
 * plain email box, which is what the spreadsheet column is too. For somebody
 * holding the records permission the full rows have addresses, and each one is
 * offered by name.
 */

const GROUPS: readonly FieldGroup[] = [
  { fields: ["title", "quarter"] },
  {
    label: "Whose it is, and where it sits",
    fields: ["ownerEmail", "department", "parent", "period"],
  },
  { fields: ["description"] },
  {
    label: "A number to hit",
    hint: "If the objective has a figure to reach, name it here. Otherwise leave this empty.",
    fields: ["measure", "unit", "start", "target", "lowerIsBetter"],
  },
] satisfies readonly {
  label?: string;
  hint?: string;
  fields: ObjectiveField[];
}[];

/**
 * The objectives that can be a parent: the ones that belong to nobody.
 *
 * That is the importer's own rule — a parent is a department or company
 * objective — and `level` is the API's word for it, so this does not guess from
 * an owner id.
 */
const parentSuggestions = (goals: readonly ApiGoal[]): FieldOption[] => {
  const seen = new Set<string>();
  const options: FieldOption[] = [];
  for (const goal of goals) {
    if (goal.level === "personal") continue;
    const title = goal.title.trim();
    if (title === "" || seen.has(title)) continue;
    seen.add(title);
    options.push({
      value: title,
      label: `${title}, ${goal.level === "company" ? "company" : (goal.departmentName ?? "department")}`,
    });
  }
  return options;
};

export function AddMultipleObjectives(props: {
  open: boolean;
  onClose: () => void;
  goals: readonly ApiGoal[];
  onChanged: () => void;
}) {
  /* Nothing here — no directory read, no lists — until the window has been
     opened once. The KPIs screen mounts this whether or not anybody presses the
     button, and two hundred people read for a window that never opens is a
     request the page did not need. It stays mounted after, so its exit runs. */
  const [everOpened, setEverOpened] = useState(false);
  if (props.open && !everOpened) setEverOpened(true);
  if (!everOpened) return null;
  return <Loaded {...props} />;
}

function Loaded({
  open,
  onClose,
  goals,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  goals: readonly ApiGoal[];
  onChanged: () => void;
}) {
  const { lists } = useObjectiveTemplateLists();
  const { employees, archivedIds } = useEmployeeDirectory({ pageSize: 200 });
  const { user } = useSession();
  const ownEmail = user?.email ?? null;

  const surface = useMemo<BulkSurface>(() => {
    const quarters = quarterOptions();
    const people: FieldOption[] = employees
      .filter((person) => person.email && !archivedIds.has(person.id))
      .map((person) => ({
        value: person.email as string,
        label: `${fullName(person)}, ${person.email as string}`,
      }));
    if (ownEmail && !people.some((option) => option.value === ownEmail)) {
      people.unshift({ value: ownEmail, label: `Me, ${ownEmail}` });
    }

    const chooseFrom = (
      names: readonly string[] | undefined,
      blank: string,
    ): FieldControl => ({
      kind: "select",
      options: (names ?? []).map((name) => ({ value: name, label: name })),
      blank,
    });

    return {
      dictionary: OBJECTIVES,
      title: "Add several objectives",
      intro:
        "Type up to 50, check them together, and they arrive as drafts for whoever each is assigned to.",
      controls: {
        quarter: {
          kind: "select",
          options: quarters.map((quarter) => ({
            value: quarter,
            label: quarterText(quarter),
          })),
          blank: "Choose a quarter",
        },
        ownerEmail: {
          kind: "text",
          type: "email",
          placeholder: "Leave empty for a department or company objective",
          suggestions: people,
        },
        department: chooseFrom(lists["department"], "No department"),
        period: chooseFrom(
          lists["period"],
          "No period (counts towards nobody's mark)",
        ),
        parent: {
          kind: "text",
          placeholder: "The exact title of the objective it sits under",
          suggestions: parentSuggestions(goals),
        },
        description: { kind: "longtext" },
        start: { kind: "text", inputMode: "decimal" },
        target: { kind: "text", inputMode: "decimal" },
      },
      groups: GROUPS,
      defaults: { quarter: quarters[1] ?? quarters[0] ?? "" },
      itemName: (draft, position) =>
        draft.values["title"]?.trim() || `Objective ${String(position)}`,
      fillable: ["quarter", "period", "department", "ownerEmail"],
      lists,
      upload: { href: "/performance/kpis/import", label: "Upload objectives" },
      prerequisites: OBJECTIVES_IMPORT_SURFACE.prerequisites,
      ...(OBJECTIVES_IMPORT_SURFACE.linkedStats
        ? { linkedStats: OBJECTIVES_IMPORT_SURFACE.linkedStats }
        : {}),
      refusalWithoutApi: OBJECTIVES_IMPORT_SURFACE.refusalWithoutApi,
      onChanged,
    };
  }, [employees, archivedIds, ownEmail, lists, goals, onChanged]);

  return <BulkCreateDialog open={open} onClose={onClose} surface={surface} />;
}
