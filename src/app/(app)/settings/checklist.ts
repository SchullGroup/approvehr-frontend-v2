import type { SetupFacts } from "@/lib/store/setup-checklist";

/**
 * The seven things a company has to set up, and how to tell whether it has.
 *
 * ## Why the judgement lives here and the facts live on the API
 *
 * `GET /setup/checklist` sends counts and booleans and no opinion. This file is
 * the opinion: which facts add up to "done", what each row affects, and what to
 * say when something is missing. The split is deliberate and is written up in
 * `approvehr-api/src/modules/setup/checklist.ts` — the short version is that a
 * fact about a company must have one definition, and a judgement about what to
 * nag somebody about belongs beside the link it sits next to, where the copy is
 * subject to this repo's own vocabulary and type-scale checks.
 *
 * ## Four states, and "optional" is what keeps the count honest
 *
 * A checklist that says 6 of 7 has to mean something. So rows that *cannot* be
 * incomplete are marked `optional` and left out of the denominator, rather than
 * counted as done and quietly inflating it. Exactly one row is like that today:
 * the employee record fields always have an answer, because their columns
 * default to on — there is no state where a company has failed to choose.
 *
 * `attention` is not a softer `todo`. It means something *is* set up and is
 * nonetheless wrong or dangerous right now: a payroll with nobody able to
 * approve it, an account that can sign in and see nothing, a calendar with no
 * holidays on it so every one of them prorates as an ordinary working day.
 */

export type RowStatus = "done" | "attention" | "todo" | "optional" | "unknown";

export type ChecklistRow = {
  id: string;
  title: string;
  /** What changes in the product because of this. Always present tense. */
  affects: string;
  status: RowStatus;
  /** The state of this row now, in one sentence. Never a bare number. */
  detail: string;
  href: string;
  linkLabel: string;
  /** A second place to go, where the fix is not where the setting is. */
  also?: { href: string; label: string };
};

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/**
 * Build the seven rows.
 *
 * Every branch that reads a nullable field states the absence rather than
 * guessing past it — the `unknown` status exists for that, and demo mode is
 * where it shows: the pay row genuinely cannot know whether a bank account is on
 * file, and "no account" would be a wrong claim rather than a missing one.
 */
export function checklistRows(facts: SetupFacts): ChecklistRow[] {
  return [
    companyRow(facts),
    locationsRow(facts),
    recordFieldsRow(facts),
    leaveRow(facts),
    payRow(facts),
    rolesRow(facts),
    payrollChecksRow(facts),
  ];
}

/** Done over the rows that can be incomplete. Optional and unknown are excluded. */
export function checklistProgress(rows: ChecklistRow[]): {
  done: number;
  total: number;
  outstanding: ChecklistRow[];
} {
  const counted = rows.filter(
    (row) => row.status !== "optional" && row.status !== "unknown",
  );
  return {
    done: counted.filter((row) => row.status === "done").length,
    total: counted.length,
    outstanding: counted.filter((row) => row.status !== "done"),
  };
}

/* ------------------------------------------------------------------ the rows */

function companyRow(facts: SetupFacts): ChecklistRow {
  const { logo, rcNumber, addressLine, taxState, tin, entities } = facts.company;
  /* TIN is not in the "done" test on purpose: a company can pay salaries and
     file PAYE before its TIN is issued, and blocking the checklist on a number
     the FIRS has not sent yet would be nagging about somebody else's queue. It
     is named in the detail instead. */
  const missing = [
    rcNumber ? null : "an RC number",
    addressLine ? null : "a registered address",
    taxState ? null : "a PAYE state",
  ].filter((item): item is string => item !== null);

  const entityNote =
    entities > 1 ? ` ${plural(entities, "entity", "entities")} on file.` : "";

  /* Named separately from `missing`, and deliberately not in the "done" test.
     A company can run payroll without a logo, so blocking the row on it would
     be nagging — but the upload sits below a form containing all thirty-seven
     states, and nothing on this page had ever mentioned it. The honest answer
     to "where do I add our logo" was "scroll", which is how somebody concludes
     the feature does not exist. */
  const logoNote = logo
    ? ""
    : " No logo yet — it goes on every payslip and on the emails the platform sends.";

  return {
    id: "company",
    title: "Company profile",
    affects:
      "The header on every payslip, the emails the platform sends, your statutory filings, and the PAYE state an employee inherits when their record does not say.",
    status: missing.length === 0 ? "done" : "todo",
    detail:
      missing.length === 0
        ? `Complete.${entityNote}${tin ? "" : " No TIN recorded yet — add it before your first filing."}${logoNote}`
        : `Still needs ${missing.join(", ")}.${logoNote}`,
    href: "/settings/company",
    linkLabel: missing.length === 0 ? "Review the profile" : "Finish the profile",
  };
}

