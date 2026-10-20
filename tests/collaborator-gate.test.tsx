import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { collaboratorMayOpen } from "@/lib/hiring/access/collaborator";

/**
 * Anywhere that is not a collaborator's own is one calm sentence and the way back. A
 * few pages ask for no permission at all (the settings home, the approvals inbox) and
 * would show an invited outsider the company's setup checklist, so the gate stands in
 * front of every address and renders nothing of the page behind it.
 */

const where = vi.hoisted(() => ({ path: "/settings", collaborator: true }));
vi.mock("next/navigation", () => ({
  usePathname: () => where.path,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/hiring/access/collaborator", async (original) => ({
  ...(await original<typeof import("@/lib/hiring/access/collaborator")>()),
  useIsCollaborator: () => where.collaborator,
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { CollaboratorGate } =
  await import("@/components/portal/collaborator-gate");

const page = (
  <CollaboratorGate>
    <p>The page behind it</p>
  </CollaboratorGate>
);

describe("the pages that are a collaborator's own", () => {
  it("are the room they were invited to, their notifications, and their own sign-in and appearance", () => {
    for (const path of [
      "/hiring/my-interviews",
      "/hiring/my-interviews/a1",
      "/notifications",
      "/settings/security",
      "/settings/appearance",
    ]) {
      expect(collaboratorMayOpen(path), path).toBe(true);
    }
  });

  it("are nothing else, including a page that merely starts the same way", () => {
    for (const path of [
      "/",
      "/dashboard",
      "/settings",
      "/settings/roles",
      "/settings/securityx",
      "/hiring",
      "/hiring/my-interviewsx",
      "/hiring/hired",
      "/payroll",
      "/people",
      "/profile",
      "/approvals",
      "/reports",
    ]) {
      expect(collaboratorMayOpen(path), path).toBe(false);
    }
  });
});

describe("the gate", () => {
  it("shows the page that is theirs", () => {
    where.collaborator = true;
    where.path = "/hiring/my-interviews";
    render(page);
    expect(screen.getByText("The page behind it")).toBeInTheDocument();
  });

  it("replaces every other page, and renders nothing of it", () => {
    where.collaborator = true;
    for (const path of [
      "/settings",
      "/approvals",
      "/payroll",
      "/hiring/hired",
    ]) {
      where.path = path;
      const view = render(page);
      expect(
        screen.getByText("This page is not part of your access"),
      ).toBeInTheDocument();
      expect(screen.queryByText("The page behind it")).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Go to My interviews" }),
      ).toHaveAttribute("href", "/hiring/my-interviews");
      view.unmount();
    }
  });

  it("does nothing for anybody who is not a collaborator", () => {
    where.collaborator = false;
    where.path = "/settings";
    render(page);
    expect(screen.getByText("The page behind it")).toBeInTheDocument();
    expect(
      screen.queryByText("This page is not part of your access"),
    ).not.toBeInTheDocument();
  });
});
