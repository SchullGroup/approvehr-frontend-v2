/**
 * U22 (SELF-6, HR-13): a line manager could not open a report's record (it
 * carries pay) and had no team page. "My team" lists the people they lead from
 * the pay-free GET /employees/team, and opens one person's details from the
 * same row.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api/client";
import type { ApiTeamMember } from "@/lib/api/team";

let read: {
  data: ApiTeamMember[] | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
  available: boolean;
};
vi.mock("@/lib/store/team", () => ({ useMyTeam: () => read }));

import { MyTeamScreen } from "@/app/(app)/people/team/team-screen";

const member = (over: Partial<ApiTeamMember> = {}): ApiTeamMember => ({
  id: "e1",
  employeeNo: "AHR-0007",
  name: "Chidi Nwosu",
  email: "chidi.nwosu@schull.io",
  phone: "08031234567",
  jobTitle: "Software Engineer",
  status: "ACTIVE",
  employmentType: "FULL_TIME",
  startDate: "2024-02-01",
  endDate: null,
  probationEndsAt: null,
  department: { id: "d1", name: "Engineering" },
  manager: { id: "m1", name: "Adaeze Okonkwo" },
  workLocation: null,
  onLeaveToday: false,
  upcomingLeave: [],
  leaveBalances: [{ leaveType: "Annual", remaining: 8, entitled: 20 }],
  ...over,
});

beforeEach(() => {
  read = {
    data: [],
    loading: false,
    error: null,
    reload: vi.fn(),
    available: true,
  };
});

describe("My team", () => {
  it("lists the team with what a manager needs and no pay", () => {
    read.data = [
      member(),
      member({ id: "e2", name: "Emeka Anyanwu", onLeaveToday: true }),
    ];
    render(<MyTeamScreen />);
    expect(screen.getByText("Chidi Nwosu")).toBeInTheDocument();
    expect(screen.getByText("Emeka Anyanwu")).toBeInTheDocument();
    expect(screen.getByText("On leave today")).toBeInTheDocument();
    expect(
      screen.getAllByText("8 of 20 Annual days left")[0],
    ).toBeInTheDocument();
    expect(screen.queryByText(/₦/)).toBeNull();
  });

  it("opens a person's details from their row", async () => {
    read.data = [member()];
    render(<MyTeamScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Chidi Nwosu" }));
    expect(screen.getByText("chidi.nwosu@schull.io")).toBeInTheDocument();
    expect(screen.getByText("AHR-0007")).toBeInTheDocument();
  });

  it("says so when nobody reports to the reader", () => {
    read.data = [];
    render(<MyTeamScreen />);
    expect(screen.getByText("Nobody reports to you")).toBeInTheDocument();
  });

  it("does not call a failed read an empty team", () => {
    read.data = null;
    read.error = new ApiError(500, "server_error", "Boom");
    render(<MyTeamScreen />);
    expect(screen.queryByText("Nobody reports to you")).toBeNull();
  });
});
