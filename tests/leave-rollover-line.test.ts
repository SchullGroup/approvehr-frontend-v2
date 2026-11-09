import { describe, expect, it } from "vitest";
import type { RolloverStatus } from "@/lib/api/leave";
import { carryOverLine } from "@/lib/leave-rollover";

const TZ = "Africa/Lagos";

const status = (over: Partial<RolloverStatus> = {}): RolloverStatus => ({
  year: 2026,
  carryingTypes: 1,
  ranThisYear: null,
  ...over,
});

const ran = (
  over: Partial<NonNullable<RolloverStatus["ranThisYear"]>> = {},
): NonNullable<RolloverStatus["ranThisYear"]> => ({
  ranAt: "2026-01-03T04:00:00.000Z",
  employeesProcessed: 12,
  daysCarried: 41,
  baseline: false,
  note: null,
  ...over,
});

describe("what the leave settings say about carry-over", () => {
  it("says nothing when no leave type carries days over", () => {
    expect(carryOverLine(status({ carryingTypes: 0 }), TZ)).toBeNull();
    /* Even a recorded run is not worth a line under a setting nobody uses. */
    expect(
      carryOverLine(status({ carryingTypes: 0, ranThisYear: ran() }), TZ),
    ).toBeNull();
  });

  it("says it has not been applied yet, which is not 'carried nothing'", () => {
    const line = carryOverLine(status(), TZ) ?? "";
    expect(line).toMatch(/has not been applied yet/);
    expect(line).not.toMatch(/carried/);
    expect(line).not.toMatch(/\b0\b/);
  });

  it("explains the first run carrying nothing, and does not call it a failure", () => {
    const line =
      carryOverLine(status({ ranThisYear: ran({ baseline: true }) }), TZ) ?? "";
    expect(line).toMatch(/nothing was carried/);
    expect(line).toMatch(/first year recorded/);
    expect(line).not.toMatch(/was applied on/);
  });

  it("reports a real run with its own figures and date in the company's zone", () => {
    const line = carryOverLine(status({ ranThisYear: ran() }), TZ) ?? "";
    expect(line).toMatch(/was applied on/);
    expect(line).toContain("41 days carried");
    expect(line).toContain("12 people checked");
    expect(line).toContain("3 January 2026");
  });

  it("states the consequence of changing the maximum after a run", () => {
    const line = carryOverLine(status({ ranThisYear: ran() }), TZ) ?? "";
    expect(line).toMatch(
      /Changing the maximum now does not change what was already carried/,
    );
  });

  it("agrees in number for one day and one person", () => {
    const line =
      carryOverLine(
        status({ ranThisYear: ran({ daysCarried: 1, employeesProcessed: 1 }) }),
        TZ,
      ) ?? "";
    expect(line).toContain("1 day carried");
    expect(line).toContain("1 person checked");
  });

  it("carries a zero honestly when the run really carried zero", () => {
    const line =
      carryOverLine(status({ ranThisYear: ran({ daysCarried: 0 }) }), TZ) ?? "";
    expect(line).toContain("0 days carried");
  });

  it("keeps the API's own note when a run did nothing", () => {
    const line =
      carryOverLine(
        status({
          ranThisYear: ran({
            employeesProcessed: 0,
            daysCarried: 0,
            note: "No leave type allows carry-over.",
          }),
        }),
        TZ,
      ) ?? "";
    expect(line).toContain("No leave type allows carry-over.");
  });

  it("reads the date in the company's zone, not the browser's", () => {
    /* 23:30 UTC on the 2nd is already the 3rd in Lagos (UTC+1). */
    const line =
      carryOverLine(
        status({ ranThisYear: ran({ ranAt: "2026-01-02T23:30:00.000Z" }) }),
        TZ,
      ) ?? "";
    expect(line).toContain("3 January 2026");
    expect(line).not.toContain("2 January");
  });
});
