import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HmoDetails } from "@/app/(app)/payroll/pay-setup/hmo-details";
import type { ApiComponentPeople } from "@/lib/api/pay-components";

/**
 * The HMO premium's side of "who has it": the provider, and whose member ID is
 * still missing.
 *
 * Two rules pinned here. A list that does not carry `memberNumber` at all — every
 * component but the HMO — renders nothing, because "this list does not carry IDs"
 * is not a claim that nobody has one. And a missing ID is **not a warning**: both
 * fields are optional, so a company with none entered reads "0 of 29 on file"
 * and nothing in red.
 */

const person = (
  id: string,
  name: string,
  over: Partial<ApiComponentPeople["people"][number]> = {},
): ApiComponentPeople["people"][number] => ({
  employeeId: id,
  name,
  employeeNo: `E-${id}`,
  department: null,
  on: true,
  ...over,
});

const hmo = (
  people: ApiComponentPeople["people"],
  provider: string | null = "Hygeia HMO",
): ApiComponentPeople => ({
  componentId: "c1",
  name: "HMO premium",
  provider,
  everyone: false,
  people,
});

describe("HmoDetails", () => {
  it("renders nothing for a list that carries no member IDs", () => {
    const { container } = render(
      <HmoDetails
        data={{
          componentId: "c2",
          name: "Union dues",
          everyone: true,
          people: [person("1", "Ada")],
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("says who the HMO is with, and how many member IDs are on file", () => {
    render(
      <HmoDetails
        data={hmo([
          person("1", "Ada", { memberNumber: "H-1" }),
          person("2", "Bola", { memberNumber: null }),
          person("3", "Cara", { memberNumber: "H-3" }),
        ])}
      />,
    );
    expect(screen.getByText("Hygeia HMO")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 on file")).toBeInTheDocument();
  });

  it("counts only the people who have the HMO", () => {
    render(
      <HmoDetails
        data={hmo([
          person("1", "Ada", { memberNumber: "H-1" }),
          /* Not on the HMO: no card to enter, so not "missing" anything. */
          person("2", "Bola", { memberNumber: null, on: false }),
        ])}
      />,
    );
    expect(screen.getByText("1 of 1 on file")).toBeInTheDocument();
    expect(
      screen.queryByText(/still without a member id/i),
    ).not.toBeInTheDocument();
  });

  it("says Not on file for a provider nobody has set", () => {
    render(
      <HmoDetails
        data={hmo([person("1", "Ada", { memberNumber: null })], null)}
      />,
    );
    expect(screen.getByText("Not on file")).toBeInTheDocument();
  });

  it("lists who is missing an ID behind a reveal, each with a way to their record", async () => {
    render(
      <HmoDetails
        data={hmo([
          person("1", "Ada", { memberNumber: "H-1" }),
          person("2", "Bola", { memberNumber: null }),
        ])}
      />,
    );
    const toggle = screen.getByRole("button", {
      name: /still without a member id/i,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);

    const link = screen.getByRole("link", { name: /open record/i });
    expect(link).toHaveAttribute("href", "/people/2");
    expect(screen.getByText("Bola")).toBeInTheDocument();
  });

  it("says so, and warns of nothing, when nobody is on it yet", () => {
    render(
      <HmoDetails
        data={hmo([person("1", "Ada", { on: false, memberNumber: null })])}
      />,
    );
    expect(screen.getByText("Nobody is on it yet")).toBeInTheDocument();
  });
});
