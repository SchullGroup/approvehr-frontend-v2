import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiApplication, ApiPosting } from "@/lib/api/careers";

/**
 * Two things that used to be answered by "the newest hundred applications" and
 * so stopped being true the day a company had more.
 *
 * A candidate's own page looked its person up in that list, so the hundred-and-
 * first applicant had a record the screen could not find. A role's screening
 * queue kept the applications of its adverts out of that same hundred, so a busy
 * role next door could empty it. Both now ask the API for exactly what they need:
 * the record by id (and, for a candidate or pipeline id, by the email it
 * resolves to), and the queue one advert at a time behind a single cursor.
 */

vi.mock("@/lib/api/client", async (original) => {
  const real = await original<typeof import("@/lib/api/client")>();
  return { ...real, tokens: { ...real.tokens, has: () => true } };
});

const careers = {
  getApplication: vi.fn(),
  listApplications: vi.fn(),
  listPostings: vi.fn(),
  analytics: vi.fn(),
  advance: vi.fn(),
  decline: vi.fn(),
};
vi.mock("@/lib/api/careers", async (original) => {
  const real = await original<typeof import("@/lib/api/careers")>();
  return {
    ...real,
    careersApi: {
      ...real.careersApi,
      getApplication: (...a: unknown[]) => careers.getApplication(...a),
      listApplications: (...a: unknown[]) => careers.listApplications(...a),
      listPostings: (...a: unknown[]) => careers.listPostings(...a),
      analytics: (...a: unknown[]) => careers.analytics(...a),
      advance: (...a: unknown[]) => careers.advance(...a),
      decline: (...a: unknown[]) => careers.decline(...a),
    },
  };
});

const recruitment = { getCandidate: vi.fn(), getApplication: vi.fn() };
vi.mock("@/lib/api/recruitment", async (original) => {
  const real = await original<typeof import("@/lib/api/recruitment")>();
  return {
    ...real,
    recruitmentApi: {
      ...real.recruitmentApi,
      getCandidate: (...a: unknown[]) => recruitment.getCandidate(...a),
      getApplication: (...a: unknown[]) => recruitment.getApplication(...a),
    },
  };
});

vi.mock("@/lib/store/grades", () => ({
  useGrades: () => ({ rows: [], connected: true, loading: false, error: null }),
}));

const { resolveCareersApplication, useApplicantRecord, useRoleQueue } =
  await import("@/lib/store/hiring");

const notFound = () => new ApiError(404, "not_found", "Not found.");
const notAnId = () => new ApiError(400, "validation", "Not a valid id.");

const row = (id: string, over: Partial<ApiApplication> = {}) =>
  ({
    id,
    postingId: "post-A",
    postingTitle: "Payroll Analyst",
    firstName: "Chioma",
    lastName: "Aduba",
    name: "Chioma Aduba",
    email: "chioma@example.com",
    phone: null,
    coverNote: null,
    source: null,
    status: "RECEIVED",
    screenedAt: null,
    declineReason: null,
    candidateId: null,
    cv: null,
    appliedAt: "2026-10-01T09:00:00.000Z",
    ...over,
  }) as ApiApplication;

const detail = (id: string, over: Partial<ApiApplication> = {}) => ({
  ...row(id, over),
  otherApplications: [],
});

const page = (data: ApiApplication[], nextCursor: string | null = null) => ({
  data,
  meta: {
    total: data.length,
    nextCursor,
    page: 1,
    pageSize: 50,
    totalPages: 1,
    hasMore: nextCursor !== null,
  },
});

beforeEach(() => {
  for (const fn of [...Object.values(careers), ...Object.values(recruitment)]) {
    fn.mockReset();
  }
});

