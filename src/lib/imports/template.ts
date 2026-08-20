/**
 * The column dictionary, mirrored.
 *
 * The API owns this list — `src/modules/imports/schemas.ts`, `EMPLOYEE_COLUMNS`
 * — and when the API answers, **its copy wins**: `GET /imports/template/employees`
 * is what the screen renders and what pre-selects the column matches. This file
 * is the same data compiled in, for the one case where that call cannot be made.
 *
 * ## Why a copy exists at all
 *
 * Choosing a file and matching its columns is pure client-side work — reading a
 * CSV and lining its headings up against a list. It would be perverse for those
 * two steps to require a database, and this prototype is demonstrated on laptops
 * with no API running (see HANDOVER.md). So the first two steps of the import
 * work offline, and the two that genuinely need the database — checking against
 * the staff you already have, and writing — say so and stop.
 *
 * ## The drift, named
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
 * Rows per request, as the API caps it.
 *
 * Not the number we actually send: `express.json` is capped at 100kb, which
 * bites around 250 rows of a fully populated file, so the client chunks well
 * below this. See `CHUNK_ROWS` in `lib/store/imports.ts`.
 */
export const MAX_ROWS_PER_BATCH = 500;

export type ColumnSpec = {
  field: EmployeeField;
  /** The heading the template prints, and the name we send the API. */
  column: string;
  /** Other headings that mean the same thing, in priority order. */
  aliases: readonly string[];
  required: boolean;
  example: string;
  /** What has to be in it, in one line. */
  note: string;
};

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
  | "nhfNumber"
  | "nextOfKinName"
  | "nextOfKinRelationship"
  | "nextOfKinPhone";

