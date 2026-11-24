import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * The public pages offer self sign-up (UAT 23 Nov, U59 / NC-18). Every "Start
 * free" went to the demo form, the pricing page had no Sign in, the banner said
 * "Migration on us" above an FAQ that quotes migration separately, and the demo
 * page said there was "no trial account" to cancel.
 */
/* jsdom has neither; the pages' scroll reveals and the nav ask for both. */
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  onchange: null,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
} as unknown as typeof IntersectionObserver;

vi.mock("next/navigation", () => ({
  usePathname: () => "/pricing",
  useRouter: () => ({ push: vi.fn() }),
}));

const { default: PricingPage } = await import("@/app/(marketing)/pricing/page");
const { AnnouncementBar, MarketingNav } =
  await import("@/components/marketing/chrome");

describe("the pricing page", () => {
  it("starts free at sign-up, and keeps the demo as its own button", () => {
    render(<PricingPage />);
    const starts = screen.getAllByRole("link", { name: /^Start free/ });
    expect(starts.length).toBeGreaterThan(0);
    for (const link of starts)
      expect(link).toHaveAttribute("href", "/register");
    expect(
      screen.getAllByRole("link", { name: /Book a demo/ })[0],
    ).toHaveAttribute("href", "/demo");
    expect(screen.queryByText(/Start free, book a demo/)).toBeNull();
  });

  it("promises no free migration the FAQ does not give", () => {
    render(<PricingPage />);
    expect(
      screen.queryByText(/migrate your existing data at no cost/),
    ).toBeNull();
    expect(screen.queryByText(/We move your data/)).toBeNull();
  });
});

describe("the site's header", () => {
  it("has Sign in", () => {
    render(<MarketingNav />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("does not promise migration on us", () => {
    render(<AnnouncementBar />);
    expect(screen.queryByText(/Migration on us/)).toBeNull();
    expect(screen.getByText(/First month free/)).toBeInTheDocument();
  });
});
