import { describe, expect, it } from "vitest";
import {
  NAV,
  NOTHING_ANSWERED_YET,
  backTarget,
  navRouteReachable,
  visibleNav,
  type NavFacts,
} from "@/components/portal/nav";
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * UAT 23 Nov, U57 (SELF-12, NC-37, HR-32, CRAWL-8): an employee's and a
 * manager's menus were full of rows that open onto "this is not part of your
 * role", and back links led to pages that refused them.
 */

const EMPLOYEE = new Set<PermissionKey>([
  "VIEW_EQUIPMENT_OWN",
  "REPORT_EQUIPMENT_FAULT",
]);
const LINE_MANAGER = new Set<PermissionKey>(["APPROVE_LEAVE", "MANAGE_HIRING"]);
const HR = new Set<PermissionKey>([
  "EDIT_RECORDS",
  "APPROVE_LEAVE_ALL",
  "VIEW_SALARIES",
]);

const facts = (rows: Partial<NavFacts["rows"]>): NavFacts => ({
  ...NOTHING_ANSWERED_YET,
  assistantWired: true,
  earlyPay: true,
  rows: { ...NOTHING_ANSWERED_YET.rows, ...rows },
});

const EMPLOYEE_FACTS = facts({});
const LEADS = facts({
  "one-on-ones": true,
  approvals: true,
  "agrees-objectives": true,
  exits: true,
});

const labels = (permissions: ReadonlySet<PermissionKey>, f: NavFacts) =>
  visibleNav(NAV, permissions, {}, f).flatMap((group) =>
    group.items.map((item) => item.label),
  );

describe("rows that would only turn the reader away", () => {
  it("are not in an employee's menu", () => {
    const shown = labels(EMPLOYEE, EMPLOYEE_FACTS);
    expect(shown).not.toContain("My approvals");
    expect(shown).not.toContain("Objectives to agree");
    expect(shown).not.toContain("Exit management");
    expect(shown).not.toContain("Shifts");
    /* What is theirs stays. */
    expect(shown).toEqual(
      expect.arrayContaining(["Home", "Leave", "Payslips", "Attendance"]),
    );
  });

  it("are in a manager's, apart from the rota planner they cannot plan", () => {
    const shown = labels(LINE_MANAGER, LEADS);
    expect(shown).toEqual(
      expect.arrayContaining(["My approvals", "Exit management"]),
    );
    expect(shown).not.toContain("Shifts");
    /* A tab of Objectives now, not a row of its own (owner, 24 Nov 2026). */
    expect(shown).not.toContain("Objectives to agree");
  });

  it("are all in HR's, Shifts included", () => {
    expect(labels(HR, LEADS)).toEqual(
      expect.arrayContaining(["My approvals", "Exit management", "Shifts"]),
    );
    expect(labels(HR, LEADS)).not.toContain("Objectives to agree");
  });
});

describe("a back link", () => {
  const employeeNav = visibleNav(NAV, EMPLOYEE, {}, EMPLOYEE_FACTS);
  const hrNav = visibleNav(NAV, HR, {}, LEADS);

  it("goes Home when the parent is a page the reader cannot open", () => {
    expect(
      backTarget({ href: "/payroll", label: "Monthly payroll" }, employeeNav),
    ).toEqual({ href: "/dashboard", label: "Home" });
    expect(
      backTarget({ href: "/people", label: "People" }, employeeNav),
    ).toEqual({ href: "/dashboard", label: "Home" });
  });

  it("is left alone when the reader can open the parent", () => {
    expect(backTarget({ href: "/people", label: "People" }, hrNav)).toEqual({
      href: "/people",
      label: "People",
    });
    expect(
      backTarget({ href: "/people/leave", label: "Leave" }, employeeNav),
    ).toEqual({ href: "/people/leave", label: "Leave" });
  });

  it("is left alone for a page that is not a menu row, or outside the shell", () => {
    expect(navRouteReachable("/people/p-01", employeeNav)).toBe(true);
    expect(navRouteReachable("/payroll", null)).toBe(true);
  });
});
