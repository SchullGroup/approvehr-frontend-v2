import { formatMoney } from "@/components/ui";
import type { AuditEntry } from "@/lib/api/audit";

/**
 * Turning an audit row into a sentence a shop owner can read.
 *
 * This file is the whole point of the audit screen. The rows are correct
 * already — the API has been writing them since the first module — and they are
 * unreadable: `employee.updated` on `employees/0192f3c1…` with
 * `{"bankAccount":{"from":"[redacted]","to":"[changed]"}}` is a fact about a
 * database, not a fact about a company. Nobody audits their own business from
 * that, so nobody checks, so the control does not exist.
 *
 * What the owner needs to read is **"Grace Effiong changed Amara Nwachukwu’s
 * bank account"**, and that is what this file produces.
 *
 * ## Keyed on the verb, not on the action
 *
 * There are 130-odd distinct actions across sixteen modules and more arriving.
 * A table keyed on the whole action string would be stale the day after the
 * next module ships, and the stale rows fail *silently* — the screen still
 * renders, just in machine language again.
 *
 * So the table is keyed on the **verb**: the part after the first dot.
 * `asset.archived`, `employee.archived` and `shift.archived` all resolve through
 * one entry, and a module shipping next month that writes `contract.archived`
 * reads correctly without anybody editing this file. Thirty-odd verbs cover
 * every action the API currently writes.
 *
 * When no verb matches, `describe` still returns a line — assembled from the
 * API's own humanised label — and marks it `exact: false`. A degraded line is a
 * bug somebody notices and reports; a crash or a raw `foo.bar_baz` is not.
 *
 * ## Possessives only for people
 *
 * "changed Amara Nwachukwu’s bank account" is right. "changed Annual leave —
 * Amara Nwachukwu’s dates" is not English. So the possessive form is used for
 * `employees` and `users`, whose labels are a person's name, and everything
 * else takes "changed the X on Y". Uniform, and correct in both directions.
 */

/* ------------------------------------------------------------------ helpers */

/** `grossMonthly` → `Gross monthly`. Mirrors `humanise` in the API. */
export function humanise(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** `employee.archived` → "Employee archived". What the API sends; used by the demo. */
export const actionLabel = (action: string): string =>
  humanise(action.replace(/[.]/g, " "));

/**
 * Acronyms the API's `humanise` flattens on the way out.
 *
 * It lower-cases everything after the first character, which is right for
 * `grossMonthly` and wrong for `nhfNumber` — "Nhf number" is not a word anybody
 * in Nigerian payroll has ever written. Fixed here rather than there because
 * this is presentation, and the list is short and local.
 */
const ACRONYMS: Record<string, string> = {
  nhf: "NHF",
  tin: "TIN",
  pin: "PIN",
  bvn: "BVN",
  paye: "PAYE",
  rc: "RC",
  nin: "NIN",
  id: "ID",
  hr: "HR",
};

/** "Nhf number" → "NHF number". Leaves everything else alone. */
export function prettyField(label: string): string {
  return label
    .split(" ")
    .map((word) => ACRONYMS[word.toLowerCase()] ?? word)
    .join(" ");
}

/** Drops the trailing "(AHR-0502)" so a sentence reads as a sentence. */
export function shortLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim() || label;
}

/**
 * Drops the actor's own name off the end of the record's label.
 *
 * Labels for a request name the person it belongs to — "Annual leave — Chidi
 * Nwosu" — which is right on a list and reads as a stutter in a sentence the
 * same person is the subject of: "Chidi Nwosu asked for Annual leave — Chidi
 * Nwosu". Only trimmed when the two names match, so somebody filing leave on a
 * colleague's behalf still says whose it was.
 */
function withoutActor(label: string, who: string): string {
  const suffix = ` — ${who}`;
  return label.endsWith(suffix) ? label.slice(0, -suffix.length) : label;
}

/** Types whose label is a person's name, so a possessive is grammatical. */
const PERSONAL_TYPES = new Set(["employees", "users"]);

/** "Amara Nwachukwu" → "Amara Nwachukwu’s"; "Charles" → "Charles’". */
function possessive(name: string): string {
  return name.endsWith("s") ? `${name}’` : `${name}’s`;
}

/** "a and b" / "a, b and c". Serial commas are not the house style here. */
function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/* --------------------------------------------------------------- the phrase */

