import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HolidayBanner } from "@/components/portal/holiday-banner";
import { usePublicHolidays } from "@/lib/store/holidays";
import { useOrgTimezone, useSession } from "@/lib/store/session";
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
vi.mock("@/lib/store/session", () => ({
  useSession: vi.fn(),
  useOrgTimezone: vi.fn(),
}));

const mockedHolidays = vi.mocked(usePublicHolidays);
const mockedSession = vi.mocked(useSession);
const mockedTimezone = vi.mocked(useOrgTimezone);

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
  /* Demo mode never reads this (todayIn only runs when isConnected), but the
     component calls the hook unconditionally, so it still needs a value. */
  mockedTimezone.mockReturnValue("Africa/Lagos");
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

describe("the date line under the headline", () => {
  const holiday: Holiday = {
    id: "h-tomorrow",
    date: TOMORROW,
    name: "Founder's Day",
    confirmed: true,
  };

  it("names the weekday and the whole date", () => {
    stubHolidays({ 2026: [holiday] });
    render(<HolidayBanner />);
    expect(
      screen.getByText(/Thursday, 20 August 2026 is a public holiday\./),
    ).toBeInTheDocument();
  });

  /* A holiday is a calendar day, so the company's zone must not touch it.
     `formatDate` reads a bare `2026-08-20` as midnight UTC; formatted in New
     York that is the evening of the 19th, and the banner would announce
     "Wednesday, 19 August" over a Thursday holiday. The zones here are the
     ones either side of UTC that the company settings actually offer. */
  it.each([
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Kolkata",
    "Australia/Sydney",
  ])("does not move to another day for a company in %s", (zone) => {
    mockedTimezone.mockReturnValue(zone);
    stubHolidays({ 2026: [holiday] });
    render(<HolidayBanner />);
    expect(
      screen.getByText(/Thursday, 20 August 2026 is a public holiday\./),
    ).toBeInTheDocument();
  });
});

describe("connected, 'today' is the company's day and not UTC's", () => {
  const onTheTwentieth: Holiday = {
    id: "h-twentieth",
    date: "2026-08-20",
    name: "Founder's Day",
    confirmed: true,
  };

  beforeEach(() => {
    /* Only the clock: React's own scheduling must keep running. */
    vi.useFakeTimers({ toFake: ["Date"] });
    mockedSession.mockReturnValue({
      isConnected: true,
    } as unknown as ReturnType<typeof useSession>);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls it today in Lagos while UTC is still on the 19th", () => {
    /* 23:30 UTC on the 19th is 00:30 on the 20th in Lagos (UTC+1). */
    vi.setSystemTime(new Date("2026-08-19T23:30:00Z"));
    mockedTimezone.mockReturnValue("Africa/Lagos");
    stubHolidays({ 2026: [onTheTwentieth] });
    render(<HolidayBanner />);
    expect(screen.getByText("Founder's Day is today")).toBeInTheDocument();
  });

  it("calls it tomorrow in New York while UTC has already moved on to the 20th", () => {
    /* 02:00 UTC on the 20th is 22:00 on the 19th in New York (UTC-4 in
       August) — a viewer reading the UTC day would be told it is today. */
    vi.setSystemTime(new Date("2026-08-20T02:00:00Z"));
    mockedTimezone.mockReturnValue("America/New_York");
    stubHolidays({ 2026: [onTheTwentieth] });
    render(<HolidayBanner />);
    expect(screen.getByText("Founder's Day is tomorrow")).toBeInTheDocument();
  });
});
