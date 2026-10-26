import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTalentPool } from "@/lib/hiring/pipeline/demo-ops";
import { demoPipeline, demoRun } from "@/lib/hiring/pipeline/demo-store";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * The talent pool: people kept on file for another role, across every job.
 *
 * It lists people, not applications, because the next role's recruiter asks "who
 * have we already met", and for each person it lists every role they have been in.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: false,
    isLoading: false,
    user: null,
    organization: undefined,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
const permission = { manage: true };
vi.mock("@/lib/permissions", () => ({
  useCan: () => permission.manage,
  usePermissions: () => ({
    can: () => permission.manage,
    loading: false,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/hiring/talent-pool",
  useSearchParams: () => new URLSearchParams(),
}));

const { TalentPoolScreen } =
  await import("@/app/(app)/hiring/talent-pool/talent-pool-screen");

beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
  permission.manage = true;
});

describe("the talent pool", () => {
  it("lists people once, with the roles they have been in", async () => {
    renderInToasts(<TalentPoolScreen />);
    const roles = await screen.findAllByRole("list", {
      name: /^Roles .* has been in$/,
    });
    expect(roles.length).toBeGreaterThan(0);
    const first = within(roles[0] as HTMLElement).getAllByRole("listitem")[0];
    expect(within(first as HTMLElement).getByRole("link")).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/hiring\/candidates\/app-/),
    );
  });

  it("says it is a list of decisions, and who may see it", async () => {
    permission.manage = false;
    renderInToasts(<TalentPoolScreen />);
    expect(
      await screen.findByText("You cannot see the talent pool"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: /Roles/ }),
    ).not.toBeInTheDocument();
  });

  it("is narrowed by a search, and says nobody matches when nobody does", async () => {
    const user = userEvent.setup();
    renderInToasts(<TalentPoolScreen />);
    await screen.findAllByRole("list", { name: /^Roles/ });
    await user.type(
      screen.getByRole("textbox", { name: "Find somebody in the talent pool" }),
      "zzzzzz",
    );
    expect(await screen.findByText("Nobody matches")).toBeInTheDocument();
  });

  it("takes somebody out after saying their applications are not changed", async () => {
    const user = userEvent.setup();
    renderInToasts(<TalentPoolScreen />);
    const buttons = await screen.findAllByRole("button", {
      name: "Take out of the talent pool",
    });
    const before = buttons.length;
    const name = (buttons[0]?.closest("li") as HTMLElement).querySelector("p")
      ?.textContent as string;
    await user.click(buttons[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Their applications and the tags on them are not changed.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Take out" }));
    expect(
      await screen.findByText(`${name} is out of the talent pool`),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Take out of the talent pool" })
          .length,
      ).toBe(before - 1),
    );
    const book = demoPipeline.current();
    expect(
      book.apps.filter((a) => a.name === name && a.talentPool),
    ).toHaveLength(0);
  });

  it("shows somebody the moment they are kept on file elsewhere", async () => {
    const quiet = demoPipeline
      .current()
      .apps.find((a) => a.outcome === "IN_PROGRESS" && !a.talentPool);
    if (!quiet) throw new Error("no seed");
    demoRun((book) => setTalentPool(book, quiet.id, true));
    renderInToasts(<TalentPoolScreen />);
    expect(await screen.findByText(quiet.name)).toBeInTheDocument();
  });
});
