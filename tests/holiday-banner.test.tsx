import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HolidayBanner } from "@/components/portal/holiday-banner";
import { usePublicHolidays } from "@/lib/store/holidays";
import { useSession } from "@/lib/store/session";
import type { HolidayCalendarState } from "@/lib/store/holidays";

/**
 * The banner side of the holiday reminder — the email is `leave/holiday-
 * reminder.ts`'s job on the API, this is telling somebody already in the
 * app the same thing.
 *
 * `useSession` and `usePublicHolidays` are mocked at the module boundary
 * rather than driven through the real demo store: both are well-typed,
 * independently-owned contracts, and what is actually new here is this
 * component's own filtering (confirmed, today-or-tomorrow) and its
 * per-holiday dismiss key — not the store's hydration timing.
 */

vi.mock("@/lib/store/holidays", () => ({ usePublicHolidays: vi.fn() }));
vi.mock("@/lib/store/session", () => ({ useSession: vi.fn() }));

const mockedHolidays = vi.mocked(usePublicHolidays);
const mockedSession = vi.mocked(useSession);

/** Fixed, so "today"/"tomorrow" do not depend on when the suite runs. */
const TODAY = "2026-08-19";
const TOMORROW = "2026-08-20";

type Holiday = HolidayCalendarState["holidays"][number];

function calendarOf(holidays: Holiday[]): HolidayCalendarState {
  return {
    holidays,
    awaitingProclamation: holidays.filter((h) => !h.confirmed).length,
    year: 2026,
    loading: false,
    error: null,
    source: "demo",
    reload: () => undefined,
  };
}

/** By year, the same shape `usePublicHolidays(year)` is actually called with. */
function stubHolidays(byYear: Record<number, Holiday[]>) {
  mockedHolidays.mockImplementation((year: number) =>
    calendarOf(byYear[year] ?? []),
  );
}

/**
 * jsdom's `localStorage` here has no working `clear`, so it is given a real
 * one — the same gap `install-prompt.test.tsx` found, for the same reason: a
 * fresh backing object per test is what stops one case's dismissal leaking
 * into the next.
 */
function freshStorage() {
  let held: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => held[k] ?? null,
      setItem: (k: string, v: string) => {
        held[k] = v;
      },
      removeItem: (k: string) => {
        delete held[k];
      },
      clear: () => {
        held = {};
      },
    },
  });
}

beforeEach(() => {
  freshStorage();
  /* Demo mode, deliberately: `isConnected: false` is what makes "today" the
     fixed `TODAY` above rather than whatever date the suite happens to run
     on. */
  mockedSession.mockReturnValue({ isConnected: false } as unknown as ReturnType<
    typeof useSession
  >);
  stubHolidays({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("no due holiday", () => {
  it("renders nothing", () => {
    stubHolidays({
      2026: [
        {
          id: "far",
          date: "2026-12-25",
          name: "Christmas Day",
          confirmed: true,
        },
      ],
    });
    render(<HolidayBanner />);
    expect(screen.queryByRole("region", { name: "Public holiday" })).toBeNull();
  });
});

describe("a confirmed holiday due today", () => {
  it("renders, naming it as today", () => {
    stubHolidays({
      2026: [
        { id: "h-today", date: TODAY, name: "Founder's Day", confirmed: true },
      ],
    });
    render(<HolidayBanner />);
    expect(screen.getByText("Founder's Day is today")).toBeInTheDocument();
  });
});

describe("a confirmed holiday due tomorrow", () => {
  it("renders, naming it as tomorrow", () => {
    stubHolidays({
      2026: [
        {
          id: "h-tomorrow",
          date: TOMORROW,
          name: "Founder's Day",
          confirmed: true,
        },
      ],
    });
    render(<HolidayBanner />);
    expect(screen.getByText("Founder's Day is tomorrow")).toBeInTheDocument();
  });

  it("links to the leave calendar", () => {
    stubHolidays({
      2026: [
        {
          id: "h-tomorrow",
          date: TOMORROW,
          name: "Founder's Day",
          confirmed: true,
        },
      ],
    });
    render(<HolidayBanner />);
    expect(
      screen.getByRole("link", { name: "View the leave calendar" }),
    ).toHaveAttribute("href", "/people/leave");
  });
});

describe("an unconfirmed holiday", () => {
  it("does not render, even inside the window", () => {
    stubHolidays({
      2026: [
        {
          id: "h-unconfirmed",
          date: TOMORROW,
          name: "Maybe Day",
          confirmed: false,
        },
      ],
    });
    render(<HolidayBanner />);
    expect(screen.queryByRole("region", { name: "Public holiday" })).toBeNull();
  });
});

describe("dismissing", () => {
  it("closes the banner and remembers this holiday's id", () => {
    stubHolidays({
      2026: [
        {
          id: "h-dismiss",
          date: TOMORROW,
          name: "Founder's Day",
          confirmed: true,
        },
      ],
    });
    render(<HolidayBanner />);
    expect(screen.getByText("Founder's Day is tomorrow")).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    });

    expect(screen.queryByText("Founder's Day is tomorrow")).toBeNull();
    expect(
      window.localStorage.getItem(
        "approvehr.holiday-banner.dismissed.h-dismiss",
      ),
    ).toBe("1");
  });

  it("does not suppress a different holiday", () => {
    window.localStorage.setItem(
      "approvehr.holiday-banner.dismissed.h-dismiss",
      "1",
    );
    stubHolidays({
      2026: [
        { id: "h-other", date: TOMORROW, name: "Other Day", confirmed: true },
      ],
    });
    render(<HolidayBanner />);
    expect(screen.getByText("Other Day is tomorrow")).toBeInTheDocument();
  });

  it("stays closed on remount, for the same id", () => {
    window.localStorage.setItem(
      "approvehr.holiday-banner.dismissed.h-dismiss",
      "1",
    );
    stubHolidays({
      2026: [
        {
          id: "h-dismiss",
          date: TOMORROW,
          name: "Founder's Day",
          confirmed: true,
        },
      ],
    });
    render(<HolidayBanner />);
    expect(screen.queryByRole("region", { name: "Public holiday" })).toBeNull();
  });
});
