import { describe, expect, it } from "vitest";
import {
  leadsWorkOf,
  peopleILead,
  type LeadReach,
} from "@/app/(app)/performance/goal-facts";
import {
  directoryPersonOf,
  type DirectoryPerson,
  type Employee,
} from "@/lib/types";
import {
  isFullEmployeeRow,
  toDirectoryPerson,
  type ApiEmployee,
  type ApiEmployeeLookup,
} from "@/lib/api/endpoints";

/**
 * "Who may this person give a KPI to" — asked of the row any signed-in person
 * can read, not the full directory row that only HR is sent.
 *
 * A department head holds no `EDIT_RECORDS`, so `GET /employees` answers them
 * with lookup rows. The old dialogs read the full rows and therefore showed a
 * head "Nobody is in this department yet" for a department with people in it.
 * These pin the rule (a mirror of the API's `leadsWorkOf`: direct reports, and
 * the departments you head — not their children — and everybody for
 * `EDIT_RECORDS`) and the mapping that feeds it.
 */

const person = (
  over: Partial<DirectoryPerson> & { id: string },
): DirectoryPerson => ({
  fullName: `Person ${over.id}`,
  jobTitle: "Analyst",
  department: null,
  departmentId: null,
  managerId: null,
  ...over,
});

const head: LeadReach = {
  employeeId: "me",
  leadsEveryone: false,
  headedDepartmentIds: new Set(["d-eng"]),
  headedDepartmentNames: new Set(["Engineering"]),
};

const people = [
  person({
    id: "report",
    managerId: "me",
    department: "Finance",
    departmentId: "d-fin",
  }),
  person({ id: "dept-mate", department: "Engineering", departmentId: "d-eng" }),
  person({ id: "other-dept", department: "Finance", departmentId: "d-fin" }),
  person({ id: "stranger" }),
  person({ id: "me", department: "Engineering", departmentId: "d-eng" }),
];

const ids = (list: DirectoryPerson[]) => list.map((one) => one.id);

describe("peopleILead", () => {
  it("offers a department head their direct reports and their department, and not another department", () => {
    expect(ids(peopleILead(people, head))).toEqual([
      "report",
      "dept-mate",
      "me",
    ]);
  });

  it("offers a line manager with no department only their direct reports", () => {
    const manager: LeadReach = {
      ...head,
      headedDepartmentIds: new Set(),
      headedDepartmentNames: new Set(),
    };
    expect(ids(peopleILead(people, manager))).toEqual(["report", "me"]);
  });

  it("offers HR everybody", () => {
    expect(peopleILead(people, { ...head, leadsEveryone: true })).toHaveLength(
      people.length,
    );
  });

  it("offers somebody who leads nobody only themselves", () => {
    const plain: LeadReach = {
      employeeId: "stranger",
      leadsEveryone: false,
      headedDepartmentIds: new Set(),
      headedDepartmentNames: new Set(),
    };
    expect(ids(peopleILead(people, plain))).toEqual(["stranger"]);
  });

  it("offers nobody to somebody with no employee record", () => {
    expect(peopleILead(people, { ...head, employeeId: null })).toEqual([]);
  });

  it("does not treat the departments beneath one you head as yours", () => {
    const child = person({
      id: "child",
      department: "Platform",
      departmentId: "d-platform",
    });
    expect(leadsWorkOf(child, head)).toBe(false);
  });
});

describe("a row that does not say where somebody sits", () => {
  /* `undefined` is "this source does not say", which is not "no department":
     the demo store names a department and has no id, and an API from before the
     lookup row carried ids sends neither id. */
  const nameOnly = (department: string | null): DirectoryPerson => ({
    id: "n",
    fullName: "Name Only",
    jobTitle: "Analyst",
    department,
  });

  it("falls back to the department's name when there is no id", () => {
    expect(leadsWorkOf(nameOnly("Engineering"), head)).toBe(true);
    expect(leadsWorkOf(nameOnly("Finance"), head)).toBe(false);
    expect(leadsWorkOf(nameOnly(null), head)).toBe(false);
  });

  it("does not guess a manager that was not sent", () => {
    expect(leadsWorkOf(nameOnly("Finance"), head)).toBe(false);
  });

  it("trusts the id over the name when both are there", () => {
    const renamed = person({
      id: "r",
      department: "Engineering",
      departmentId: "d-fin",
    });
    expect(leadsWorkOf(renamed, head)).toBe(false);
  });
});

describe("the lookup row, mapped without inventing anything", () => {
  const lookup: ApiEmployeeLookup = {
    id: "e1",
    fullName: "Mary Ann Smith",
    jobTitle: "Lead",
    department: "Engineering",
    departmentId: "d-eng",
    managerId: "boss",
  };

  it("keeps the API's own full name rather than splitting it", () => {
    expect(toDirectoryPerson(lookup)).toEqual({
      id: "e1",
      fullName: "Mary Ann Smith",
      jobTitle: "Lead",
      department: "Engineering",
      departmentId: "d-eng",
      managerId: "boss",
    });
  });

  it("keeps null as null, and leaves out what an older API did not send", () => {
    const none = toDirectoryPerson({
      ...lookup,
      departmentId: null,
      managerId: null,
    });
    expect(none.departmentId).toBeNull();
    expect(none.managerId).toBeNull();

    const old: ApiEmployeeLookup = { ...lookup };
    delete old.departmentId;
    delete old.managerId;
    const legacy = toDirectoryPerson(old);
    expect(legacy).not.toHaveProperty("departmentId");
    expect(legacy).not.toHaveProperty("managerId");
  });

  it("carries no pay, even when the API sent it for a VIEW_SALARIES caller", () => {
    expect(
      toDirectoryPerson({ ...lookup, grossMonthlyKobo: 5_000_000 }),
    ).not.toHaveProperty("grossMonthlyKobo");
  });

  it("tells a lookup row from a full row by the status only the full row has", () => {
    expect(isFullEmployeeRow(lookup)).toBe(false);
    expect(
      isFullEmployeeRow({
        ...lookup,
        status: "ACTIVE",
      } as unknown as ApiEmployee),
    ).toBe(true);
  });

  it("projects a full row down to the same shape", () => {
    const full = {
      ...lookup,
      status: "ACTIVE",
      employeeNo: "E-1",
      email: "m@example.test",
    } as unknown as ApiEmployee;
    expect(toDirectoryPerson(full)).toEqual(toDirectoryPerson(lookup));
  });

  it("projects the demo store's employee, whose department is a name and may be a dash", () => {
    const demo = {
      id: "d1",
      firstName: "Ada",
      lastName: "Lovelace",
      jobTitle: "Engineer",
      department: "Engineering",
      managerId: "boss",
    } as unknown as Employee;
    expect(directoryPersonOf(demo)).toEqual({
      id: "d1",
      fullName: "Ada Lovelace",
      jobTitle: "Engineer",
      department: "Engineering",
      managerId: "boss",
    });
    expect(
      directoryPersonOf({ ...demo, department: "—" }).department,
    ).toBeNull();
  });
});
