import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * The careers pages are the employer's, not ApproveHR's sales site (UAT 23 Nov,
 * U89 / PERF-9). A job seeker reading a company's roles saw the product's
 * announcement bar, nav, Book a demo button and full marketing footer.
 */
const { default: CareersLayout } = await import("@/app/(careers)/layout");

describe("the careers layout", () => {
  it("draws no sales chrome round the employer's page", () => {
    render(
      <CareersLayout>
        <h1>Open roles</h1>
      </CareersLayout>,
    );
    expect(
      screen.getByRole("heading", { name: "Open roles" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Book a demo/i)).toBeNull();
    expect(screen.queryByText(/First month free/i)).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("ends with one line naming the product", () => {
    render(
      <CareersLayout>
        <p>Body</p>
      </CareersLayout>,
    );
    const footer = screen.getByTestId("careers-footer");
    expect(footer).toHaveTextContent("Careers page powered by ApproveHR");
    expect(footer.querySelectorAll("a")).toHaveLength(1);
  });
});
