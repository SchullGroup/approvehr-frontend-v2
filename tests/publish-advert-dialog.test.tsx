import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PublishAdvertDialog } from "@/components/hiring/publish-advert-dialog";

/**
 * Publishing asks first and shows the page a candidate will read (UAT 23 Nov,
 * U98 / PERF-18). It used to be one menu click, and an advert could go public
 * saying nothing about the job.
 */
const posting = {
  title: "Data Analyst",
  summary: "Data Analyst in Operations · Abeokuta site",
  description: "Builds the weekly operations report.\n\nWhat you need:\n- SQL",
  location: "Abeokuta site",
  employmentType: "FULL_TIME" as const,
  showSalary: true,
  salaryMinKobo: 45_000_000,
  salaryMaxKobo: 65_000_000,
};

describe("the publish confirmation", () => {
  it("shows the title, the facts and the description before anything is sent", async () => {
    const onPublish = vi.fn();
    render(
      <PublishAdvertDialog
        posting={posting}
        open
        onClose={vi.fn()}
        onPublish={onPublish}
      />,
    );
    const preview = screen.getByRole("region", {
      name: "How the advert will read",
    });
    expect(within(preview).getByText("Data Analyst")).toBeInTheDocument();
    expect(preview).toHaveTextContent("Full time · Abeokuta site");
    expect(preview).toHaveTextContent("Builds the weekly operations report.");
    expect(onPublish).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Publish it" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("will not publish an advert that says nothing about the job", () => {
    render(
      <PublishAdvertDialog
        posting={{ ...posting, description: "   " }}
        open
        onClose={vi.fn()}
        onPublish={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Publish it" })).toBeDisabled();
    expect(
      screen.getByText(/says nothing about the job yet/),
    ).toBeInTheDocument();
  });

  it("leaves the pay out when the company withholds it", () => {
    render(
      <PublishAdvertDialog
        posting={{ ...posting, showSalary: false }}
        open
        onClose={vi.fn()}
        onPublish={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("region", { name: "How the advert will read" }),
    ).not.toHaveTextContent("₦");
  });
});
