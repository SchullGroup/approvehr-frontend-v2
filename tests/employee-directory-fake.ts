import type {
  ApiEmployee,
  ApiEmployeeLookup,
  EmployeeListParams,
} from "@/lib/api/endpoints";

/**
 * `GET /employees`, as the API answers it, for tests of anything that searches
 * the directory.
 *
 * Shaped from `approvehr-api` `modules/employees/service.ts`, not from a guess,
 * because the two things a type-ahead depends on are easy to get wrong in a
 * fake:
 *
 * - **`q` is matched field by field.** First name, last name, email, employee
 *   number and job title are each tested alone (`whereFor`), so a full name
 *   typed with its space matches **nobody**. A fake that matched the joined name
 *   would let a picker that sends "Ada Obi" through pass here and fail in
 *   production.
 * - **The default order is first name**, with the id as tiebreak, and the page is
 *   cut after the count. That is what put colleague 201 out of reach of a
 *   `pageSize: 200` picker.
 *
 * A lookup row has no first or last name of its own, so the fake splits
 * `fullName` at the first space, as the API's two columns would hold it.
 */

export type Person = {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  department?: string | null;
};

const lookup = (person: Person): ApiEmployeeLookup => ({
  id: person.id,
  fullName: `${person.firstName} ${person.lastName}`,
  jobTitle: person.jobTitle ?? "Analyst",
  department:
    person.department === undefined ? "Operations" : person.department,
  departmentId: "d-ops",
  managerId: "boss",
});

/** What a caller with `EDIT_RECORDS` is sent: the same person, and a status. */
const full = (person: Person): ApiEmployee =>
  ({
    ...lookup(person),
    employeeNo: `E-${person.id}`,
    firstName: person.firstName,
    lastName: person.lastName,
    middleName: null,
    email: `${person.id}@example.test`,
    phone: null,
    dateOfBirth: null,
    gender: null,
    managerName: null,
    workLocationId: null,
    workLocation: null,
    employmentType: "FULL_TIME",
    status: "ACTIVE",
    startDate: "2025-01-01",
    endDate: null,
    salaryGradeId: null,
    salaryGrade: null,
    payeManualOverride: false,
    canLogin: false,
    grossMonthlyKobo: null,
    bankName: null,
    bankAccount: null,
    addressLine: null,
    nin: null,
    stateOfOrigin: null,
    lgaOfOrigin: null,
    religion: null,
    pensionPin: null,
    pensionProvider: null,
    taxState: "Lagos",
    tin: null,
    nhfNumber: null,
    annualRentKobo: null,
    rentDeclaredAt: null,
    nextOfKin: null,
    avatarUrl: null,
    archived: false,
    missingForPayroll: [],
    access: { state: "NONE", expiresAt: null, roles: [] },
  }) as unknown as ApiEmployee;

/** The API's `PageMeta`. */
const meta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
  hasMore: page * pageSize < total,
});

/**
 * A fake `employees.list` over a fixed company. Calls are recorded in `calls`,
 * so a test can say what was asked and not only what came back.
 */
export function fakeDirectory(
  people: readonly Person[],
  { as = "lookup" }: { as?: "lookup" | "full" } = {},
) {
  const calls: EmployeeListParams[] = [];
  const list = async (params: EmployeeListParams = {}) => {
    calls.push(params);
    const needle = params.q?.toLowerCase();
    const matched = needle
      ? people.filter((person) =>
          [
            person.firstName,
            person.lastName,
            `${person.id}@example.test`,
            `E-${person.id}`,
            person.jobTitle ?? "Analyst",
          ].some((field) => field.toLowerCase().includes(needle)),
        )
      : people;
    const sorted = [...matched].sort(
      (a, b) =>
        a.firstName.localeCompare(b.firstName) || a.id.localeCompare(b.id),
    );
    const pageSize = Math.min(params.pageSize ?? 25, 200);
    const page = params.page ?? 1;
    const rows = sorted.slice((page - 1) * pageSize, page * pageSize);
    return {
      data: rows.map(as === "full" ? full : lookup),
      meta: meta(page, pageSize, sorted.length),
    };
  };
  return { list, calls };
}

/** A company of `count` people, first-named so that the order is the index. */
export function company(count: number, special: Record<number, Person> = {}) {
  return Array.from({ length: count }, (_, index): Person => {
    const pad = String(index).padStart(3, "0");
    return (
      special[index] ?? {
        id: `p${pad}`,
        firstName: `Staff${pad}`,
        lastName: `Member${pad}`,
      }
    );
  });
}

/** Resolves later, by hand: for the race between two searches. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
