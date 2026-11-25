/**
 * L32 (NC-27): opening the confirmation link a second time said, in red, "This
 * link no longer works", to an owner whose email was already confirmed. When
 * the link is spent and this browser is signed in to an account whose email is
 * confirmed, the screen says so instead.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";

const me = vi.hoisted(() => ({ verifiedAt: null as string | null }));

vi.mock("@/lib/api/account", async (original) => ({
  ...(await original<typeof import("@/lib/api/account")>()),
  account: {
    confirmEmail: () =>
      Promise.reject(
        new ApiError(400, "invalid_token", "That link is no longer valid."),
      ),
    requestEmailVerification: vi.fn(),
  },
}));
vi.mock("@/lib/api/endpoints", async (original) => {
  const actual = await original<typeof import("@/lib/api/endpoints")>();
  return {
    ...actual,
    auth: {
      ...actual.auth,
      me: () => Promise.resolve({ emailVerifiedAt: me.verifiedAt }),
    },
  };
});
vi.mock("@/lib/api/client", async (original) => {
  const actual = await original<typeof import("@/lib/api/client")>();
  return { ...actual, tokens: { ...actual.tokens, has: () => true } };
});

const { VerifyEmailScreen } =
  await import("@/app/(auth)/verify-email/verify-email-screen");

beforeEach(() => {
  me.verifiedAt = null;
});

describe("opening a spent confirmation link", () => {
  it("says it is already confirmed when the account is", async () => {
    me.verifiedAt = "2026-11-23T08:00:00.000Z";
    render(<VerifyEmailScreen token="spent" />);
    expect(await screen.findByText("Already confirmed")).toBeInTheDocument();
    expect(screen.queryByText("This link no longer works")).toBeNull();
  });

  it("still says the link is spent when the account is not confirmed", async () => {
    render(<VerifyEmailScreen token="spent" />);
    expect(
      await screen.findByText("This link no longer works"),
    ).toBeInTheDocument();
  });
});
