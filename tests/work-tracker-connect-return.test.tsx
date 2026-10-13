import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Trello's return page.
 *
 * Trello puts the token in the URL fragment, which no server ever sees, so
 * this page is the only thing standing between Trello and the API. Three
 * things matter: it sends the token and the signed state it was given, it
 * wipes the token out of the address bar before anything else happens, and
 * it follows the API's answer rather than deciding where to go itself.
 */

const completeToken =
  vi.fn<
    (body: {
      state: string;
      token?: string;
      error?: string;
    }) => Promise<{ redirect: string }>
  >();

vi.mock("@/lib/api/work-trackers", () => ({
  workTrackersApi: { completeToken: (body: never) => completeToken(body) },
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const replace = vi.fn();

beforeEach(() => {
  completeToken.mockReset();
  replace.mockReset();
  window.history.replaceState(
    null,
    "",
    "/settings/integrations/connect-return?state=signed.state#token=secret-token",
  );
  vi.spyOn(window, "location", "get").mockReturnValue({
    ...window.location,
    hash: "#token=secret-token",
    search: "?state=signed.state",
    pathname: "/settings/integrations/connect-return",
    replace,
  } as Location);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConnectReturn", () => {
  it("posts the token with its state, clears the address bar, and follows the answer", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    completeToken.mockResolvedValue({
      redirect: "/settings/integrations?workTracker=connected&connectionId=c1",
    });
    const { ConnectReturn } =
      await import("@/app/(app)/settings/integrations/connect-return/connect-return");
    render(<ConnectReturn />);

    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/settings/integrations/connect-return",
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/settings/integrations?workTracker=connected&connectionId=c1",
      ),
    );
    expect(completeToken).toHaveBeenCalledWith({
      state: "signed.state",
      token: "secret-token",
    });
  });

  it("says so, with a way back, when the API refuses", async () => {
    completeToken.mockRejectedValue(new Error("boom"));
    const { ConnectReturn } =
      await import("@/app/(app)/settings/integrations/connect-return/connect-return");
    render(<ConnectReturn />);
    expect(
      await screen.findByText(/Something went wrong finishing the connection/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to integrations" }),
    ).toHaveAttribute("href", "/settings/integrations");
    expect(replace).not.toHaveBeenCalled();
  });
});
