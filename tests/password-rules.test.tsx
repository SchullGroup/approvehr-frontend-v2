import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PASSWORD_MIN, passwordAccepted } from "@/lib/api/account";
import { PasswordField } from "@/components/portal/password-field";

/**
 * One rule for every account: eight characters, nothing about capitals,
 * numbers or symbols. Anybody who wants more turns on two-factor.
 */

describe("the password rule", () => {
  it("is eight characters", () => {
    expect(PASSWORD_MIN).toBe(8);
    expect(passwordAccepted("abcdefg")).toBe(false);
    expect(passwordAccepted("abcdefgh")).toBe(true);
  });

  it("asks for no capital, number or symbol", () => {
    expect(passwordAccepted("alllowercase")).toBe(true);
    expect(passwordAccepted("12345679")).toBe(true);
  });

  it("still refuses the obvious ones", () => {
    expect(passwordAccepted("password")).toBe(false);
    expect(passwordAccepted("Password1")).toBe(false);
    expect(passwordAccepted("12345678")).toBe(false);
  });
});

function Harness() {
  const [value, setValue] = useState("");
  return (
    <PasswordField
      label="Password"
      autoComplete="new-password"
      value={value}
      onChange={setValue}
    />
  );
}

describe("the password box", () => {
  it("lists the one length rule and ticks it at eight characters", async () => {
    render(<Harness />);
    const box = screen.getByLabelText(/^Password/);

    await userEvent.type(box, "abc");
    expect(screen.getByText("8 characters or more")).toBeInTheDocument();
    expect(screen.getByText("5 to go")).toBeInTheDocument();
    expect(
      screen.queryByText(/uppercase|special character|A number/i),
    ).toBeNull();

    await userEvent.type(box, "defgh");
    expect(screen.queryByText(/to go/)).toBeNull();
  });
});
