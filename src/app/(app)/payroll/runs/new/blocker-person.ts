import { fullName, type DirectoryPerson, type Employee } from "@/lib/types";

/**
 * The name and department to show beside a run's blocker (U29).
 *
 * The full row where this reader is sent one, and the lookup row where not.
 * A payroll analyst without Edit records is sent lookup rows only, and reading
 * only the full rows dropped the blocker from the page while the footer still
 * counted it: "1 thing still stops this run", and nothing named. Null only
 * when neither list has the person.
 */
export function blockerPerson(
  id: string,
  employees: readonly Employee[],
  people: readonly DirectoryPerson[],
): {
  name: string;
  department: string;
  salaryGradeId: string | null;
} | null {
  const person = employees.find((e) => e.id === id);
  if (person) {
    return {
      name: fullName(person),
      department: person.department,
      salaryGradeId: person.salaryGradeId ?? null,
    };
  }
  const lookup = people.find((p) => p.id === id);
  return lookup
    ? {
        name: lookup.fullName,
        department: lookup.department ?? "",
        salaryGradeId: null,
      }
    : null;
}