type Ctx = {
  /** "Grace Effiong", or "The system". */
  who: string;
  /** The record, named: "Amara Nwachukwu", "Finance", "August 2026 payroll". */
  it: string;
  /** "Amara Nwachukwu’s". Only grammatical when `personal`. */
  its: string;
  personal: boolean;
  noun: string;
  /** Changed field labels, prettified and lower-cased for mid-sentence use. */
  fields: string[];
};

/**
 * The phrase for a change, which is the common case and the one that has to be
 * exactly right.
 *
 * Three fields or more collapses to a count. Naming five fields in a timeline
 * row produces a sentence nobody finishes reading, and the expanded view names
 * every one of them beside its before and after — which is the place to look
 * when the answer is "which five".
 */
function changed(c: Ctx): string {
  if (c.fields.length === 0) return `updated ${c.it}`;
  if (c.fields.length >= 3) {
    return `changed ${c.fields.length} things about ${c.it}`;
  }
  const what = joinWords(c.fields);
  return c.personal
    ? `changed ${c.its} ${what}`
    : `changed the ${what} on ${c.it}`;
}

/**
 * Verb → phrase. Everything after the actor's name.
 *
 * Covers every verb the API writes today. Read it as a glossary: the left side
 * is what a developer wrote, the right side is what a business owner would say
 * about the same event.
 */
const VERBS: Record<string, (c: Ctx) => string> = {
  /* Records */
  created: (c) => `added ${c.it}`,
  added: (c) => `added ${c.it}`,
  updated: changed,
  assignment_updated: changed,
  profile_updated: () => "changed the company details",
  archived: (c) => `archived ${c.it}`,
  restored: (c) => `restored ${c.it}`,
  deleted: (c) => `deleted ${c.it}`,
  deactivated: (c) => `turned off ${c.it}`,
  moved: (c) => `moved ${c.it}`,
  reordered: (c) => `reordered ${c.it}`,
  corrected: (c) => `corrected ${c.it}`,
  registered: (c) => `registered ${c.it}`,
  generated: (c) => `generated ${c.it}`,
  imported: (c) => `imported ${c.it}`,
  applied: (c) => `applied for ${c.it}`,
  bank_changed: (c) =>
    c.personal ? `changed ${c.its} bank account` : `changed the bank account on ${c.it}`,

  /* Decisions — the product is named after these */
  approved: (c) => `approved ${c.it}`,
  hr_approved: (c) => `approved ${c.it} for HR`,
  manager_approved: (c) => `approved ${c.it} as the manager`,
  bulk_approved: (c) => `approved several ${c.noun}s at once`,
  declined: (c) => `declined ${c.it}`,
  rejected: (c) => `declined ${c.it}`,
  decided: (c) => `decided ${c.it}`,
  cancelled: (c) => `cancelled ${c.it}`,
  reopened: (c) => `reopened ${c.it}`,
  accepted: (c) => `accepted ${c.it}`,
  requested: (c) => `asked for ${c.it}`,
  awaiting_approval: (c) => `sent ${c.it} for approval`,
  waived: (c) => `waived ${c.it}`,
  submitted: (c) => `submitted ${c.it}`,
  acknowledged: (c) => `signed for ${c.it}`,
  verified: (c) => `checked ${c.it}`,
  fulfilled: (c) => `supplied ${c.it}`,
  published: (c) => `published ${c.it}`,
  completed: (c) => `finished ${c.it}`,
  started: (c) => `started ${c.it}`,
  answered: (c) => `answered ${c.it}`,
  recorded: (c) => `recorded ${c.it}`,
  action_recorded: (c) =>
    c.personal ? `recorded a disciplinary action for ${c.it}` : `recorded ${c.it}`,

  /* Money */
  paid: (c) => `paid ${c.it}`,
  prepared: (c) => `prepared ${c.it}`,
  repayment_recorded: (c) => `recorded a repayment on ${c.it}`,
  repayment_waived: (c) => `waived a repayment on ${c.it}`,
  increase_applied: (c) => `applied a pay rise on ${c.it}`,
  filing_due: (c) => `flagged ${c.it} as due`,

  /* People moving around */
  assigned: (c) => `assigned ${c.it}`,
  bulk_assigned: (c) => `assigned ${c.it} to several people`,
  assignment_ended: (c) => `ended ${c.it}`,
  employees_assigned: (c) => `moved people into ${c.it}`,
  employees_unassigned: (c) => `moved people out of ${c.it}`,
  members_added: (c) => `gave people the ${c.it} role`,
  member_removed: (c) => `took somebody out of the ${c.it} role`,
  returned: (c) => `took ${c.it} back`,
  clocked_in_for: (c) => `clocked in for ${c.it}`,

  /* Reading things that are worth knowing were read */
  viewed: (c) => `looked at ${c.it}`,
  read: (c) => `looked at ${c.it}`,
  file_viewed: (c) => `opened the file on ${c.it}`,
  record_read: (c) => `looked at ${c.it}`,
  register_read: () => "looked at the disciplinary register",
  expiry_reviewed: (c) => `reviewed when ${c.it} expires`,

  /* Accounts */
  email_verified: (c) =>
    c.personal ? `confirmed ${c.its} email address` : `confirmed an email address`,
  password_reset: (c) => (c.personal ? `reset ${c.its} password` : "reset a password"),
  password_reset_requested: (c) =>
    c.personal ? `asked for a password reset for ${c.it}` : "asked for a password reset",

  /* Setup */
  features_updated: () => "changed which parts of the product this company uses",
};

