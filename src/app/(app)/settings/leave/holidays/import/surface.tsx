import { useState } from "react";
import { Card, CardBody, Field, Select } from "@/components/ui";
import { HOLIDAYS } from "@/lib/imports/holidays";
import type { ImportSurface } from "@/lib/imports/surface";
import { usePermissions } from "@/lib/permissions";
import { useOrgTimezone } from "@/lib/store/session";
import { todayIn } from "@/lib/time";

/**
 * Whoever may add a holiday by hand may import them: `MANAGE_SETTINGS`, or the
 * import permission. The API asks the same question (`openTo` on its entity).
 */
function useCanImportHolidays(): boolean {
  const { can } = usePermissions();
  return can("MANAGE_SETTINGS") || can("IMPORT_DATA");
}

/** The years offered: last year, then the next few. Plus the default, if outside. */
function yearsAround(now: number, defaultYear: number): number[] {
  const years = new Set<number>([defaultYear]);
  for (let year = now - 1; year <= now + 4; year += 1) years.add(year);
  return [...years].sort((a, b) => a - b);
}

/**
 * The year a sheet of DD/MM dates lands in, picked once for the whole file.
 *
 * Public holidays are the same list every year, so the file carries no year and
 * the same sheet imports into any of them. Sent to the API as `context.year`
 * with both steps; changing it after a check sends the flow back to re-check.
 */
function useHolidayYear(requestedYear: number | undefined) {
  const timeZone = useOrgTimezone();
  /* The company's current year, not the browser's: in the first hours of a
     January the two can be a year apart. */
  const thisYear = Number(todayIn(timeZone).slice(0, 4));
  const defaultYear = requestedYear ?? thisYear;
  const [year, setYear] = useState(String(defaultYear));
  return {
    values: { year },
    control: (
      <Card>
        <CardBody>
          <Field
            label="Year these holidays are for"
            help="Dates in the file are a day and a month, such as 25/12. Each one is added in this year."
          >
            <div className="max-w-40">
              <Select
                value={year}
                onChange={(event) => setYear(event.target.value)}
              >
                {yearsAround(thisYear, defaultYear).map((option) => (
                  <option key={option} value={String(option)}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
        </CardBody>
      </Card>
    ),
  };
}

/**
 * What the import screen says when the rows are a year's public holidays.
 *
 * A function of the year a link asked for, which is the year the holiday calendar
 * was showing when somebody pressed "Import from Excel" (absent when somebody
 * arrived without one). No prerequisites: a holiday names nothing else that has to
 * exist first.
 */
export function holidayImportSurface(
  requestedYear: number | undefined,
): ImportSurface {
  return {
    dictionary: HOLIDAYS,
    title: "Import public holidays",
    breadcrumb: [
      { href: "/settings", label: "Settings" },
      { href: "/settings/leave?tab=holidays", label: "Leave policies" },
    ],
    home: {
      href: "/settings/leave?tab=holidays",
      label: "See the holiday calendar",
    },
    prerequisites: {},
    useAccess: useCanImportHolidays,
    useImportContext: () => useHolidayYear(requestedYear),
    noAccess: {
      title: "Importing holidays is for people who manage company settings",
      description:
        "The holiday calendar decides attendance, overtime and pay for the day, so changing it needs the settings permission. Ask whoever handles access to add it to your role.",
    },
    refusalWithoutApi: DEMO_ENABLED
      ? "This is demo mode. The file has been read and checked as far as a browser can, and that is where it stops: attendance, overtime and payroll all read the holiday calendar, so it is only changed on a live company."
      : "",
  };
}
