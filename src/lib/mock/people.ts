import type { Employee } from "@/lib/types";

/**
 * The one employee directory. Payroll derives its run list from this rather
 * than keeping its own, so the two can never disagree about headcount.
 *
 * Three records are deliberately incomplete — a missing bank account, a
 * missing pension PIN, a missing TIN. They are what the payroll run blocks on
 * and what the record page nags about, so those paths have something real to
 * catch rather than always showing a clean board.
 *
 * ## The account numbers are fabricated, and they are whole
 *
 * Ten digits, NUBAN-shaped, and invented — they belong to nobody.
 *
 * They used to be stored pre-masked, as `"GTBank ····4471"`, which broke the one
 * control that exists to reveal them: `Guarded` on the record page masks what it
 * is given, so pressing **Show** replaced a mask with a mask and the full number
 * was nowhere in the product. Masking is a presentation decision and belongs in
 * the component that presents; a fixture that arrives already redacted cannot be
 * un-redacted by anything downstream.
 *
 * Each one ends in the four digits the old masked string showed, so anything
 * that quoted a last-four still reads the same.
 */
type SeedRecord = Omit<
  Employee,
  "addressLine" | "nin" | "stateOfOrigin" | "lgaOfOrigin" | "religion"
>;

/**
 * The five fields the record gained, filled in by mapping rather than by hand.
 *
 * Fifty more literals across ten records is fifty more chances for one of them
 * to disagree with the row it sits in. Derived instead, from what the record
 * already says — and deliberately sparse: two of the ten have no NIN and none
 * has an LGA, because "everybody's paperwork is complete" is not what a real
 * directory looks like and the importer's missing-detail list needs something
 * to find.
 */
const ORIGINS: readonly (readonly [string, string])[] = [
  ["Imo", "Ikeduru"],
  ["Lagos", "Ikeja"],
  ["Anambra", "Onitsha North"],
  ["Enugu", "Nsukka"],
  ["Kano", "Nassarawa"],
  ["Rivers", "Obio-Akpor"],
  ["Oyo", "Ibadan North"],
  ["Kaduna", "Zaria"],
  ["Delta", "Warri South"],
  ["FCT", "Abuja Municipal"],
];

function withRecordFields(row: SeedRecord, index: number): Employee {
  const origin = ORIGINS[index % ORIGINS.length]!;
  return {
    ...row,
    addressLine: `${12 + index * 7} Awolowo Road, ${origin[1]}`,
    /* Two without one, so the flagged list has something real in it. */
    nin: index % 5 === 3 ? null : `${22_100_000_000 + index * 137}`,
    stateOfOrigin: origin[0],
    /* Half of them: an LGA is the field people leave until later. */
    lgaOfOrigin: index % 2 === 0 ? origin[1] : null,
    religion: index % 3 === 0 ? "Islam" : "Christianity",
  };
}

