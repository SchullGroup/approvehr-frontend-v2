import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RowActions } from "@/components/ui/row-actions";

describe("RowActions available", () => {
  it("leaves an unavailable action out, and the separator that would be left dangling", async () => {
    render(
      <RowActions
        label="More actions for Stage"
        items={[
          { label: "Edit", onSelect: vi.fn() },
          "separator",
          { label: "Remove", onSelect: vi.fn(), available: false },
        ]}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "More actions for Stage" }),
    );
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("draws no button at all when every action is unavailable", () => {
    render(
      <RowActions
        label="More actions"
        items={[{ label: "Remove", available: false }]}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
