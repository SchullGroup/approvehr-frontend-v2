import { EQUIPMENT } from "@/lib/imports/equipment";
import type { ImportSurface } from "@/lib/imports/surface";

/**
 * What the import screen says when the thing being imported is equipment.
 *
 * The only equipment-specific file in this route. The dictionary
 * (`lib/imports/equipment.ts`) is the data contract; this is the copy — the page
 * title, where the items are once they are in, and what the two things a row can
 * refer to mean when they are missing.
 *
 * `prerequisites` is keyed by the `missing` keys the API returns. Both of this
 * entity's keys are unusual in the same way and it is worth saying why: an
 * employee import's missing departments have to be *created* before the rows
 * work, and neither of these does. A new equipment kind is created by the file
 * itself — what is missing is the **answer** to whether a leaver hands one back,
 * which lives in a column. And a holder we cannot find does not stop the item
 * importing at all; it stops the item reaching anybody's exit checklist. So both
 * callouts say what the file has to change rather than only where to go.
 */
export const EQUIPMENT_IMPORT_SURFACE: ImportSurface = {
  dictionary: EQUIPMENT,
  title: "Import your equipment register",
  description:
    "Upload the spreadsheet you already keep. You will see exactly what it will do before anything is saved.",
  breadcrumb: [
    { href: "/people", label: "People" },
    { href: "/people/assets", label: "Equipment" },
  ],
  home: { href: "/people/assets", label: "See your equipment" },
  prerequisites: {
    equipmentKinds: {
      title: "Some equipment kinds have not been answered for yet",
      consequence:
        "are new, and their rows do not say whether a leaver has to hand one back. Fill in must_be_returned_on_exit on those rows and check again — one answer makes somebody's clearance impossible and the other makes it meaningless, so we will not choose it.",
      action: { href: "/people/assets", label: "See the kinds you already have" },
    },
    people: {
      title: "Some of the people named as holding something are not on your staff list",
      consequence:
        "will import, with nobody recorded as holding them — so they will not appear on anybody's exit checklist until you hand them over.",
      action: { href: "/people", label: "Add the people first" },
    },
  },
  keyNote:
    "The tag is not one of them: it is the label somebody reads off the case, so a row without one is refused rather than given a made-up tag.",
  /* What a browser cannot settle, so the check does not imply a clean file will
     import cleanly. Both of this entity's unknowns are lookups against rows only
     the database holds: whether that tag or serial is already on the register,
     and whether the person named as holding it is on the staff list. */
  demoLimits:
    "whether that tag or serial is already on your register, or whether the people named as holding something are on your staff list.",
  demoRefusal:
    "This is demo mode. The file has been read and checked as far as a browser can, and that is where it stops: an equipment register in one laptop is the opposite of the point, because the whole reason to keep one is that somebody's exit checklist can read it.",
  linkedStats: [
    {
      key: "handedOver",
      label: "Handovers recorded",
      hint: "items now showing against the person holding them",
    },
    {
      key: "kindsAdded",
      label: "Kinds added",
      hint: "each with the return rule its row gave",
    },
  ],
};
