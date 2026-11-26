"use client";

import { Field, Picker, type PickerOption } from "@/components/ui";
import { periodLabel } from "@/lib/api/payroll";
import type { PayrollRun } from "@/lib/api/payroll";

/**
 * Which payroll's schedules the table below is showing: a year, then a month
 * of that year (or all of it), then a run when the month has more than one —
 * an off-cycle run sits beside the regular one, and each has its own schedules.
 *
 * Presentational. The table owns the choice, so the picker never fetches and
 * can be read as a plain function of what it is given.
 */
export function RunPicker({
  years,
  year,
  onYear,
  months,
  month,
  onMonth,
  runs,
  runId,
  onRun,
  loading,
}: {
  years: readonly number[];
  year: number | null;
  onYear: (year: number) => void;
  /** Months of `year` that have an approved run, newest first. */
  months: readonly number[];
  month: number | "all";
  onMonth: (month: number | "all") => void;
  /** Approved runs inside the chosen year and month, newest first. */
  runs: readonly PayrollRun[];
  runId: string | null;
  onRun: (runId: string) => void;
  loading: boolean;
}) {
  const yearOptions: PickerOption[] = years.map((value) => ({
    value: String(value),
    label: String(value),
  }));
  const monthOptions: PickerOption[] = [
    { value: "all", label: "All months" },
    ...months.map((value) => ({
      value: String(value),
      label: monthName(value),
    })),
  ];
  const runOptions: PickerOption[] = runs.map((run) => ({
    value: run.id,
    label: run.label
      ? `${periodLabel(run.period)} · ${run.label}`
      : periodLabel(run.period),
  }));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Year">
        <Picker
          aria-label="Year"
          value={year === null ? "" : String(year)}
          onChange={(value) => onYear(Number(value))}
          options={yearOptions}
          placeholder="No approved payroll yet"
          disabled={years.length === 0}
        />
      </Field>
      <Field label="Month">
        <Picker
          aria-label="Month"
          value={month === "all" ? "all" : String(month)}
          onChange={(value) => onMonth(value === "all" ? "all" : Number(value))}
          options={monthOptions}
          disabled={year === null}
        />
      </Field>
      {runs.length > 1 && (
        <Field label="Run">
          <Picker
            aria-label="Payroll run"
            value={runId ?? ""}
            onChange={onRun}
            options={runOptions}
            loading={loading}
          />
        </Field>
      )}
    </div>
  );
}

/** "November", from the month's number. Written once, here. */
export function monthName(month: number): string {
  return new Date(Date.UTC(2026, month - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    timeZone: "UTC",
  });
}
