import { StrictMode } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiToday } from "@/lib/api/me";

/**
 * What the Today panel's client asks the API, and what the store makes of the
 * answer.
 *
 * `request` is faked at its edge, so these hold the translation: the query the
 * API reads, the verbs, and the three rules of the store that a screen cannot
 * check for itself: a section merges over what is held and nothing else,
 * a notice read moves the count by one and only once, and an API without the
 * route is silence rather than an error.
 */

const request = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ connected: true }));
const focus = vi.hoisted(() => ({ generation: 0 }));

vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  request,
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: session.connected }),
}));
vi.mock("@/lib/revalidate", () => ({
  useRevalidation: () => focus.generation,
}));

const {
  calendarDaysBetween,
  meApi,
  sectionData,
  sectionFailed,
  todayEndpointMissing,
} = await import("@/lib/api/me");
const { announcementsApi } = await import("@/lib/api/announcements");
const { engagementApi, sharePercent, trackingIsOff, weeklyActiveAbsent } =
  await import("@/lib/api/engagement");
const { useMeToday } = await import("@/lib/store/me-today");

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  session.connected = true;
  focus.generation = 0;
});

/* ------------------------------------------------------------------- calls */

describe("the calls", () => {
  it("asks for every section by sending no list at all", async () => {
    request.mockResolvedValue({ asOf: "x", sections: {} });
    await meApi.today();
    expect(request).toHaveBeenCalledWith("/me/today", {});
  });

  it("asks for named sections as the comma-separated list the API reads", async () => {
    request.mockResolvedValue({ asOf: "x", sections: {} });
    await meApi.today(["clockIn", "announcements"]);
    expect(request).toHaveBeenCalledWith("/me/today", {
      query: { sections: "clockIn,announcements" },
    });
  });

  it("does not turn an empty list into 'none', which the API would refuse", async () => {
    request.mockResolvedValue({ asOf: "x", sections: {} });
    await meApi.today([]);
    expect(request).toHaveBeenCalledWith("/me/today", {});
  });

  it("posts the app-open event with no body and no query", async () => {
    request.mockResolvedValue(undefined);
    await meApi.appOpen();
    expect(request).toHaveBeenCalledWith("/me/app-open", { method: "POST" });
  });

  it("marks a notice read by POST to that notice and nothing else", async () => {
    request.mockResolvedValue({
      id: "n1",
      read: true,
      readAt: "2026-10-21T09:00:00.000Z",
      alreadyRead: false,
    });
    await announcementsApi.markRead("n1");
    expect(request).toHaveBeenCalledWith("/announcements/n1/read", {
      method: "POST",
    });
  });

  it("asks for the week by one date, and for the current week by none", async () => {
    request.mockResolvedValue({});
    await engagementApi.weeklyActive("2026-10-12");
    expect(request).toHaveBeenLastCalledWith("/engagement/weekly-active", {
      query: { week: "2026-10-12" },
    });
    await engagementApi.weeklyActive();
    expect(request).toHaveBeenLastCalledWith("/engagement/weekly-active", {});
  });
});

/* ---------------------------------------------------------------- helpers */

describe("reading a section", () => {
  it("gives the data of one that answered, and null for everything else", () => {
    expect(sectionData({ status: "ok", data: { total: 0 } })).toEqual({
      total: 0,
    });
    expect(
      sectionData({ status: "unavailable", reason: "feature_off" }),
    ).toBeNull();
    expect(
      sectionData({
        status: "error",
        code: "section_failed",
        message: "m",
      }),
    ).toBeNull();
    expect(sectionData(undefined)).toBeNull();
  });

  it("tells a failed section from one that does not apply", () => {
    expect(
      sectionFailed({ status: "error", code: "section_timeout", message: "m" }),
    ).toBe(true);
    expect(sectionFailed({ status: "unavailable", reason: "policy_off" })).toBe(
      false,
    );
    expect(sectionFailed(undefined)).toBe(false);
  });

  it("treats only a 404 as an API that does not have the route", () => {
    expect(
      todayEndpointMissing(new ApiError(404, "not_found", "Not found.")),
    ).toBe(true);
    expect(todayEndpointMissing(new ApiError(500, "internal", "No."))).toBe(
      false,
    );
    expect(todayEndpointMissing(new ApiError(0, "network_error", "No."))).toBe(
      false,
    );
  });
});

