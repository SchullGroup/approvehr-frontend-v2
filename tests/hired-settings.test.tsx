import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoHired } from "@/lib/hiring/hired/demo-store";
import { book, useBook } from "./hired-helpers";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * What happens when somebody accepts an offer.
 *
 * This used to have no choice: accepting created the employee record in the same
 * moment. A company that was relying on that is looking at a changed product, so the
 * page says what the default is now, what the old behaviour is, and where Core HR
 * decides what is possible.
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
const permission = vi.hoisted(() => ({ manage: true }));
vi.mock("@/lib/permissions", () => ({
  useCan: () => permission.manage,
  usePermissions: () => ({ can: () => permission.manage, loading: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/hiring/settings/accepted-offers",
  useSearchParams: () => new URLSearchParams(),
}));

const { AcceptedOffersScreen } =
  await import("@/app/(app)/hiring/settings/accepted-offers/accepted-offers-screen");

beforeEach(() => {
  permission.manage = true;
  useBook(book());
});

const choice = (name: RegExp) =>
  screen.getByRole("radio", { name }) as HTMLInputElement;

/** The one-sentence summary under the options. */
const sentence = () =>
  screen.getByText(
    (_, element) =>
      element?.tagName === "P" &&
      (element.textContent ?? "").startsWith("With this choice:"),
  );

describe("the Accepted offers setting", () => {
  it("says accepting now stops at the Hired list, and what it used to do", async () => {
    renderInToasts(<AcceptedOffersScreen />);
    expect(
      await screen.findByText("How accepting an offer works now"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Before the Hired list existed it also created the employee record straight away/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /the people who became employees show as Employee created/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open the Hired list" }),
    ).toHaveAttribute("href", "/hiring/hired");
  });

  it("explains both options in full, with the default chosen", async () => {
    renderInToasts(<AcceptedOffersScreen />);
    await screen.findByText("How accepting an offer works now");
    const list = choice(/Add them to the Hired list/);
    const old = choice(/Create their employee record at once/);
    expect(list).toBeChecked();
    expect(old).not.toBeChecked();
    expect(
      screen.getByText(/Nothing is created until you do/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/as it did before the Hired list existed/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Needs Core HR/)).toBeInTheDocument();
  });

  it("shows the current Core HR state, and what this choice does in one sentence", async () => {
    renderInToasts(<AcceptedOffersScreen />);
    expect(await screen.findByText("Core HR is on")).toBeInTheDocument();
    expect(sentence()).toHaveTextContent(
      "With this choice: They are added to the Hired list. No employee record is created yet.",
    );
  });

  it("changes the sentence as the choice changes, and saves only on Save", async () => {
    const user = userEvent.setup();
    renderInToasts(<AcceptedOffersScreen />);
    await screen.findByText("How accepting an offer works now");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await user.click(choice(/Create their employee record at once/));
    expect(sentence()).toHaveTextContent(
      "With this choice: They are added to the Hired list and their employee record is created now.",
    );
    expect(demoHired.current().settings.onOfferAccepted).toBe(
      "HIRED_LIST_ONLY",
    );

    await user.click(save);
    expect(
      await screen.findByText("Accepted offers saved"),
    ).toBeInTheDocument();
    expect(demoHired.current().settings.onOfferAccepted).toBe(
      "CREATE_EMPLOYEE",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(),
    );
  });

  it("discards a change without saving it", async () => {
    const user = userEvent.setup();
    renderInToasts(<AcceptedOffersScreen />);
    await screen.findByText("How accepting an offer works now");
    await user.click(choice(/Create their employee record at once/));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(choice(/Add them to the Hired list/)).toBeChecked();
    expect(demoHired.current().settings.onOfferAccepted).toBe(
      "HIRED_LIST_ONLY",
    );
  });
});

describe("a company that kept the old behaviour", () => {
  beforeEach(() => {
    useBook(
      book({ settings: { onOfferAccepted: "CREATE_EMPLOYEE", coreHr: true } }),
    );
  });

  it("is told plainly that accepting an offer still makes the employee record, and what is new for others", async () => {
    renderInToasts(<AcceptedOffersScreen />);
    expect(
      await screen.findByText("Accepting an offer makes the employee record"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("How accepting an offer works now"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Companies that are new to hiring now start with the Hired list alone/,
      ),
    ).toBeInTheDocument();
    expect(choice(/Create their employee record at once/)).toBeChecked();
    expect(sentence()).toHaveTextContent(
      "With this choice: They are added to the Hired list and their employee record is created now.",
    );
  });

  it("can switch to the Hired list alone", async () => {
    const user = userEvent.setup();
    renderInToasts(<AcceptedOffersScreen />);
    await screen.findByText("Accepting an offer makes the employee record");
    await user.click(choice(/Add them to the Hired list/));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Accepted offers saved"),
    ).toBeInTheDocument();
    expect(demoHired.current().settings.onOfferAccepted).toBe(
      "HIRED_LIST_ONLY",
    );
  });

  it("says what really happens when the plan has since lost Core HR", async () => {
    useBook(
      book({ settings: { onOfferAccepted: "CREATE_EMPLOYEE", coreHr: false } }),
    );
    renderInToasts(<AcceptedOffersScreen />);
    await screen.findByText("Accepting an offer makes the employee record");
    expect(
      screen.getByText(
        /no longer includes Core HR, though, so for now accepting an offer only adds the person to the Hired list/,
      ),
    ).toBeInTheDocument();
  });
});

describe("without Core HR", () => {
  beforeEach(() => {
    useBook(
      book({ settings: { onOfferAccepted: "HIRED_LIST_ONLY", coreHr: false } }),
    );
  });

  it("says so, says people stay on the list, and turns the old behaviour off with the reason", async () => {
    renderInToasts(<AcceptedOffersScreen />);
    expect(await screen.findByText("Core HR is not on")).toBeInTheDocument();
    expect(
      screen.getByText(/there are no employee records to create/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/People stay on the Hired list/),
    ).toBeInTheDocument();
    const old = choice(/Create their employee record at once/);
    expect(old).toBeDisabled();
    expect(
      screen.getByText(/Off for your company, because it does not use Core HR/),
    ).toBeInTheDocument();
    expect(choice(/Add them to the Hired list/)).toBeChecked();
  });

  it("says what really happens for a company that chose the old behaviour and then lost Core HR", async () => {
    useBook(
      book({ settings: { onOfferAccepted: "CREATE_EMPLOYEE", coreHr: false } }),
    );
    renderInToasts(<AcceptedOffersScreen />);
    await screen.findByText("Core HR is not on");
    expect(sentence()).toHaveTextContent(
      "No employee record is created, because your company does not use Core HR.",
    );
  });
});

describe("who may change it", () => {
  it("is kept to whoever hires, and says why", async () => {
    permission.manage = false;
    renderInToasts(<AcceptedOffersScreen />);
    expect(
      await screen.findByText("You cannot change these"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("has its own tab in Hiring settings", async () => {
    renderInToasts(<AcceptedOffersScreen />);
    await screen.findByText("How accepting an offer works now");
    const tabs = screen.getAllByRole("link", { name: "Accepted offers" });
    expect(tabs.length).toBeGreaterThan(0);
    expect(
      within(tabs[0] as HTMLElement).getByText("Accepted offers"),
    ).toBeVisible();
  });
});
