import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NAV, NOTHING_ANSWERED_YET, visibleNav } from "@/components/portal/nav";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/permission-keys";
import { book, hire, useBook } from "./hired-helpers";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * Where the Hired list is found: in the sidebar for whoever hires, and on a job's own
 * page as a line with the way to the list, narrowed to that job.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: false,
    isLoading: false,
    user: null,
    organization: undefined,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const { JobHires } = await import("@/components/hiring/hired/job-hires");

const hiring = (
  permissions: ReadonlySet<PermissionKey>,
  features: Record<string, boolean> = {},
) =>
  visibleNav(NAV, permissions, features, NOTHING_ANSWERED_YET)
    .flatMap((group) => group.items)
    .filter((item) => item.href.startsWith("/hiring"))
    .map((item) => item.label);

describe("the sidebar row", () => {
  it("is there for whoever manages hiring, next to Offers", () => {
    const labels = hiring(new Set<PermissionKey>(["MANAGE_HIRING"]));
    expect(labels).toContain("Hired");
    expect(labels.indexOf("Hired")).toBe(labels.indexOf("Offers") + 1);
  });

  it("is not there for somebody who may only approve hiring, or for nobody in particular", () => {
    expect(hiring(new Set<PermissionKey>(["APPROVE_HIRING"]))).not.toContain(
      "Hired",
    );
    expect(hiring(new Set<PermissionKey>([]))).not.toContain("Hired");
  });

  it("goes with the module: a company that has switched hiring off has no such row", () => {
    expect(
      hiring(new Set<PermissionKey>(PERMISSION_KEYS), { hiring: false }),
    ).toEqual([]);
  });

  it("opens the list itself", () => {
    const item = visibleNav(
      NAV,
      new Set<PermissionKey>(["MANAGE_HIRING"]),
      {},
      NOTHING_ANSWERED_YET,
    )
      .flatMap((group) => group.items)
      .find((entry) => entry.label === "Hired");
    expect(item?.href).toBe("/hiring/hired");
  });
});

describe("a job's hires", () => {
  beforeEach(() => {
    useBook(book());
  });

  it("says how many of the job's places are taken, how many are employees, and links to the list for that job", async () => {
    renderInToasts(<JobHires requisitionId="job-b" headcount={2} />);
    expect(await screen.findByText("2 of 2 hired")).toBeInTheDocument();
    expect(screen.getByText("1 is already an employee.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open the Hired list for this job" }),
    ).toHaveAttribute("href", "/hiring/hired?job=job-b");
  });

  it("counts only people who still hold a place: somebody who did not join is on the list but is not a hire", async () => {
    renderInToasts(<JobHires requisitionId="job-c" headcount={3} />);
    expect(
      await screen.findByText("Nobody has accepted an offer for this job yet"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Open the Hired list/ }),
    ).toBeInTheDocument();
  });

  it("says nobody, with no link, when there is nobody", async () => {
    useBook(book({ hires: [hire("x", { jobId: "job-a" })] }));
    const { container } = renderInToasts(
      <JobHires requisitionId="job-b" headcount={2} />,
    );
    expect(
      await screen.findByText("Nobody has accepted an offer for this job yet"),
    ).toBeInTheDocument();
    expect(within(container).queryByRole("link")).not.toBeInTheDocument();
  });
});
