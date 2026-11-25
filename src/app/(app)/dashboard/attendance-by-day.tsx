"use client";

import {
  Card,
  CardBody,
  CardHeader,
  ColumnChart,
  Spinner,
} from "@/components/ui";
import { useAttendanceMonth } from "@/lib/store/attendance-history";
import { useOrgTimezone } from "@/lib/store/session";
import { todayIn } from "@/lib/time";

/**
 * Who came in on each of the last working days, as columns.
 *
 * One request for the month (the same one the attendance calendar makes), the last
 * ten working days up to today. A day nothing was recorded for is left out rather
 * than drawn as nobody coming in: an absence of records is not an absence of people.
 */
export function AttendanceByDay() {
  const timeZone = useOrgTimezone();
  const today = todayIn(timeZone);
  const month = useAttendanceMonth(today.slice(0, 7));

  if (month.loading) {
    return (
      <Card as="article" className="h-full">
        <CardHeader title="Attendance by day" level={3} />
        <CardBody>
          <div className="flex items-center gap-2 py-6 text-body-sm text-muted">
            <Spinner size="sm" />
            Working it out
          </div>
        </CardBody>
      </Card>
    );
  }

  const days = month.days
    .filter(
      (day) =>
        day.kind === "WORKING" &&
        day.tracked &&
        !day.future &&
        day.date <= today,
    )
    .slice(-10);
  if (month.error || days.length === 0) return null;

  return (
    <Card as="article" className="h-full">
      <CardHeader title="Attendance by day" level={3} />
      <CardBody>
        <ColumnChart
          shape="pill"
          height={170}
          points={days.map((day) => ({
            label: String(Number(day.date.slice(8, 10))),
            value: day.present,
          }))}
          format={(n) => `${String(n)} in`}
          caption={`People who clocked in on each of the last ${String(days.length)} working days.`}
        />
      </CardBody>
    </Card>
  );
}
