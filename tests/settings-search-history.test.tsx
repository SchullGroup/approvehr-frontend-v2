import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MAX_RECENT, remember } from "@/lib/store/settings-search-history";

vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/store/setup-checklist", () => ({
  useSetupChecklist: () => ({
    facts: null,
    loading: false,
    error: null,
    source: "api",
    reload: () => {},
  }),
}));
vi.mock("@/app/(app)/settings/billing-card", () => ({
  BillingCard: () => null,
  useBillingStatus: () => null,
}));

import { SettingsScreen } from "@/app/(app)/settings/settings-screen";

const box = () => screen.getByLabelText("Search settings");

describe("remember", () => {
  it("puts the newest first and drops repeats without regard to case", () => {
    expect(remember(["leave", "pension"], "Pension")).toEqual([
      "Pension",
      "leave",
    ]);
  });
  it("ignores a query too short to mean anything", () => {
    expect(remember(["leave"], " a ")).toEqual(["leave"]);
  });
  it("keeps at most the limit", () => {
    const many = Array.from({ length: MAX_RECENT }, (_, i) => `word${i}`);
    expect(remember(many, "fresh")).toHaveLength(MAX_RECENT);
    expect(remember(many, "fresh")[0]).toBe("fresh");
  });
});

describe("recent searches on the Settings screen", () => {
  /* The store keeps its state in module memory as well as in storage, and
     clearing storage does not clear memory, so each test starts by emptying
     the history the way a person would. */
  beforeEach(async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    const { unmount } = render(<SettingsScreen />);
    await user.click(box());
    const clear = screen.queryByRole("button", { name: "Clear history" });
    if (clear) await user.click(clear);
    unmount();
  });

  it("remembers a search on Enter and offers it when the box is clicked", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsScreen />);
    await user.type(box(), "overtime{Enter}");
    unmount();

    render(<SettingsScreen />);
    expect(screen.queryByText("Recent searches")).toBeNull();
    await user.click(box());
    expect(await screen.findByText("Recent searches")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "overtime" }));
    expect((box() as HTMLInputElement).value).toBe("overtime");
  });

  it("does not remember a search that found nothing", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    await user.type(box(), "zzzz");
    await user.tab();
    await user.clear(box());
    expect(screen.queryByText("Recent searches")).toBeNull();
  });

  it("clears the history", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    await user.type(box(), "pension{Enter}");
    await user.clear(box());
    expect(await screen.findByText("Recent searches")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear history" }));
    expect(screen.queryByText("Recent searches")).toBeNull();
  });
});
