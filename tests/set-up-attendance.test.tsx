import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let state = {
  locations: [] as unknown[],
  loading: false,
  error: null as unknown,
};
vi.mock("@/lib/store/attendance", async (orig) => ({
  ...(await orig<typeof import("@/lib/store/attendance")>()),
  useWorkLocations: () => state,
}));

import { SetUpAttendance } from "@/app/(app)/people/attendance/attendance-screen";

describe("Set up attendance", () => {
  it("offers one next step when there is no office", () => {
    state = { locations: [], loading: false, error: null };
    render(<SetUpAttendance />);
    expect(screen.getByRole("link", { name: "Add office" })).toHaveAttribute(
      "href",
      "/settings/locations",
    );
  });
  it("says nothing while loading, on a failed read, or once an office exists", () => {
    for (const next of [
      { locations: [], loading: true, error: null },
      { locations: [], loading: false, error: new Error("x") },
      { locations: [{}], loading: false, error: null },
    ]) {
      state = next;
      const { container, unmount } = render(<SetUpAttendance />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
