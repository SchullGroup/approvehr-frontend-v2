import { describe, expect, it } from "vitest";
import { validateEmployee } from "@/lib/store/employees";

/**
 * Gross pay takes any figure HR enters: zero and negative included, no ceiling.
 * The product owner's instruction; the API agrees (`employees/schemas.ts`).
 */
describe("gross monthly pay", () => {
  it.each([0, -25_000, 1_000_000_000_000])("accepts %s", (grossMonthly) => {
    const errors = validateEmployee({ grossMonthly });
    expect(errors.filter((e) => e.field === "grossMonthly")).toEqual([]);
  });
});