export const EMPLOYEE_COLUMNS: readonly ColumnSpec[] = [
  {
    field: "employeeNo",
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
    required: true,
    example: "EMP-1000",
    note: "Your own staff number. This is what we match on, so a second import of the same number updates that person instead of creating a duplicate.",
  },
  {
    field: "firstName",
    column: "first_name",
    aliases: ["given_name", "first"],
    required: true,
    example: "Ngozi",
    note: "Required.",
  },
  {
    field: "lastName",
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
    column: "email",
    aliases: ["email_address", "work_email", "company_email", "official_email"],
    required: false,
    example: "ngozi.williams@company.com",
    note: "Their work address. We check the shape and flag anything that cannot be an email.",
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
    column: "date_of_birth",
    aliases: ["dob", "birth_date", "birthday"],
    required: false,
    example: "14/03/1991",
    note: "DD/MM/YYYY or YYYY-MM-DD. Both are accepted and neither is guessed at.",
  },
  {
    field: "gender",
    column: "gender",
    aliases: ["sex"],
    required: false,
    example: "female",
    note: "female, male or other.",
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
    field: "managerEmployeeNo",
    column: "manager_employee_no",
    aliases: ["manager_employee_id", "manager_staff_no", "manager_no"],
    required: false,
    example: "EMP-1004",
    note: "Their manager's staff number. Use this instead of a name when two people share one.",
  },
  {
    field: "workLocation",
    column: "work_location",
    aliases: ["location", "office", "branch", "duty_station"],
    required: false,
    example: "Lagos Office",
    note: "Matched by name against your locations. An unrecognised one is flagged, not invented.",
  },
  {
    field: "legalEntity",
    column: "legal_entity",
    aliases: ["entity", "subsidiary"],
    required: false,
    example: "Schulltech Nigeria Ltd",
    note: "Only if you file PAYE for more than one company.",
  },
  {
    field: "salaryGrade",
    column: "salary_grade",
    aliases: ["grade", "grade_level", "grade_code", "pay_grade", "salary_band"],
    required: false,
    example: "G4",
    note: "Must already exist, by code or name. We also flag pay that falls outside the grade's band.",
  },
  {
    field: "employmentType",
    column: "employment_type",
    aliases: ["contract_type", "staff_category"],
    required: false,
    example: "full_time",
    note: "full_time, part_time, contract, intern or nysc. Permanent counts as full time. Defaults to full time.",
  },
  {
    field: "workType",
    column: "work_type",
    aliases: ["work_schedule"],
    required: false,
    example: "full_time",
    note: "Read as employment type when employment_type is missing. If both are present and disagree, we use employment_type and say so.",
  },
  {
    field: "status",
    column: "employment_status",
    aliases: ["status", "staff_status"],
    required: false,
    example: "active",
    note: "active, on_leave, suspended, onboarding or exited. Defaults to active.",
  },
  {
    field: "startDate",
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
    column: "end_date",
    aliases: ["termination_date", "exit_date", "date_of_exit", "last_working_day"],
    required: false,
    example: "",
    note: "Leave it empty for current staff.",
  },
  {
    field: "grossMonthly",
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
    required: true,
    example: "162,632.00",
    note: "Monthly gross in naira. ₦, commas and spaces are fine. Must be a monthly figure — we will not divide an annual one.",
  },
  {
    field: "payFrequency",
    column: "pay_frequency",
    aliases: ["salary_frequency", "pay_cycle", "frequency"],
    required: false,
    example: "monthly",
    note: "Must say monthly if it is there at all. Anything else stops the row, because an annual figure imported as monthly overpays by twelve times.",
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
  },
  {
    field: "pensionPin",
    column: "pension_pin",
    aliases: ["rsa_pin", "pension_number", "rsa"],
    required: false,
    example: "PEN100234567",
    note: "PEN then 9 to 12 digits. Flagged if it is not, because PenCom will refuse the schedule.",
  },
  {
    field: "pensionProvider",
    column: "pension_provider",
    aliases: ["pfa", "pension_administrator", "pension_fund_administrator"],
    required: false,
    example: "Stanbic IBTC Pension",
    note: "Optional.",
  },
  {
    field: "taxState",
    column: "tax_state",
    aliases: ["paye_state", "state_of_tax_residence", "tax_jurisdiction", "state"],
    required: false,
    example: "Lagos",
    note: "The state their PAYE is filed to — not their state of origin. One of the 36 states or FCT. Falls back to the company's state when empty.",
  },
  {
    field: "tin",
    column: "tin",
    aliases: ["tax_id", "tax_identification_number", "tax_number", "tin_number"],
    required: false,
    example: "1234567890",
    note: "10 digits, FIRS format. Flagged if it is not.",
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
];

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

/** Lowercase, letters and digits only. `Employee ID` and `employee_id` agree. */
export const normalizeKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Normalised heading to field, with the alias's position kept.
 *
 * `priority` is how far down a column's alias list the match was found, and it
 * is what settles a file carrying both `job_title` and `position`: the earlier
 * alias wins the pre-selected match and the other is left unmapped for the
 * person to decide. The API resolves conflicts by the same rule, so what the
 * screen guesses and what the API would have guessed agree.
 */
export const COLUMN_LOOKUP: ReadonlyMap<
  string,
  { field: EmployeeField; priority: number }
> = (() => {
  const map = new Map<string, { field: EmployeeField; priority: number }>();
  for (const spec of EMPLOYEE_COLUMNS) {
    [spec.column, ...spec.aliases].forEach((key, priority) => {
      const normalized = normalizeKey(key);
      if (!map.has(normalized)) map.set(normalized, { field: spec.field, priority });
    });
  }
  return map;
})();

export const SPEC_BY_FIELD: ReadonlyMap<EmployeeField, ColumnSpec> = new Map(
  EMPLOYEE_COLUMNS.map((spec) => [spec.field, spec]),
);

export const REQUIRED_FIELDS: readonly EmployeeField[] = EMPLOYEE_COLUMNS.filter(
  (spec) => spec.required,
).map((spec) => spec.field);

/** The heading we send for a field, for a message that names a column. */
export const HEADING: Readonly<Record<EmployeeField, string>> = Object.fromEntries(
  EMPLOYEE_COLUMNS.map((spec) => [spec.field, spec.column]),
) as Record<EmployeeField, string>;

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
