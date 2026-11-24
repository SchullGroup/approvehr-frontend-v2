import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  GetReady,
  NextStep,
  currentStep,
  type ReadyStep,
} from "@/components/performance/next-step";

/** Guided flows (owner, 24 Nov 2026): one next step, one primary button. */

const steps = (over: Partial<Record<string, Partial<ReadyStep>>> = {}) =>
  [
    {
      id: "objectives",
      label: "Objectives",
      optional: true,
      done: false,
      action: { label: "Set objectives", href: "/performance/kpis" },
    },
    {
      id: "appraisers",
      label: "Who appraises whom",
      done: true,
      action: { label: "Review", href: "/a" },
    },
    {
      id: "questions",
      label: "Questions",
      done: false,
      action: { label: "Add questions", href: "/q" },
    },
  ].map((step) => ({ ...step, ...over[step.id] })) as ReadyStep[];

describe("NextStep", () => {
  it("says one thing and has one primary button", async () => {
    const onClick = vi.fn();
    render(
      <NextStep
        title="12 people have not finished"
        action={{ label: "Send a reminder", onClick }}
      />,
    );
    expect(screen.getByText("12 people have not finished")).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("button", { name: "Send a reminder" }),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("goes straight to a step with a link, and offers a quiet later", () => {
    render(
      <NextStep
        title="Pick who appraises Q4"
        action={{ label: "Pick", href: "/performance/appraisers" }}
        later={{ label: "Do this later", href: "/performance" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Pick" })).toHaveAttribute(
      "href",
      "/performance/appraisers",
    );
    expect(screen.getByRole("link", { name: "Do this later" })).toBeVisible();
  });

  it("is never red", () => {
    const { container } = render(<NextStep title="Something to do" />);
    expect(container.innerHTML).not.toMatch(/danger|red-|warning/);
  });
});

describe("GetReady", () => {
  it("counts the steps that are needed, not the optional ones", () => {
    render(<GetReady steps={steps()} />);
    expect(screen.getByText("1 of 2 ready")).toBeVisible();
  });

  it("highlights the first step still to do and gives it the one primary button", () => {
    render(<GetReady steps={steps()} />);
    expect(currentStep(steps())?.id).toBe("questions");
    const items = screen.getAllByRole("listitem");
    const current = items.find(
      (li) => li.getAttribute("aria-current") === "step",
    );
    expect(within(current as HTMLElement).getByText("Questions")).toBeVisible();
    expect(
      within(current as HTMLElement).getByRole("link", {
        name: "Add questions",
      }),
    ).toHaveAttribute("href", "/q");
  });

  it("treats an optional step as an invitation, never the current step", () => {
    expect(currentStep(steps({ questions: { done: true } }))).toBeNull();
  });

  it("offers the final action only when everything needed is done", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <GetReady steps={steps()} final={{ label: "Start period", onClick }} />,
    );
    expect(
      screen.queryByRole("button", { name: "Start period" }),
    ).not.toBeInTheDocument();
    rerender(
      <GetReady
        steps={steps({ questions: { done: true } })}
        final={{ label: "Start period", onClick }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Start period" }),
    ).toBeInTheDocument();
  });

  it("says states in plain text, not as errors", () => {
    const { container } = render(<GetReady steps={steps()} />);
    expect(screen.getByText("To do")).toBeVisible();
    expect(container.innerHTML).not.toMatch(/danger|text-warning/);
  });
});
