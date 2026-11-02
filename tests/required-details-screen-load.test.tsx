import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiRequiredOverview } from "@/lib/api/endpoints";

/**
 * The Required details screen, and what it may say while it waits.
 *
 * The screen drew its own failure card and its own spinner, which is the shape
 * `verify-load-rule` refuses, and `dev`, `test` and `main` went red on it. It reads
 * through `LoadState` now. `tsc` and the gate cannot see what is pinned here: that
 * a read in flight shows a placeholder and none of the content, that a failed read
 * shows the failure and none of the content, that Try again reads as trying and
 * not as the same failure still on screen, and that a refusal is not turned into
 * something else.
 */

let requiredDetails: Mock<
  (signal?: AbortSignal) => Promise<ApiRequiredOverview>
>;
let allowed: boolean;

vi.mock("@/lib/api/endpoints", () => ({
  employees: {
    requiredDetails: (signal?: AbortSignal) => requiredDetails(signal),
    setRequiredDetails: vi.fn(),
  },
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => allowed }));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true }),
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { RequiredDetailsScreen } =
  await import("@/app/(app)/settings/required-details/required-details-screen");

const overview = (
  over: Partial<ApiRequiredOverview> = {},
): ApiRequiredOverview => ({
  required: [{ field: "religion", label: "Religion" }],
  options: [
    { field: "religion", label: "Religion" },
    { field: "phone", label: "Phone number" },
  ],
  outstanding: [
    {
      employeeId: "e-1",
      name: "Ngozi Eze",
      employeeNo: "AHR-0004",
      missing: [{ field: "religion", label: "Religion" }],
    },
  ],
  staff: 12,
  ...over,
});

const mount = () =>
  render(
    <ToastProvider>
      <RequiredDetailsScreen />
    </ToastProvider>,
  );

const CONTENT = "What staff must fill in";
const FAILED = "The required details did not load";
const loading = () => document.querySelector('[aria-busy="true"]');

/** A read that has not answered yet, and the way to answer it. */
const pending = () => {
  let resolve: (value: ApiRequiredOverview) => void = () => {};
  const promise = new Promise<ApiRequiredOverview>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  allowed = true;
  requiredDetails = vi.fn().mockResolvedValue(overview());
});

describe("while the read is in flight", () => {
  it("holds the place and shows none of the content, and does not say it failed", () => {
    requiredDetails.mockReturnValue(pending().promise);
    mount();

    expect(loading()).not.toBeNull();
    expect(
      screen.getByText("Loading the required details"),
    ).toBeInTheDocument();
    expect(screen.queryByText(CONTENT)).not.toBeInTheDocument();
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });
});

describe("after the read has answered", () => {
  it("shows the content, with what is required ticked, and who still has gaps", async () => {
    mount();

    expect(await screen.findByText(CONTENT)).toBeInTheDocument();
    expect(loading()).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Religion" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Phone number" }),
    ).not.toBeChecked();
    expect(screen.getByText("Who still has gaps")).toBeInTheDocument();
    expect(screen.getByText("Ngozi Eze")).toBeInTheDocument();
    expect(screen.getByText(/1 of 12 current staff\./)).toBeInTheDocument();
  });
});

describe("after the read has failed", () => {
  const down = new ApiError(500, "internal", "Something went wrong.");

  it("shows the failure and none of the content, and no placeholder", async () => {
    requiredDetails.mockRejectedValue(down);
    mount();

    expect(await screen.findByText(FAILED)).toBeInTheDocument();
    expect(screen.queryByText(CONTENT)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Who still has gaps")).not.toBeInTheDocument();
    expect(loading()).toBeNull();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("takes the old failure off the screen when Try again is pressed, so it reads as trying", async () => {
    const second = pending();
    requiredDetails
      .mockRejectedValueOnce(down)
      .mockReturnValueOnce(second.promise);
    mount();
    await screen.findByText(FAILED);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    /* Not the same failure left up while the new read is on its way. */
    await waitFor(() =>
      expect(screen.queryByText(FAILED)).not.toBeInTheDocument(),
    );
    expect(loading()).not.toBeNull();
    expect(requiredDetails).toHaveBeenCalledTimes(2);

    second.resolve(overview());
    expect(await screen.findByText(CONTENT)).toBeInTheDocument();
    expect(loading()).toBeNull();
  });

  it("says the person may not see it for a refusal, with no Try again and no content", async () => {
    requiredDetails.mockRejectedValue(
      new ApiError(403, "forbidden", "You need the settings permission."),
    );
    mount();

    expect(
      await screen.findByText("You cannot see the required details"),
    ).toBeInTheDocument();
    expect(screen.queryByText(CONTENT)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });
});

describe("for somebody without the settings permission", () => {
  it("says so, asks for nothing, and never shows a placeholder", () => {
    allowed = false;
    mount();

    expect(
      screen.getByText("Choosing required details is not part of your access"),
    ).toBeInTheDocument();
    expect(requiredDetails).not.toHaveBeenCalled();
    expect(loading()).toBeNull();
  });
});
