import {
  buildDictionary,
  normalizeKey,
  parseImportDate,
  type ColumnSpec,
  type Dictionary,
  type RowContext,
} from "./spec";

/**
 * The equipment dictionary, and the rules only an equipment import has.
 *
 * The framework's second consumer on this side. Everything generic — matching a
 * heading, reading a date or an amount, building the template file, the
 * four-step screen — is in `spec.ts`, `mapping.ts`, `check.ts`,
 * `template-file.ts` and `components/imports/`, and none of it changed to admit
 * this. What is *equipment* about an equipment import is only what is below.
 *
 * ## Two words, on purpose
 *
 * The slug is `assets`, because it is a URL segment beside `/api/v1/assets` and
 * the tables behind it are `assets` and `asset_categories`. Everything a person
 * reads says **equipment**, because that is what a Nigerian small-business owner
 * calls the laptop — the same split `app/(app)/people/assets/` already keeps.
 *
 * ## This is a mirror, and the API's copy wins
 *
 * The API owns this list — `approvehr-api/src/modules/imports/assets.ts`,
 * `ASSET_COLUMNS` — and when the API answers, **its copy wins**:
 * `GET /imports/template/assets` is what the screen renders, what pre-selects
 * the column matches, and what the downloaded file is built from. The copy here
 * is the same data compiled in, for the one case where that call cannot be made:
 * reading a spreadsheet and lining its headings up against a list has no
 * business needing a database.
 *
 * The drift is benign in the direction that matters — a column the API knows
 * about and this file does not is offered as "do not import", and the API
 * re-matches every heading it is sent regardless of what this file guessed. If
 * you change the API's dictionary, re-copy it here.
 */

/** The conditions the API accepts, as it writes them. */
export type AssetConditionCode = "NEW" | "GOOD" | "FAIR" | "POOR" | "DAMAGED";

/** The statuses a person may set. `ASSIGNED` is not one — see `assetRowRules`. */
export type SettableAssetStatusCode = "AVAILABLE" | "IN_REPAIR" | "RETIRED" | "LOST";

export type AssetField =
  | "kind"
  | "tag"
  | "name"
  | "mustReturn"
  | "serialNumber"
  | "value"
  | "condition"
  | "purchasedOn"
  | "make"
  | "model"
  | "status"
  | "holderEmployeeNo"
  | "holderEmail"
  | "assignedOn"
  | "notes";

