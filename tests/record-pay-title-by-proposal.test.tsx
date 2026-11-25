/**
 * U14 (HR-14): pay, job title and department could be typed straight onto a
 * record and saved, skipping the approval a promotion or a rise needs. While
 * editing, a locked field keeps its value read-only with a link to "Propose a
 * change", and Save never sends it.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Employee } from "@/lib/types";

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));

import { EditableSection } from "@/components/people/editable-section";

const employee = {
  id: "e1",
  firstName: "Chidi",
  lastName: "Nwosu",
  jobTitle: "Analyst",
  phone: "08030000000",
} as unknown as Employee;

describe("a locked field", () => {
  it("is read-only while editing, shows its link, and is not saved", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EditableSection
        title="Role"
        employee={employee}
        onSave={onSave}
        fields={[
          {
            key: "jobTitle",
            label: "Job title",
            required: true,
            locked: <button type="button">Propose a change</button>,
          },
          { key: "phone", label: "Phone" },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(screen.queryByDisplayValue("Analyst")).toBeNull();
    expect(screen.getByText("Analyst")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Propose a change" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("08030000000"), {
      target: { value: "08031111111" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ phone: "08031111111" });
  });
});

describe("the record page", () => {
  const record = readFileSync(
    path.resolve(
      import.meta.dirname,
      "../src/app/(app)/people/[id]/record.tsx",
    ),
    "utf8",
  );
  it("locks job title, department and pay behind a proposal", () => {
    expect(record).toMatch(/locked: proposeLink\("PROMOTION"\)/);
    expect(record).toMatch(/locked: proposeLink\("TRANSFER"\)/);
    expect(record).toMatch(/locked: proposeLink\("PAY_CHANGE"\)/);
    expect(record).toContain("<ProposeChangeDialog");
  });
});
