import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * Four settings screens on the one loading and failure rule.
 *
 * What an audit found: the audit log printed "Changes 0 / People 0" and
 * "Nothing recorded yet" while it loaded and after it failed, which is the one
 * log whose whole purpose is to say what happened; the work-locations screen
 * printed "Locations 0" and "No work locations yet" under its failure card; the
 * webhook list said "No endpoints yet" under its failure; the job-role catalogue
 * said "No job roles yet" for a catalogue that never loaded.
 */

const serverError = new ApiError(500, "internal", "Something went wrong.");

const read = () => ({
  loading: false,
  error: null as unknown,
  reload: () => {},
});

const state = vi.hoisted(() => ({
  audit: {
    entries: [] as unknown[],
    total: 0,
    hasMore: false,
    live: true,
    now: new Date("2026-10-22T09:00:00Z"),
    loading: false,
    error: null as unknown,
    reload: () => {},
    showMore: () => {},
  },
  locations: {
    locations: [] as unknown[],
    source: "api" as string,
    loading: false,
    error: null as unknown,
    reload: () => {},
  },
  webhooks: {
    rows: [] as unknown[],
    total: 0,
    hasMore: false,
    loading: false,
    error: null as unknown,
    reload: () => {},
  },
  jobRoles: {
    roles: [] as unknown[],
    readOnly: false,
    loading: false,
    error: null as unknown,
    reload: () => {},
  },
}));
void read;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {} }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/permissions")>()),
  useCan: () => true,
  Can: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePermissions: () => ({
    can: () => true,
    loading: false,
    permissions: new Set<string>(),
  }),
}));
vi.mock("@/lib/store/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/session")>()),
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true, isLoading: false, mode: "api" }),
}));
vi.mock("@/lib/store/audit", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/audit")>()),
  useAuditTrail: () => state.audit,
  useAuditFilterOptions: () => ({
    actors: [],
    kinds: [],
    summary: undefined,
    loading: false,
  }),
}));
vi.mock("@/lib/store/work-locations", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/work-locations")>()),
  useWorkLocationList: () => state.locations,
  useWorkLocationMutations: () => ({
    create: async () => {},
    update: async () => {},
    archive: async () => {},
    restore: async () => {},
  }),
}));
vi.mock("@/lib/store/webhooks", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/webhooks")>()),
  useWebhooks: () => state.webhooks,
  useWebhookCatalogue: () => ({ catalogue: [], loading: false }),
  useWebhookActions: () => ({
    update: async () => {},
    editable: true,
    create: async () => {},
    remove: async () => {},
  }),
}));
vi.mock("@/lib/store/job-roles", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/job-roles")>()),
  useJobRoles: () => state.jobRoles,
  useJobRoleActions: () => ({
    create: async () => {},
    update: async () => {},
    archive: async () => {},
    restore: async () => {},
  }),
}));

beforeEach(() => {
  for (const key of ["audit", "locations", "webhooks", "jobRoles"] as const) {
    state[key].loading = false;
    state[key].error = null;
  }
  state.audit.entries = [];
  state.locations.locations = [];
  state.webhooks.rows = [];
  state.jobRoles.roles = [];
});

const SCREENS = [
  {
    name: "the audit log",
    key: "audit" as const,
    draw: async () => {
      const { AuditScreen } =
        await import("@/app/(app)/settings/audit/audit-screen");
      return <AuditScreen />;
    },
    empty: "Nothing recorded yet",
    failed: "The audit log did not load",
  },
  {
    name: "work locations",
    key: "locations" as const,
    draw: async () => {
      const { LocationsScreen } =
        await import("@/app/(app)/settings/locations/locations-screen");
      return <LocationsScreen />;
    },
    empty: "No work locations yet",
    failed: "Your work locations did not load",
  },
  {
    name: "webhooks",
    key: "webhooks" as const,
    draw: async () => {
      const { WebhooksScreen } =
        await import("@/app/(app)/settings/webhooks/webhooks-screen");
      return <WebhooksScreen />;
    },
    empty: "No endpoints yet",
    failed: "Your endpoints did not load",
  },
  {
    name: "job roles",
    key: "jobRoles" as const,
    draw: async () => {
      const { JobRolesScreen } =
        await import("@/app/(app)/settings/job-roles/job-roles-screen");
      return <JobRolesScreen />;
    },
    empty: "No job roles yet",
    failed: "The job role catalogue did not load",
  },
];

describe.each(SCREENS)("$name", (screenCase) => {
  it("says nothing is there only once it has asked", async () => {
    state[screenCase.key].loading = true;
    render(await screenCase.draw());
    expect(screen.queryByText(screenCase.empty)).not.toBeInTheDocument();
    expect(screen.queryByText(screenCase.failed)).not.toBeInTheDocument();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("shows the failure card and not the empty state after a failure", async () => {
    state[screenCase.key].error = serverError;
    render(await screenCase.draw());
    expect(screen.getByText(screenCase.failed)).toBeInTheDocument();
    expect(screen.queryByText(screenCase.empty)).not.toBeInTheDocument();
  });

  it("says it is empty once it has asked and there is nothing", async () => {
    render(await screenCase.draw());
    expect(screen.getByText(screenCase.empty)).toBeInTheDocument();
  });
});
