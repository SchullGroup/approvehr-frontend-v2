import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  GetReady,
  ReadyChip,
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
  const open = async () =>
    userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: /Next:|Ready to start|All done/ }),
      );

  it("is one thin line that says what is next and how many are in", () => {
    render(<GetReady steps={steps()} />);
    expect(screen.getByText("Next: Questions")).toBeVisible();
    expect(screen.getByText("1 of 2")).toBeVisible();
    expect(
      screen.getByRole("progressbar", { name: "1 of 2 ready" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("opens the steps in a window, the first one still to do carrying the one primary button", async () => {
    render(<GetReady steps={steps()} />);
    await open();
    expect(currentStep(steps())?.id).toBe("questions");
    const current = screen
      .getAllByRole("listitem")
      .find((li) => li.getAttribute("aria-current") === "step");
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

  it("offers the final action only when everything needed is done", async () => {
    const onClick = vi.fn();
    const { unmount } = render(
      <GetReady steps={steps()} final={{ label: "Start period", onClick }} />,
    );
    await open();
    expect(
      screen.queryByRole("button", { name: "Start period" }),
    ).not.toBeInTheDocument();
    unmount();
    render(
      <GetReady
        steps={steps({ questions: { done: true } })}
        final={{ label: "Start period", onClick }}
      />,
    );
    expect(screen.getByText("Ready to start")).toBeVisible();
    await open();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Start period" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("says states in plain text, not as errors", async () => {
    const { container } = render(<GetReady steps={steps()} />);
    await open();
    expect(screen.getByText("To do")).toBeVisible();
    expect(container.innerHTML).not.toMatch(/danger|text-warning/);
  });
});

describe("ReadyChip", () => {
  it("is a ring and a count, and opens the steps", async () => {
    render(<ReadyChip steps={steps()} />);
    expect(
      screen.getByRole("button", { name: "Get ready: 1 of 2 ready" }),
    ).toBeVisible();
    expect(screen.getByText("1 of 2")).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Get ready/ }));
    expect(screen.getByText("Questions")).toBeVisible();
    expect(screen.getByRole("link", { name: "Add questions" })).toHaveAttribute(
      "href",
      "/q",
    );
  });

  it("gets a tick when everything needed is in", () => {
    const { container } = render(
      <ReadyChip steps={steps({ questions: { done: true } })} />,
    );
    expect(screen.getByText("2 of 2")).toBeVisible();
    expect(container.querySelector("svg.lucide-check")).not.toBeNull();
  });
});
