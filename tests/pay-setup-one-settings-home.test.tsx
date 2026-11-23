/**
 * U80 (PAY-26, NC-30): payroll settings lived in two places. /settings/payroll
 * ("Payroll settings", breadcrumbed "Pay setup") and Pay setup's Extras tab
 * rendered the same forms, Extras said "change it here or there", and the two
 * pages shared a name. Pay setup also showed internal component codes
 * (LEAVE_ALLOWANCE, THIRTEENTH_MONTH) under every name.
 *
 * Now there is one home: a Settings tab on Pay setup. /settings/payroll leads
 * there, overtime keeps its own page instead of being repeated, and the codes
 * are not shown.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
vi.mock("next/navigation", () => ({ redirect }));

import {
  PAY_SETUP_TABS,
  paySetupTabFrom,
} from "@/app/(app)/payroll/pay-setup/tabs";

const read = (path: string) => readFileSync(path, "utf8");

describe("one home for payroll settings", () => {
  it("is a Settings tab on Pay setup", () => {
    expect(PAY_SETUP_TABS).toContain("settings");
    expect(PAY_SETUP_TABS).not.toContain("extras");
    const screen = read("src/app/(app)/payroll/pay-setup/pay-setup-screen.tsx");
    expect(screen).toMatch(/settings: \{\s*label: "Settings"/);
  });

  it("still opens an old ?tab=extras link on that tab", () => {
    expect(paySetupTabFrom("extras")).toBe("settings");
    expect(paySetupTabFrom("settings")).toBe("settings");
    expect(paySetupTabFrom("grades")).toBe("grades");
    expect(paySetupTabFrom("nonsense")).toBe("allowances");
    expect(paySetupTabFrom(undefined)).toBe("allowances");
  });

  it("is where Settings › Payroll leads", async () => {
    const page = await import("@/app/(app)/settings/payroll/page");
    expect(() => page.default()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/payroll/pay-setup?tab=settings");
  });

  it("does not repeat the overtime form or say there are two doors", () => {
    const panel = read("src/app/(app)/payroll/pay-setup/extras-panel.tsx");
    expect(panel).not.toContain("<OvertimePolicyFields");
    expect(panel).not.toMatch(/here or there/);
    expect(panel).toContain("<PayrollSettingsForm");
    expect(panel).toContain('href="/settings/overtime"');
  });

  it("does not show internal component codes", () => {
    const panel = read("src/app/(app)/payroll/pay-setup/components-panel.tsx");
    expect(panel).not.toContain("subtitle={row.code}");
    expect(panel).not.toContain("{row.code}</p>");
  });
});