function locationsRow(facts: SetupFacts): ChecklistRow {
  const { total, withGeofence, enforcing } = facts.locations;

  if (total === 0) {
    return {
      id: "locations",
      title: "Work locations",
      affects:
        "Where staff may clock in, what a timesheet says about where a day was worked, and which branch a person's record names.",
      status: "todo",
      detail:
        "No offices yet. Until one exists a clock-in records a time and not a place.",
      href: "/settings/locations",
      linkLabel: "Add your first office",
    };
  }

  const inert = withGeofence - enforcing;
  const fenceNote =
    withGeofence === 0
      ? "No geofence on any of them, so a clock-in from anywhere is accepted."
      : inert === 0
        ? withGeofence === 1
          ? "One has a geofence, and it is applied."
          : `${withGeofence} have a geofence, and each one is applied.`
        : inert === withGeofence
          ? withGeofence === 1
            ? "One has a geofence, and it is not applied — staff there may clock in from anywhere."
            : `${withGeofence} have a geofence, and none is applied — staff there may clock in from anywhere.`
          : `${withGeofence} have a geofence, ${inert} of which ${inert === 1 ? "is" : "are"} not applied because staff there may clock in from anywhere.`;

  return {
    id: "locations",
    title: "Work locations",
    affects:
      "Where staff may clock in, what a timesheet says about where a day was worked, and which branch a person's record names.",
    status: "done",
    detail: `${plural(total, "office", "offices")}. ${fenceNote}`,
    href: "/settings/locations",
    linkLabel: "Manage offices",
  };
}

function recordFieldsRow(facts: SetupFacts): ChecklistRow {
  const { taxSetup, pensionSetup, bankDetails } = facts.recordFields;
  const on = [
    taxSetup ? "tax" : null,
    pensionSetup ? "pension" : null,
    bankDetails ? "bank details" : null,
  ].filter((item): item is string => item !== null);

  return {
    id: "record-fields",
    title: "Employee record fields",
    affects:
      "Which statutory groups a new starter is asked for, and how long the form is. Switching one off hides fields and deletes nothing.",
    /* Never a todo: the columns default to on, so there is no state where a
       company has failed to answer. Left out of the count for that reason. */
    status: "optional",
    detail:
      on.length === 3
        ? "All three groups are asked for: tax, pension and bank details."
        : on.length === 0
          ? "None of the three statutory groups are asked for. A new record is name, job and salary."
          : `Asking for ${on.join(" and ")}. The rest are hidden on the form.`,
    href: "/settings/features",
    linkLabel: "Choose the fields",
  };
}

function leaveRow(facts: SetupFacts): ChecklistRow {
  const { types, holidays, awaitingProclamation, year } = facts.leave;

  if (types === 0) {
    return {
      id: "leave",
      title: "Leave types and holidays",
      affects:
        "What people can book, what every balance is measured against, and how payroll prorates a month.",
      status: "todo",
      detail: "No leave types yet, so nobody can book anything.",
      href: "/settings/leave",
      linkLabel: "Set up leave",
    };
  }

  if (holidays === 0) {
    return {
      id: "leave",
      title: "Leave types and holidays",
      affects:
        "What people can book, what every balance is measured against, and how payroll prorates a month.",
      /* Attention rather than todo: leave works, and the *consequence* is
         specific — with no dates on the calendar, payroll and the timesheet
         treat every public holiday as an ordinary working day. */
      status: "attention",
      detail: `${plural(types, "leave type", "leave types")}, and no public holidays on the ${year} calendar. Every one of them is being treated as an ordinary working day.`,
      href: "/settings/leave",
      linkLabel: "Add the holidays",
    };
  }

  return {
    id: "leave",
    title: "Leave types and holidays",
    affects:
      "What people can book, what every balance is measured against, and how payroll prorates a month.",
    status: "done",
    detail:
      awaitingProclamation > 0
        ? `${plural(types, "leave type", "leave types")} and ${plural(holidays, "holiday", "holidays")} for ${year}, ${awaitingProclamation} of them awaiting proclamation.`
        : `${plural(types, "leave type", "leave types")} and ${plural(holidays, "holiday", "holidays")} for ${year}.`,
    href: "/settings/leave",
    linkLabel: "Review leave",
  };
}

