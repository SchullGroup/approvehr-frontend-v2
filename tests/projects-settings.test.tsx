import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import type { ProjectData } from "@/lib/projects/types";
import { contextFor, fakeActions, sampleData } from "./projects-fixture";

/**
 * Project settings: the workflow editor's rules said out loud, the members, the
 * danger zone, and a page that is read-only for everybody but the lead.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/projects/pj-chk",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({
    flat: [
      { id: "d-eng", name: "Engineering", archived: false },
      { id: "d-old", name: "Closed down", archived: true },
    ],
  }),
}));

const { SettingsView } =
  await import("@/app/(app)/projects/[id]/settings-view");

function renderSettings(
  overrides: Partial<ProjectContextValue> = {},
  data: ProjectData = sampleData(),
) {
  const ctx = contextFor(data, overrides);
  const actions = ctx.actions as unknown as ReturnType<typeof fakeActions>;
  render(
    <ProjectProvider value={ctx}>
      <SettingsView />
    </ProjectProvider>,
  );
  return { ctx, actions, data };
}

beforeEach(() => {
  push.mockClear();
});

describe("who can change settings", () => {
  it("turns everything off for somebody who is not the lead, and says why", () => {
    renderSettings({ canManage: false });
    expect(
      screen.getByText(
        "Only the project lead and people who manage employee records can change settings.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Status 1 name")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save workflow" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete project" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add a member")).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Project lead" }),
    ).toBeDisabled();
  });

  it("leaves it all open for the lead", () => {
    renderSettings();
    expect(screen.queryByText(/Only the project lead/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Status 1 name")).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Delete project" }),
    ).toBeInTheDocument();
  });
});

describe("the workflow editor", () => {
  it("lists the statuses in order with their categories and limits", () => {
    renderSettings();
    expect(screen.getByLabelText("Status 2 name")).toHaveValue("In Progress");
    expect(screen.getByLabelText("Status 2 category")).toHaveValue(
      "IN_PROGRESS",
    );
    expect(screen.getByLabelText("Status 2 WIP limit")).toHaveValue(5);
    expect(screen.getByLabelText("Status 1 WIP limit")).toHaveValue(null);
  });

  it("refuses to remove a status that has issues, and says how many, on press", async () => {
    renderSettings();
    expect(screen.queryByText(/issues are in Done/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Done" }));
    expect(
      screen.getByText(
        /issues are in Done\. Move them to another status first\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Status 4 name")).toHaveValue("Done");
  });

  it("starts with nothing to save, and saves a new status without an id", async () => {
    const { actions } = renderSettings();
    const save = screen.getByRole("button", { name: "Save workflow" });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Add a status" }));
    /* A status with no name is not savable yet. */
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Every status needs a name",
    );
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Status 4 name"), "Blocked");
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(actions.saveWorkflow).toHaveBeenCalledTimes(1));
    const sent = actions.saveWorkflow.mock.calls[0]![0] as {
      id?: string;
      name: string;
    }[];
    expect(sent.map((s) => s.name)).toEqual([
      "To Do",
      "In Progress",
      "In Review",
      "Blocked",
      "Done",
    ]);
    expect(sent[3]!.id).toBeUndefined();
    expect(sent[0]!.id).toBeDefined();
  });

  it("will not save with the last Done category taken away", async () => {
    renderSettings();
    await userEvent.selectOptions(
      screen.getByLabelText("Status 4 category"),
      "TODO",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Keep at least one Done status",
    );
    expect(
      screen.getByRole("button", { name: "Save workflow" }),
    ).toBeDisabled();
  });

  it("will not save a WIP limit of zero", async () => {
    renderSettings();
    const wip = screen.getByLabelText("Status 2 WIP limit");
    await userEvent.clear(wip);
    await userEvent.type(wip, "0");
    expect(screen.getByRole("alert")).toHaveTextContent("WIP limit");
    expect(
      screen.getByRole("button", { name: "Save workflow" }),
    ).toBeDisabled();
  });

  it("reorders, and sends the new order", async () => {
    const { actions } = renderSettings();
    await userEvent.click(
      screen.getByRole("button", { name: "Move In Review up" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save workflow" }),
    );
    await waitFor(() => expect(actions.saveWorkflow).toHaveBeenCalled());
    const names = (
      actions.saveWorkflow.mock.calls[0]![0] as { name: string }[]
    ).map((s) => s.name);
    expect(names).toEqual(["To Do", "In Review", "In Progress", "Done"]);
  });

  it("discards an edit and goes back to what is saved", async () => {
    renderSettings();
    await userEvent.type(screen.getByLabelText("Status 1 name"), " more");
    await userEvent.click(
      screen.getByRole("button", { name: "Discard changes" }),
    );
    expect(screen.getByLabelText("Status 1 name")).toHaveValue("To Do");
    expect(
      screen.getByRole("button", { name: "Save workflow" }),
    ).toBeDisabled();
  });

  it("shows the API's refusal under the editor and keeps the draft", async () => {
    const { actions } = renderSettings();
    actions.saveWorkflow.mockResolvedValueOnce({
      ok: false,
      message: "That workflow is not allowed.",
      error: null,
    });
    await userEvent.type(screen.getByLabelText("Status 1 name"), "x");
    await userEvent.click(
      screen.getByRole("button", { name: "Save workflow" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("not allowed");
    expect(screen.getByLabelText("Status 1 name")).toHaveValue("To Dox");
  });
});

describe("details", () => {
  it("refuses to change the board type while a sprint is active, in words", async () => {
    const { actions } = renderSettings();
    await userEvent.selectOptions(
      screen.getByLabelText("Board type"),
      "KANBAN",
    );
    expect(
      screen.getByText(
        "Complete the active sprint before changing the board type.",
      ),
    ).toBeInTheDocument();
    expect(actions.updateProject).not.toHaveBeenCalled();
  });

  it("changes the colour", async () => {
    const { actions } = renderSettings();
    await userEvent.click(screen.getByRole("radio", { name: "Teal" }));
    expect(actions.updateProject).toHaveBeenCalledWith({ color: "#0F766E" });
  });

  it("offers the live departments only", () => {
    renderSettings();
    const select = screen.getByLabelText(/Department/);
    expect(
      within(select).queryByRole("option", { name: "Closed down" }),
    ).not.toBeInTheDocument();
    expect(
      within(select).getByRole("option", { name: "Engineering" }),
    ).toBeInTheDocument();
  });

  it("says the key cannot change", () => {
    renderSettings();
    expect(
      screen.getByText(/The key cannot change after the project is created/),
    ).toBeInTheDocument();
  });
});

describe("members", () => {
  it("lists the members with the lead marked, and no way to remove the lead", () => {
    renderSettings();
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove Adaeze Okonkwo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Chidi Nwosu" }),
    ).toBeInTheDocument();
  });

  it("removes a member by sending the rest", async () => {
    const { actions, data } = renderSettings();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Chidi Nwosu" }),
    );
    expect(actions.setMembers).toHaveBeenCalledWith(
      data.project.memberIds.filter((id) => id !== "p-03"),
    );
  });
});

describe("deleting the project", () => {
  it("needs the key typed before it will delete, then deletes and leaves", async () => {
    const { actions } = renderSettings();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete project" }),
    );
    const modal = within(screen.getByRole("dialog"));
    const go = modal.getByRole("button", { name: "Delete forever" });
    expect(go).toBeDisabled();
    await userEvent.type(modal.getByLabelText(/Type CHK to confirm/), "chk");
    expect(go).toBeEnabled();
    await userEvent.click(go);
    await waitFor(() => expect(actions.deleteProject).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects"));
  });

  it("starts with an empty box every time it opens", async () => {
    renderSettings();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete project" }),
    );
    await userEvent.type(screen.getByLabelText(/Type CHK to confirm/), "CH");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete project" }),
    );
    expect(screen.getByLabelText(/Type CHK to confirm/)).toHaveValue("");
  });
});
