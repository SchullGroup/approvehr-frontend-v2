import {
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { EmailCatalog, StageSetting } from "@/lib/hiring/comms/model";
import type { JobAccess, AccessMember } from "@/lib/hiring/access/model";
import { seatKey, splitSeats } from "@/lib/hiring/comms/seats";
import type { PipelineGateway } from "@/lib/hiring/pipeline/gateway";

/**
 * A company that has recruitment and not Core HR has no staff to put on a panel. Its
 * panelists are the people invited to the job, who have a sign-in and no employee
 * record, so a picker that listed only employees would be empty and could not be used.
 *
 * Who could be asked is staff (when there are any) and the people on this job's list
 * who have an account, each as its own kind of seat so the two can never be mixed up.
 */

const directory = vi.hoisted(() => ({
  people: [] as {
    id: string;
    fullName: string;
    jobTitle: string;
    department: null;
  }[],
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ people: directory.people, loading: false }),
}));

const access = vi.hoisted(() => ({
  members: [] as unknown[],
  get: vi.fn(),
}));
vi.mock("@/lib/hiring/access/use-access", () => ({
  useAccessGateway: () => ({ mode: "api", get: access.get }),
  useAccessVersion: () => 0,
  accessChanged: vi.fn(),
}));

const { usePanelPeople } = await import("@/lib/hiring/access/use-panel-people");
const { StageComms } = await import("@/components/hiring/stage-comms");

const member = (
  over: Partial<AccessMember> & { id: string },
): AccessMember => ({
  userId: null,
  employeeId: null,
  name: "Somebody",
  email: null,
  role: "PANELIST",
  kind: "ACCOUNT",
  status: "ACTIVE",
  since: "2026-10-01T09:00:00.000Z",
  canSeeScores: false,
  seats: { stages: [], interviews: 0 },
  canRevoke: { allowed: true },
  ...over,
});

const jobWith = (members: AccessMember[]): JobAccess => ({
  requisitionId: "r1",
  restricted: false,
  restrictedNote: null,
  scoreVisibility: "HIRING_TEAM",
  members,
  pending: [],
  alsoReach: [],
  alwaysOpen: [],
  canManage: true,
});

beforeEach(() => {
  directory.people = [];
  access.get.mockReset();
});

describe("who could sit on a panel", () => {
  it("is the invited accounts on the job when there are no staff, so the picker is not empty", async () => {
    access.get.mockResolvedValue(
      jobWith([
        member({ id: "g1", userId: "u1", name: "Folasade Ige" }),
        member({
          id: "g2",
          userId: "u2",
          name: "Kunle Adebayo",
          status: "INVITED",
        }),
      ]),
    );
    const { result } = renderHook(() => usePanelPeople("r1"));
    await waitFor(() => expect(result.current.people).toHaveLength(2));
    expect(result.current.people.map((p) => p.id)).toEqual(["u:u1", "u:u2"]);
    expect(result.current.people.map((p) => p.name)).toEqual([
      "Folasade Ige",
      "Kunle Adebayo",
    ]);
    expect(result.current.people[1]?.jobTitle).toBe(
      "Invited, not signed in yet",
    );
  });

  it("lists staff as staff and an account as an account, and a member of staff on the list only once", async () => {
    directory.people = [
      {
        id: "p1",
        fullName: "Chidi Nwosu",
        jobTitle: "Engineer",
        department: null,
      },
    ];
    access.get.mockResolvedValue(
      jobWith([
        /* Staff with a sign-in: already offered from the staff list. */
        member({
          id: "g1",
          userId: "u-chidi",
          employeeId: "p1",
          kind: "STAFF",
          name: "Chidi Nwosu",
        }),
        member({ id: "g2", userId: "u2", name: "Kunle Adebayo" }),
        /* On the list but with no sign-in yet (staff who could not be given one): not offered. */
        member({
          id: "g3",
          userId: null,
          employeeId: "p9",
          kind: "STAFF",
          name: "No Login",
        }),
      ]),
    );
    const { result } = renderHook(() => usePanelPeople("r1"));
    await waitFor(() => expect(result.current.people).toHaveLength(2));
    expect(result.current.people.map((p) => p.id)).toEqual(["e:p1", "u:u2"]);
  });

  it("turns a list of seats back into what a request sends", () => {
    expect(splitSeats(["e:p1", "u:u2", "e:p3", "u:u2"])).toEqual({
      employeeIds: ["p1", "p3"],
      userIds: ["u2"],
    });
    expect(seatKey({ employeeId: null, userId: "u2" })).toBe("u:u2");
    expect(seatKey({ employeeId: "p1", userId: null })).toBe("e:p1");
  });
});

describe("a stage's panel with no staff to choose from", () => {
  const stages: StageSetting[] = [
    {
      stageId: "s2",
      name: "Interview",
      order: 1,
      type: "INTERVIEW",
      emailTemplateId: null,
      panel: [
        {
          employeeId: null,
          userId: "u1",
          kind: "ACCOUNT",
          name: "Folasade Ige",
          jobTitle: "",
        },
      ],
    },
  ];
  const catalog: EmailCatalog = {
    kinds: [],
    templates: [],
    fields: [],
    sender: null,
  } as unknown as EmailCatalog;
  const setPanel = vi.fn();
  const gateway = {
    stages: { setEmail: vi.fn(), setPanel },
  } as unknown as PipelineGateway;

  const open = async () => {
    access.get.mockResolvedValue(
      jobWith([
        member({ id: "g1", userId: "u1", name: "Folasade Ige" }),
        member({ id: "g2", userId: "u2", name: "Kunle Adebayo" }),
      ]),
    );
    setPanel.mockReset().mockResolvedValue([]);
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <StageComms
          requisitionId="r1"
          gateway={gateway}
          stages={stages}
          catalog={catalog}
          canManage
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    );
    await user.click(
      screen.getByRole("button", { name: /Stage emails and interview panels/ }),
    );
    return user;
  };

  it("shows the invited account already on it, by name", async () => {
    await open();
    const panel = screen.getByRole("list", { name: "Panel for Interview" });
    expect(within(panel).getByText("Folasade Ige")).toBeInTheDocument();
  });

  it("offers the other invited people and adds one as an account, keeping the one already there", async () => {
    const user = await open();
    await user.click(
      screen.getByRole("combobox", {
        name: /Add somebody: Panel for Interview/,
      }),
    );
    /* Folasade is already on it: not offered again. */
    expect(screen.queryByRole("option", { name: /Folasade Ige/ })).toBeNull();
    await user.click(
      await screen.findByRole("option", { name: /Kunle Adebayo/ }),
    );
    expect(setPanel).toHaveBeenCalledWith("r1", "s2", {
      employeeIds: [],
      userIds: ["u1", "u2"],
    });
  });

  it("takes an account off by sending the accounts that remain, and no employee at all", async () => {
    const user = await open();
    const panel = screen.getByRole("list", { name: "Panel for Interview" });
    await user.click(
      within(panel).getByRole("button", {
        name: /Take Folasade Ige off: Panel for Interview/,
      }),
    );
    expect(setPanel).toHaveBeenCalledWith("r1", "s2", {
      employeeIds: [],
      userIds: [],
    });
  });
});
