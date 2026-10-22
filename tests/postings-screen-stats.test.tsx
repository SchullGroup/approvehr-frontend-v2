import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * The Job adverts list after a write. The row comes from the postings list and
 * the stat cards from the analytics call; the list reloads itself after a
 * publish or a close, so the analytics have to be asked again too or "Live
 * adverts" keeps the old number until a page reload. The API is the only fake.
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
const publishPosting = vi.fn();
const closePosting = vi.fn();

vi.mock("@/lib/api/careers", async (original) => {
  const real = await original<typeof import("@/lib/api/careers")>();
  return {
    ...real,
    careersApi: {
      ...real.careersApi,
      listPostings: (...a: unknown[]) => listPostings(...a),
      analytics: (...a: unknown[]) => analytics(...a),
      publishPosting: (...a: unknown[]) => publishPosting(...a),
      closePosting: (...a: unknown[]) => closePosting(...a),
    },
  };
});

const { PostingsScreen } =
  await import("@/app/(app)/hiring/postings/postings-screen");

const advert = (status: "DRAFT" | "PUBLISHED" | "CLOSED") => ({
  id: "post-1",
  slug: "payroll-analyst",
  title: "Payroll Analyst",
  summary: "Run payroll.",
  location: "Lagos",
  employmentType: "FULL_TIME",
  showSalary: false,
  salaryMinKobo: null,
  salaryMaxKobo: null,
  status,
  publishedAt: status === "DRAFT" ? null : "2026-10-01T09:00:00.000Z",
  closesOn: null,
  acceptingApplications: status === "PUBLISHED",
  requisitionId: null,
  requisitionReference: null,
  requisitionStatus: null,
  applicationCount: 0,
  publicPath: "/acme/payroll-analyst",
  createdAt: "2026-10-01T09:00:00.000Z",
});

const totals = (live: number) => ({
  totals: {
    postings: 1,
    live,
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

const page = (status: "DRAFT" | "PUBLISHED" | "CLOSED") => ({
  data: [advert(status)],
  meta: { total: 1 },
});

const liveStat = () =>
  screen.getByText("Live adverts").closest<HTMLElement>(".rounded-lg")!;

beforeEach(() => {
  for (const fn of [listPostings, analytics, publishPosting, closePosting])
    fn.mockReset();
});

const mount = () =>
  render(
    <ToastProvider>
      <PostingsScreen />
    </ToastProvider>,
  );

describe("the stat cards after a write", () => {
  it("updates Live adverts when an advert is published", async () => {
    listPostings.mockResolvedValueOnce(page("DRAFT"));
    analytics.mockResolvedValueOnce(totals(0));
    mount();
    await waitFor(() =>
      expect(within(liveStat()).getByText("0")).toBeInTheDocument(),
    );

    publishPosting.mockResolvedValue(advert("PUBLISHED"));
    listPostings.mockResolvedValue(page("PUBLISHED"));
    analytics.mockResolvedValue(totals(1));
    await userEvent.click(
      screen.getAllByRole("button", { name: /More actions for/ })[0]!,
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Publish" }),
    );

    await waitFor(() =>
      expect(within(liveStat()).getByText("1")).toBeInTheDocument(),
    );
  });

  it("updates Live adverts when an advert is closed", async () => {
    listPostings.mockResolvedValueOnce(page("PUBLISHED"));
    analytics.mockResolvedValueOnce(totals(1));
    mount();
    await waitFor(() =>
      expect(within(liveStat()).getByText("1")).toBeInTheDocument(),
    );

    closePosting.mockResolvedValue({ waiting: 0 });
    listPostings.mockResolvedValue(page("CLOSED"));
    analytics.mockResolvedValue(totals(0));
    await userEvent.click(
      screen.getAllByRole("button", { name: /More actions for/ })[0]!,
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Close" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Close advert" }),
    );

    await waitFor(() =>
      expect(within(liveStat()).getByText("0")).toBeInTheDocument(),
    );
  });
});
