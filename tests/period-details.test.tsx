import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiCycle } from "@/lib/api/performance";
import {
  datesProblem,
  guideLinkProblem,
  messageProblem,
  reminderWords,
  STAFF_MESSAGE_WHERE,
} from "@/lib/performance/period-details";

/**
 * What a period says about itself after the wizard (F7): its dates, the message
 * to staff, and the reminder. They were asked once and could not be seen or
 * changed afterwards.
 */

let updateCycle: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/store/performance", () => ({
  useCycleMutations: () => ({
    updateCycle: (...args: unknown[]) => updateCycle(...args),
  }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({
    flat: [
      { id: "eng", name: "Engineering" },
      { id: "fin", name: "Finance" },
    ],
  }),
}));

const { PeriodDatesCard, PeriodMessageCard, PeriodReminderCard } =
  await import("@/app/(app)/performance/periods/[id]/period-details");
const { ToastProvider } = await import("@/components/ui");

const period = (over: Partial<ApiCycle> = {}): ApiCycle =>
  ({
    id: "p-1",
    name: "H2 2026",
    stage: "SELF",
    stageLabel: "self-review",
    dueDate: "2027-01-14",
    periodStart: "2026-07-01",
    periodEnd: "2026-12-31",
    instructions: "Be honest.",
    guideUrl: null,
    remindDaysBefore: 3,
    departmentIds: [],
    ...over,
  }) as unknown as ApiCycle;

const show = (node: React.ReactNode) => {
  const onChanged = vi.fn();
  const user = userEvent.setup();
  render(<ToastProvider>{node}</ToastProvider>);
  return { user, onChanged };
};

beforeEach(() => {
  updateCycle = vi.fn().mockResolvedValue({});
});

describe("the rules", () => {
  it("refuses half of a range and a range that ends first, in the API's words", () => {
    expect(datesProblem("2026-07-01", "")).toBe(
      "A period needs a start and an end. Set both, or clear both.",
    );
    expect(datesProblem("", "2026-12-31")).toBe(
      "A period needs a start and an end. Set both, or clear both.",
    );
    expect(datesProblem("2026-12-31", "2026-07-01")).toBe(
      "The period would end before it starts.",
    );
    expect(datesProblem("", "")).toBeNull();
    expect(datesProblem("2026-07-01", "2026-07-01")).toBeNull();
  });

  it("refuses a message over the API's limit and a guide that is not a link", () => {
    expect(messageProblem("x".repeat(4000))).toBeNull();
    expect(messageProblem("x".repeat(4001))).toMatch(/Keep the introduction/);
    expect(guideLinkProblem("")).toBeNull();
    expect(guideLinkProblem("https://example.com/a")).toBeNull();
    expect(guideLinkProblem("javascript:alert(1)")).toMatch(/not a link/);
    expect(guideLinkProblem("example.com")).toMatch(/not a link/);
  });

  it("says who reads the message, and that it is not on a manager's form", () => {
    expect(STAFF_MESSAGE_WHERE).toMatch(/self-review/);
    expect(STAFF_MESSAGE_WHERE).toMatch(/not shown on a manager/);
  });

  it("says what a reminder is in words", () => {
    expect(reminderWords(null)).toBe("No reminder is sent.");
    expect(reminderWords(1)).toBe("1 day before the due date");
    expect(reminderWords(7)).toBe("7 days before the due date");
  });
});

