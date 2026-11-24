/**
 * U111 (MOB-12): resetting a password on a phone meant copying a link out of
 * Mail. The reset email now carries a six-digit code too, and the web's
 * forgot-password screen takes it: the code and a new password, on the same
 * screen as "Check your email".
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api/client";

const forgotPassword = vi.fn();
const resetPasswordWithCode = vi.fn();
vi.mock("@/lib/api/account", async (original) => ({
  ...(await original<typeof import("@/lib/api/account")>()),
  account: {
    forgotPassword: (...a: unknown[]) => forgotPassword(...a),
    resetPasswordWithCode: (...a: unknown[]) => resetPasswordWithCode(...a),
  },
}));

import { ForgotPasswordScreen } from "@/app/(auth)/forgot-password/forgot-password-screen";

beforeEach(() => {
  forgotPassword.mockReset();
  forgotPassword.mockResolvedValue({
    message: "If that address has an account, a reset email is on its way.",
    passwordReset: null,
  });
  resetPasswordWithCode.mockReset();
});

async function askForEmail() {
  render(<ForgotPasswordScreen />);
  fireEvent.change(screen.getByLabelText(/^Work email/), {
    target: { value: "chidi.nwosu@schull.io" },
  });
  await userEvent.click(screen.getByRole("button", { name: /Email me/ }));
  await screen.findByText(/a reset email is on its way/);
}

function fillCode(code: string, password: string) {
  fireEvent.change(screen.getByLabelText(/^Code from the email/), {
    target: { value: code },
  });
  fireEvent.change(screen.getByLabelText(/^New password/), {
    target: { value: password },
  });
}

describe("resetting a password with the code from the email", () => {
  it("sets the password with the address, the code and the new password", async () => {
    resetPasswordWithCode.mockResolvedValue({ sessionsRevoked: 2 });
    await askForEmail();
    fillCode("482913", "a-new-long-password-1");
    await userEvent.click(
      screen.getByRole("button", { name: "Set new password" }),
    );
    expect(resetPasswordWithCode).toHaveBeenCalledWith(
      "chidi.nwosu@schull.io",
      "482913",
      "a-new-long-password-1",
    );
    expect(await screen.findByText("Password changed")).toBeInTheDocument();
  });

  it("waits for six digits", async () => {
    await askForEmail();
    fillCode("4829", "a-new-long-password-1");
    expect(
      screen.getByRole("button", { name: "Set new password" }),
    ).toBeDisabled();
  });

  it("shows the server's sentence for a wrong code", async () => {
    resetPasswordWithCode.mockRejectedValue(
      new ApiError(
        401,
        "unauthorized",
        "That code is wrong or has expired. Ask for a new one.",
      ),
    );
    await askForEmail();
    fillCode("000000", "a-new-long-password-1");
    await userEvent.click(
      screen.getByRole("button", { name: "Set new password" }),
    );
    expect(
      await screen.findByText(
        "That code is wrong or has expired. Ask for a new one.",
      ),
    ).toBeInTheDocument();
  });

  it("points to the link on a server that cannot take a code yet", async () => {
    resetPasswordWithCode.mockRejectedValue(
      new ApiError(404, "not_found", "Not found."),
    );
    await askForEmail();
    fillCode("482913", "a-new-long-password-1");
    await userEvent.click(
      screen.getByRole("button", { name: "Set new password" }),
    );
    expect(
      await screen.findByText(/Use the link in the email instead/),
    ).toBeInTheDocument();
  });
});
