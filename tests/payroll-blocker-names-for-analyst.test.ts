/**
 * U29 (PAY-4), web part: the payroll analyst was told "1 thing still stops
 * this run" and never shown who. The run's blocker rows were built from the
 * directory's full rows, which a reader without Edit records is not sent, so
 * the row was dropped. The lookup rows everyone is sent name the person.
 */
import { describe, expect, it } from "vitest";
import { blockerPerson } from "@/app/(app)/payroll/runs/new/blocker-person";
import type { DirectoryPerson, Employee } from "@/lib/types";

const lookup: DirectoryPerson = {
  id: "e-owner",
  fullName: "Amara Nwachukwu",
  jobTitle: "Managing Director",
  department: "Leadership",
};

describe("who a blocker is about", () => {
  it("is named from the lookup rows when the reader has no full rows", () => {
    expect(blockerPerson("e-owner", [], [lookup])).toEqual({
      name: "Amara Nwachukwu",
      department: "Leadership",
      salaryGradeId: null,
    });
  });

  it("prefers the full row, which carries the grade", () => {
    const full = {
      id: "e-owner",
      firstName: "Amara",
      lastName: "Nwachukwu",
      department: "Leadership",
      salaryGradeId: "g-1",
    } as unknown as Employee;
    expect(blockerPerson("e-owner", [full], [lookup])?.salaryGradeId).toBe(
      "g-1",
    );
  });

  it("is null only when nobody has the person", () => {
    expect(blockerPerson("e-x", [], [lookup])).toBeNull();
  });
});