describe("Dates", () => {
  it("shows what the period holds and who it covers", () => {
    show(<PeriodDatesCard period={period()} onChanged={vi.fn()} />);
    expect(screen.getByLabelText("Period starts")).toHaveValue("2026-07-01");
    expect(screen.getByLabelText("Period ends")).toHaveValue("2026-12-31");
    expect(screen.getByLabelText("Answers due")).toHaveValue("2027-01-14");
    expect(screen.getByText("The whole company")).toBeInTheDocument();
  });

  it("names the departments a scoped period covers", () => {
    show(
      <PeriodDatesCard
        period={period({ departmentIds: ["eng", "fin"] })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText("Engineering, Finance")).toBeInTheDocument();
  });

  it("keeps Save off until something changes, and sends only what changed", async () => {
    const { user } = show(
      <PeriodDatesCard period={period()} onChanged={vi.fn()} />,
    );
    const save = screen.getByRole("button", { name: "Save dates" });
    expect(save).toBeDisabled();
    const due = screen.getByLabelText("Answers due");
    await user.clear(due);
    await user.type(due, "2027-02-01");
    expect(save).toBeEnabled();
    await user.click(save);
    expect(updateCycle).toHaveBeenCalledWith("p-1", { dueDate: "2027-02-01" });
  });

  it("clears a date by sending null", async () => {
    const { user } = show(
      <PeriodDatesCard period={period()} onChanged={vi.fn()} />,
    );
    await user.clear(screen.getByLabelText("Answers due"));
    await user.click(screen.getByRole("button", { name: "Save dates" }));
    expect(updateCycle).toHaveBeenCalledWith("p-1", { dueDate: null });
  });

  it("will not send half of a range, and says why", async () => {
    const { user } = show(
      <PeriodDatesCard period={period()} onChanged={vi.fn()} />,
    );
    await user.clear(screen.getByLabelText("Period ends"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Set both, or clear both/,
    );
    expect(screen.getByRole("button", { name: "Save dates" })).toBeDisabled();
    expect(updateCycle).not.toHaveBeenCalled();
  });

  it("tells the parent it changed, and shows the server's sentence when refused", async () => {
    updateCycle.mockRejectedValueOnce(
      new ApiError(409, "conflict", "That cycle is published."),
    );
    const { user, onChanged } = show(
      <PeriodDatesCard period={period()} onChanged={vi.fn()} />,
    );
    const due = screen.getByLabelText("Answers due");
    await user.clear(due);
    await user.type(due, "2027-03-03");
    await user.click(screen.getByRole("button", { name: "Save dates" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That cycle is published.",
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("calls onChanged after a good save", async () => {
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <PeriodDatesCard period={period()} onChanged={onChanged} />
      </ToastProvider>,
    );
    const due = screen.getByLabelText("Answers due");
    await user.clear(due);
    await user.type(due, "2027-03-03");
    await user.click(screen.getByRole("button", { name: "Save dates" }));
    await screen.findByText("Dates saved");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("is read only once the period is published", () => {
    show(
      <PeriodDatesCard
        period={period({ stage: "PUBLISHED" })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Answers due")).not.toBeInTheDocument();
    expect(screen.getByText("Answers were due")).toBeInTheDocument();
    expect(screen.getByText("14 Jan 2027")).toBeInTheDocument();
  });
});

describe("Message to staff", () => {
  it("shows the message and where it is read", () => {
    show(<PeriodMessageCard period={period()} onChanged={vi.fn()} />);
    expect(screen.getByLabelText("Message")).toHaveValue("Be honest.");
    expect(screen.getByText(STAFF_MESSAGE_WHERE)).toBeInTheDocument();
  });

  it("sends the trimmed message, and null when it is emptied", async () => {
    const { user } = show(
      <PeriodMessageCard period={period()} onChanged={vi.fn()} />,
    );
    const box = screen.getByLabelText("Message");
    await user.clear(box);
    await user.type(box, "  Add evidence.  ");
    await user.click(screen.getByRole("button", { name: "Save message" }));
    expect(updateCycle).toHaveBeenLastCalledWith("p-1", {
      instructions: "Add evidence.",
    });

    await user.clear(box);
    await user.click(screen.getByRole("button", { name: "Save message" }));
    expect(updateCycle).toHaveBeenLastCalledWith("p-1", {
      instructions: null,
    });
  });

  it("refuses a guide that is not a link before it sends anything", async () => {
    const { user } = show(
      <PeriodMessageCard period={period()} onChanged={vi.fn()} />,
    );
    await user.type(
      screen.getByLabelText(/Link to the company's guide/),
      "javascript:alert(1)",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/not a link/);
    expect(screen.getByRole("button", { name: "Save message" })).toBeDisabled();
  });
});

describe("Reminder", () => {
  it("shows what is set and writes a change at once", async () => {
    const { user } = show(
      <PeriodReminderCard period={period()} onChanged={vi.fn()} />,
    );
    const select = screen.getByLabelText("Remind them");
    expect(select).toHaveValue("3");
    await user.selectOptions(select, "7");
    expect(updateCycle).toHaveBeenCalledWith("p-1", { remindDaysBefore: 7 });
  });

  it("switches it off by sending null", async () => {
    const { user } = show(
      <PeriodReminderCard period={period()} onChanged={vi.fn()} />,
    );
    await user.selectOptions(screen.getByLabelText("Remind them"), "0");
    expect(updateCycle).toHaveBeenCalledWith("p-1", { remindDaysBefore: null });
  });

  it("keeps a value the list does not offer, so it is not lost on screen", () => {
    show(
      <PeriodReminderCard
        period={period({ remindDaysBefore: 4 })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Remind them")).toHaveValue("4");
  });

  it("says a reminder needs a due date, and cannot be set without one", () => {
    show(
      <PeriodReminderCard
        period={period({ dueDate: null, remindDaysBefore: null })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Remind them")).toBeDisabled();
    expect(screen.getByText(/no date|has none/)).toBeInTheDocument();
  });
});
