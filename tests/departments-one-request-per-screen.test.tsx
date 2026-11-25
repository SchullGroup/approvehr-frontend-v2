/**
 * L31 (SELF-26): every component that showed departments fetched the tree for
 * itself, so the KPIs screen asked for /departments seven times on one load.
 * The tree is now one shared answer per screen.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const tree = vi.fn();
vi.mock("@/lib/api/endpoints", async (original) => {
  const actual = await original<typeof import("@/lib/api/endpoints")>();
  return {
    ...actual,
    departments: {
      ...actual.departments,
      tree: (...a: unknown[]) => tree(...a),
    },
  };
});
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true }),
}));

import { useDepartments } from "@/lib/store/departments";

function Names({ label }: { label: string }) {
  const { flat, loading } = useDepartments();
  return (
    <p>
      {label}: {loading ? "loading" : flat.map((d) => d.name).join(",")}
    </p>
  );
}

beforeEach(() => {
  tree.mockReset();
  tree.mockResolvedValue({
    tree: [],
    flat: [{ id: "d1", name: "Engineering" }],
    counts: { departments: 1, people: 0, unassigned: 0 },
  });
});

describe("departments on one screen", () => {
  it("are asked for once, however many components show them", async () => {
    render(
      <>
        <Names label="a" />
        <Names label="b" />
        <Names label="c" />
      </>,
    );
    await waitFor(() =>
      expect(screen.getByText("c: Engineering")).toBeInTheDocument(),
    );
    expect(screen.getByText("a: Engineering")).toBeInTheDocument();
    expect(tree).toHaveBeenCalledTimes(1);
  });
});
