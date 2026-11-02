// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { holidayImportSurface } from "@/app/(app)/settings/leave/holidays/import/surface";

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useOrgTimezone: () => "Africa/Lagos",
}));

/**
 * Which year the holiday import opens on.
 *
 * The year a sheet of DD/MM dates lands in is chosen on the screen, and it
 * starts on the company's current year unless a link asked for another one.
 * "Current" is the company's own day: at 23:30 UTC on 31 December Lagos is
 * already in the next year, and the browser's clock is not.
 */
function YearPicker({ requested }: { requested?: number }) {
  const context = holidayImportSurface(requested).useImportContext?.();
  return context?.control ?? null;
}

describe("the year the holiday import opens on", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("is the company's current year, not the browser's", () => {
    render(<YearPicker />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
      "2027",
    );
  });

  it("is the year a link asked for when it asked for one", () => {
    render(<YearPicker requested={2025} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
      "2025",
    );
  });

  it("offers last year and the next few from the company's year, and the requested one too", () => {
    render(<YearPicker requested={2040} />);
    const offered = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(offered).toEqual([
      "2026",
      "2027",
      "2028",
      "2029",
      "2030",
      "2031",
      "2040",
    ]);
  });
});