/**
 * Full-action overrides, checked before the verb table.
 *
 * Only for the handful of verbs whose meaning depends on the family, where
 * keying on the verb alone produces a sentence that is wrong rather than merely
 * generic. `applied` is the reason this table exists: `loan.applied` is somebody
 * asking for a loan, and `import_batch.applied` is somebody running a
 * spreadsheet into the database. One word, two acts, and "Grace applied for
 * staff-list-august.csv" is nonsense.
 *
 * Keep it short. Anything that reads correctly from the verb belongs in `VERBS`,
 * where a module shipping later inherits it for free.
 */
const ACTIONS: Record<string, (c: Ctx) => string> = {
  "leave_request.created": (c) => `asked for ${c.it}`,
  "leave_request.cancelled": (c) => `cancelled ${c.it}`,
  "import_batch.applied": (c) => `imported ${c.it}`,
  "approval.decided": (c) => `made a decision on ${c.it}`,
  "attendance.clocked_in_for": (c) => `clocked in on behalf of ${c.it}`,
  "document.file_viewed": (c) => `opened the file on ${c.it}`,
  "setup.answered": () => "answered the setup questions",
  "setup.completed": () => "finished setting the company up",
};

/** Reads of the trail itself. `audit_log.*`, written by the audit module. */
const READS: Record<string, (c: Ctx) => string> = {
  "audit_log.searched": () => "searched the audit log",
  "audit_log.summary_read": () => "opened the audit log",
  "audit_log.actors_read": () => "opened the audit log",
  "audit_log.event_read": () => "opened one entry in the audit log",
  "audit_log.entity_read": (c) =>
    c.personal ? `looked at ${c.its} history` : `looked at the history of ${c.it}`,
};

export type Described = {
  /** The line to show. Always safe to render. */
  text: string;
  /**
   * False when no verb matched and the line was assembled from the API's
   * humanised label instead. The screen shows these as-is; the flag exists so a
   * gap is findable rather than invisible.
   */
  exact: boolean;
};

/** What `describe` needs. Narrower than `AuditEntry` so the demo can use it. */
export type DescribableEntry = Pick<
  AuditEntry,
  "action" | "actionLabel" | "actor" | "entity" | "changedFields"
>;

/**
 * "Grace Effiong changed Amara Nwachukwu’s bank account".
 *
 * The sentence, and nothing else — no timestamp, no chips. Those are separate
 * elements in the row because they are separate facts, and a reader scanning a
 * column of times should not have to find them inside a sentence.
 */
export function describe(entry: DescribableEntry): Described {
  const who = entry.actor.isSystem ? "The system" : entry.actor.name;
  const it = withoutActor(shortLabel(entry.entity.label), who);
  const personal = PERSONAL_TYPES.has(entry.entity.type);
  const ctx: Ctx = {
    who,
    it,
    its: possessive(it),
    personal,
    noun: entry.entity.noun,
    fields: entry.changedFields.map((field) => prettyField(field).toLowerCase()),
  };

  const read = READS[entry.action];
  if (read) return { text: `${who} ${read(ctx)}`, exact: true };

  const override = ACTIONS[entry.action];
  if (override) return { text: `${who} ${override(ctx)}`, exact: true };

  const verb = entry.action.includes(".")
    ? entry.action.slice(entry.action.indexOf(".") + 1)
    : entry.action;
  const template = VERBS[verb];
  if (template) return { text: `${who} ${template(ctx)}`, exact: true };

  /* No template. Assemble from the API's own label rather than guessing at
     grammar: "Grace Effiong · loan repayment waived · Loan — Amara". Readable,
     honest about being generic, and it cannot come out as broken English. */
  return {
    text: `${who} · ${entry.actionLabel.toLowerCase()} · ${it}`,
    exact: false,
  };
}

