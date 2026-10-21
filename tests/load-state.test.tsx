import { renderHook, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  EmptyState,
  LoadState,
  Stat,
  loadPhase,
  useHasAnswered,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";

/**
 * The one loading and failure rule.
 *
 * While a read is loading: skeletons, and no count and no empty state. After it
 * fails: the failure card, and neither the empty state nor a count. Each of the
 * screens an audit found breaking this handled `loading`, `error` and
 * `rows.length === 0` correctly in isolation — the defect was always the
 * combination — so what is pinned here is the combination.
 */

const serverError = new ApiError(500, "internal", "Something went wrong.");
const forbidden = new ApiError(403, "forbidden", "You need the permission.");

function screenWith(props: {
  loading: boolean;
  error?: unknown;
  hasData?: boolean;
  onRetry?: () => void;
  rows?: string[];
}) {
  const rows = props.rows ?? [];
  return render(
    <LoadState
      loading={props.loading}
      error={props.error ?? null}
      subject="the payslips"
      {...(props.hasData === undefined ? {} : { hasData: props.hasData })}
      {...(props.onRetry ? { onRetry: props.onRetry } : {})}
    >
      <Stat label="Payslips" value={String(rows.length)} />
      {rows.length === 0 ? (
        <EmptyState title="No payslips yet" description="Run payroll." />
      ) : (
        rows.map((row) => <p key={row}>{row}</p>)
      )}
    </LoadState>,
  );
}

describe("loadPhase", () => {
  it("is loading while nothing has answered", () => {
    expect(loadPhase({ loading: true, error: null })).toBe("loading");
  });

  it("is failed once the read has failed", () => {
    expect(loadPhase({ loading: false, error: serverError })).toBe("failed");
  });

  it("is ready only when it has neither", () => {
    expect(loadPhase({ loading: false, error: null })).toBe("ready");
  });

  it("reads a retry as loading, not as the old failure", () => {
    expect(loadPhase({ loading: true, error: serverError })).toBe("loading");
  });

  it("reads a retry as loading even with stale data on screen", () => {
    expect(
      loadPhase({ loading: true, error: serverError, hasData: true }),
    ).toBe("loading");
  });

  it("keeps what is on screen through a reload", () => {
    expect(loadPhase({ loading: true, error: null, hasData: true })).toBe(
      "ready",
    );
  });

  it("lets a failure win over stale data", () => {
    expect(
      loadPhase({ loading: false, error: serverError, hasData: true }),
    ).toBe("failed");
  });
});

describe("LoadState while loading", () => {
  it("shows a skeleton and no count and no empty state", () => {
    screenWith({ loading: true });
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading the payslips")).toBeInTheDocument();
    expect(screen.queryByText("No payslips yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Payslips")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("keeps the rows on screen through a reload when it has data", () => {
    screenWith({ loading: true, hasData: true, rows: ["Ada"] });
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("LoadState after a failure", () => {
  it("shows the failure card and neither the empty state nor the count", () => {
    screenWith({ loading: false, error: serverError });
    expect(screen.getByText("The payslips did not load")).toBeInTheDocument();
    expect(screen.queryByText("No payslips yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Payslips")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("says what is safe, and what usually fixes it", () => {
    screenWith({ loading: false, error: serverError });
    expect(
      screen.getByText("Nothing has been changed or lost."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Try again in a moment/)).toBeInTheDocument();
  });

  it("offers Try again, and it runs the retry", async () => {
    const onRetry = vi.fn();
    screenWith({ loading: false, error: serverError, onRetry });
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("offers no retry for a refusal, and shows the API's own sentence", () => {
    screenWith({ loading: false, error: forbidden, onRetry: vi.fn() });
    expect(screen.getByText("You cannot see the payslips")).toBeInTheDocument();
    expect(screen.getByText("You need the permission.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Try again/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Nothing has been changed or lost."),
    ).not.toBeInTheDocument();
  });

  it("does not let stale data stand in for an answer", () => {
    screenWith({
      loading: false,
      error: serverError,
      hasData: true,
      rows: ["Ada"],
    });
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(screen.getByText("The payslips did not load")).toBeInTheDocument();
  });
});

describe("LoadState once it has answered", () => {
  it("shows the empty state, and its count, when there is genuinely nothing", () => {
    screenWith({ loading: false });
    expect(screen.getByText("No payslips yet")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows the rows", () => {
    screenWith({ loading: false, rows: ["Ada", "Chidi"] });
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Chidi")).toBeInTheDocument();
    expect(screen.queryByText("No payslips yet")).not.toBeInTheDocument();
  });
});

describe("useHasAnswered", () => {
  it("is false until the first answer, and stays true through a reload", () => {
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) => useHasAnswered(loading),
      { initialProps: { loading: true } },
    );
    expect(result.current).toBe(false);

    rerender({ loading: false });
    expect(result.current).toBe(true);

    /* A filter changes the request and `loading` goes true again. What is on
       screen is the previous answer, not a claim made without one. */
    rerender({ loading: true });
    expect(result.current).toBe(true);
  });
});
