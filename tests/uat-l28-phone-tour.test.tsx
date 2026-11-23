import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * UAT 23 Nov, L28 (SELF-19): on a phone the first-run tour had a step about
 * "the search at the top of a wide screen" that a phone does not have, the
 * last step offered both Done and Finish, the approvals step told an employee
 * that staff loans and payroll come to their queue, and the step about their
 * day pointed at nothing.
 */

const state = vi.hoisted(() => ({
  held: new Set<string>(),
  manager: false,
  narrow: true,
}));

vi.mock("@/components/portal/tour/spotlight", () => ({
  Spotlight: ({
    children,
    target,
  }: {
    children: React.ReactNode;
    target: readonly string[];
  }) => (
    <div role="dialog" data-target={target.join(",")}>
      {children}
    </div>
  ),
  findTarget: () => null,
}));
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  usePermissions: () => ({
    permissions: state.held,
    loading: false,
    can: (p: PermissionKey) => state.held.has(p),
  }),
  useIsManager: () => state.manager,
}));
vi.mock("@/lib/store/features", () => ({
  useFeatures: () => ({ loading: false }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    tourSeen: false,
    dismissTour: vi.fn(),
    isConnected: true,
  }),
}));

const { GuidedTour } = await import("@/components/portal/tour/guided-tour");

function media(narrow: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("max-width") ? narrow : !narrow,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

function walk() {
  const titles: string[] = [];
  for (;;) {
    titles.push(screen.getByRole("heading").textContent ?? "");
    const next = screen.queryByRole("button", { name: "Next" });
    if (!next) break;
    act(() => next.click());
  }
  return titles;
}

beforeEach(() => {
  state.held = new Set();
  state.manager = false;
});

describe("the tour on a phone", () => {
  it("leaves out the step about the wide-screen search", () => {
    media(true);
    render(<GuidedTour />);
    expect(walk()).not.toContain("Find a person or a role");
  });

  it("counts the steps it shows in words", () => {
    media(true);
    render(<GuidedTour />);
    expect(screen.getByRole("dialog").textContent).toMatch(/1 of 3/);
    expect(screen.getByRole("dialog").textContent).toMatch(/^.*Three things/);
  });

  it("points the step about their day at the menu button", () => {
    media(true);
    render(<GuidedTour />);
    act(() => screen.getByRole("button", { name: "Next" }).click());
    act(() => screen.getByRole("button", { name: "Next" }).click());
    expect(screen.getByRole("dialog").dataset.target).toContain(
      '[data-tour="nav-toggle"]',
    );
  });
});

describe("the tour anywhere", () => {
  it("ends on one button, Done", () => {
    media(false);
    render(<GuidedTour />);
    walk();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });

  it("keeps the search step on a wide screen", () => {
    media(false);
    render(<GuidedTour />);
    expect(walk()).toContain("Find a person or a role");
  });

  it("does not name modules the reader may not decide in", () => {
    media(false);
    state.manager = true;
    render(<GuidedTour />);
    const bodies: string[] = [];
    for (;;) {
      bodies.push(screen.getByRole("dialog").textContent ?? "");
      const next = screen.queryByRole("button", { name: "Next" });
      if (!next) break;
      act(() => next.click());
    }
    expect(bodies.join(" ")).toMatch(/Waiting on you/);
    expect(bodies.join(" ")).not.toMatch(/staff loans and payroll/);
  });
});
