import type { HiredPerson } from "@/lib/hiring/hired/model";

/** A row off the list, for the tests that act on one person. Not a test file. */
export const person = (
  id: string,
  over: Partial<HiredPerson> = {},
): HiredPerson => ({
  id,
  applicationId: `pa-${id}`,
  reference: "APP-J7ET3745",
  name: `Person ${id}`,
  email: `${id}@example.com`,
  phone: null,
  requisitionId: "req-1",
  role: "Payroll Analyst",
  requisitionReference: "FIN-032",
  department: "Finance",
  source: null,
  acceptedAt: "2026-10-10T09:00:00.000Z",
  startDate: "2026-11-02",
  state: "HIRED",
  employee: null,
  employeeVia: null,
  didNotJoin: null,
  createEmployee: { allowed: true },
  ...over,
});
