import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * How long rejected and withdrawn candidates are kept, in a demo.
 *
 * The default is to keep everybody and no number is suggested: how long a company
 * may keep a rejected applicant's details is its own decision. Setting a period asks
 * first and says what will happen, nothing is deleted for a week after it is set, and
 * the page shows what a period would do before that week is over.
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
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/hiring/settings/retention",
  useSearchParams: () => new URLSearchParams(),
}));

const { RetentionScreen } =
  await import("@/app/(app)/hiring/settings/retention/retention-screen");

beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
});

const open = async () => {
  renderInToasts(<RetentionScreen />);
  await screen.findByText("Keep rejected candidates for");
};

const months = () => screen.getByRole("textbox", { name: /Months/ });

describe("the default", () => {
  it("keeps everybody, and says the number is not ours to choose", async () => {
    await open();
    expect(
      screen.getByText(
        /By default they are kept\. How long is right is a decision for your company and its legal advice, so none is suggested\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nobody is deleted. Set a number of months to start."),
    ).toBeInTheDocument();
    expect(months()).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Keep everybody" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("What this period would do"),
    ).not.toBeInTheDocument();
  });

  it("says what is deleted and what never is", async () => {
    await open();
    expect(screen.getByText("Deleted, for good")).toBeInTheDocument();
    expect(screen.getByText("Never deleted this way")).toBeInTheDocument();
    expect(
      screen.getByText("Anybody you have kept in the talent pool"),
    ).toBeInTheDocument();
    expect(screen.getByText("Anybody who was hired")).toBeInTheDocument();
  });
});

describe("choosing a period", () => {
  it("will not take a number that is not whole months from 1 to 120", async () => {
    const user = userEvent.setup();
    await open();
    for (const bad of ["0", "1.5", "121", "twelve"]) {
      await user.clear(months());
      await user.type(months(), bad);
      expect(
        screen.getByText("A whole number of months, 1 to 120."),
        bad,
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Set this period" }),
      ).toBeDisabled();
    }
  });

  it("asks before it sets one, and says what it will do", async () => {
    const user = userEvent.setup();
    await open();
    await user.type(months(), "24");
    await user.click(screen.getByRole("button", { name: "Set this period" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Delete rejected candidates after 24 months?",
    });
    expect(dialog).toHaveTextContent("deleted for good");
    expect(dialog).toHaveTextContent("nothing is deleted in the first week");
    /* Asking changed nothing. */
    expect(demoPipeline.current().retention.months).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(demoPipeline.current().retention.months).toBeNull();
  });

  it("sets it once confirmed, starts the week of grace, and shows what it would do", async () => {
    const user = userEvent.setup();
    await open();
    await user.type(months(), "6");
    await user.click(screen.getByRole("button", { name: "Set this period" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Set this period",
      }),
    );
    expect(
      await screen.findByText("Rejected candidates are kept for 6 months"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nothing is deleted until a week from now."),
    ).toBeInTheDocument();
    expect(demoPipeline.current().retention.months).toBe(6);

    expect(
      await screen.findByText(
        /Nothing is deleted before 26 Aug 2026, a week after the period was set \(7 days\)/,
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("What this period would do"),
    ).toBeInTheDocument();
    expect(screen.getByText("Due now")).toBeInTheDocument();
    expect(screen.getByText("Kept in the talent pool")).toBeInTheDocument();
  });

  it("says plainly when the deployment only reports what it would delete", async () => {
    const user = userEvent.setup();
    await open();
    await user.type(months(), "6");
    await user.click(screen.getByRole("button", { name: "Set this period" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Set this period",
      }),
    );
    expect(
      await screen.findByText(
        "This deployment only reports what it would delete. It does not delete anybody yet.",
      ),
    ).toBeInTheDocument();
  });

  it("goes back to keeping everybody with one press, and the grace goes with it", async () => {
    const user = userEvent.setup();
    await open();
    await user.type(months(), "6");
    await user.click(screen.getByRole("button", { name: "Set this period" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Set this period",
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Keep everybody" }),
    );
    expect(
      await screen.findByText("Rejected candidates are kept again"),
    ).toBeInTheDocument();
    expect(demoPipeline.current().retention).toEqual({
      months: null,
      setAt: null,
    });
    await waitFor(() =>
      expect(
        screen.queryByText("What this period would do"),
      ).not.toBeInTheDocument(),
    );
  });
});
