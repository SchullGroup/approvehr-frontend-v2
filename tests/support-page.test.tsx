import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingFooter } from "@/components/marketing/chrome";
import SupportPage, { metadata } from "@/app/(marketing)/support/page";
import { COMPANY } from "@/lib/marketing/legal";
import { SUPPORT } from "@/lib/marketing/support";

/**
 * The support page is what the App Store's Support URL opens, so it has two jobs
 * a test can hold: the way to reach a person must be there and must work, and the
 * page must not claim anything nobody has agreed to. There is no response time,
 * no opening hours, no phone number and no chat on it because none exists, and
 * the day one is added it is added to `lib/marketing/support.ts` on purpose, not
 * by drifting in.
 */

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [],
            meta: { total: 0, page: 1, pageSize: 500 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the support page", () => {
  it("shows the support address as visible text and as a mailto link", () => {
    render(<SupportPage />);
    expect(COMPANY.supportEmail).toBe("support@approvehr.io");

    const link = screen.getByRole("link", { name: COMPANY.supportEmail });
    expect(link).toHaveAttribute("href", `mailto:${COMPANY.supportEmail}`);
    expect(link).toBeVisible();
  });

  it("sends privacy requests to the privacy address, not the support one", () => {
    render(<SupportPage />);
    const section = document.getElementById("privacy-requests");
    expect(section).not.toBeNull();
    const link = within(section as HTMLElement).getByRole("link", {
      name: COMPANY.privacyEmail,
    });
    expect(link).toHaveAttribute("href", `mailto:${COMPANY.privacyEmail}`);
    expect(
      within(section as HTMLElement).queryByText(COMPANY.supportEmail),
    ).toBeNull();
  });

  it("says accounts are created by the employer, and to ask the company first", () => {
    render(<SupportPage />);
    const section = document.getElementById("your-company-first");
    expect(section).not.toBeNull();
    const text = (section as HTMLElement).textContent ?? "";
    expect(text).toMatch(/created by the company/i);
    for (const topic of [
      "account",
      "signing in",
      "leave",
      "payslip",
      "approval",
    ]) {
      expect(text, topic).toMatch(new RegExp(topic, "i"));
    }
    expect(text).toMatch(/HR team or ApproveHR administrator first/);
  });

  it("lists what to include, and tells people not to send passwords or full pay details", () => {
    render(<SupportPage />);
    const section = document.getElementById("what-to-include");
    expect(section).not.toBeNull();
    const text = (section as HTMLElement).textContent ?? "";
    expect(text).toMatch(/company's name/i);
    expect(text).toMatch(/work email/i);
    expect(text).toMatch(/what you were doing/i);
    expect(text).toMatch(/iPhone model/i);
    expect(text).toMatch(/app/i);
    expect(text).toMatch(/do not put your password/i);
    expect(text).toMatch(/payslip figures/i);
  });

  it("covers the iPhone app and points to the privacy policy for what it collects", () => {
    render(<SupportPage />);
    const section = document.getElementById("mobile-app");
    expect(section).not.toBeNull();
    const text = (section as HTMLElement).textContent ?? "";
    for (const topic of ["sign in", "location", "Wellness", "Notifications"]) {
      expect(text, topic).toMatch(new RegExp(topic, "i"));
    }
    const policy = within(section as HTMLElement).getByRole("link", {
      name: "privacy policy",
    });
    expect(policy).toHaveAttribute("href", "/privacy#mobile-app");
  });

  it("links to the privacy policy and to Book a demo", () => {
    render(<SupportPage />);
    expect(
      screen
        .getAllByRole("link", { name: /^Privacy policy/ })
        .map((a) => a.getAttribute("href")),
    ).toContain("/privacy");
    expect(screen.getByRole("link", { name: /^Book a demo/ })).toHaveAttribute(
      "href",
      "/demo",
    );
  });

  it("has one h1", () => {
    render(<SupportPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("promises nothing that has not been agreed", () => {
    const { container } = render(<SupportPage />);
    const text = container.textContent ?? "";
    /* No response time or hours. */
    expect(text).not.toMatch(/\bwithin\b/i);
    expect(text).not.toMatch(/\b(hours?|days?|minutes?)\b/i);
    expect(text).not.toMatch(/24\s*\/\s*7|business|working day|opening|sla\b/i);
    expect(text).not.toMatch(/\b(reply|respond|response)\b/i);
    /* No phone number, chat or social channel. */
    expect(text).not.toMatch(/\+?\d[\d\s().-]{7,}\d/);
    expect(text).not.toMatch(
      /\b(phone|call us|whatsapp|live chat|chat with)\b/i,
    );
    expect(text).not.toMatch(/linkedin|instagram|twitter/i);
    /* No legal-entity claim beyond the footer's own. */
    expect(text).not.toContain(COMPANY.legalName);
    expect(text).not.toMatch(/\bLLC\b|\bLtd\b|\bLimited\b/);
  });

  it("keeps every address in `COMPANY`, written nowhere else", () => {
    const copy = readFileSync(
      path.join(process.cwd(), "src/lib/marketing/support.ts"),
      "utf8",
    );
    const page = readFileSync(
      path.join(process.cwd(), "src/app/(marketing)/support/page.tsx"),
      "utf8",
    );
    expect(copy).not.toMatch(/[a-z]+@approvehr\.io/);
    expect(page).not.toMatch(/[a-z]+@approvehr\.io/);
    expect(SUPPORT.title).toBe("Support");
  });
});

describe("where the page is registered", () => {
  it("has a title, a description and a canonical address", () => {
    expect(metadata.title).toBe("Support");
    expect(metadata.description).toContain(COMPANY.supportEmail);
    expect(metadata.alternates?.canonical).toBe("https://approvehr.io/support");
  });

  it("is in the footer's Company column", () => {
    render(<MarketingFooter />);
    const link = screen.getByRole("link", { name: "Support" });
    expect(link).toHaveAttribute("href", "/support");
  });

  it("is in the sitemap", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://approvehr.io");
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://approvehr.io/support");
  });
});
