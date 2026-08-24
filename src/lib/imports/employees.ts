import {
  buildDictionary,
  normalizeKey,
  parseImportDate,
  type ColumnSpec,
  type Dictionary,
  type RowContext,
} from "./spec";

/**
 * The employee dictionary, and the rules only an employee import has.
 *
 * This is the whole of what "an importable entity" is on this side. Everything
 * generic — matching a heading, reading a date or an amount, building the
 * template file, the four-step screen — is in `spec.ts`, `mapping.ts`,
 * `check.ts`, `template-file.ts` and `components/imports/`. What is *employee*
 * about an employee import is only what is below.
 *
 * A second importable entity is a second file shaped like this one plus a
 * validate/apply pair on the API. It is not a second screen.
 *
 * ## This is a mirror, and the API's copy wins
 *
 * The API owns this list — `approvehr-api/src/modules/imports/employees.ts`,
 * `EMPLOYEE_COLUMNS` — and when the API answers, **its copy wins**:
 * `GET /imports/template/employees` is what the screen renders, what pre-selects
 * the column matches and what the downloaded file is built from. The copy here is
 * the same data compiled in, for the one case where that call cannot be made.
 *
 * ### The drift, named
 *
 * Two copies of a list is one too many and this one is deliberate. It is data
 * rather than logic, it is only reached when the API is unreachable, and the
 * failure mode is benign in the direction that matters: a column the API knows
 * about and this file does not is offered as "do not import" rather than
 * mismatched, and the API re-matches every heading it is sent regardless of what
 * this file guessed. If you change the API's dictionary, re-copy it here.
 */


/** The employment types the API accepts, as it writes them. */
export type EmploymentTypeCode =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "INTERN"
  | "NYSC";

/** The employment statuses the API accepts, as it writes them. */
export type EmploymentStatusCode =
  | "ONBOARDING"
  | "ACTIVE"
  | "ON_LEAVE"
  | "SUSPENDED"
  | "EXITED";

/**
 * The 36 states and FCT. PAYE is filed to a state revenue service, so this is
 * not a display list — a typo sends a remittance to the wrong agency.
 */
export const NIGERIAN_TAX_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
] as const;

/** What people actually type. FCT has four common spellings and none is "FCT". */
const STATE_ALIASES: Readonly<Record<string, string>> = {
  abuja: "FCT",
  fct: "FCT",
  fctabuja: "FCT",
  abujafct: "FCT",
  federalcapitalterritory: "FCT",
  nassarawa: "Nasarawa",
  crossrivers: "Cross River",
  akwaibom: "Akwa Ibom",
};

export const EMPLOYMENT_TYPE_WORDS: Readonly<Record<string, EmploymentTypeCode>> = {
  fulltime: "FULL_TIME",
  full: "FULL_TIME",
  permanent: "FULL_TIME",
  regular: "FULL_TIME",
  staff: "FULL_TIME",
  parttime: "PART_TIME",
  part: "PART_TIME",
  contract: "CONTRACT",
  contractor: "CONTRACT",
  temporary: "CONTRACT",
  temp: "CONTRACT",
  consultant: "CONTRACT",
  locum: "CONTRACT",
  intern: "INTERN",
  internship: "INTERN",
  siwes: "INTERN",
  industrialtraining: "INTERN",
  nysc: "NYSC",
  corper: "NYSC",
  youthservice: "NYSC",
};

export const EMPLOYMENT_STATUS_WORDS: Readonly<Record<string, EmploymentStatusCode>> = {
  active: "ACTIVE",
  current: "ACTIVE",
  employed: "ACTIVE",
  onleave: "ON_LEAVE",
  leave: "ON_LEAVE",
  maternityleave: "ON_LEAVE",
  suspended: "SUSPENDED",
  inactive: "SUSPENDED",
  onhold: "SUSPENDED",
  onboarding: "ONBOARDING",
  probation: "ONBOARDING",
  pending: "ONBOARDING",
  exited: "EXITED",
  terminated: "EXITED",
  resigned: "EXITED",
  left: "EXITED",
  retired: "EXITED",
  dismissed: "EXITED",
};