const COLUMNS: readonly ColumnSpec<AssetField>[] = [
  {
    field: "kind",
    column: "kind",
    aliases: [
      "asset_kind",
      "category",
      "asset_category",
      "asset_type",
      "equipment_type",
      "item_type",
      "type",
      "class",
    ],
    /* Required, and the database does not require it: whether a leaver has to
       hand something back is recorded against the *kind*, so an item without one
       would have that flag set by an empty cell. See the API's dictionary. */
    required: true,
    example: "Laptop",
    note: "What sort of thing it is, e.g. Laptop, Phone, Access card.",
  },
  {
    field: "tag",
    templateExample: "EXAMPLE-001",
    column: "tag",
    aliases: [
      "asset_tag",
      "tag_number",
      "tag_no",
      "asset_id",
      "asset_code",
      "asset_no",
      "sticker",
      "label",
      "inventory_number",
    ],
    /* Required, and no tag is generated for a row without one. The employee
       importer generates a staff number; a tag is documented as the label you
       read off the case, so inventing one sends somebody looking for nothing. */
    required: true,
    example: "LAP-0042",
    note: "Your asset tag — what's on the sticker. Must be unique.",
  },
  {
    field: "name",
    templateExample: "DELETE THIS ROW",
    column: "item",
    aliases: [
      "name",
      "asset_name",
      "item_name",
      "description",
      "item_description",
      "equipment",
      "asset_description",
    ],
    required: true,
    example: 'MacBook Air 13"',
    note: "What it's called, e.g. \"MacBook Pro 14-inch\".",
  },
  {
    field: "mustReturn",
    column: "must_be_returned_on_exit",
    aliases: [
      "must_be_returned",
      "must_return",
      "return_required",
      "return_on_exit",
      "hand_back_on_exit",
      "returnable",
      "recoverable",
      "company_property",
    ],
    /* The one column here that can make a clearance either impossible or
       meaningless, which is why it is required and never inferred. */
    required: true,
    example: "yes",
    note: "Yes or no — must it be handed back when they leave?",
  },
  {
    field: "serialNumber",
    column: "serial_number",
    aliases: ["serial", "serial_no", "sn", "imei", "service_tag", "vin"],
    required: false,
    example: "C02X1234ABCD",
    note: "The manufacturer's serial number.",
    recommended: {
      why: "no serial number — an unreturned item cannot be identified to an insurer, a repairer or the police",
    },
  },
  {
    field: "value",
    cell: { kind: "money", zeroAllowed: true, subject: "The value" },
    column: "value",
    aliases: [
      "purchase_cost",
      "cost",
      "purchase_price",
      "price",
      "amount",
      "book_value",
    ],
    required: false,
    example: "950,000.00",
    note: "What it cost, in naira. Leave blank if unknown — 0 means it was free.",
    recommended: {
      why: "no value recorded — an item that does not come back has no figure against it, so the conversation about it is an argument",
    },
  },
  {
    field: "condition",
    column: "condition",
    aliases: ["state", "item_condition", "asset_condition", "grade"],
    required: false,
    example: "good",
    note: "new, good, fair, poor or damaged.",
  },
  {
    field: "purchasedOn",
    cell: { kind: "date" },
    column: "purchased_on",
    aliases: [
      "purchase_date",
      "date_purchased",
      "bought_on",
      "acquired_on",
      "invoice_date",
    ],
    required: false,
    example: "14/03/2024",
    note: "DD/MM/YYYY or YYYY-MM-DD.",
  },
  {
    field: "make",
    column: "make",
    aliases: ["manufacturer", "brand", "vendor"],
    required: false,
    example: "Apple",
    note: "The manufacturer, e.g. Apple, Dell.",
  },
  {
    field: "model",
    column: "model",
    aliases: ["model_number", "model_name", "variant"],
    required: false,
    example: "A2681",
    note: "The model name or number.",
  },
  {
    field: "status",
    column: "status",
    aliases: ["asset_status", "location_status", "availability", "state_of_use"],
    required: false,
    example: "available",
    note: "available, in_repair, retired or lost. Say who holds it below, not here.",
  },
  {
    field: "holderEmployeeNo",
    column: "held_by_staff_no",
    aliases: [
      "assigned_to_staff_no",
      "assigned_to_employee_no",
      "employee_no",
      "staff_no",
      "staff_number",
      "custodian_staff_no",
      "holder_staff_no",
    ],
    required: false,
    example: "EMP-1000",
    note: "The staff number of whoever has it now.",
  },
  {
    field: "holderEmail",
    column: "held_by_email",
    aliases: [
      "assigned_to_email",
      "assigned_to",
      "email",
      "holder_email",
      "custodian_email",
      "user_email",
      "issued_to",
    ],
    required: false,
    example: "ngozi.williams@company.com",
    note: "Their work email, if you don't have staff numbers.",
  },
  {
    field: "assignedOn",
    cell: { kind: "date" },
    column: "held_since",
    aliases: [
      "assigned_on",
      "issued_on",
      "handover_date",
      "date_assigned",
      "issue_date",
    ],
    required: false,
    example: "01/07/2025",
    note: "When they were given it. Defaults to today.",
  },
  {
    field: "notes",
    column: "notes",
    aliases: ["comment", "comments", "remarks", "note"],
    required: false,
    example: "Charger missing",
    note: "Anything else worth noting.",
  },
];

/* ------------------------------------------------------------- word lists */

/** The API's `MUST_RETURN`. An unrecognised word is refused, never defaulted. */
const MUST_RETURN: Readonly<Record<string, boolean>> = {
  yes: true,
  y: true,
  true: true,
  "1": true,
  required: true,
  mustreturn: true,
  mustbereturned: true,
  returnable: true,
  recoverable: true,
  handback: true,
  returnonexit: true,
  company: true,
  companyproperty: true,
  no: false,
  n: false,
  false: false,
  "0": false,
  notrequired: false,
  notreturnable: false,
  norequirement: false,
  keep: false,
  theirs: false,
  theirstokeep: false,
  gift: false,
  consumable: false,
  disposable: false,
};

