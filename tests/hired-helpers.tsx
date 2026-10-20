import type { DemoHire, HiredBook } from "@/lib/hiring/hired/demo-ops";
import { demoHired } from "@/lib/hiring/hired/demo-store";

/**
 * Shared furniture for the Hired list's tests: a small, known book instead of the
 * demo's seed, so a test can say exactly who is on the list and why.
 *
 * Not a test file (no `.test.`): vitest only runs `*.test.*`.
 */

export const hire = (id: string, over: Partial<DemoHire> = {}): DemoHire => ({
  id,
  name: `Person ${id}`,
  email: `${id}@mail.com`,
  phone: "+234 803 000 0000",
  jobId: "job-a",
  source: "careers-page",
  acceptedAt: "2026-08-10T09:00:00.000Z",
  startDate: "2026-09-01",
  grossMonthlyNaira: 500_000,
  employeeId: null,
  employeeVia: null,
  didNotJoin: null,
  ...over,
});

export const book = (over: Partial<HiredBook> = {}): HiredBook => ({
  hires: [
    hire("ada", {
      name: "Ada Okafor",
      email: "ada.okafor@mail.com",
      acceptedAt: "2026-08-12T09:00:00.000Z",
    }),
    hire("bayo", {
      name: "Bayo Adeyemi",
      email: "bayo.adeyemi@mail.com",
      acceptedAt: "2026-08-11T09:00:00.000Z",
    }),
    hire("ngozi", {
      jobId: "job-b",
      name: "Ngozi Eze",
      email: "ngozi.eze@mail.com",
      source: "linkedin",
      acceptedAt: "2026-08-10T09:00:00.000Z",
      startDate: "2026-10-01",
    }),
    hire("kemi", {
      jobId: "job-b",
      name: "Kemi Sani",
      email: "kemi.sani@mail.com",
      acceptedAt: "2026-08-09T09:00:00.000Z",
      employeeId: "emp-1",
      employeeVia: "CREATED",
    }),
    hire("tunde", {
      jobId: "job-c",
      name: "Tunde Bakare",
      email: "tunde.bakare@mail.com",
      acceptedAt: "2026-08-08T09:00:00.000Z",
      didNotJoin: {
        reason: "Took a counter-offer.",
        at: "2026-08-15T09:00:00.000Z",
        by: "You",
      },
    }),
  ],
  employees: [
    {
      id: "emp-1",
      employeeNo: "EMP-0001",
      name: "Kemi Sani",
      email: "kemi.sani@mail.com",
    },
  ],
  jobs: [
    {
      id: "job-a",
      title: "Payroll Analyst",
      reference: "FIN-032",
      department: "Finance",
      employmentType: "FULL_TIME",
      headcount: 2,
      status: "FILLED",
    },
    {
      id: "job-b",
      title: "Product Designer",
      reference: "PRD-009",
      department: "Product",
      employmentType: "FULL_TIME",
      headcount: 2,
      status: "OPEN",
    },
    {
      id: "job-c",
      title: "Operations Associate",
      reference: "OPS-051",
      department: "Operations",
      employmentType: "FULL_TIME",
      headcount: 3,
      status: "OPEN",
    },
  ],
  settings: { onOfferAccepted: "HIRED_LIST_ONLY", coreHr: true },
  ...over,
});

/** Puts a known book in the demo's store, replacing whatever was there. */
export function useBook(next: HiredBook): void {
  window.localStorage?.clear?.();
  demoHired.reset();
  demoHired.commit(next);
}

/** `count` people on one job, for the tests that need more than a page. */
export function crowd(count: number, jobId = "job-b"): DemoHire[] {
  return Array.from({ length: count }, (_, index) =>
    hire(`c${String(index + 1)}`, {
      jobId,
      name: `Crowd ${String(index + 1).padStart(3, "0")}`,
      email: `crowd${String(index + 1)}@mail.com`,
      acceptedAt: new Date(
        Date.parse("2026-08-01T09:00:00.000Z") + index * 3_600_000,
      ).toISOString(),
    }),
  );
}