export const GENDER_WORDS: Readonly<Record<string, string>> = {
  female: "female",
  f: "female",
  woman: "female",
  male: "male",
  m: "male",
  man: "male",
  other: "other",
  o: "other",
  nonbinary: "other",
};

const STATES_BY_KEY: ReadonlyMap<string, string> = new Map(
  NIGERIAN_TAX_STATES.map((state) => [normalizeKey(state), state]),
);

/**
 * A written state to its canonical name, or null.
 *
 * A trailing "State" is stripped first: "Kaduna State" is what a spreadsheet
 * says, and refusing it would be pedantry rather than validation.
 */
export function resolveTaxState(value: string): string | null {
  const key = normalizeKey(value).replace(/state$/, "");
  return STATES_BY_KEY.get(key) ?? STATE_ALIASES[key] ?? null;
}

/**
 * The three canonical answers, derived from `GENDER_WORDS` rather than typed
 * a second time — its own values, deduplicated in the order they are
 * declared, cannot drift from what the checker actually accepts.
 */
const GENDER_OPTIONS: readonly string[] = [...new Set(Object.values(GENDER_WORDS))];

/** Every accepted spelling of "must say monthly", collapsed to the one word. */
const PAY_FREQUENCY_OPTIONS: readonly string[] = ["monthly"];

/**
 * Rows per request, as the API caps it.
 *
 * Not the number we actually send: `express.json` is capped at 100kb, which
 * bites around 250 rows of a fully populated file, so the client chunks well
 * below this. See `CHUNK_ROWS` in `lib/store/imports.ts`.
 */
export const MAX_ROWS_PER_BATCH = 500;

export type EmployeeField =
  | "employeeNo"
  | "firstName"
  | "lastName"
  | "middleName"
  | "email"
  | "phone"
  | "dateOfBirth"
  | "gender"
  | "jobTitle"
  | "department"
  | "manager"
  | "managerEmployeeNo"
  | "workLocation"
  | "legalEntity"
  | "salaryGrade"
  | "employmentType"
  | "workType"
  | "status"
  | "startDate"
  | "endDate"
  | "grossMonthly"
  | "payFrequency"
  | "bankName"
  | "bankAccount"
  | "pensionPin"
  | "pensionProvider"
  | "taxState"
  | "tin"
  | "annualRent"
  | "nhfNumber"
  | "nextOfKinName"
  | "nextOfKinRelationship"
  | "nextOfKinPhone"
  | "addressLine"
  | "nin"
  | "stateOfOrigin"
  | "lgaOfOrigin"
  | "religion";

