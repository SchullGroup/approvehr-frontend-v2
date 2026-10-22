import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiCareersSettings } from "@/lib/api/careers";

/**
 * The company's careers settings: how it appears, what applicants are asked to
 * accept, and the confirmation email. The API is the only fake.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/hiring/postings/settings",
  useSearchParams: () => new URLSearchParams(),
}));

let connected = true;
vi.mock("@/lib/api/client", async (original) => {
  const real = await original<typeof import("@/lib/api/client")>();
  return { ...real, tokens: { ...real.tokens, has: () => connected } };
});

vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
  useCan: () => true,
}));

const getSettings = vi.fn();
const updateSettings = vi.fn();
vi.mock("@/lib/api/careers", async (original) => {
  const real = await original<typeof import("@/lib/api/careers")>();
  return {
    ...real,
    careersApi: {
      ...real.careersApi,
      getSettings: (...a: unknown[]) => getSettings(...a),
      updateSettings: (...a: unknown[]) => updateSettings(...a),
    },
  };
});

const { CareersSettingsScreen, changesFrom, problemsWith } =
  await import("@/app/(app)/hiring/postings/settings/careers-settings-screen");

const settings = (
  over: Partial<ApiCareersSettings> = {},
): ApiCareersSettings => ({
  branding: {
    displayName: null,
    name: "Acme Ltd",
    companyName: "Acme Ltd",
    description: null,
    websiteUrl: null,
    accentColor: null,
    logoUrl: null,
  },
  contact: { replyToEmail: null },
  consent: {
    required: false,
    text: "Acme Ltd will use the information in this application to consider you.",
    customText: null,
    url: null,
    version: "default-1",
    isDefault: true,
    needsReview: true,
    reviewNote:
      "This is ApproveHR's standard wording. It has not been reviewed for your company. Have your counsel or data-protection officer read it.",
    standardText:
      "Acme Ltd will use the information in this application to consider you.",
  },
  acknowledgement: {
    enabled: true,
    willSend: false,
    blockedBy: [
      "Add a reply-to address, replies from applicants have to go somewhere.",
    ],
  },
  search: { indexable: true },
  deployment: { fileUploads: true },
  ...over,
});

const mount = () =>
  render(
    <ToastProvider>
      <CareersSettingsScreen />
    </ToastProvider>,
  );

beforeEach(() => {
  connected = true;
  getSettings.mockReset();
  updateSettings.mockReset();
  getSettings.mockResolvedValue(settings());
});

describe("reading the settings", () => {
  it("says the standard notice has not been reviewed for this company, in the API's own words", async () => {
    mount();
    expect(
      await screen.findByText("Not reviewed for your company"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /has not been reviewed for your company\. Have your counsel/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("notice-in-use")).toHaveTextContent(
      "Acme Ltd will use the information",
    );
    expect(
      screen.getByText("What applicants are shown now: the standard wording"),
    ).toBeInTheDocument();
  });

  it("lists, in words, why no confirmation email would go out", async () => {
    mount();
    expect(
      await screen.findByText("No confirmation will be sent right now"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Add a reply-to address/)).toBeInTheDocument();
  });

  it("says a confirmation is queued when nothing blocks it", async () => {
    getSettings.mockResolvedValue(
      settings({
        acknowledgement: { enabled: true, willSend: true, blockedBy: [] },
      }),
    );
    mount();
    expect(
      await screen.findByText(
        /A confirmation email is queued for each new application/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No confirmation will be sent right now"),
    ).not.toBeInTheDocument();
  });

  it("hides the not-reviewed warning once the company has its own notice", async () => {
    getSettings.mockResolvedValue(
      settings({
        consent: {
          ...settings().consent,
          required: true,
          customText:
            "Our own notice, written by our counsel and long enough to be a notice.",
          text: "Our own notice, written by our counsel and long enough to be a notice.",
          isDefault: false,
          needsReview: false,
          reviewNote: null,
          version: "custom-1",
        },
      }),
    );
    mount();
    await screen.findByLabelText(/Your own notice/);
    expect(
      screen.queryByText("Not reviewed for your company"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("What applicants are shown now: your notice"),
    ).toBeInTheDocument();
  });
});

describe("changing them", () => {
  it("sends only what changed, and nothing for what did not", async () => {
    const user = userEvent.setup();
    updateSettings.mockResolvedValue(settings());
    mount();
    await user.type(
      await screen.findByLabelText(/Name on the page/),
      "Acme Payroll",
    );
    await user.click(
      screen.getByRole("switch", {
        name: "Ask applicants to accept the notice",
      }),
    );
    await user.click(screen.getByRole("button", { name: /Save settings/ }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
    expect(updateSettings.mock.calls[0]?.[0]).toEqual({
      displayName: "Acme Payroll",
      consentRequired: true,
    });
  });

  it("sends null to clear a field the company emptied", async () => {
    const user = userEvent.setup();
    getSettings.mockResolvedValue(
      settings({
        branding: {
          ...settings().branding,
          description: "We run payroll.",
          websiteUrl: "https://acme.example",
        },
      }),
    );
    updateSettings.mockResolvedValue(settings());
    mount();
    await user.clear(await screen.findByLabelText(/About the company/));
    await user.clear(screen.getByLabelText(/^Website/));
    await user.click(screen.getByRole("button", { name: /Save settings/ }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalled());
    expect(updateSettings.mock.calls[0]?.[0]).toEqual({
      description: null,
      websiteUrl: null,
    });
  });

  it("will not save a colour that is not a colour, a short notice or a bad email, and says where", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(await screen.findByLabelText(/Accent colour/), "gold");
    await user.type(screen.getByLabelText(/Reply-to address/), "not-an-email");
    await user.type(screen.getByLabelText(/Your own notice/), "Too short.");
    await user.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(
      await screen.findByText("Use a six-digit colour like #2b3990."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A privacy notice is a few sentences/),
    ).toBeInTheDocument();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("puts the API's refusal at the field it names and keeps the work", async () => {
    const user = userEvent.setup();
    updateSettings.mockRejectedValueOnce(
      new ApiError(400, "validation_failed", "Check the settings.", [
        {
          field: "websiteUrl",
          message: "Enter a web address, like https://example.com.",
        },
      ]),
    );
    mount();
    await user.type(await screen.findByLabelText(/^Website/), "nonsense");
    await user.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(
      await screen.findByText("Enter a web address, like https://example.com."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Website/)).toHaveValue("nonsense");
    expect(screen.getAllByText("Unsaved changes").length).toBeGreaterThan(0);
  });

  it("says when a colour is too pale for white text and what the button will use instead", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(await screen.findByLabelText(/Accent colour/), "#ffd700");
    expect(screen.getByTestId("accent-swatch")).toHaveStyle({
      backgroundColor: "#ffd700",
    });
    expect(screen.getByTestId("accent-note")).toHaveTextContent(
      /White text on that colour would be hard to read/,
    );
  });

  it("says nothing of contrast for a colour that is fine", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(await screen.findByLabelText(/Accent colour/), "#2b3990");
    expect(screen.queryByTestId("accent-note")).not.toBeInTheDocument();
  });

  it("lets the company see its own notice before it saves it", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(
      await screen.findByLabelText(/Your own notice/),
      "We will keep your application for twelve months and then delete it.",
    );
    expect(screen.getByTestId("notice-in-use")).toHaveTextContent(
      "We will keep your application for twelve months",
    );
  });
});

describe("a demo", () => {
  it("shows the settings and will not change them", async () => {
    connected = false;
    mount();
    expect(
      await screen.findByText("Read-only in demo mode"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Save settings/ }),
    ).toBeDisabled();
    expect(screen.getByLabelText(/Name on the page/)).toBeDisabled();
    expect(getSettings).not.toHaveBeenCalled();
  });
});

describe("the pure checks", () => {
  const base = {
    displayName: "",
    description: "",
    websiteUrl: "",
    accentColor: "",
    replyToEmail: "",
    privacyNotice: "",
    privacyNoticeUrl: "",
    consentRequired: false,
    ackEmailEnabled: true,
    searchIndexing: true,
  };

  it("sees no change in an untouched draft, and trims what it compares", () => {
    expect(changesFrom(base, { ...base })).toEqual({});
    expect(changesFrom(base, { ...base, displayName: "   " })).toEqual({});
    expect(
      changesFrom(
        { ...base, displayName: "Acme" },
        { ...base, displayName: " Acme " },
      ),
    ).toEqual({});
  });

  it("reports each kind of change under the API's own name for it", () => {
    expect(
      changesFrom(base, {
        ...base,
        accentColor: " #0b6e4f ",
        ackEmailEnabled: false,
        searchIndexing: false,
        privacyNoticeUrl: "https://a.example/privacy",
      }),
    ).toEqual({
      accentColor: "#0b6e4f",
      ackEmailEnabled: false,
      searchIndexing: false,
      privacyNoticeUrl: "https://a.example/privacy",
    });
  });

  it("finds each problem under the field it belongs to", () => {
    expect(problemsWith(base)).toEqual({});
    expect(
      problemsWith({ ...base, displayName: "x".repeat(81) }).displayName,
    ).toMatch(/80 characters/);
    expect(
      problemsWith({ ...base, description: "x".repeat(601) }).description,
    ).toMatch(/600/);
    expect(
      problemsWith({ ...base, privacyNotice: "x".repeat(6001) }).privacyNotice,
    ).toMatch(/6,000/);
  });
});
