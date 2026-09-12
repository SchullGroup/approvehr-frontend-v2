import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The dashboard greeting picks "Good morning" / "Good afternoon" /
 * "Good evening" off an hour — and that hour has to be the **company's**,
 * not whoever happens to be looking at the screen.
 *
 * The machine this suite runs on defaults to `Africa/Lagos`, so a test that
 * only exercised the default zone would pass just as well against the old
 * `new Date().getHours()` — that call reads the *system's* local clock, and
 * the system happens to agree with Lagos. Mocking `useOrgTimezone` to a
 * different zone and choosing an instant the two zones disagree about is
 * what makes this a real assertion about which clock is read.
 */
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ displayName: "Amara Nwachukwu" }),
  useOrgTimezone: () => "Pacific/Auckland",
}));

/* PageHeader (inside DashboardHeader) reads the app router directly. */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard",
}));

const { DashboardHeader } = await import("@/app/(app)/dashboard/header");

describe("DashboardHeader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("greets by the company's hour, not the reader's machine clock", () => {
    /* 05:00 UTC is 06:00 in Lagos (this machine's own zone) — "Good
       morning" — and already 17:00 in Auckland, the mocked company zone —
       "Good evening". A greeting keyed off the local machine clock would
       say morning here; the company's zone says evening. */
    vi.setSystemTime(new Date("2026-09-12T05:00:00Z"));

    render(<DashboardHeader />);

    expect(screen.getByText("Good evening, Amara")).toBeInTheDocument();
  });
});