const COLUMNS: readonly ColumnSpec<EmployeeField>[] = [
  {
    field: "employeeNo",
    templateExample: "EXAMPLE-001",
    column: "employee_no",
    aliases: [
      "employee_id",
      "employee_number",
      "staff_no",
      "staff_id",
      "staff_number",
      "emp_no",
      "employee_code",
    ],
    /* Not required, and it used to be. The single-employee form generates one
       when nobody supplies it, so refusing the row here made the product
       disagree with itself about the same person. See the API's dictionary. */
    required: false,
    example: "EMP-1000",
    note: "Your own staff number. This is what we match on, so a second import of the same number updates that person instead of creating a duplicate. Leave it out and we match on email, or on name and date of birth, and generate a number for anybody new.",
  },
  {
    field: "firstName",
    templateExample: "DELETE",
    column: "first_name",
    aliases: ["given_name", "first"],
    required: true,
    example: "Ngozi",
    note: "Required.",
  },
  {
    field: "lastName",
    templateExample: "THIS ROW",
    column: "last_name",
    aliases: ["surname", "family_name", "last"],
    required: true,
    example: "Williams",
    note: "Required.",
  },
  {
    field: "middleName",
    column: "middle_name",
    aliases: ["other_names", "other_name", "middle"],
    required: false,
    example: "Chiamaka",
    note: "Optional.",
  },
  {
    field: "email",
    templateExample: "example@yourcompany.com",
    column: "email",
    aliases: ["email_address", "work_email", "company_email", "official_email"],
    required: false,
    example: "ngozi.williams@company.com",
    note: "Their work address. It is also how we tell whether a row is somebody you already have, so a file without it cannot be safely imported twice.",
    recommended: {
      why: "no work email — payslips cannot be sent to them, and a re-import cannot tell they are already on file",
    },
  },
  {
    field: "phone",
    column: "phone",
    aliases: ["phone_number", "mobile", "mobile_number", "telephone"],
    required: false,
    example: "+234 803 111 0011",
    note: "Optional. 10 digits locally, or 11 to 14 with a country code.",
  },
  {
    field: "dateOfBirth",
    cell: { kind: "date" },
    column: "date_of_birth",
    aliases: ["dob", "birth_date", "birthday"],
    required: false,
    example: "14/03/1991",
    note: "DD/MM/YYYY or YYYY-MM-DD. Both are accepted and neither is guessed at. With a name, this is the second way we recognise somebody you already have.",
  },
  {
    field: "gender",
    column: "gender",
    aliases: ["sex"],
    required: false,
    example: "female",
    note: "female, male or other.",
    dropdown: GENDER_OPTIONS,
  },
  {
    field: "jobTitle",
    column: "job_title",
    aliases: ["title", "position", "designation", "job_role"],
    required: true,
    example: "Data Analyst",
    note: "Required.",
  },
  {
    field: "department",
    column: "department",
    aliases: ["department_name", "dept", "unit", "division", "team"],
    required: false,
    example: "Finance",
    note: "Must already exist, by name. We list the ones that do not so you can add them in one go.",
  },
  {
    field: "manager",
    column: "manager",
    aliases: ["manager_name", "line_manager", "supervisor", "reports_to"],
    required: false,
    example: "Adaeze Okafor",
    note: "Their manager's full name. Matched against this file first, then your existing staff. Ambiguous names are left unset and reported.",
  },
  {
    field: "startDate",
    cell: { kind: "date" },
    column: "start_date",
    aliases: [
      "hire_date",
      "date_of_employment",
      "employment_date",
      "date_employed",
      "date_joined",
      "join_date",
      "resumption_date",
    ],
    required: true,
    example: "28/04/2021",
    note: "DD/MM/YYYY or YYYY-MM-DD. Required, because leave and pension both count from it.",
  },
  {
    field: "endDate",
    cell: { kind: "date" },
    column: "end_date",
    aliases: ["termination_date", "exit_date", "date_of_exit", "last_working_day"],
    required: false,
    example: "",
    note: "Leave it empty for current staff.",
  },
  {
    field: "grossMonthly",
    cell: { kind: "money", subject: "Monthly pay" },
    column: "gross_monthly",
    aliases: [
      "gross_monthly_pay",
      "monthly_gross",
      "gross_salary",
      "gross_pay",
      "monthly_salary",
      "monthly_pay",
      "salary",
      "gross",
    ],
    required: false,
    example: "162,632.00",
    note: "Monthly gross in naira. ₦, commas and spaces are fine. Must be a monthly figure — we will not divide an annual one.",
    recommended: {
      why: "Without it they are on the staff list and cannot be paid — every payroll will name them until it is set.",
      important: true,
    },
  },
  {
    field: "payFrequency",
    column: "pay_frequency",
    aliases: ["salary_frequency", "pay_cycle", "frequency"],
    required: false,
    example: "monthly",
    note: "Must say monthly if it is there at all. Anything else stops the row, because an annual figure imported as monthly overpays by twelve times.",
    dropdown: PAY_FREQUENCY_OPTIONS,
  },
  {
    field: "bankName",
    column: "bank_name",
    aliases: ["bank"],
    required: false,
    example: "First Bank",
    note: "Optional.",
  },
  {
    field: "bankAccount",
    column: "account_number",
    aliases: ["bank_account", "bank_account_number", "nuban", "account_no"],
    required: false,
    example: "9477600630",
    note: "10 digits. Anything else is flagged — payroll cannot pay into it.",
    recommended: {
      feature: "bankDetails",
      why: "no account number — they will be on the payroll run and cannot be paid from it",
      important: true,
    },
  },
  {
    field: "pensionPin",
    column: "pension_pin",
    aliases: ["rsa_pin", "pension_number", "rsa"],
    required: false,
    example: "PEN000000000",
    note: "PEN then 9 to 12 digits. Flagged if it is not, because PenCom will refuse the schedule.",
    recommended: {
      feature: "pensionSetup",
      why: "no RSA PIN — their pension is deducted but the PenCom schedule cannot name them",
    },
  },
  {
    field: "tin",
    column: "tin",
    aliases: ["tax_id", "tax_identification_number", "tax_number", "tin_number"],
    required: false,
    example: "1234567890",
    note: "10 digits, FIRS format. Flagged if it is not.",
    recommended: {
      feature: "taxSetup",
      why: "no TIN — PAYE is still deducted and remitted, but the FIRS filing cannot name them",
    },
  },
  {
    field: "annualRent",
    cell: { kind: "money", zeroAllowed: true, subject: "Rent" },
    column: "annual_rent",
    aliases: ["rent", "annual_rent_paid", "yearly_rent", "rent_paid", "rent_declared"],
    required: false,
    example: "1,800,000.00",
    note: "Annual rent they have declared, in naira. 20% of it is relieved against PAYE, up to ₦500,000. Leave it empty for anybody who has not declared — empty is not the same as 0, and 0 is a declaration.",
    recommended: {
      feature: "taxSetup",
      why: "no rent declared — they get no rent relief and pay more PAYE until they declare",
    },
  },
  {
    field: "nhfNumber",
    column: "nhf_number",
    aliases: ["nhf", "nhf_no", "housing_fund_number"],
    required: false,
    example: "NHF0012345",
    note: "Optional.",
  },
  {
    field: "nextOfKinName",
    column: "next_of_kin_name",
    aliases: ["next_of_kin", "emergency_contact_name", "kin_name"],
    required: false,
    example: "Chinedu Williams",
    note: "Optional.",
  },
  {
    field: "nextOfKinRelationship",
    column: "next_of_kin_relationship",
    aliases: ["emergency_contact_relationship", "kin_relationship"],
    required: false,
    example: "Spouse",
    note: "Optional.",
  },
  {
    field: "nextOfKinPhone",
    column: "next_of_kin_phone",
    aliases: ["emergency_contact_phone", "kin_phone"],
    required: false,
    example: "+234 803 111 0022",
    note: "Optional.",
  },
  {
    field: "addressLine",
    column: "address_line",
    aliases: [
      "address",
      "home_address",
      "residential_address",
      "street_address",
      "house_address",
    ],
    required: false,
    example: "14 Bishop Oluwole Street, Victoria Island, Lagos",
    note: "Where they live, on one line. Not the office they work at, and not the state their PAYE is filed to.",
    recommended: {
      why: "Somebody has to be able to reach them off-site — a letter, a courier, an exit query.",
    },
  },
  {
    field: "nin",
    column: "nin",
    aliases: [
      "national_id",
      "national_identity_number",
      "national_identification_number",
      "nimc",
      "nin_number",
    ],
    required: false,
    example: "12345678901",
    note: "National Identification Number, 11 digits. Spaces and dashes are fine, we strip them. Flagged if it is not 11 digits.",
    recommended: {
      why: "The statutory registrations a Nigerian employee needs are keyed to it.",
    },
  },
  {
    field: "stateOfOrigin",
    column: "state_of_origin",
    aliases: ["origin_state", "home_state", "state_of_birth"],
    required: false,
    example: "Imo",
    note: "One of the 36 states or the FCT. IMO STATE and Imo both read as Imo. An unrecognised one is flagged, never guessed at.",
    recommended: { why: "Reported in statutory and federal-character returns." },
    dropdown: NIGERIAN_TAX_STATES,
  },
  {
    field: "lgaOfOrigin",
    column: "local_government_area",
    aliases: ["lga", "lga_of_origin", "local_govt", "local_government"],
    required: false,
    example: "Ikeduru",
    note: "Free text, deliberately not checked against a list: there are 774 and we will not reject a real one because ours is out of date.",
    recommended: { why: "Reported alongside the state of origin." },
  },
  {
    field: "religion",
    column: "religion",
    aliases: ["faith"],
    required: false,
    example: "Christianity",
    note: "Free text, never a fixed list. Recorded because holidays and dietary arrangements depend on it.",
  },
];


