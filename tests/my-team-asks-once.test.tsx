/**
 * The My team read asked for the team again on every render: its loader was a
 * new function each time, and `useFetched` re-runs when the loader changes. On
 * a real server that was thousands of requests in a minute and a 429 that
 * signed the manager out.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const list = vi.fn();
vi.mock("@/lib/api/team", () => ({
  teamApi: { list: (...a: unknown[]) => list(...a) },
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true }),
}));

import { useMyTeam } from "@/lib/store/team";

function Count() {
  const team = useMyTeam();
  return <p>{team.data ? `${String(team.data.length)} people` : "loading"}</p>;
}

describe("reading my team", () => {
  it("asks the server once", async () => {
    list.mockResolvedValue([]);
    render(<Count />);
    await waitFor(() =>
      expect(screen.getByText("0 people")).toBeInTheDocument(),
    );
    await new Promise((r) => setTimeout(r, 200));
    expect(list).toHaveBeenCalledTimes(1);
  });
});
