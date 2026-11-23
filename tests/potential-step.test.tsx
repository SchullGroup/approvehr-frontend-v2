import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PotentialStep } from "@/app/(focus)/performance/reviews/[id]/answer/focus-steps";

/**
 * The last question of a manager's review: how far could they go. Three answers;
 * the one that drives promotions asks why, and the others do not.
 */
function Harness() {
  const [potential, setPotential] = useState("");
  const [reason, setReason] = useState("");
  return (
    <PotentialStep
      firstName="Ada"
      potential={potential}
      reason={reason}
      onPick={setPotential}
      onClear={() => setPotential("")}
      onReason={setReason}
    />
  );
}

describe("the potential step", () => {
  it("asks in the person's name, with three plain answers", () => {
    render(<Harness />);
    expect(
      screen.getByRole("heading", { name: "How far could Ada go?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Ready for a bigger role/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Could grow in this role/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Happy where they are/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/What you have seen/)).toBeNull();
  });

  it("asks why only for a bigger role", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText(/Could grow in this role/));
    expect(screen.queryByPlaceholderText(/What you have seen/)).toBeNull();
    await user.click(screen.getByLabelText(/Ready for a bigger role/));
    expect(
      screen.getByPlaceholderText(/What you have seen/),
    ).toBeInTheDocument();
  });
});
