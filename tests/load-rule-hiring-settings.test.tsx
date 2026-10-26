import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * The three hiring settings lists on the one loading and failure rule.
 *
 * Each had its own hand-written chain (loading, then failure, then empty), which
 * is correct and is exactly the kind that drifts: the rule now lives in one
 * place. What is pinned is the combination — skeleton while it asks, the failure
 * card and no "No tags yet" after it fails, the empty state only once it has
 * answered with nothing.
 */

const serverError = new ApiError(500, "internal", "Something went wrong.");

const state = vi.hoisted(() => ({
  tags: {
    items: [] as unknown[],
    loading: false,
    error: null as unknown,
    reload: () => {},
  },
  reasons: {
    items: [] as unknown[],
    loading: false,
    error: null as unknown,
    reload: () => {},
  },
  templates: {
    items: [] as unknown[],
    loading: false,
    error: null as unknown,
    reload: () => {},
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {} }),
  usePathname: () => "/hiring/settings/tags",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/permissions")>()),
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("@/lib/hiring/pipeline/use-pipeline", async (importActual) => ({
  ...(await importActual<
    typeof import("@/lib/hiring/pipeline/use-pipeline")
  >()),
  usePipelineGateway: () => ({}),
  useTags: () => state.tags,
  useRejectionReasons: () => state.reasons,
  useTemplates: () => state.templates,
}));
vi.mock("@/lib/hiring/pipeline/use-comms", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/hiring/pipeline/use-comms")>()),
  useEmailCatalog: () => ({ items: [], loading: false, error: null }),
}));

beforeEach(() => {
  for (const key of ["tags", "reasons", "templates"] as const) {
    state[key].items = [];
    state[key].loading = false;
    state[key].error = null;
  }
});

const SCREENS = [
  {
    name: "tags",
    key: "tags" as const,
    draw: async () => {
      const { TagsScreen } =
        await import("@/app/(app)/hiring/settings/tags/tags-screen");
      return <TagsScreen />;
    },
    empty: "No tags yet",
    failed: "The tags did not load",
  },
  {
    name: "rejection reasons",
    key: "reasons" as const,
    draw: async () => {
      const { ReasonsScreen } =
        await import("@/app/(app)/hiring/settings/rejection-reasons/reasons-screen");
      return <ReasonsScreen />;
    },
    empty: "No reasons yet",
    failed: "The reasons did not load",
  },
  {
    name: "pipeline templates",
    key: "templates" as const,
    draw: async () => {
      const { TemplatesScreen } =
        await import("@/app/(app)/hiring/settings/pipelines/templates-screen");
      return <TemplatesScreen />;
    },
    empty: "No templates yet",
    failed: "The templates did not load",
  },
];

describe.each(SCREENS)("$name", (screenCase) => {
  it("says nothing is there only after it has asked", async () => {
    state[screenCase.key].loading = true;
    render(await screenCase.draw());
    expect(screen.queryByText(screenCase.empty)).not.toBeInTheDocument();
    expect(screen.queryByText(screenCase.failed)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
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