/* -------------------------------------------------------------------- rules */

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Case- and space-insensitive, the way the API matches a staff number. */
const noKey = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, "");

/**
 * Everything the file alone can settle that is not a property of one cell.
 *
 * The dates and the amounts are declared on their columns and checked by the
 * generic engine. What is left is a word list, two columns that disagree, and
 * the three ways one person appears twice in one file — each of which needs a
 * different message and a different severity, which is why it is prose here
 * rather than more declaration.
 *
 * It never guesses at the ones that need the database: whether a staff number is
 * already yours, whether that department exists, whether the pay sits inside its
 * grade's band. The screen says so out loud rather than implying a clean file
 * will import cleanly.
 */
function employeeRowRules(ctx: RowContext<EmployeeField>): void {
  const { text, error, warn, tally, seen } = ctx;

  const employeeNo = text("employeeNo");
  if (employeeNo !== "") {
    const first = seen("employeeNo", noKey(employeeNo));
    if (first !== undefined) {
      error(
        "employeeNo",
        `${employeeNo} is already used on row ${first}. Two people cannot share a staff number — change one of them.`,
      );
    }
  }

  const frequency = text("payFrequency");
  if (
    frequency !== "" &&
    !/^(monthly|month|permonth|monthlypay)$/.test(normalizeKey(frequency))
  ) {
    error(
      "payFrequency",
      `This says "${frequency}". The pay column has to be a monthly figure — we will not divide a yearly one by twelve and guess.`,
    );
  }

  const type = text("employmentType");
  const resolvedType = type === "" ? null : EMPLOYMENT_TYPE_WORDS[normalizeKey(type)];
  if (type !== "" && !resolvedType) {
    error(
      "employmentType",
      `We do not know what "${type}" means. Use full_time, part_time, contract, intern or nysc.`,
    );
  }

  const workType = text("workType");
  const resolvedWorkType =
    workType === "" ? null : EMPLOYMENT_TYPE_WORDS[normalizeKey(workType)];
  if (resolvedType && resolvedWorkType && resolvedType !== resolvedWorkType) {
    tally("typeDisagreements");
    warn(
      "workType",
      `This says "${workType}" and employment_type says "${type}". We use employment_type.`,
    );
  }

  const status = text("status");
  if (status !== "") {
    const resolved = EMPLOYMENT_STATUS_WORDS[normalizeKey(status)];
    if (!resolved) {
      error(
        "status",
        `We do not know what "${status}" means. Use active, on_leave, suspended, onboarding or exited.`,
      );
    } else if (normalizeKey(status) === "inactive") {
      tally("inactiveRows");
    }
  }

  const taxState = text("taxState");
  if (taxState !== "" && !resolveTaxState(taxState)) {
    error(
      "taxState",
      `"${taxState}" is not one of the 36 states or FCT. This is where their PAYE is filed, not where they are from.`,
    );
  }

  const email = text("email");
  if (email !== "" && !EMAIL.test(email)) {
    error("email", `"${email}" cannot be an email address. Check for a typo.`);
  } else if (email !== "") {
    const first = seen("email", email.toLowerCase());
    if (first !== undefined) {
      error(
        "email",
        `${email} is already on row ${first} of this file. Two people cannot share a work email — merge the rows, or correct one address.`,
      );
    }
  }

  const account = text("bankAccount");
  if (account !== "" && !/^\d{10}$/.test(account.replace(/[\s-]/g, ""))) {
    warn(
      "bankAccount",
      `"${account}" is not a 10-digit account number. They will import, but payroll cannot pay into it.`,
    );
  }

  const pin = text("pensionPin");
  if (pin !== "" && !/^pen\d{9,12}$/i.test(pin.replace(/[\s-]/g, ""))) {
    warn(
      "pensionPin",
      `"${pin}" is not in PenCom's format — PEN then 9 to 12 digits. They will import, but the pension schedule will be refused.`,
    );
  }

  const tin = text("tin");
  if (tin !== "" && !/^\d{10}$/.test(tin.replace(/[\s-]/g, ""))) {
    warn("tin", `"${tin}" is not a 10-digit FIRS number. They will import.`);
  }

  const gender = text("gender");
  if (gender !== "" && !GENDER_WORDS[normalizeKey(gender)]) {
    warn("gender", `We do not recognise "${gender}", so we left it blank.`);
  }

  /* Name plus date of birth, inside the file. Both are needed: a name alone
     matches cousins and a date of birth alone matches strangers. */
  const dob = text("dateOfBirth");
  const firstName = text("firstName");
  const lastName = text("lastName");
  if (firstName !== "" && lastName !== "" && dob !== "") {
    const parsed = parseImportDate(dob);
    if (parsed.ok) {
      const key = `${normalizeKey(firstName + lastName)}|${parsed.value.iso}`;
      const first = seen("nameAndDob", key);
      if (first !== undefined) {
        error(
          "dateOfBirth",
          `${firstName} ${lastName}, born ${parsed.value.iso}, is already on row ${first} of this file. If they are two different people, give them different staff numbers.`,
        );
      }
    }
  }
}

