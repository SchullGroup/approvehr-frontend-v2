import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { EmailCatalog, StageSetting } from "@/lib/hiring/comms/model";
import type { PipelineGateway } from "@/lib/hiring/pipeline/gateway";

/**
 * A role's stage emails and interview panels.
 *
 * Choosing an email on a stage sends nothing: it means whoever moves a candidate in
 * is asked. A panel belongs to an interview stage and to no other, is replaced as a
 * whole set, and the card says what panelists can and cannot see.
 */

vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({
    people: [
      {
        id: "p1",
        fullName: "Chidi Nwosu",
        jobTitle: "Engineer",
        department: null,
      },
      {
        id: "p2",
        fullName: "Emeka Anyanwu",
        jobTitle: "Designer",
        department: null,
      },
      {
        id: "p3",
        fullName: "Zainab Musa",
        jobTitle: "Analyst",
        department: null,
      },
    ],
    loading: false,
  }),
}));

const { StageComms } = await import("@/components/hiring/stage-comms");

const stages: StageSetting[] = [
  {
    stageId: "s1",
    name: "Applied",
    order: 0,
    type: "APPLIED",
    emailTemplateId: null,
    panel: null,
  },
  {
    stageId: "s2",
    name: "Interview",
    order: 1,
    type: "INTERVIEW",
    emailTemplateId: "t1",
    panel: [
      {
        employeeId: "p1",
        userId: null,
        kind: "EMPLOYEE",
        name: "Chidi Nwosu",
        jobTitle: "Engineer",
      },
    ],
  },
  {
    stageId: "s3",
    name: "Hired",
    order: 2,
    type: "HIRED",
    emailTemplateId: null,
    panel: null,
  },
  {
    stageId: "s4",
    name: "Rejected",
    order: 3,
    type: "REJECTED",
    emailTemplateId: null,
    panel: null,
  },
];

const catalog: EmailCatalog = {
  fields: [],
  kinds: [],
  sender: null,
  templates: [
    {
      id: "t1",
      kind: "INVITE",
      kindLabel: "Invitation to interview",
      name: "Interview invitation",
      subject: "s",
      body: "b",
      isDefault: true,
      archived: false,
      usedByStages: 1,
    },
    {
      id: "t2",
      kind: "STAGE_UPDATE",
      kindLabel: "Update on their application",
      name: "Next stage",
      subject: "s",
      body: "b",
      isDefault: false,
      archived: false,
      usedByStages: 0,
    },
    {
      id: "t3",
      kind: "DECLINE",
      kindLabel: "Not taking them forward",
      name: "Old decline",
      subject: "s",
      body: "b",
      isDefault: false,
      archived: true,
      usedByStages: 0,
    },
  ],
};

const setEmail = vi.fn();
const setPanel = vi.fn();
const gateway = {
  stages: { setEmail, setPanel },
} as unknown as PipelineGateway;
const changed = vi.fn();

beforeEach(() => {
  setEmail.mockReset().mockResolvedValue(undefined);
  setPanel.mockReset().mockResolvedValue([]);
  changed.mockReset();
});

const open = async (canManage = true) => {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <StageComms
        requisitionId="r1"
        gateway={gateway}
        stages={stages}
        catalog={catalog}
        canManage={canManage}
        onChanged={changed}
      />
    </ToastProvider>,
  );
  await user.click(
    screen.getByRole("button", { name: /Stage emails and interview panels/ }),
  );
  return user;
};

describe("the card", () => {
  it("says how many stages send an email and how many have a panel", async () => {
    await open();
    expect(screen.getByText("1 stage sends an email")).toBeInTheDocument();
    expect(screen.getByText("1 panel")).toBeInTheDocument();
  });

  it("says that choosing an email sends nothing", async () => {
    await open();
    expect(
      screen.getByText(/Choosing an email sends nothing/),
    ).toBeInTheDocument();
  });

  it("leaves out Hired and Rejected: nobody is dragged into them", async () => {
    await open();
    expect(
      screen.queryByRole("combobox", { name: /into Hired/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /into Rejected/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /into Applied/ }),
    ).toBeInTheDocument();
  });
});

describe("a stage's email", () => {
  it("offers the company's emails that are not archived, and no email as a choice", async () => {
    await open();
    const select = screen.getByRole("combobox", {
      name: /into Applied/,
    }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual([
      "No email",
      "Interview invitation (invitation to interview)",
      "Next stage (update on their application)",
    ]);
  });

  it("sets the one chosen, and takes it off with no email", async () => {
    const user = await open();
    await user.selectOptions(
      screen.getByRole("combobox", { name: /into Applied/ }),
      "Next stage (update on their application)",
    );
    expect(setEmail).toHaveBeenCalledWith("r1", "s1", "t2");
    expect(
      await screen.findByText("Applied will offer to send Next stage"),
    ).toBeInTheDocument();
    expect(changed).toHaveBeenCalled();

    await user.selectOptions(
      screen.getByRole("combobox", { name: /into Interview/ }),
      "No email",
    );
    expect(setEmail).toHaveBeenLastCalledWith("r1", "s2", null);
  });

  it("shows the API's refusal in the words it wrote, and reloads nothing", async () => {
    setEmail.mockRejectedValue(
      Object.assign(
        new Error("That email template does not exist, or has been archived."),
        {
          name: "ApiError",
        },
      ),
    );
    const user = await open();
    await user.selectOptions(
      screen.getByRole("combobox", { name: /into Applied/ }),
      "Next stage (update on their application)",
    );
    expect(await screen.findByText("That did not work")).toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });

  it("cannot be changed by somebody who may not manage hiring", async () => {
    await open(false);
    expect(
      screen.getByRole("combobox", { name: /into Applied/ }),
    ).toBeDisabled();
  });
});

describe("a stage's panel", () => {
  it("belongs to an interview stage only", async () => {
    await open();
    expect(
      screen.getByRole("list", { name: "Panel for Interview" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Panel for Applied")).not.toBeInTheDocument();
  });

  it("adds somebody by sending the whole set, not just the new name", async () => {
    const user = await open();
    await user.click(
      screen.getByRole("combobox", {
        name: /Add somebody: Panel for Interview/,
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: /Emeka Anyanwu/ }),
    );
    expect(setPanel).toHaveBeenCalledWith("r1", "s2", {
      employeeIds: ["p1", "p2"],
      userIds: [],
    });
    expect(
      await screen.findByText("Emeka Anyanwu is on the Interview panel"),
    ).toBeInTheDocument();
  });

  it("does not offer somebody already on it", async () => {
    const user = await open();
    await user.click(
      screen.getByRole("combobox", {
        name: /Add somebody: Panel for Interview/,
      }),
    );
    expect(
      screen.queryByRole("option", { name: /Chidi Nwosu/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Zainab Musa/ }),
    ).toBeInTheDocument();
  });

  it("takes somebody off, and says what an empty panel means", async () => {
    const user = await open();
    const panel = screen.getByRole("list", { name: "Panel for Interview" });
    await user.click(
      within(panel).getByRole("button", {
        name: /Take Chidi Nwosu off: Panel for Interview/,
      }),
    );
    expect(setPanel).toHaveBeenCalledWith("r1", "s2", {
      employeeIds: [],
      userIds: [],
    });
  });
});