describe("calendar days between two company dates", () => {
  it("counts on the calendar, across months and years", () => {
    expect(calendarDaysBetween("2026-10-21", "2026-10-21")).toBe(0);
    expect(calendarDaysBetween("2026-10-21", "2026-10-22")).toBe(1);
    expect(calendarDaysBetween("2026-10-31", "2026-11-01")).toBe(1);
    expect(calendarDaysBetween("2026-12-31", "2027-01-02")).toBe(2);
    expect(calendarDaysBetween("2026-10-22", "2026-10-21")).toBe(-1);
  });

  it("is not thrown by a daylight-saving change", () => {
    /* Whole UTC days, so the clock change in the US does not make a 23-hour day. */
    expect(calendarDaysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(calendarDaysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("is null, not zero, for something that is not a date", () => {
    expect(calendarDaysBetween("soon", "2026-10-21")).toBeNull();
    expect(calendarDaysBetween("2026-10-21", "")).toBeNull();
  });
});

describe("the weekly figure", () => {
  it("never rounds a share up across the bar it was held against", () => {
    expect(sharePercent(0.7996)).toBe("79.9%");
    expect(sharePercent(0.8)).toBe("80.0%");
    expect(sharePercent(0.79)).toBe("79.0%");
    expect(sharePercent(1)).toBe("100.0%");
    expect(sharePercent(0)).toBe("0.0%");
  });

  it("is not thrown by floating point on a fraction that is exact", () => {
    /* 0.29 * 100 is 28.999999999999996, which is how a flooring version says 28. */
    expect(sharePercent(0.29)).toBe("29.0%");
    expect(sharePercent(0.5714)).toBe("57.1%");
  });

  it("knows tracking is off from the API's own reason, and from nothing else", () => {
    const off = new ApiError(422, "unprocessable", "Switched off.", {
      reason: "module_off",
      module: "app_open_tracking",
    });
    expect(trackingIsOff(off)).toBe(true);
    /* A different 422, such as a week that has not started, is a real answer. */
    expect(
      trackingIsOff(
        new ApiError(422, "unprocessable", "That week has not started."),
      ),
    ).toBe(false);
    expect(trackingIsOff(new ApiError(500, "internal", "No."))).toBe(false);
    expect(trackingIsOff(new Error("module_off"))).toBe(false);
  });

  it("draws nothing for off, forbidden and missing, and something for a real failure", () => {
    expect(
      weeklyActiveAbsent(
        new ApiError(422, "unprocessable", "Off.", { reason: "module_off" }),
      ),
    ).toBe(true);
    expect(weeklyActiveAbsent(new ApiError(403, "forbidden", "No."))).toBe(
      true,
    );
    expect(weeklyActiveAbsent(new ApiError(404, "not_found", "No."))).toBe(
      true,
    );
    expect(weeklyActiveAbsent(new ApiError(500, "internal", "No."))).toBe(
      false,
    );
    expect(weeklyActiveAbsent(new ApiError(0, "network_error", "No."))).toBe(
      false,
    );
    expect(weeklyActiveAbsent(null)).toBe(false);
  });
});

/* ------------------------------------------------------------------- store */

const notice = (id: string, read = false) => ({
  id,
  title: id,
  body: id,
  pinned: false,
  publishedAt: "2026-10-19T09:00:00.000Z",
  postedByName: null,
  departmentNames: [],
  read,
  readAt: read ? "2026-10-20T09:00:00.000Z" : null,
});

const held = (): ApiToday => ({
  asOf: "2026-10-21T09:00:00.000Z",
  sections: {
    announcements: {
      status: "ok",
      data: { notices: [notice("a"), notice("b")], unread: 5, total: 6 },
    },
    leave: {
      status: "ok",
      data: { year: 2026, balances: [] },
    },
  },
});

describe("the store", () => {
  it("reads the whole panel once connected, behind loading", async () => {
    request.mockResolvedValue(held());
    const { result } = renderHook(() => useMeToday());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.sections.announcements?.status).toBe("ok");
    expect(request).toHaveBeenCalledWith("/me/today", {});
  });

  it("asks nothing, and is not loading, when nobody is connected", () => {
    session.connected = false;
    const { result } = renderHook(() => useMeToday());
    expect(request).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      data: null,
      loading: false,
      error: null,
    });
  });

  it("keeps the failure itself, so the card can choose its advice from the class", async () => {
    const failure = new ApiError(500, "internal", "Something went wrong.");
    request.mockRejectedValue(failure);
    const { result } = renderHook(() => useMeToday());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(failure);
    expect(result.current.data).toBeNull();
  });

  it("answers an API without the route with no data and no error", async () => {
    request.mockRejectedValue(new ApiError(404, "not_found", "Not found."));
    const { result } = renderHook(() => useMeToday());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it("merges a refreshed section over what is held and leaves the rest alone", async () => {
    request.mockResolvedValueOnce(held());
    const { result } = renderHook(() => useMeToday());
    await waitFor(() => expect(result.current.loading).toBe(false));

    request.mockResolvedValueOnce({
      asOf: "2026-10-21T09:05:00.000Z",
      sections: {
        announcements: {
          status: "ok",
          data: { notices: [notice("b")], unread: 4, total: 6 },
        },
      },
    });
    let landed = false;
    await act(async () => {
      landed = await result.current.refresh(["announcements"]);
    });
    expect(landed).toBe(true);
    expect(request).toHaveBeenLastCalledWith("/me/today", {
      query: { sections: "announcements" },
    });
    const sections = result.current.data?.sections;
    expect(
      sections?.announcements?.status === "ok" &&
        sections.announcements.data.unread,
    ).toBe(4);
    /* The section that was not asked for is exactly what it was. */
    expect(sections?.leave?.status).toBe("ok");
    expect(result.current.data?.asOf).toBe("2026-10-21T09:05:00.000Z");
  });

  it("says a refresh did not land, and leaves what is on screen alone", async () => {
    request.mockResolvedValueOnce(held());
    const { result } = renderHook(() => useMeToday());
    await waitFor(() => expect(result.current.loading).toBe(false));

    request.mockRejectedValueOnce(new ApiError(500, "internal", "No."));
    let landed = true;
    await act(async () => {
      landed = await result.current.refresh(["announcements"]);
    });
    expect(landed).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data?.sections.announcements?.status).toBe("ok");
  });

  it("moves a notice to read and takes one off the count, once", async () => {
    request.mockResolvedValueOnce(held());
    const { result } = renderHook(() => useMeToday());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.markNoticeRead("a", "2026-10-21T09:10:00.000Z"));
    const read = () => {
      const section = result.current.data?.sections.announcements;
      return section?.status === "ok" ? section.data : null;
    };
    expect(read()?.unread).toBe(4);
    expect(read()?.notices.find((n) => n.id === "a")).toMatchObject({
      read: true,
      readAt: "2026-10-21T09:10:00.000Z",
    });
    expect(read()?.notices.find((n) => n.id === "b")?.read).toBe(false);

    /* A second tap on the same notice is not a second off the count. */
    act(() => result.current.markNoticeRead("a", "2026-10-21T09:11:00.000Z"));
    expect(read()?.unread).toBe(4);
    /* Nor is a notice that is not here. */
    act(() => result.current.markNoticeRead("zzz", "2026-10-21T09:12:00.000Z"));
    expect(read()?.unread).toBe(4);
  });

  it("never takes the unread count below zero", async () => {
    request.mockResolvedValueOnce({
      asOf: "x",
      sections: {
        announcements: {
          status: "ok",
          data: { notices: [notice("a")], unread: 0, total: 1 },
        },
      },
    });
    const { result } = renderHook(() => useMeToday());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.markNoticeRead("a", "2026-10-21T09:10:00.000Z"));
    const section = result.current.data?.sections.announcements;
    expect(section?.status === "ok" && section.data.unread).toBe(0);
  });
});

