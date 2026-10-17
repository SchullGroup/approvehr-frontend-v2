import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HiredSettings } from "@/lib/hiring/hired/model";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * Where the API sends its own wording and availability for the two choices, the screen
 * uses them: the API is the one that knows whether an option is available and why not.
 */

vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/hiring/settings/accepted-offers",
  useSearchParams: () => new URLSearchParams(),
}));

const current = vi.hoisted(() => ({ settings: null as unknown }));
vi.mock("@/lib/hiring/hired/use-hired", () => ({
  useHiredSettings: () => ({
    settings: current.settings as HiredSettings,
    loading: false,
    error: null,
    reload: () => undefined,
    save: async () => current.settings as HiredSettings,
  }),
}));

const { AcceptedOffersScreen } =
  await import("@/app/(app)/hiring/settings/accepted-offers/accepted-offers-screen");

const settings = (over: Partial<HiredSettings>): HiredSettings => ({
  onOfferAccepted: "HIRED_LIST_ONLY",
  effective: "HIRED_LIST_ONLY",
  coreHr: true,
  coreHrReason: null,
  canChange: true,
  options: [
    {
      value: "HIRED_LIST_ONLY",
      label: "Add them to the Hired list",
      description: "Nobody is made an employee when an offer is accepted.",
      available: true,
      unavailableReason: null,
    },
    {
      value: "CREATE_EMPLOYEE",
      label: "Also make their employee record straight away",
      description: "As accepting an offer always used to work.",
      available: true,
      unavailableReason: null,
    },
  ],
  ...over,
});

describe("the API's own choices", () => {
  it("are shown in the API's words", async () => {
    current.settings = settings({});
    renderInToasts(<AcceptedOffersScreen />);
    expect(
      await screen.findByRole("radio", {
        name: /Also make their employee record straight away/,
      }),
    ).toBeEnabled();
    expect(
      screen.getByText("Nobody is made an employee when an offer is accepted."),
    ).toBeInTheDocument();
  });

  it("turn an option off with the API's own reason, not the screen's", async () => {
    current.settings = settings({
      coreHr: false,
      coreHrReason: "Your plan does not include Core HR.",
      options: [
        {
          value: "HIRED_LIST_ONLY",
          label: "Add them to the Hired list",
          description: "Nobody is made an employee.",
          available: true,
          unavailableReason: null,
        },
        {
          value: "CREATE_EMPLOYEE",
          label: "Also make their employee record straight away",
          description: "As it always used to work.",
          available: false,
          unavailableReason:
            "Your plan does not include Core HR, so employee records cannot be made from here.",
        },
      ],
    });
    renderInToasts(<AcceptedOffersScreen />);
    const old = await screen.findByRole("radio", {
      name: /Also make their employee record straight away/,
    });
    expect(old).toBeDisabled();
    expect(
      within(old.closest("div") as HTMLElement).getByText(
        /Your plan does not include Core HR, so employee records cannot be made from here\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Off for your company/)).not.toBeInTheDocument();
  });

  it("are not required: a server that sends none gets the screen's own words", async () => {
    current.settings = settings({});
    (current.settings as HiredSettings).options = undefined as never;
    delete (current.settings as { options?: unknown }).options;
    renderInToasts(<AcceptedOffersScreen />);
    expect(
      await screen.findByRole("radio", {
        name: /Create their employee record at once/,
      }),
    ).toBeEnabled();
  });
});