/** The API's `CONDITION_WORDS`. */
const CONDITION_WORDS: Readonly<Record<string, AssetConditionCode>> = {
  new: "NEW",
  brandnew: "NEW",
  unused: "NEW",
  sealed: "NEW",
  good: "GOOD",
  verygood: "GOOD",
  excellent: "GOOD",
  working: "GOOD",
  ok: "GOOD",
  fine: "GOOD",
  fair: "FAIR",
  average: "FAIR",
  used: "FAIR",
  usable: "FAIR",
  poor: "POOR",
  bad: "POOR",
  worn: "POOR",
  endoflife: "POOR",
  damaged: "DAMAGED",
  broken: "DAMAGED",
  faulty: "DAMAGED",
  cracked: "DAMAGED",
  notworking: "DAMAGED",
  deadondelivery: "DAMAGED",
};

/** The API's `STATUS_WORDS`. ASSIGNED is absent on purpose. */
const STATUS_WORDS: Readonly<Record<string, SettableAssetStatusCode>> = {
  available: "AVAILABLE",
  instore: "AVAILABLE",
  store: "AVAILABLE",
  free: "AVAILABLE",
  unassigned: "AVAILABLE",
  spare: "AVAILABLE",
  inrepair: "IN_REPAIR",
  repair: "IN_REPAIR",
  underrepair: "IN_REPAIR",
  workshop: "IN_REPAIR",
  servicing: "IN_REPAIR",
  retired: "RETIRED",
  writtenoff: "RETIRED",
  writeoff: "RETIRED",
  disposed: "RETIRED",
  scrapped: "RETIRED",
  lost: "LOST",
  missing: "LOST",
  stolen: "LOST",
  unaccountedfor: "LOST",
};

/** ₦50,000,000 for one item, the same ceiling the add-an-item form uses. */
const MAX_VALUE_KOBO = 50_000_000_00;

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Today as `YYYY-MM-DD`, UTC, so it compares against a parsed date directly. */
const todayIso = (): string => new Date().toISOString().slice(0, 10);

/**
 * Everything the file alone can settle that is not a property of one cell.
 *
 * The dates and the value are declared on their columns and checked by the
 * generic engine. What is left is three word lists, two ways one item appears
 * twice in one file, and two dates that cannot be in the future — each needing a
 * different message and a different severity, which is why it is prose here
 * rather than more declaration.
 *
 * It never guesses at the ones that need the database, and there are four of
 * them: whether that kind exists, whether that kind's return rule already says
 * something else, whether this tag or serial is already on the register, and
 * whether the person named as holding it is on the staff list. The screen says
 * so out loud rather than implying a clean file will import cleanly.
 */