/** The batch-level sentences, from what the rules and the cell checks counted. */
function employeeFileNotes(counts: Readonly<Record<string, number>>): string[] {
  const notes: string[] = [];
  const ambiguousDates = counts["ambiguousDates"] ?? 0;
  const inactiveRows = counts["inactiveRows"] ?? 0;
  const typeDisagreements = counts["typeDisagreements"] ?? 0;

  if (ambiguousDates > 0) {
    notes.push(
      `${ambiguousDates} ${ambiguousDates === 1 ? "date could" : "dates could"} be read two ways — 03/04/2021 is either 3 April or 4 March. We read the day first.`,
    );
  }
  if (inactiveRows > 0) {
    notes.push(
      `${inactiveRows} ${inactiveRows === 1 ? "person is" : "people are"} marked "inactive". We record that as suspended, not as having left — nobody gave a leaving date.`,
    );
  }
  if (typeDisagreements > 0) {
    notes.push(
      `${typeDisagreements} ${typeDisagreements === 1 ? "row has" : "rows have"} employment_type and work_type saying different things. We use employment_type.`,
    );
  }
  return notes;
}

/* --------------------------------------------------------------- dictionary */

/**
 * The employee dictionary, built.
 *
 * `buildDictionary` is the only way to make one, and it is what puts the
 * required columns first — see `Dictionary.columns`. So the template, the
 * dropdowns on the matching step, the browser check and the API's own response
 * all read one ordered list.
 */
export const EMPLOYEES: Dictionary<EmployeeField> = buildDictionary(
  {
    slug: "employees",
    kind: "EMPLOYEES",
    templateFile: {
      basename: "approvehr-employees-template",
      sheetName: "Staff list",
    },
    noun: { one: "person", many: "people" },
    keyLabel: "staff number",
    rowRules: employeeRowRules,
    fileNotes: employeeFileNotes,
    identify: (text) => ({
      key: text("employeeNo") || null,
      name: [text("firstName"), text("lastName")].filter(Boolean).join(" ") || null,
    }),
  },
  COLUMNS,
);

/**
 * The dictionary's own list, in template order, for a screen that needs it.
 *
 * Exported from the built dictionary rather than as the raw declaration, so
 * nothing can render an order the template does not use.
 */
export const EMPLOYEE_COLUMNS = EMPLOYEES.columns;

export const HEADING = EMPLOYEES.heading;
