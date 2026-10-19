import type { ImportSurface } from "@/lib/imports/surface";
import type { Dictionary } from "@/lib/imports/spec";
import type { TemplateLists } from "@/lib/imports/template-file";
import type { Defaults, Draft } from "./model";

/**
 * What the "add several" window needs to know about one kind of record.
 *
 * The window itself — the three layouts, the review, the download and the load —
 * knows nothing about objectives. Everything particular to them is in one of
 * these: the dictionary the rows are checked against, which control each field
 * gets, how the card groups them, and where the person goes if the window is the
 * wrong size for what they have.
 *
 * It is built by a hook-calling wrapper (`AddMultipleObjectives`) rather than
 * written out, because the options in the controls — the company's departments,
 * the people it can suggest — arrive from stores. The window gets them as plain
 * data, so it never has to know where they came from.
 */

export type FieldOption = { value: string; label: string };

export type FieldControl =
  | {
      kind: "text";
      placeholder?: string;
      /** An email input, so a phone offers the right keyboard. */
      type?: "text" | "email";
      inputMode?: "text" | "decimal";
      /**
       * Things worth offering while typing, which never restrict what can be
       * typed. A person's work email is the case: the importer takes an email,
       * so a suggestion helps and a closed list would refuse a colleague the
       * directory has not shown us.
       */
      suggestions?: readonly FieldOption[];
    }
  | { kind: "longtext"; placeholder?: string }
  | {
      kind: "select";
      options: readonly FieldOption[];
      /** What the empty choice says: "Nobody", "No period". */
      blank: string;
    };

/** One run of fields on a card, with an optional heading. */
export type FieldGroup = {
  label?: string;
  hint?: string;
  fields: readonly string[];
};

export type BulkSurface = {
  dictionary: Dictionary<string>;
  /** "Add several objectives". */
  title: string;
  intro: string;
  /** By field. A field with no entry gets a dropdown if the dictionary has one, else a text box. */
  controls: Readonly<Record<string, FieldControl>>;
  /** How a card lays its fields out. Every field should appear exactly once. */
  groups: readonly FieldGroup[];
  defaults: Defaults;
  /** The item's name in a heading, a chip and a problem list. */
  itemName: (draft: Draft, position: number) => string;
  /** The columns the "same for everyone" bar can set. */
  fillable: readonly string[];
  /** The company's own lists, so a downloaded draft carries its dropdowns. */
  lists: TemplateLists;
  /** The upload the window points at when it is the wrong size. */
  upload: { href: string; label: string };
  prerequisites: ImportSurface["prerequisites"];
  /** Counts only this entity's writer reports, with the label for each. */
  linkedStats?: ImportSurface["linkedStats"];
  /** What a person sees when the app cannot reach the server. May be empty. */
  refusalWithoutApi: string;
  /** Called once something has been created, so the screen behind can reload. */
  onChanged: () => void;
};
