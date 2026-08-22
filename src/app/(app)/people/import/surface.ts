import { EMPLOYEES } from "@/lib/imports/employees";
import type { ImportSurface } from "@/lib/imports/surface";

/**
 * What the import screen says when the thing being imported is a person.
 *
 * The only employee-specific file in this route. The dictionary next to it
 * (`lib/imports/employees.ts`) is the data contract; this is the copy — the page
 * title, where the records are once they are in, and where the things a row can
 * refer to get created.
 *
 * `prerequisites` is keyed by the `missing` keys the API returns. Add a key there
 * and the callout appears with the names in it; add it here too and it gets a
 * link to where they are made.
 */
export const EMPLOYEE_IMPORT_SURFACE: ImportSurface = {
  dictionary: EMPLOYEES,
  title: "Import your staff list",
  description:
    "Upload the spreadsheet you already keep. You will see exactly what it will do before anything is saved.",
  breadcrumb: [{ href: "/people", label: "People" }],
  home: { href: "/people", label: "See your people" },
  prerequisites: {
    departments: {
      title: "Some departments do not exist yet",
      consequence: "will be skipped until they exist.",
      action: { href: "/people/departments", label: "Add the departments" },
    },
    salaryGrades: {
      title: "Some salary grades do not exist yet",
      consequence: "will be skipped.",
      action: { href: "/payroll/pay-setup", label: "Add the grades" },
    },
  },
  keyNote:
    "That includes the staff number, where we match on email, or on name and date of birth, instead.",
  demoLimits:
    "who is already on your list, whether those departments exist, or whether the pay fits its grade.",
  demoRefusal:
    "This is demo mode. The file has been read and checked as far as a browser can, and that is where it stops: writing five hundred salaries into this browser would put a staff list in one laptop that no payroll run will ever see.",
  linkedStats: [
    {
      key: "managersLinked",
      label: "Reporting lines set",
      hint: "managers matched by staff number or name",
    },
  ],
};
