import { describe, expect, it } from "vitest";
import {
  NO_DEPARTMENT,
  departmentOptions,
  filterProjects,
  resolveDepartment,
} from "@/lib/projects/project-filter";

const projects = [
  {
    name: "Payroll Q4",
    key: "PAY",
    departmentId: "d-fin",
    departmentName: "Finance",
  },
  {
    name: "Mobile app",
    key: "MOB",
    departmentId: "d-eng",
    departmentName: "Engineering",
  },
  { name: "Office move", key: "OFF", departmentId: null, departmentName: null },
  {
    name: "Payments rail",
    key: "RAIL",
    departmentId: "d-fin",
    departmentName: "Finance",
  },
];

describe("searching projects", () => {
  it("matches the name or the key, ignoring case", () => {
    expect(filterProjects(projects, "pay", "").map((p) => p.key)).toEqual([
      "PAY",
      "RAIL",
    ]);
    expect(filterProjects(projects, "mob", "").map((p) => p.key)).toEqual([
      "MOB",
    ]);
    expect(filterProjects(projects, "  OFFICE ", "").map((p) => p.key)).toEqual(
      ["OFF"],
    );
  });

  it("shows everything for an empty search and nothing for a miss", () => {
    expect(filterProjects(projects, "", "")).toHaveLength(4);
    expect(filterProjects(projects, "zzz", "")).toEqual([]);
  });
});

describe("filtering projects by department", () => {
  it("keeps one department's projects", () => {
    expect(filterProjects(projects, "", "d-fin").map((p) => p.key)).toEqual([
      "PAY",
      "RAIL",
    ]);
  });

  it("keeps projects with no department for 'No department'", () => {
    expect(
      filterProjects(projects, "", NO_DEPARTMENT).map((p) => p.key),
    ).toEqual(["OFF"]);
  });

  it("combines with the search", () => {
    expect(filterProjects(projects, "rail", "d-fin").map((p) => p.key)).toEqual(
      ["RAIL"],
    );
    expect(filterProjects(projects, "mob", "d-fin")).toEqual([]);
  });

  it("offers each department once, by name, then No department", () => {
    expect(departmentOptions(projects)).toEqual([
      { value: "d-eng", label: "Engineering" },
      { value: "d-fin", label: "Finance" },
      { value: NO_DEPARTMENT, label: "No department" },
    ]);
  });

  it("offers no 'No department' when every project has one", () => {
    expect(
      departmentOptions(projects.filter((p) => p.departmentId)),
    ).not.toContainEqual(expect.objectContaining({ value: NO_DEPARTMENT }));
  });

  it("reads a link's department ignoring case, and drops one nobody offers", () => {
    const options = departmentOptions(projects);
    expect(resolveDepartment("NONE", options)).toBe(NO_DEPARTMENT);
    expect(resolveDepartment("D-FIN", options)).toBe("d-fin");
    expect(resolveDepartment("d-gone", options)).toBe("");
    expect(resolveDepartment("", options)).toBe("");
  });
});
