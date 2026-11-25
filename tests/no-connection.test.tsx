import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import OfflinePage from "@/app/offline/page";
import { NoConnectionCard } from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";

/**
 * "No connection", drawn three ways: the full page the service worker serves, the card that replaces the red
 * failure box for a read that never got an answer, and the mark on the sign-in screen.
 */

describe("the /offline page", () => {
  it("says the real reason and keeps the promises it can keep: nothing is cached, nothing is half-saved", () => {
    const { container } = render(<OfflinePage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "No connection" }),
    ).toBeTruthy();
    const text = container.textContent ?? "";
    expect(text).toMatch(/kept there rather than on this device/);
    expect(text).toMatch(/Nothing is half-saved/);
    // It never implies a saved copy exists: the service worker caches this one page and nothing else.
    expect(text).not.toMatch(
      /saved copy|cached|available offline|offline mode/i,
    );
  });

  it("works with nothing else loaded: a plain link for Try again, no React-only control, no external file", () => {
    const { container } = render(<OfflinePage />);
    const link = screen.getByRole("link", { name: "Try again" });
    expect(link.getAttribute("href")).toBe("/dashboard");
    // A button here would be dead: this page is served to a document with no JavaScript running yet.
    expect(container.querySelector("button")).toBeNull();
    // Everything it draws is in the document itself.
    expect(container.querySelector("link")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("style")?.textContent).toContain(
      ".ahr-offline",
    );
  });

  it("reopens the app when the browser says the network is back, once per change", () => {
    const { container } = render(<OfflinePage />);
    const script = [...container.querySelectorAll("script")]
      .map((s) => s.textContent)
      .join("\n");
    expect(script).toContain('addEventListener("online"');
    expect(script).toContain("/dashboard");
  });

  it("keeps to the 14px floor in its own stylesheet", () => {
    const { container } = render(<OfflinePage />);
    const css = container.querySelector("style")?.textContent ?? "";
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)].map(
      ([, n, unit]) => (unit === "px" ? Number(n) : Number(n) * 16),
    );
    expect(sizes.length).toBeGreaterThan(3);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
  });

  it("draws its decoration as hidden: the symbol, the tiles and the backdrop", () => {
    const { container } = render(<OfflinePage />);
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    // glyph, three tiles, the backdrop svg
    expect(hidden.length).toBeGreaterThanOrEqual(5);
  });
});

describe("NoConnectionCard", () => {
  it("is an alert with a hidden symbol, and Try again does what the screen asked", async () => {
    const onRetry = vi.fn();
    render(
      <NoConnectionCard onRetry={onRetry}>
        <p>The app cannot reach the server.</p>
      </NoConnectionCard>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("No connection")).toBeTruthy();
    // White on the blue, set on the heading itself: the base styles would otherwise make it the dark ink colour.
    expect(
      screen.getByRole("heading", { name: "No connection" }).className,
    ).toContain("text-white");
    expect(screen.getByText("The app cannot reach the server.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("has no button when there is nothing to retry", () => {
    render(<NoConnectionCard />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("LoadFailure and the connection", () => {
  it("draws a read that never got an answer as the calm card, with the same sentences and the retry", async () => {
    const onRetry = vi.fn();
    render(
      <LoadFailure
        subject="the payslips"
        error={new ApiError(0, "network", "offline")}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("No connection")).toBeTruthy();
    expect(screen.getByText("The payslips did not load.")).toBeTruthy();
    expect(screen.getByText(/Check your internet connection/)).toBeTruthy();
    expect(screen.getByText("Nothing has been changed or lost.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps the red failure box for everything that is not the connection", () => {
    render(
      <LoadFailure
        subject="the payslips"
        error={new ApiError(500, "internal", "Something went wrong.")}
      />,
    );
    expect(screen.queryByText("No connection")).toBeNull();
    expect(screen.getByText("The payslips did not load")).toBeTruthy();
  });
});
