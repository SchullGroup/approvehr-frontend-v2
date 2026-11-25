import { describe, expect, it } from "vitest";
import {
  defaultDueDate,
  presetDates,
  presetName,
} from "@/lib/performance/period-presets";

describe("period presets", () => {
  it("fills in the standard dates", () => {
    expect(presetDates("Q4", 2026)).toEqual({
      start: "2026-10-01",
      end: "2026-12-31",
    });
    expect(presetDates("H1", 2026)).toEqual({
      start: "2026-01-01",
      end: "2026-06-30",
    });
    expect(presetDates("FY", 2027)).toEqual({
      start: "2027-01-01",
      end: "2027-12-31",
    });
  });

  it("names them the way people say them", () => {
    expect(presetName("Q4", 2026)).toBe("Q4 2026 appraisal");
    expect(presetName("FY", 2026)).toBe("2026 appraisal");
  });

  it("is due two weeks after the period ends, or two weeks from today when it already has", () => {
    expect(defaultDueDate("2026-12-31", "2026-11-23")).toBe("2027-01-14");
    expect(defaultDueDate("2026-06-30", "2026-11-23")).toBe("2026-12-07");
  });
});