const SEED: SeedRecord[] = DEMO_ENABLED ? [
  {
    id: "p-01", employeeNo: "AHR-0142",
    firstName: "Adaeze", lastName: "Okonkwo",
    email: "adaeze.okonkwo@schulltech.com", phone: "+234 803 111 0011",
    dateOfBirth: "1990-04-12", gender: "female",
    jobTitle: "Engineering Manager", department: "Engineering",
    managerId: null, location: "Lagos, NG", employmentType: "full_time",
    startDate: "2022-03-14", status: "active", grossMonthly: 1_850_000,
    bankName: "Guaranty Trust Bank", bankAccount: "0114204471",
    pensionPin: "PEN100482913", pensionProvider: "Stanbic IBTC Pensions",
    taxState: "Lagos", tin: "1029384756", nhfNumber: "NHF0044821",
    nextOfKin: { name: "Ifeoma Okonkwo", relationship: "Sister", phone: "+234 802 445 1120" },
  },
  {
    id: "p-02", employeeNo: "AHR-0088",
    firstName: "Tunde", lastName: "Bakare",
    email: "tunde.bakare@schulltech.com", phone: "+234 806 222 0022",
    dateOfBirth: "1985-09-30", gender: "male",
    jobTitle: "Head of Finance", department: "Finance",
    managerId: null, location: "Lagos, NG", employmentType: "full_time",
    startDate: "2021-07-05", status: "active", grossMonthly: 2_100_000,
    bankName: "Zenith Bank", bankAccount: "1017338820",
    pensionPin: "PEN100338217", pensionProvider: "ARM Pensions",
    taxState: "Lagos", tin: "2938475610", nhfNumber: "NHF0031882",
    nextOfKin: { name: "Bisi Bakare", relationship: "Spouse", phone: "+234 809 331 7742" },
  },
  {
    id: "p-03", employeeNo: "AHR-0417",
    firstName: "Chidi", lastName: "Nwosu",
    email: "chidi.nwosu@schulltech.com", phone: "+234 701 333 0033",
    dateOfBirth: "1992-01-22", gender: "male",
    jobTitle: "Staff Engineer", department: "Engineering",
    managerId: "p-01", location: "Lagos, NG", employmentType: "full_time",
    startDate: "2023-06-12", status: "active", grossMonthly: 1_650_000,
    bankName: "Access Bank", bankAccount: "0691251194",
    pensionPin: "PEN100774520", pensionProvider: "Leadway Pensure",
    taxState: "Lagos", tin: "3847561029", nhfNumber: "NHF0077452",
    nextOfKin: { name: "Ada Nwosu", relationship: "Mother", phone: "+234 703 118 9920" },
  },
  {
    id: "p-04", employeeNo: "AHR-0205",
    firstName: "Ngozi", lastName: "Eze",
    email: "ngozi.eze@schulltech.com", phone: "+234 809 444 0044",
    dateOfBirth: "1989-11-08", gender: "female",
    jobTitle: "Principal Designer", department: "Product",
    managerId: "p-01", location: "Remote, NG", employmentType: "full_time",
    startDate: "2022-09-19", status: "on_leave", grossMonthly: 1_420_000,
    bankName: "United Bank for Africa", bankAccount: "2094476612",
    pensionPin: "PEN100918334", pensionProvider: "Stanbic IBTC Pensions",
    taxState: "Lagos", tin: "4756102938", nhfNumber: "NHF0091833",
    nextOfKin: { name: "Uche Eze", relationship: "Brother", phone: "+234 805 227 4410" },
  },
  {
    id: "p-05", employeeNo: "AHR-0311",
    firstName: "Fatima", lastName: "Bello",
    email: "fatima.bello@schulltech.com", phone: "+234 802 555 0055",
    dateOfBirth: "1993-06-17", gender: "female",
    jobTitle: "Senior People Partner", department: "People",
    managerId: "p-02", location: "Abuja, NG", employmentType: "full_time",
    startDate: "2023-01-09", status: "active", grossMonthly: 980_000,
    bankName: "Stanbic IBTC Bank", bankAccount: "0043912205",
    pensionPin: "PEN100227741", pensionProvider: "ARM Pensions",
    taxState: "Abuja", tin: "5610293847", nhfNumber: "NHF0022774",
    nextOfKin: { name: "Yusuf Bello", relationship: "Spouse", phone: "+234 806 993 2210" },
  },
  {
    id: "p-06", employeeNo: "AHR-0502",
    firstName: "Amara", lastName: "Nwachukwu",
    email: "amara.nwachukwu@schulltech.com", phone: "+234 805 666 0066",
    dateOfBirth: "1994-02-25", gender: "female",
    jobTitle: "Talent Acquisition Lead", department: "People",
    managerId: "p-05", location: "Lagos, NG", employmentType: "full_time",
    startDate: "2024-02-01", status: "active", grossMonthly: 890_000,
    bankName: "Guaranty Trust Bank", bankAccount: "0114629037",
    pensionPin: "PEN100551208", pensionProvider: "Leadway Pensure",
    taxState: "Lagos", tin: "6102938475", nhfNumber: "NHF0055120",
    nextOfKin: { name: "Obi Nwachukwu", relationship: "Father", phone: "+234 807 442 1180" },
  },
  {
    id: "p-07", employeeNo: "AHR-0619",
    firstName: "Musa", lastName: "Ibrahim",
    email: "musa.ibrahim@schulltech.com", phone: "+234 810 777 0077",
    dateOfBirth: "1996-08-03", gender: "male",
    jobTitle: "Finance Associate", department: "Finance",
    managerId: "p-02", location: "Abeokuta, NG", employmentType: "full_time",
    startDate: "2024-08-19", status: "active", grossMonthly: 700_000,
    bankName: "First Bank of Nigeria", bankAccount: "3086513388",
    pensionPin: "PEN100664419", pensionProvider: "Premium Pensions",
    taxState: "Ogun", tin: null, nhfNumber: "NHF0066441",
    nextOfKin: { name: "Aisha Ibrahim", relationship: "Sister", phone: "+234 813 220 7741" },
  },
  {
    id: "p-08", employeeNo: "AHR-0741",
    firstName: "Grace", lastName: "Effiong",
    email: null, phone: "+234 813 888 0088",
    dateOfBirth: "1991-12-14", gender: "female",
    jobTitle: "Payroll Analyst", department: "Finance",
    managerId: "p-02", location: "Lagos, NG", employmentType: "full_time",
    startDate: "2026-08-01", status: "onboarding", grossMonthly: 850_000,
    bankName: null, bankAccount: null,
    pensionPin: "PEN100882205", pensionProvider: "ARM Pensions",
    taxState: "Lagos", tin: "7293847561", nhfNumber: null,
    nextOfKin: null,
  },
  {
    id: "p-09", employeeNo: "AHR-0758",
    firstName: "Emeka", lastName: "Anyanwu",
    email: "emeka.anyanwu@schulltech.com", phone: "+234 818 999 0099",
    dateOfBirth: "1995-05-21", gender: "male",
    jobTitle: "Software Engineer", department: "Engineering",
    managerId: "p-01", location: "Lagos, NG", employmentType: "full_time",
    startDate: "2026-08-04", status: "probation", grossMonthly: 1_300_000,
    bankName: "Kuda Bank", bankAccount: "2005417741",
    pensionPin: null, pensionProvider: null,
    taxState: "Lagos", tin: "8475610293", nhfNumber: null,
    nextOfKin: { name: "Nkem Anyanwu", relationship: "Spouse", phone: "+234 814 667 3320" },
  },
  {
    id: "p-10", employeeNo: "AHR-0388",
    firstName: "Halima", lastName: "Sani",
    email: "halima.sani@schulltech.com", phone: "+234 816 121 0121",
    dateOfBirth: "1990-10-02", gender: "female",
    jobTitle: "Operations Lead", department: "Operations",
    managerId: "p-02", location: "Abeokuta, NG", employmentType: "contract",
    startDate: "2023-04-17", endDate: "2026-08-31", status: "offboarding",
    grossMonthly: 760_000,
    bankName: "Zenith Bank", bankAccount: "1017895520",
    pensionPin: "PEN100443318", pensionProvider: "Premium Pensions",
    taxState: "Ogun", tin: "9384756102", nhfNumber: "NHF0044331",
    nextOfKin: { name: "Sani Abdullahi", relationship: "Father", phone: "+234 818 553 9910" },
  },
] : [];

