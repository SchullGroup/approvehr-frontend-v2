import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * One live state for an advert (UAT 23 Nov, U90 / PERF-10).
 *
 * "Senior Backend Engineer" closed on 20 Nov and the hiring screens still said
 * "Live", beside their own "Live adverts 0": a published advert past its
 * closing date is still `PUBLISHED`. The API now says it once (`liveState`,
 * `liveLabel`), and every screen reads it through `liveOf`. An API that
 * predates it is read the same way from `status` and `acceptingApplications`.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/hiring/postings",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/client", async (original) => {
  const real = await original<typeof import("@/lib/api/client")>();
  return { ...real, tokens: { ...real.tokens, has: () => true } };
});

vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
  useCan: () => true,
}));

const listPostings = vi.fn();
const analytics = vi.fn();

vi.mock("@/lib/api/careers", async (original) => {
  const real = await original<typeof import("@/lib/api/careers")>();
  return {
    ...real,
    careersApi: {
      ...real.careersApi,
      listPostings: (...a: unknown[]) => listPostings(...a),
      analytics: (...a: unknown[]) => analytics(...a),
    },
  };
});

const { liveOf } = await import("@/lib/api/careers");
const { toRoleRow } = await import("@/lib/api/hiring");
const { PostingsScreen } =
  await import("@/app/(app)/hiring/postings/postings-screen");

const advert = (over: Record<string, unknown> = {}) => ({
  id: "post-1",
  slug: "senior-backend-engineer",
  title: "Senior Backend Engineer",
  summary: "Build the API.",
  description: "Builds and runs the API.",
  location: "Lagos",
  employmentType: "FULL_TIME",
  showSalary: false,
  salaryMinKobo: null,
  salaryMaxKobo: null,
  status: "PUBLISHED",
  publishedAt: "2026-10-01T09:00:00.000Z",
  closesOn: "2026-11-20",
  acceptingApplications: false,
  liveState: "CLOSED",
  liveLabel: "Closed on 20 Nov 2026",
  requisitionId: null,
  requisitionReference: null,
  requisitionStatus: null,
  applicationCount: 0,
  publicPath: "/schulltech/senior-backend-engineer",
  createdAt: "2026-10-01T09:00:00.000Z",
  ...over,
});

describe("liveOf", () => {
  it("takes the API's state and words when it sends them", () => {
    expect(
      liveOf({
        status: "PUBLISHED",
        liveState: "CLOSED",
        liveLabel: "Closed on 20 Nov 2026",
      }),
    ).toEqual({ state: "CLOSED", label: "Closed on 20 Nov 2026" });
  });

  it("reads an older API from the status and whether it takes applications", () => {
    expect(
      liveOf({ status: "PUBLISHED", acceptingApplications: true }),
    ).toEqual({ state: "LIVE", label: "Live" });
    expect(
      liveOf({ status: "PUBLISHED", acceptingApplications: false }),
    ).toEqual({ state: "CLOSED", label: "Closed" });
    expect(liveOf({ status: "DRAFT" })).toEqual({
      state: "DRAFT",
      label: "Draft",
    });
    expect(liveOf({ status: "CLOSED" })).toEqual({
      state: "CLOSED",
      label: "Closed",
    });
  });
});

describe("the hiring overview's rows", () => {
  it("say Closed for a published advert past its closing date, and are not live", () => {
    const row = toRoleRow(advert() as never);
    expect(row.statusLabel).toBe("Closed on 20 Nov 2026");
    expect(row.liveState).toBe("CLOSED");
    expect(row.live).toBe(false);
  });
});

describe("the Job adverts list", () => {
  beforeEach(() => {
    listPostings.mockReset();
    analytics.mockReset();
  });

  it("shows the closed advert as closed, never as Live", async () => {
    listPostings.mockResolvedValue({ data: [advert()], meta: { total: 1 } });
    analytics.mockResolvedValue({
      totals: {
        postings: 1,
        live: 0,
        applications: 0,
        waiting: 0,
        advanced: 0,
        declined: 0,
        withdrawn: 0,
        advanceRate: null,
      },
      perPosting: [],
      perSource: [],
      cvNote: null,
    });
    render(
      <ToastProvider>
        <PostingsScreen />
      </ToastProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getAllByText("Closed on 20 Nov 2026").length,
      ).toBeGreaterThan(0),
    );
    const table = screen.getAllByRole("table")[0]!;
    expect(within(table).queryByText("Live")).toBeNull();
  });
});
