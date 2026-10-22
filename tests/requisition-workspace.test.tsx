import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RequisitionWorkspace,
  RoleGlance,
  type WorkspaceTab,
} from "@/app/(app)/hiring/requisitions/[id]/requisition-workspace";

/**
 * The layout of a role's page: a glance, then Pipeline first and the rest a tap away.
 *
 * The address carries the tab, so a link can say "the people waiting on a first look"
 * rather than "this page, then scroll". It is written with `replaceState` so one Back
 * press leaves the page instead of stepping back through tabs.
 */

const tabs: WorkspaceTab[] = [
  { id: "pipeline", label: "Pipeline", content: <p>the board</p> },
  {
    id: "applicants",
    label: "Applicants",
    count: 2,
    tone: "warning",
    content: <p>the applicants</p>,
  },
  { id: "stages", label: "Stages", content: <p>the stages</p> },
  { id: "access", label: "Access", content: <p>the access</p> },
];

const open = () =>
  render(<RequisitionWorkspace tabs={tabs} glance={<p>glance</p>} />);

beforeEach(() => {
  window.history.replaceState(null, "", "/hiring/requisitions/req-1");
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("the role page", () => {
  it("opens on the pipeline, with the glance above the tabs", () => {
    open();
    expect(screen.getByRole("tab", { name: "Pipeline" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("the board")).toBeInTheDocument();
    expect(screen.queryByText("the applicants")).not.toBeInTheDocument();
    const glance = screen.getByText("glance");
    const strip = screen.getByRole("tablist");
    expect(
      glance.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens on the tab the address asks for", () => {
    window.history.replaceState(
      null,
      "",
      "/hiring/requisitions/req-1?tab=stages",
    );
    open();
    expect(screen.getByText("the stages")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Stages" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("falls back to the pipeline for a tab it does not have", () => {
    window.history.replaceState(
      null,
      "",
      "/hiring/requisitions/req-1?tab=nonsense",
    );
    open();
    expect(screen.getByText("the board")).toBeInTheDocument();
  });

  it("writes the chosen tab into the address without adding a history entry", async () => {
    const user = userEvent.setup();
    open();
    const before = window.history.length;
    await user.click(screen.getByRole("tab", { name: /Applicants/ }));
    expect(screen.getByText("the applicants")).toBeInTheDocument();
    expect(window.location.search).toBe("?tab=applicants");
    expect(window.history.length).toBe(before);
  });

  it("takes the parameter off again for the first tab, and keeps the rest of the address", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      "",
      "/hiring/requisitions/req-1?tab=access&view=table",
    );
    open();
    await user.click(screen.getByRole("tab", { name: "Pipeline" }));
    expect(window.location.search).toBe("?view=table");
  });
});

describe("the glance", () => {
  const facts = [
    { label: "Salary band", value: "₦1,200,000.00 – ₦1,800,000.00" },
    { label: "Location", value: "Lagos HQ" },
    { label: "Headcount", value: 2 },
  ];

  it("lists every fact for somebody who is not on a phone", () => {
    render(<RoleGlance facts={facts} />);
    const terms = screen.getAllByText(/Salary band|Location|Headcount/);
    expect(terms.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Lagos HQ")).toBeInTheDocument();
  });

  it("says what the phone toggle does and whether it is open", async () => {
    const user = userEvent.setup();
    render(<RoleGlance facts={facts} />);
    const toggle = screen.getByRole("button", { name: /Salary band/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("More");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("Less");
  });

  it("draws no figures or description row when there are none, rather than empty ones", () => {
    const { container } = render(<RoleGlance facts={facts} />);
    expect(container.querySelector(".border-t")).toBeNull();
  });

  it("folds a long description to two lines and offers the rest", async () => {
    const user = userEvent.setup();
    render(
      <RoleGlance
        facts={facts}
        description={"A very long line. ".repeat(20)}
      />,
    );
    const more = screen.getByRole("button", {
      name: "Read the whole description",
    });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("offers no fold for a short description", () => {
    render(<RoleGlance facts={facts} description="Payroll and payments." />);
    expect(
      screen.queryByRole("button", { name: /Read the whole description/ }),
    ).not.toBeInTheDocument();
  });
});