/* ------------------------------------------------------------------- values */

export type FormattedValue = {
  text: string;
  /** `empty` renders muted; `hidden` is a value the API refused to send. */
  kind: "value" | "empty" | "hidden";
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Field names that hold integer kobo. The one place money crosses over. */
const isKoboField = (field: string): boolean =>
  field.toLowerCase().replace(/[^a-z0-9]/g, "").endsWith("kobo");

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * One stored value, as a person reads it.
 *
 * A `diff` is `Json`, so this has to cope with anything: numbers, booleans,
 * nulls, ISO dates, nested objects a bulk importer wrote. Four decisions worth
 * naming:
 *
 * 1. **Kobo becomes naira here.** The API speaks integer kobo and the frontend
 *    speaks naira, and a diff is the one payload where which keys are money is
 *    knowable only from the key's name. So the boundary is this function, keyed
 *    on a field ending in `Kobo`. Most pay figures never arrive — the API
 *    redacts salary, gross, net and basic whatever is stored — but a loan
 *    principal does, and printing `250000000` where ₦2,500,000 belongs is the
 *    kind of wrong that gets believed.
 * 2. **Null is "Not set", not blank.** A blank cell reads as a rendering bug.
 * 3. **Nested objects are flattened one level.** The screen is a timeline, not
 *    a JSON viewer; two levels deep says "more detail" rather than pasting a
 *    brace. Nothing legible is lost, because the API already replaced anything
 *    deeper than six levels itself.
 * 4. **The API's own redaction tokens are translated.** `[redacted]` and
 *    `[changed]` are protocol, not English.
 */
export function formatFieldValue(field: string, value: unknown): FormattedValue {
  if (value === null || value === undefined) return { text: "Not set", kind: "empty" };

  if (typeof value === "boolean") {
    return { text: value ? "Yes" : "No", kind: "value" };
  }

  if (typeof value === "number") {
    if (isKoboField(field)) {
      return {
        text: formatMoney(value / 100, "NGN", { decimals: true }),
        kind: "value",
      };
    }
    return { text: value.toLocaleString("en-NG"), kind: "value" };
  }

  if (typeof value === "string") {
    if (value === "[redacted]") return { text: "Hidden", kind: "hidden" };
    if (value === "[changed]") return { text: "Changed", kind: "hidden" };
    if (value === "[nested]") return { text: "More detail", kind: "empty" };
    if (value === "") return { text: "Empty", kind: "empty" };

    if (isKoboField(field) && /^-?\d+$/.test(value)) {
      return {
        text: formatMoney(Number(value) / 100, "NGN", { decimals: true }),
        kind: "value",
      };
    }
    if (DATE_ONLY.test(value)) return { text: readableDate(value), kind: "value" };
    if (TIMESTAMP.test(value)) return { text: fullStamp(value), kind: "value" };
    return { text: value, kind: "value" };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return { text: "None", kind: "empty" };
    if (value.length > 4) {
      return { text: `${value.length} items`, kind: "value" };
    }
    return {
      text: value.map((item) => formatFieldValue(field, item).text).join(", "),
      kind: "value",
    };
  }

  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>).map(
      ([key, inner]) =>
        `${prettyField(humanise(key))}: ${formatFieldValue(key, inner).text}`,
    );
    if (parts.length === 0) return { text: "Nothing", kind: "empty" };
    return { text: parts.join(" · "), kind: "value" };
  }

  return { text: String(value), kind: "value" };
}

/* -------------------------------------------------------------------- clock */

/** `2026-08-19` → `19 Aug 2026`. */
export function readableDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** The exact moment. For a tooltip, and for anybody who has to be sure. */
export function fullStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Local day parts, not UTC.
 *
 * An audit timestamp is an instant, so "which day was that" is a question about
 * the reader's day. Nigeria is UTC+1 with no daylight saving, which is exactly
 * the hour that would push a late-evening event into tomorrow if this used the
 * UTC getters `lib/today.ts` correctly uses for calendar-only values.
 */
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export const dayKey = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "Today", "Yesterday", "Tuesday", then a date. The heading over a day's rows. */
export function dayHeading(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAYS[date.getDay()] ?? "";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Relative while it is still news, then the clock time — the day is a heading. */
export function timeLabel(iso: string, now: Date): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;
  const minutes = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  return `${pad(then.getHours())}:${pad(then.getMinutes())}`;
}
