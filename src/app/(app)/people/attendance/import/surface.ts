import { ATTENDANCE } from "@/lib/imports/attendance";
import type { ImportSurface } from "@/lib/imports/surface";

/**
 * What the import screen says when the thing being imported is a day somebody
 * worked.
 *
 * The only attendance-specific file in this route. The dictionary
 * (`lib/imports/attendance.ts`) is the data contract; this is the copy.
 *
 * `prerequisites` is keyed by the `missing` keys the API returns — `people` and
 * `workLocations` here. Both link somewhere real, and both are things this
 * import will never create: a person because a timesheet row is not a hiring
 * record, and an office because an office carries a geofence that decides
 * whether a clock-in is accepted at all.
 */
export const ATTENDANCE_IMPORT_SURFACE: ImportSurface = {
  dictionary: ATTENDANCE,
  title: "Import attendance",
  breadcrumb: [
    { href: "/people", label: "Employees" },
    { href: "/people/attendance", label: "Attendance" },
  ],
  home: { href: "/people/attendance", label: "See the timesheet" },
  prerequisites: {
    people: {
      title: "Some staff numbers match nobody",
      consequence:
        "will be skipped. If these are your terminal's own user numbers, they have to be mapped to people first: a staff number is the only id this import can match on.",
      action: { href: "/people", label: "Check your staff list" },
    },
    workLocations: {
      title: "Some offices do not exist yet",
      consequence:
        "will be skipped. An office is never created from a spreadsheet, because it carries the geofence that decides whether a clock-in is accepted.",
      action: { href: "/settings/locations", label: "Add the offices" },
    },
  },
  refusalWithoutApi: DEMO_ENABLED
    ? "This is demo mode. The file has been read and checked as far as a browser can, and that is where it stops: payroll prorates a salary against these days, so writing a month of attendance into this browser would put figures behind a payslip that no payroll run will ever see."
    : "",
  linkedStats: [
    {
      key: "corrected",
      label: "Days corrected",
      hint: "already on file, and changed rather than added",
    },
    {
      key: "openShifts",
      label: "Open shifts",
      hint: "added with a clock-in and no clock-out",
    },
  ],
};
