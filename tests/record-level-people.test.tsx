import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCompetency } from "@/lib/api/performance";
import { RecordLevelDialog } from "@/app/(app)/performance/rating-dialog";

/**
 * Who a line manager can pick in "Record a level".
 *
 * A caller without `EDIT_RECORDS`, which is every line manager, is sent lookup
 * rows by the directory: a full name and a manager id, and no first or last name.
 * `useEmployeeDirectory` keeps the full rows in `employees` and every row in
 * `people`. The dialog read `employees`, so for exactly the people it is for the
 * Employee picker held only its placeholder, and a manager could not record a
 * level for anybody. Only somebody holding `EDIT_RECORDS` saw a list.
 *
 * The mock hands back `people` and gives `employees` an empty list, which is what
 * the real hook returns for a manager. A dialog that reads `employees` fails every
 * test here.
 */

const PEOPLE = [
  {
    id: "me",
    fullName: "Adaeze Okonkwo",
    jobTitle: "Engineering lead",
    department: "Engineering",
    managerId: "boss",
  },
  {
    id: "e-chidi",
    fullName: "Chidi Nwosu",
    jobTitle: "Engineer",
    department: "Engineering",
    managerId: "me",
  },
  {
    id: "e-emeka",
    fullName: "Emeka Anyanwu",
    jobTitle: "Analyst",
    department: "Engineering",
    managerId: "me",
  },
  {
    id: "e-fatima",
    fullName: "Fatima Bello",
    jobTitle: "Designer",
    department: "Design",
    managerId: "boss",
  },
  {
    id: "boss",
    fullName: "Amara Nwachukwu",
    jobTitle: "Owner",
    department: "Management",
    managerId: null,
  },
];

const COMPETENCY: ApiCompetency = {
  id: "c-punct",
  name: "Punctuality",
  sectionId: "s-core",
  sectionName: "Core competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 0,
};

let canEditRecords: boolean;

vi.mock("@/lib/store/performance", () => ({
  useFramework: () => ({
    competencies: [COMPETENCY],
    groups: [
      {
        sectionId: "s-core",
        sectionName: "Core competency",
        competencies: [COMPETENCY],
      },
    ],
    loading: false,
    error: null,
  }),
  useAppraisals: () => ({ cycles: [], loading: false }),
  useSkills: () => ({
    skills: null,
    loading: false,
    error: null,
    reload: () => {},
  }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  /* What the real hook returns for a caller without `EDIT_RECORDS`: the full
     rows are empty and everybody is in `people`. */
  useEmployeeDirectory: () => ({ employees: [], people: PEOPLE }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ employeeId: "me" }),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => canEditRecords,
}));

const offered = () => {
  render(<RecordLevelDialog open onClose={vi.fn()} onSave={vi.fn()} />);
  const select = screen.getByLabelText(/Employee/);
  return within(select)
    .getAllByRole("option")
    .map((option) => option.textContent)
    .filter((text) => text !== "Pick a person");
};

beforeEach(() => {
  canEditRecords = false;
});

describe("a line manager, who holds no records permission", () => {
  it("is offered the people who report to them, which the full directory never gives them", () => {
    expect(offered()).toEqual([
      "Chidi Nwosu · Engineer",
      "Emeka Anyanwu · Analyst",
    ]);
  });

  it("is not offered themselves, their own manager or somebody else's report", () => {
    const list = offered();
    /* Not vacuous: an empty list would pass the three lines below. */
    expect(list).toHaveLength(2);
    const names = list.join(" | ");
    expect(names).not.toContain("Adaeze Okonkwo");
    expect(names).not.toContain("Amara Nwachukwu");
    expect(names).not.toContain("Fatima Bello");
  });
});

describe("somebody who holds the records permission", () => {
  it("is offered everybody except themselves, by full name", () => {
    canEditRecords = true;
    expect(offered()).toEqual([
      "Chidi Nwosu · Engineer",
      "Emeka Anyanwu · Analyst",
      "Fatima Bello · Designer",
      "Amara Nwachukwu · Owner",
    ]);
  });
});
