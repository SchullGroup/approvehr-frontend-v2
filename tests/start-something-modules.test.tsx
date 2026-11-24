import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * "Start something" offers only what the company has switched on: a company
 * that does not use hiring or departments is not shown "Post a job advert" or
 * "Add a department", and neither is one whose flags have not answered yet.
 */

const world = vi.hoisted(() => ({
  features: {} as Record<string, boolean | undefined>,
}));

vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({
    permissions: new Set(["MANAGE_HIRING", "MANAGE_SETTINGS", "EDIT_RECORDS"]),
  }),
}));
vi.mock("@/lib/store/features", () => ({
  useFeatures: () => ({ loading: false, ...world.features }),
}));

const { QuickActions } = await import("@/app/(app)/dashboard/quick-actions");

async function open() {
  render(<QuickActions />);
  await userEvent.click(
    screen.getByRole("button", { name: /Start something/ }),
  );
}

describe("Start something", () => {
  it("offers the advert and the department when those modules are on", async () => {
    world.features = { hiring: true, departments: true };
    await open();
    expect(screen.getByText("Post a job advert")).toBeInTheDocument();
    expect(screen.getByText("Add a department")).toBeInTheDocument();
  });

  it("hides both when the modules are off", async () => {
    world.features = { hiring: false, departments: false };
    await open();
    expect(screen.queryByText("Post a job advert")).toBeNull();
    expect(screen.queryByText("Add a department")).toBeNull();
    expect(screen.getByText("Add an employee")).toBeInTheDocument();
  });

  it("hides them while the answer is not known either", async () => {
    world.features = {};
    await open();
    expect(screen.queryByText("Post a job advert")).toBeNull();
    expect(screen.queryByText("Add a department")).toBeNull();
  });
});
