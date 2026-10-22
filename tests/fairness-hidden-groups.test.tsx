import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GroupCard } from "@/app/(app)/performance/periods/[id]/fairness/fairness-screen";
import type { ApiFairnessDimension } from "@/lib/api/performance";

/**
 * A dimension with nothing it can show. The API hides a group for one of two
 * reasons and the card has to say which: "small" is under the minimum size,
 * "protects" is a big group held back so the small ones cannot be worked out
 * by subtraction.
 */

const dimension = (
  hidden: ApiFairnessDimension["hidden"],
): ApiFairnessDimension => ({
  key: "gender",
  label: "Gender",
  groups: [],
  hidden,
  notRecorded: 0,
  flags: [],
});

const draw = (hidden: ApiFairnessDimension["hidden"]) =>
  render(
    <GroupCard dimension={dimension(hidden)} averageBp={7000} minGroup={5} />,
  );

describe("a dimension whose groups are all hidden", () => {
  it("keeps the size sentence when every group is simply small", () => {
    draw([
      { label: "Female", people: 3, reason: "small" },
      { label: "Male", people: 2, reason: "small" },
    ]);
    expect(
      screen.getByText(
        "Every group here is under the size it can be shown at.",
      ),
    ).toBeInTheDocument();
  });

  it("names a large group that is hidden to protect the small ones", () => {
    draw([
      { label: "Female", people: 3, reason: "small" },
      { label: "Male", people: 40, reason: "protects" },
    ]);
    expect(
      screen.getByText(
        "Groups under 5 people are hidden, and so is Male, because showing it would reveal the smaller groups by subtraction.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/under the size it can be shown at/)).toBeNull();
  });
});
