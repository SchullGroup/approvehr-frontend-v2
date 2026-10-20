import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "@/components/portal/shell";
import { resetNavHistoryForTests } from "@/lib/nav-history";

/**
 * One way back and one trail, never two saying the same thing.
 *
 * "Back to Monthly payroll" beside "Monthly payroll / Run payroll" was the same
 * sentence twice on every detail screen. The back control stays; the trail is
 * drawn only when it says something the control and the title do not.
 */

const nav = { pathname: "/payroll/runs/new" };
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  resetNavHistoryForTests();
  nav.pathname = "/payroll/runs/new";
});

describe("PageHeader's way back", () => {
  it("names the parent once when the trail is only the parent and this page", () => {
    render(
      <PageHeader
        title="Run payroll"
        breadcrumb={[
          { href: "/payroll", label: "Monthly payroll" },
          { href: "/payroll/runs/new", label: "Run payroll" },
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: /Back to Monthly payroll/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Breadcrumb" }),
    ).not.toBeInTheDocument();
    /* One link to the parent, not that and a second one in a trail. */
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("draws the trail when it names a place between the parent and the page", () => {
    nav.pathname = "/people/p-01/payslips";
    render(
      <PageHeader
        title="Payslip"
        breadcrumb={[
          { href: "/people", label: "Employees" },
          { href: "/people/p-01", label: "Ada Okonkwo" },
          { href: "/people/p-01/payslips", label: "Payslip" },
        ]}
      />,
    );
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(trail).toHaveTextContent("Employees");
    expect(trail).toHaveTextContent("Ada Okonkwo");
    expect(
      screen.getByRole("link", { name: /Back to Ada Okonkwo/ }),
    ).toBeInTheDocument();
  });

  it("draws the trail beside a plain Back once the visit has real history", () => {
    /* A visit that has already been somewhere else in this tab. */
    nav.pathname = "/payroll";
    render(<PageHeader title="Payroll" />).unmount();
    nav.pathname = "/payroll/runs/new";
    render(
      <PageHeader
        title="Run payroll"
        breadcrumb={[
          { href: "/payroll", label: "Monthly payroll" },
          { href: "/payroll/runs/new", label: "Run payroll" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toHaveTextContent("Monthly payroll");
  });

  it("shows nothing at all without a breadcrumb", () => {
    render(<PageHeader title="Payroll" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
