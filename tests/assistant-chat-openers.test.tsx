import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/lib/permissions";

/**
 * The Assistant page's buttons, as a person sees them.
 *
 * The questions themselves are tested as data in `assistant-openers.test.ts`; this
 * is what the page makes of them: the buttons, the sentence above them, and what
 * pressing one does. The assistant, the conversation and the usage gauge are
 * stood in for, because none of them is what is being tested.
 */

const signedIn = vi.hoisted(() => ({
  permissions: new Set<string>(),
}));

vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ permissions: signedIn.permissions }),
}));
vi.mock("@/lib/store/ai", () => ({
  useAssistantAvailable: () => ({
    available: true,
    loading: false,
    reason: null,
  }),
}));
vi.mock("@/lib/store/ai-chat", () => ({
  useAssistantChat: () => ({
    turns: [],
    sending: false,
    live: null,
    error: null,
    capped: false,
    capReason: null,
    full: false,
    confirming: null,
    send: async () => false,
    stop: () => undefined,
    retry: async () => undefined,
    reset: () => undefined,
    confirm: async () => undefined,
    discard: () => undefined,
  }),
}));
vi.mock("@/components/ai/usage-gauge", () => ({ UsageGauge: () => null }));
vi.mock("@/components/ai/turn-progress", () => ({ LiveTurn: () => null }));

const { AssistantChat } = await import("@/components/portal/assistant-chat");

const holding = (...keys: PermissionKey[]) => {
  signedIn.permissions = new Set<string>(keys);
};

/** The text of every suggested question, in the order they are shown. */
const buttons = () =>
  screen
    .getAllByRole("button")
    .map((button) => button.textContent ?? "")
    .filter((text) => text.endsWith("?"));

beforeEach(() => {
  holding();
});

describe("the assistant page's suggested questions", () => {
  it("shows an employee their own pay, their own leave and the review periods", () => {
    render(<AssistantChat />);
    expect(buttons()).toEqual([
      "What was my last net pay?",
      "What leave have I asked for?",
      "Which review periods are running?",
      "What can you do for me?",
    ]);
    expect(
      screen.getByText(
        "Ask about your own pay, your leave, or the review periods. Try one of these:",
      ),
    ).toBeInTheDocument();
  });

  it("shows a line manager no question about their team's leave", () => {
    holding("APPROVE_LEAVE", "MANAGE_HIRING");
    render(<AssistantChat />);
    const shown = buttons();
    expect(shown).not.toContain("Whose leave requests are waiting for me?");
    expect(shown).not.toContain("Who on my team is on leave?");
    expect(shown).toContain("What leave have I asked for?");
  });

  it("shows the Payroll analyst a payroll question, though they cannot edit records", () => {
    holding("VIEW_SALARIES", "RUN_PAYROLL", "EXPORT_DATA");
    render(<AssistantChat />);
    expect(buttons()).toEqual([
      "Is anyone missing something before payday?",
      "What did we pay last month?",
      "What was my last net pay?",
      "What can you do for me?",
    ]);
    expect(
      screen.getByText(
        "Ask about your payroll runs or your own pay. Try one of these:",
      ),
    ).toBeInTheDocument();
  });

  it("shows the HR manager the company's questions", () => {
    holding("VIEW_SALARIES", "EDIT_RECORDS", "APPROVE_LEAVE_ALL");
    render(<AssistantChat />);
    expect(buttons()).toEqual([
      "How many people have no bank account?",
      "Whose leave requests are still waiting?",
      "Is anyone missing something before payday?",
      "What can you do for me?",
    ]);
  });

  it("puts the question in the box when it is pressed, and sends nothing", async () => {
    render(<AssistantChat />);
    await userEvent.click(
      screen.getByRole("button", { name: "Which review periods are running?" }),
    );
    expect(screen.getByLabelText("Your message")).toHaveValue(
      "Which review periods are running?",
    );
  });
});
