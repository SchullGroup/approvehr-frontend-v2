import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UAT 23 Nov, U52 (HR-17, CRAWL-4): pages a customer could not use. The
 * assistant pages said "not switched on" to anybody who found them by address,
 * and the integrations return page asked the API to finish a connection it had
 * nothing to finish.
 */

const state = vi.hoisted(() => ({
  assistant: false,
  ask: false,
  completeToken: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/store/ai", () => ({
  useAssistantAvailable: () => ({
    available: state.assistant,
    loading: false,
    reason: "Set GEMINI_API_KEY on the API",
  }),
}));
vi.mock("@/lib/store/ai2-chat", () => ({
  useAi2Available: () => ({
    available: state.ask,
    loading: false,
    model: "model",
    reason: "Set a key",
  }),
}));
vi.mock("@/components/portal/assistant-chat", () => ({
  AssistantChat: () => <div>chat</div>,
}));
vi.mock("@/components/ai/ai2-chat", () => ({ Ai2Chat: () => <div>chat</div> }));
vi.mock("@/lib/api/work-trackers", () => ({
  workTrackersApi: { completeToken: state.completeToken },
}));

import { AssistantScreen } from "@/app/(app)/assistant/assistant-screen";
import { AskScreen } from "@/app/(app)/ask/ask-screen";
import { ConnectReturn } from "@/app/(app)/settings/integrations/connect-return/connect-return";

beforeEach(() => {
  state.assistant = false;
  state.ask = false;
  state.completeToken.mockReset();
});

describe("the assistant pages, with no assistant answering", () => {
  it("are not there, rather than a page that says it is off", () => {
    render(<AssistantScreen />);
    expect(screen.getByText(/We could not find/)).toBeTruthy();
    expect(screen.queryByText(/not switched on/)).toBeNull();
    expect(screen.queryByText(/GEMINI/)).toBeNull();
  });

  it("the same for Ask", () => {
    render(<AskScreen />);
    expect(screen.getByText(/We could not find/)).toBeTruthy();
    expect(screen.queryByText(/not switched on/)).toBeNull();
  });

  it("are there once one answers", () => {
    state.assistant = true;
    render(<AssistantScreen />);
    expect(screen.queryByText(/We could not find/)).toBeNull();
    expect(screen.getByText("chat")).toBeTruthy();
  });
});

describe("the integrations return page", () => {
  it("says the link is incomplete, and asks the API nothing, when opened bare", async () => {
    window.history.replaceState(
      null,
      "",
      "/settings/integrations/connect-return",
    );
    render(<ConnectReturn />);
    await waitFor(() =>
      expect(screen.getByText(/This link is incomplete/)).toBeTruthy(),
    );
    expect(state.completeToken).not.toHaveBeenCalled();
  });

  it("finishes the connection when Trello sent what it should", async () => {
    state.completeToken.mockResolvedValue({
      redirect: "/settings/integrations",
    });
    window.history.replaceState(
      null,
      "",
      "/settings/integrations/connect-return?state=abc#token=xyz",
    );
    render(<ConnectReturn />);
    await waitFor(() => expect(state.completeToken).toHaveBeenCalled());
    expect(state.completeToken.mock.calls[0]![0]).toMatchObject({
      state: "abc",
      token: "xyz",
    });
  });
});