/* ----------------------------------------------------------- the polling floor */

describe("how often the whole panel is read", () => {
  /** A monotonic clock the test moves by hand. */
  function clockAt(ms: number) {
    vi.spyOn(performance, "now").mockReturnValue(ms);
  }

  it("does not read again when somebody comes back to the window inside a minute", async () => {
    request.mockResolvedValue(held());
    clockAt(1_000);
    const { result, rerender } = renderHook(() => useMeToday());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(request).toHaveBeenCalledTimes(1);

    focus.generation = 1;
    clockAt(1_000 + 59_000);
    rerender();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reads again on a return once the minute has passed, without a skeleton over what is shown", async () => {
    request.mockResolvedValue(held());
    clockAt(1_000);
    const { result, rerender } = renderHook(() => useMeToday());
    await waitFor(() => expect(result.current.loading).toBe(false));

    focus.generation = 1;
    clockAt(1_000 + 60_000);
    rerender();
    expect(request).toHaveBeenCalledTimes(2);
    /* The answer on screen stays until the new one lands. */
    expect(result.current.loading).toBe(false);
    expect(result.current.data).not.toBeNull();
  });

  it("always reads on an explicit reload, however recent the last read", async () => {
    request.mockResolvedValue(held());
    clockAt(1_000);
    const { result } = renderHook(() => useMeToday());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.reload());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("is one read, and an answer that arrives, in strict mode where every effect runs twice", async () => {
    request.mockResolvedValue(held());
    const { result } = renderHook(() => useMeToday(), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.sections.announcements?.status).toBe("ok");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not let an older answer overwrite a newer one", async () => {
    let answerFirst: (value: ApiToday) => void = () => undefined;
    request.mockReturnValueOnce(
      new Promise<ApiToday>((resolve) => {
        answerFirst = resolve;
      }),
    );
    const { result } = renderHook(() => useMeToday());
    expect(result.current.loading).toBe(true);

    /* Reload while the first read is still out: the second is the newest. */
    request.mockResolvedValueOnce({
      asOf: "second",
      sections: {},
    });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data?.asOf).toBe("second"));

    await act(async () => {
      answerFirst({ asOf: "first", sections: {} });
    });
    expect(result.current.data?.asOf).toBe("second");
  });
});
