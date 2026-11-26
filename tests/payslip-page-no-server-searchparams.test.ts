import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The payslip page must not read `searchParams` on the server.
 *
 * It did, to point Back at the payslip's month (25 Nov 2026), and every payslip then answered a bare
 * "Internal Server Error" on the live site: a route whose id nobody can list at build time, made dynamic
 * per request. The month is read in the browser instead (`header.tsx`), behind a Suspense boundary.
 */
describe("the payslip page", () => {
  it("is not made dynamic by reading searchParams on the server", () => {
    const page = readFileSync(
      "src/app/(app)/payroll/payslips/[id]/page.tsx",
      "utf8",
    );
    expect(page).not.toMatch(/searchParams/);
  });

  it("reads ?run= in the browser, for Back", () => {
    const header = readFileSync(
      "src/app/(app)/payroll/payslips/[id]/header.tsx",
      "utf8",
    );
    expect(header).toMatch(/^"use client";/);
    expect(header).toMatch(/useSearchParams\(\)\.get\("run"\)/);
  });
});