function assetRowRules(ctx: RowContext<AssetField>): void {
  const { text, error, warn, tally, seen } = ctx;

  const tag = text("tag");
  if (tag !== "") {
    const first = seen("tag", tag.toUpperCase());
    if (first !== undefined) {
      error(
        "tag",
        `${tag} is already on row ${first} of this file. Two items cannot share one tag — merge the rows, or give one a different tag.`,
      );
    }
  }

  const serial = text("serialNumber");
  if (serial !== "") {
    const first = seen("serialNumber", serial.toUpperCase());
    if (first !== undefined) {
      error(
        "serialNumber",
        `Serial ${serial} is already on row ${first} of this file. If these are two different items, check the serials — they are stamped on the case.`,
      );
    }
  }

  const mustReturn = text("mustReturn");
  if (mustReturn !== "" && MUST_RETURN[normalizeKey(mustReturn)] === undefined) {
    error(
      "mustReturn",
      `We do not know what "${mustReturn}" means here. Write yes if a leaver has to hand it back, or no if they keep it.`,
    );
  }

  const condition = text("condition");
  if (condition !== "" && !CONDITION_WORDS[normalizeKey(condition)]) {
    error(
      "condition",
      `We do not know what "${condition}" means. Use new, good, fair, poor or damaged. We will not leave it blank and let it default to good — that would be the register claiming the item is fine.`,
    );
  }

  const status = text("status");
  if (status !== "") {
    if (normalizeKey(status) === "assigned") {
      error(
        "status",
        'Say who has it in the held_by_staff_no or held_by_email column instead. "Assigned" is something we work out from an open handover, not a label — otherwise the register would say a laptop is out without saying who has it.',
      );
    } else if (!STATUS_WORDS[normalizeKey(status)]) {
      error(
        "status",
        `We do not know what "${status}" means. Use available, in_repair, retired or lost.`,
      );
    }
  }

  /* The declared money cell has already refused anything that is not naira. The
     per-item ceiling is this entity's own, and it catches a misplaced decimal
     before it reaches an insurance claim. */
  const value = text("value");
  if (value !== "") {
    const digits = value.replace(/[^\d.]/g, "");
    const kobo = Math.round(Number(digits) * 100);
    if (Number.isFinite(kobo) && kobo > MAX_VALUE_KOBO) {
      error("value", "That is too much for one item. Check for a misplaced decimal point.");
    }
  }

  const today = todayIso();
  const purchased = text("purchasedOn");
  if (purchased !== "") {
    const parsed = parseImportDate(purchased);
    if (parsed.ok && parsed.value.iso > today) {
      error("purchasedOn", `${purchased} is in the future. Check the year.`);
    }
  }

  const held = text("assignedOn");
  if (held !== "") {
    const parsed = parseImportDate(held);
    if (parsed.ok) {
      if (parsed.value.iso > today) {
        error("assignedOn", "You cannot hand something over in the future.");
      } else if (purchased !== "") {
        const bought = parseImportDate(purchased);
        if (bought.ok && parsed.value.iso < bought.value.iso) {
          warn(
            "assignedOn",
            "This says it was handed over before it was bought. One of the two dates is wrong — we import both as written.",
          );
        }
      }
    }
  }

  const email = text("holderEmail");
  if (email !== "" && !EMAIL.test(email)) {
    warn(
      "holderEmail",
      `"${email}" cannot be an email address, so nobody would be recorded as holding this. The item still goes onto the register.`,
    );
  }

  /* A row naming a holder is a row whose custody claim only the API can settle.
     Counted so the file-level note can say how many, rather than repeating the
     same sentence on forty rows. */
  if (text("holderEmployeeNo") !== "" || email !== "") tally("holderRows");
}

/** The batch-level sentences, from what the rules and the cell checks counted. */
function assetFileNotes(counts: Readonly<Record<string, number>>): string[] {
  const notes: string[] = [];
  const ambiguousDates = counts["ambiguousDates"] ?? 0;
  const holderRows = counts["holderRows"] ?? 0;

  if (ambiguousDates > 0) {
    notes.push(
      `${ambiguousDates} ${ambiguousDates === 1 ? "date could" : "dates could"} be read two ways — 03/04/2024 is either 3 April or 4 March. We read the day first.`,
    );
  }
  if (holderRows > 0) {
    notes.push(
      `${holderRows} ${holderRows === 1 ? "row names somebody" : "rows name somebody"} as holding an item. Whether those people are on your staff list, and whether the item is already with somebody else, are both questions only the live register can answer.`,
    );
  }
  return notes;
}

/* --------------------------------------------------------------- dictionary */

/**
 * The equipment dictionary, built.
 *
 * `buildDictionary` is the only way to make one, and it is what puts the four
 * required columns first — so the template, the dropdowns on the matching step,
 * the browser check and the API's own response all read one ordered list.
 */
export const EQUIPMENT: Dictionary<AssetField> = buildDictionary(
  {
    slug: "assets",
    kind: "ASSETS",
    templateFile: {
      basename: "approvehr-equipment-template",
      sheetName: "Equipment register",
    },
    noun: { one: "item", many: "items" },
    keyLabel: "tag",
    rowRules: assetRowRules,
    fileNotes: assetFileNotes,
    /* A person is a first and a last name; an item is its tag and what it is. */
    identify: (text) => ({
      key: text("tag") || null,
      name: text("name") || null,
    }),
  },
  COLUMNS,
);

/** The dictionary's own list, in template order, for a screen that needs it. */
export const EQUIPMENT_COLUMNS = EQUIPMENT.columns;

export const HEADING = EQUIPMENT.heading;
