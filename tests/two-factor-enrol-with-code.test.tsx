/**
 * U10 (NC-3): turning two-factor on is two steps now. The API emails a code
 * first, and switches two-factor on only once that code is typed, so somebody
 * whose email does not work cannot lock themselves out. The company switch no
 * longer decides sign-in: a person who turns it on is always asked for a code.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api/client";

const sendEnrolCode = vi.fn();
const enrolTwoFactor = vi.fn();
vi.mock("@/lib/api/endpoints", async (original) => ({
  ...(await original<typeof import("@/lib/api/endpoints")>()),
  auth: {
    twoFactorStatus: async () => ({
      enabled: false,
      enabledAt: null,
      recoveryCodesLeft: 0,
      emailWorks: true,
    }),
    sendTwoFactorEnrolCode: (...a: unknown[]) => sendEnrolCode(...a),
    enrolTwoFactor: (...a: unknown[]) => enrolTwoFactor(...a),
    disableTwoFactor: vi.fn(),
  },
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true }),
}));
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: () => true,
}));
vi.mock("@/lib/store/features", () => ({
  useFeatureSettings: () => ({
    flags: { twoFactor: false },
    loading: false,
    editable: true,
    setFeature: vi.fn(),
    setStepUpActions: vi.fn(),
    stepUpActions: [],
  }),
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SecurityScreen } from "@/app/(app)/settings/security/security-screen";

beforeEach(() => {
  sendEnrolCode.mockReset();
  enrolTwoFactor.mockReset();
  sendEnrolCode.mockResolvedValue({
    challengeId: "c1",
    expiresAt: "2026-11-24T10:10:00Z",
    delivery: "email",
  });
});

async function start() {
  render(<SecurityScreen />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Turn on two-factor" }),
  );
}

describe("turning two-factor on", () => {
  it("emails a code first and turns on only once it is typed", async () => {
    enrolTwoFactor.mockResolvedValue({
      recoveryCodes: ["aaaa-bbbb"],
      enabledAt: "2026-11-24T10:00:00Z",
    });
    await start();
    expect(sendEnrolCode).toHaveBeenCalledTimes(1);
    expect(enrolTwoFactor).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^Code from the email/), {
      target: { value: "482913" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Turn it on" }));
    expect(enrolTwoFactor).toHaveBeenCalledWith("c1", "482913");
    expect(await screen.findByText("aaaa-bbbb")).toBeInTheDocument();
  });

  it("stays off and says why when the code is wrong", async () => {
    enrolTwoFactor.mockRejectedValue(
      new ApiError(
        401,
        "unauthorized",
        "That code is wrong or has expired. Ask for a new one.",
      ),
    );
    await start();
    fireEvent.change(screen.getByLabelText(/^Code from the email/), {
      target: { value: "000000" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Turn it on" }));
    expect(
      await screen.findByText(
        "That code is wrong or has expired. Ask for a new one.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("aaaa-bbbb")).toBeNull();
  });

  it("does not offer the company switch as a sign-in setting", async () => {
    render(<SecurityScreen />);
    await screen.findByRole("button", { name: "Turn on two-factor" });
    expect(screen.queryByText("Ask for a code at sign-in")).toBeNull();
  });
});
