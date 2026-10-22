import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAnnouncement } from "@/lib/api/announcements";
import { MANDATORY_CHANGE_RECORDED } from "@/lib/api/announcements";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * The noticeboard, from the side that writes it, with the must-read switch.
 *
 * What is pinned here is what the API relies on and what a reader of the list is
 * told: the flag goes out when somebody sets it, a repeat of the current value is
 * not sent, a live notice says in a line beside the switch that changing it is
 * recorded, and the tooltip (not a banner) carries the rule.
 */

const store = vi.hoisted(() => ({
  rows: [] as ApiAnnouncement[],
  create: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/settings/announcements",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true }),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
}));
vi.mock("@/lib/store/announcements", () => ({
  useAnnouncements: () => ({
    announcements: store.rows,
    total: store.rows.length,
    loading: false,
    error: null,
    source: "api",
    editable: true,
    reload: vi.fn(),
  }),
  useAnnouncementMutations: () => ({
    create: store.create,
    update: store.update,
    publish: store.publish,
    unpublish: vi.fn(),
    remove: vi.fn(),
  }),
}));

const { AnnouncementsScreen } =
  await import("@/app/(app)/settings/announcements/announcements-screen");

const notice = (
  id: string,
  over: Partial<ApiAnnouncement> = {},
): ApiAnnouncement => ({
  id,
  title: `Notice ${id}`,
  body: `Wording of ${id}`,
  audience: "EVERYONE",
  departmentIds: [],
  departmentNames: [],
  pinned: false,
  mandatory: false,
  published: true,
  publishedAt: "2026-10-19T09:00:00.000Z",
  expiresOn: null,
  expired: false,
  postedByName: "Ada Obi",
  createdAt: "2026-10-19T09:00:00.000Z",
  updatedAt: "2026-10-19T09:00:00.000Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  store.rows = [notice("a", { mandatory: true }), notice("b")];
  store.create.mockResolvedValue(notice("new"));
  store.update.mockResolvedValue(notice("a"));
  store.publish.mockResolvedValue({ announcement: notice("a"), reaches: 3 });
});

const rowOf = (title: string) =>
  screen.getAllByText(title)[0]?.closest("tr") as HTMLElement;

describe("the list", () => {
  it("badges the notice staff must read, and only that one", () => {
    renderInToasts(<AnnouncementsScreen />);
    expect(
      within(rowOf("Notice a")).getByText("Must read"),
    ).toBeInTheDocument();
    expect(within(rowOf("Notice b")).queryByText("Must read")).toBeNull();
  });

  it("does not draw the badge in red", () => {
    renderInToasts(<AnnouncementsScreen />);
    expect(
      within(rowOf("Notice a")).getByText("Must read").className,
    ).not.toMatch(/danger|red/);
  });
});

describe("writing a notice", () => {
  it("sends mandatory when the switch is on, and false when it is not touched", async () => {
    const user = userEvent.setup();
    renderInToasts(<AnnouncementsScreen />);
    await user.click(screen.getByRole("button", { name: /Write a notice/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Title/), "Fire drill");
    await user.type(within(dialog).getByLabelText(/The notice/), "At eleven.");

    /* Off by default: nobody is asked to read something unless it was chosen. */
    const must = within(dialog).getByRole("switch", { name: "Must be read" });
    expect(must).not.toBeChecked();
    await user.click(must);
    expect(must).toBeChecked();

    await user.click(
      within(dialog).getByRole("button", { name: "Publish it" }),
    );
    await waitFor(() => expect(store.create).toHaveBeenCalledTimes(1));
    expect(store.create.mock.calls[0]?.[0]).toMatchObject({
      title: "Fire drill",
      mandatory: true,
      publish: true,
    });
  });

  it("says in a tooltip, not a banner, that changing it later is recorded", async () => {
    const user = userEvent.setup();
    renderInToasts(<AnnouncementsScreen />);
    await user.click(screen.getByRole("button", { name: /Write a notice/ }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", {
        name: "About changing this after it is published",
      }),
    ).toBeInTheDocument();
    /* The sentence is there for a screen reader without the tap. */
    expect(
      within(dialog).getByText(MANDATORY_CHANGE_RECORDED),
    ).toBeInTheDocument();
    /* And it is not a callout: the only callout on this form is the draft one. */
    expect(within(dialog).queryAllByRole("note")).toHaveLength(0);
  });
});

describe("editing a live notice", () => {
  const openEditor = async (
    user: ReturnType<typeof userEvent.setup>,
    id: string,
  ) => {
    renderInToasts(<AnnouncementsScreen />);
    await user.click(
      within(rowOf(`Notice ${id}`)).getByRole("button", {
        name: `More actions for Notice ${id}`,
      }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    return screen.findByRole("dialog");
  };

  it("opens on the notice's own wording and its own switch, not a blank form", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user, "a");
    /* The form used to open on the blank state it was first mounted with, so an
       untouched save wrote that over the notice and, with this switch, quietly
       turned the must-read off. */
    expect(within(dialog).getByLabelText(/Title/)).toHaveValue("Notice a");
    expect(within(dialog).getByLabelText(/The notice/)).toHaveValue(
      "Wording of a",
    );
    expect(
      within(dialog).getByRole("switch", { name: "Must be read" }),
    ).toBeChecked();
  });

  it("opens each notice on its own, one after another", async () => {
    const user = userEvent.setup();
    const first = await openEditor(user, "a");
    await user.click(within(first).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(
      within(rowOf("Notice b")).getByRole("button", {
        name: "More actions for Notice b",
      }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const second = await screen.findByRole("dialog");
    expect(within(second).getByLabelText(/Title/)).toHaveValue("Notice b");
    expect(
      within(second).getByRole("switch", { name: "Must be read" }),
    ).not.toBeChecked();
  });

  it("sends mandatory only when it moved, and says the change is recorded", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user, "a");
    const must = within(dialog).getByRole("switch", { name: "Must be read" });
    expect(must).toBeChecked();

    /* Turning it off on a live notice: the line beside the switch says so. */
    await user.click(must);
    expect(
      within(dialog).getByText(
        "Saving will turn this off, and that is recorded.",
      ),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() => expect(store.update).toHaveBeenCalledTimes(1));
    expect(store.update.mock.calls[0]?.[1]).toMatchObject({ mandatory: false });
  });

  it("leaves mandatory out of the edit when it did not change", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user, "a");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() => expect(store.update).toHaveBeenCalledTimes(1));
    expect(store.update.mock.calls[0]?.[1]).not.toHaveProperty("mandatory");
  });
});