describe("finding the careers application behind an id in a candidate's URL", () => {
  it("is one request when the id is the application's own", async () => {
    careers.getApplication.mockResolvedValue(detail("app-1"));

    const found = await resolveCareersApplication("app-1");

    expect(found?.detail.id).toBe("app-1");
    expect(found?.matchedBy).toBe("id");
    expect(careers.getApplication).toHaveBeenCalledTimes(1);
    expect(careers.listApplications).not.toHaveBeenCalled();
    expect(recruitment.getCandidate).not.toHaveBeenCalled();
  });

  it("resolves a candidate id through the candidate's email, never by scanning a list", async () => {
    careers.getApplication.mockImplementation(async (id: string) => {
      if (id === "cand-1") throw notFound();
      return detail(id, { candidateId: "cand-1" });
    });
    recruitment.getCandidate.mockResolvedValue({
      id: "cand-1",
      email: "Chioma@Example.com",
    });
    /* The hundred-and-first applicant: the server finds her by email because the
       question is "who has this address", not "is she in the first page". */
    careers.listApplications.mockResolvedValue(
      page([
        row("app-other", {
          email: "chioma@example.com.ng",
          candidateId: "cand-9",
        }),
        row("app-101", { candidateId: "cand-1" }),
      ]),
    );

    const found = await resolveCareersApplication("cand-1");

    expect(careers.listApplications).toHaveBeenCalledTimes(1);
    expect(careers.listApplications.mock.calls[0]?.[0]).toMatchObject({
      q: "Chioma@Example.com",
    });
    expect(found?.detail.id).toBe("app-101");
    expect(found?.matchedBy).toBe("id");
  });

  it("falls back to the address alone, and says that is what it matched on", async () => {
    careers.getApplication.mockImplementation(async (id: string) => {
      if (id === "cand-1") throw notFound();
      return detail(id);
    });
    recruitment.getCandidate.mockResolvedValue({
      id: "cand-1",
      email: "chioma@example.com",
    });
    careers.listApplications.mockResolvedValue(
      page([row("app-5", { candidateId: null })]),
    );

    const found = await resolveCareersApplication("cand-1");

    expect(found?.detail.id).toBe("app-5");
    expect(found?.matchedBy).toBe("email");
  });

  it("resolves a pipeline application id from the board the same way", async () => {
    careers.getApplication.mockImplementation(async (id: string) => {
      if (id === "pipe-1") throw notAnId();
      return detail(id, { candidateId: "cand-1" });
    });
    recruitment.getCandidate.mockRejectedValue(notFound());
    recruitment.getApplication.mockResolvedValue({
      candidate: { id: "cand-1", email: "chioma@example.com" },
    });
    careers.listApplications.mockResolvedValue(
      page([row("app-7", { candidateId: "cand-1" })]),
    );

    const found = await resolveCareersApplication("pipe-1");

    expect(found?.detail.id).toBe("app-7");
  });

  it("is nobody when the id is none of the three", async () => {
    careers.getApplication.mockRejectedValue(notFound());
    recruitment.getCandidate.mockRejectedValue(notFound());
    recruitment.getApplication.mockRejectedValue(notFound());

    expect(await resolveCareersApplication("nope")).toBeNull();
    expect(careers.listApplications).not.toHaveBeenCalled();
  });

  it("is nobody when the address matches no application", async () => {
    careers.getApplication.mockRejectedValue(notFound());
    recruitment.getCandidate.mockResolvedValue({
      id: "cand-1",
      email: "x@example.com",
    });
    careers.listApplications.mockResolvedValue(page([]));

    expect(await resolveCareersApplication("cand-1")).toBeNull();
  });

  it("does not mistake a fault for 'not that kind of id'", async () => {
    careers.getApplication.mockRejectedValue(
      new ApiError(500, "internal", "Boom."),
    );

    await expect(resolveCareersApplication("app-1")).rejects.toMatchObject({
      status: 500,
    });
    expect(recruitment.getCandidate).not.toHaveBeenCalled();
  });
});

describe("a candidate's page", () => {
  it("shows the record without a list in sight, and screens somebody in then refreshes it in place", async () => {
    careers.getApplication.mockResolvedValue(detail("app-1"));
    careers.advance.mockResolvedValue({
      note: "In Screening.",
      candidateId: "cand-1",
      id: "app-1",
    });

    const { result } = renderHook(() => useApplicantRecord("app-1"));
    await waitFor(() =>
      expect(result.current.record?.applicationId).toBe("app-1"),
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.editable).toBe(true);
    expect(careers.listApplications).not.toHaveBeenCalled();

    careers.getApplication.mockResolvedValue(
      detail("app-1", { status: "ADVANCED", candidateId: "cand-1" }),
    );
    await act(async () => {
      await result.current.screenIn({});
    });
    expect(careers.advance).toHaveBeenCalledWith("app-1", {});
    /* The record is replaced, not blanked, and not left saying "Waiting". */
    await waitFor(() => expect(result.current.record?.status).toBe("ADVANCED"));
    expect(result.current.loading).toBe(false);
  });

  it("reports a miss as no record, and a fault as an error", async () => {
    careers.getApplication.mockRejectedValue(notFound());
    recruitment.getCandidate.mockRejectedValue(notFound());
    recruitment.getApplication.mockRejectedValue(notFound());
    const miss = renderHook(() => useApplicantRecord("nobody"));
    await waitFor(() => expect(miss.result.current.loading).toBe(false));
    expect(miss.result.current.record).toBeNull();
    expect(miss.result.current.error).toBeNull();

    careers.getApplication.mockRejectedValue(
      new ApiError(500, "internal", "Boom."),
    );
    const fault = renderHook(() => useApplicantRecord("whoever"));
    await waitFor(() => expect(fault.result.current.error).not.toBeNull());
    expect(fault.result.current.record).toBeNull();
  });
});

/* ----------------------------------------------------------------- the role */

const posting = (
  id: string,
  requisitionId: string,
  count: number,
): ApiPosting =>
  ({
    id,
    slug: id,
    title: id,
    requisitionId,
    requisitionReference: requisitionId.toUpperCase(),
    requisitionStatus: "OPEN",
    applicationCount: count,
  }) as unknown as ApiPosting;