function payRow(facts: SetupFacts): ChecklistRow {
  const { settings, bankAccounts, hasPrimaryBankAccount } = facts.pay;
  const affects =
    "The working month payroll prorates against, the salary split, pension and NHF rates, and the account salaries leave from.";

  if (!settings) {
    return {
      id: "pay",
      title: "Pay setup",
      affects,
      status: "todo",
      detail: "Nothing saved yet. Payroll cannot be prepared without it.",
      href: "/settings/payroll",
      linkLabel: "Set up pay",
    };
  }

  /* Demo mode cannot see the payment book. Absent, not "no account". */
  if (hasPrimaryBankAccount === null) {
    return {
      id: "pay",
      title: "Pay setup",
      affects,
      status: "unknown",
      detail:
        "Rates and the working month are saved. Whether an account is on file for paying salaries needs the API.",
      href: "/settings/payroll",
      linkLabel: "Review pay setup",
      also: { href: "/settings/bank-accounts", label: "Bank accounts" },
    };
  }

  if (!hasPrimaryBankAccount) {
    return {
      id: "pay",
      title: "Pay setup",
      affects,
      /* A real blocker with a specific consequence: no payment batch can be
         built at all, however correct the payslips are. */
      status: "attention",
      detail:
        bankAccounts === 0
          ? "Rates are saved, and no bank account is on file. A payment batch cannot be built until one is."
          : `Rates are saved, and none of your ${plural(bankAccounts ?? 0, "account", "accounts")} is set as the one salaries come from. A payment batch cannot be built until one is.`,
      href: "/settings/bank-accounts",
      linkLabel: "Choose the account",
      also: { href: "/settings/payroll", label: "Pay setup" },
    };
  }

  return {
    id: "pay",
    title: "Pay setup",
    affects,
    status: "done",
    detail: `Rates, the working month and a default account are all set. ${plural(bankAccounts ?? 0, "account", "accounts")} on file.`,
    href: "/settings/payroll",
    linkLabel: "Review pay setup",
    also: { href: "/settings/bank-accounts", label: "Bank accounts" },
  };
}

function rolesRow(facts: SetupFacts): ChecklistRow {
  const { roles, usersWithoutRole, canApprovePayroll } = facts.access;
  const affects =
    "Who can see salaries, approve a payroll, change these settings, or export the directory.";

  if (roles === 0) {
    return {
      id: "roles",
      title: "Roles and access",
      affects,
      status: "todo",
      detail: "No roles yet, so nobody has any permission at all.",
      href: "/settings/roles",
      linkLabel: "Set up roles",
    };
  }

  if (canApprovePayroll === 0) {
    return {
      id: "roles",
      title: "Roles and access",
      affects,
      status: "attention",
      detail: `${plural(roles, "role", "roles")}, and nobody holds the permission to approve a payroll. A prepared payroll would have nowhere to go.`,
      href: "/settings/roles",
      linkLabel: "Fix approvals",
    };
  }

  if (usersWithoutRole > 0) {
    return {
      id: "roles",
      title: "Roles and access",
      affects,
      status: "attention",
      detail: `${plural(usersWithoutRole, "account has", "accounts have")} no role, so ${usersWithoutRole === 1 ? "it" : "they"} can sign in and see nothing.`,
      href: "/settings/roles",
      linkLabel: "Give them a role",
    };
  }

  return {
    id: "roles",
    title: "Roles and access",
    affects,
    status: "done",
    detail:
      canApprovePayroll === 1
        ? `${plural(roles, "role", "roles")}, and exactly one person can approve a payroll. Worth a second, for the week they are away.`
        : `${plural(roles, "role", "roles")}, and ${canApprovePayroll} people can approve a payroll.`,
    href: "/settings/roles",
    linkLabel: "Review roles",
  };
}

function payrollChecksRow(facts: SetupFacts): ChecklistRow {
  const {
    employees,
    requireBankAccount,
    requirePensionPin,
    missingBankAccount,
    missingPensionPin,
  } = facts.payrollChecks;
  const affects =
    "What stops a payroll before it goes out. These are the same checks the run itself raises.";

  if (employees === 0) {
    return {
      id: "payroll-checks",
      title: "Payroll checks",
      affects,
      status: "todo",
      detail: "Nobody on the payroll yet, so there is nothing to check.",
      href: "/people/new",
      linkLabel: "Add somebody",
      also: { href: "/settings/payroll", label: "The checks" },
    };
  }

  const blockers = requireBankAccount ? missingBankAccount : 0;
  const warnings = requirePensionPin ? missingPensionPin : 0;

  if (blockers > 0) {
    return {
      id: "payroll-checks",
      title: "Payroll checks",
      affects,
      status: "attention",
      detail: `${plural(blockers, "person has", "people have")} no account number, out of ${employees}. They cannot be paid, and a payroll will not go out until each one is fixed or deliberately left off.`,
      href: "/people",
      linkLabel: "Fix the records",
      also: { href: "/settings/payroll", label: "The checks" },
    };
  }

  return {
    id: "payroll-checks",
    title: "Payroll checks",
    affects,
    status: "done",
    detail:
      warnings > 0
        ? `Everybody has an account number. ${plural(warnings, "person has", "people have")} no pension PIN, which leaves the pension schedule incomplete but does not stop a payroll.`
        : `All ${employees} could be paid today. Nothing would stop a payroll.`,
    href: "/settings/payroll",
    linkLabel: "Review the checks",
  };
}