export const EMPLOYEES: Employee[] = SEED.map(withRecordFields);

export const employeeById = (id: string) => EMPLOYEES.find((e) => e.id === id);

export const directReports = (id: string) =>
  EMPLOYEES.filter((e) => e.managerId === id);

/**
 * The seeded persona a demo session opens as.
 *
 * **`undefined` in a production build**, where `EMPLOYEES` is empty — see
 * `lib/demo.ts`. Every caller is a demo code path that cannot run there, and the
 * type says so rather than a comment: a non-null `Employee` here would have been
 * a lie the compiler helped keep, and `CURRENT_USER.id` would have thrown on the
 * first read.
 */
export const CURRENT_USER: Employee | undefined = EMPLOYEES[5];

/* --------------------------------------------------------------- Balances */

/**
 * A leave balance as any screen displays it. `taken` and `pending` are
 * **derived**, not stored — see `lib/workflows/leave.ts`. They have to be,
 * because approving a request has to move the balance on the employee's record
 * immediately, and a stored number would have to be kept in step by hand.
 */
export type LeaveBalance = {
  employeeId: string;
  type: string;
  entitled: number;
  taken: number;
  pending: number;
};

/**
 * The policy half of a balance: what the company grants, plus the days already
 * used *before* the tracked request window opens. Everything after that comes
 * from the leave requests themselves.
 *
 * `takenBefore` exists so the seed looks like a company mid-year rather than one
 * where nobody has ever taken a day, without the number having to be reconciled
 * against the handful of seed requests.
 */
export type LeaveEntitlement = {
  employeeId: string;
  type: string;
  entitled: number;
  takenBefore: number;
};

export const LEAVE_ENTITLEMENTS: LeaveEntitlement[] = EMPLOYEES.flatMap((e, i) => [
  { employeeId: e.id, type: "Annual", entitled: 20, takenBefore: 4 + (i % 4) },
  { employeeId: e.id, type: "Sick", entitled: 10, takenBefore: i % 3 },
  { employeeId: e.id, type: "Compassionate", entitled: 5, takenBefore: 0 },
]);

export const entitlementsFor = (id: string) =>
  LEAVE_ENTITLEMENTS.filter((b) => b.employeeId === id);

/* -------------------------------------------------------------- Documents */

export type EmployeeDocument = {
  id: string;
  employeeId: string;
  name: string;
  category: "Contract" | "Identification" | "Certificate" | "Letter";
  uploadedAt: string;
  verified: boolean;
};

export const DOCUMENTS: EmployeeDocument[] = EMPLOYEES.flatMap((e) => [
  { id: `${e.id}-d1`, employeeId: e.id, name: "Employment contract.pdf", category: "Contract", uploadedAt: e.startDate, verified: true },
  { id: `${e.id}-d2`, employeeId: e.id, name: "National ID card.pdf", category: "Identification", uploadedAt: e.startDate, verified: e.status !== "onboarding" },
  { id: `${e.id}-d3`, employeeId: e.id, name: "Degree certificate.pdf", category: "Certificate", uploadedAt: e.startDate, verified: e.status !== "onboarding" },
]);

export const documentsFor = (id: string) =>
  DOCUMENTS.filter((d) => d.employeeId === id);