const forAdvert = (advert: string, count: number) =>
  Array.from({ length: count }, (_, i) =>
    row(`${advert}-${String(i)}`, { postingId: advert }),
  );

describe("a role's screening queue", () => {
  it("asks for each of the role's adverts in turn, newest first, and never for another role's", async () => {
    careers.listPostings.mockResolvedValue({
      data: [
        posting("A", "req-1", 60),
        posting("B", "req-1", 10),
        posting("C", "req-2", 500),
      ],
      meta: { total: 3 },
    });
    careers.analytics.mockResolvedValue({
      totals: {},
      perPosting: [
        { postingId: "A", waiting: 40 },
        { postingId: "B", waiting: 3 },
        { postingId: "C", waiting: 400 },
      ],
      perSource: [],
      cvNote: null,
    });
    const advertA = forAdvert("A", 60);
    const advertB = forAdvert("B", 10);
    careers.listApplications.mockImplementation(
      async (params: { postingId: string; cursor?: string }) => {
        if (params.postingId === "A") {
          return params.cursor
            ? page(advertA.slice(50), null)
            : page(advertA.slice(0, 50), "A-cursor");
        }
        return page(advertB, null);
      },
    );

    const { result } = renderHook(() => useRoleQueue("req-1"));
    await waitFor(() => expect(result.current.rows).toHaveLength(50));

    /* The counts are the server's, not the length of what is on screen. */
    expect(result.current.total).toBe(70);
    await waitFor(() => expect(result.current.waiting).toBe(43));
    expect(result.current.hasMore).toBe(true);

    /* The rest of A is ten, and B is ten: the second page is filled from both
       rather than stopping at the end of A with a button under it. */
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(70));
    expect(result.current.hasMore).toBe(false);
    expect(
      careers.listApplications.mock.calls.slice(-2).map((call) => call[0]),
    ).toMatchObject([
      { postingId: "A", cursor: "A-cursor", pageSize: 50 },
      { postingId: "B", pageSize: 40 },
    ]);

    const asked = new Set(
      careers.listApplications.mock.calls.map(
        (call) => (call[0] as { postingId: string }).postingId,
      ),
    );
    expect(asked).toEqual(new Set(["A", "B"]));
    expect(new Set(result.current.rows.map((row) => row.id)).size).toBe(70);
  });

  it("fills the first page from the next advert when the first has only a few", async () => {
    careers.listPostings.mockResolvedValue({
      data: [posting("campus", "req-1", 12), posting("main", "req-1", 251)],
      meta: { total: 2 },
    });
    careers.analytics.mockResolvedValue({
      totals: {},
      perPosting: [],
      perSource: [],
      cvNote: null,
    });
    const campus = forAdvert("campus", 12);
    const main = forAdvert("main", 251);
    careers.listApplications.mockImplementation(
      async (params: {
        postingId: string;
        pageSize: number;
        cursor?: string;
      }) => {
        if (params.postingId === "campus") return page(campus, null);
        const from = params.cursor ? Number.parseInt(params.cursor, 10) : 0;
        const end = from + params.pageSize;
        return page(
          main.slice(from, end),
          end < main.length ? String(end) : null,
        );
      },
    );

    const { result } = renderHook(() => useRoleQueue("req-1"));
    /* Fifty, not twelve: the dozen from the small advert and thirty-eight from
       the big one. */
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    expect(result.current.hasMore).toBe(true);
    expect(result.current.total).toBe(263);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(100));
    expect(new Set(result.current.rows.map((row) => row.id)).size).toBe(100);
  });

  it("moves straight past an advert nobody applied to, instead of offering a button that loads nothing", async () => {
    careers.listPostings.mockResolvedValue({
      data: [posting("A", "req-1", 0), posting("B", "req-1", 3)],
      meta: { total: 2 },
    });
    careers.analytics.mockResolvedValue({
      totals: {},
      perPosting: [],
      perSource: [],
      cvNote: null,
    });
    careers.listApplications.mockImplementation(
      async (params: { postingId: string }) =>
        params.postingId === "A" ? page([]) : page(forAdvert("B", 3)),
    );

    const { result } = renderHook(() => useRoleQueue("req-1"));
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.hasMore).toBe(false);
  });

  it("is empty, without a request, for a role with no advert", async () => {
    careers.listPostings.mockResolvedValue({
      data: [posting("C", "req-2", 5)],
      meta: { total: 1 },
    });
    careers.analytics.mockResolvedValue({
      totals: {},
      perPosting: [],
      perSource: [],
      cvNote: null,
    });

    const { result } = renderHook(() => useRoleQueue("req-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([]);
    expect(result.current.adverts).toEqual([]);
    expect(careers.listApplications).not.toHaveBeenCalled();
  });
});
