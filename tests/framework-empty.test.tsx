import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NO_FRAMEWORK_EXPLAINED,
  NO_FRAMEWORK_TITLE,
} from "@/lib/performance/framework-empty";

/**
 * What the product says when the company has written no competencies (F35).
 *
 * The screens said "Finish setup and the four standard parts are created for
 * you". Nothing creates them: the set-up wizard and the finished-setup page
 * never write a framework, and the API's own note says "A company writes its
 * own". An administrator whose setup was finished went looking for a step that
 * does not exist.
 *
 * Where the framework is absent the person's own list draws nothing, and the
 * dialog that records a level has no sentence about it. The card that explains
 * how appraisals work is a reference page, so it says what it holds, once.
 */

let canEdit = true;
let framework: {
  competencies: unknown[];
  groups: unknown[];
  loading: boolean;
  error: unknown;
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {} }),
  usePathname: () => "/performance",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) =>
    permission === "MANAGE_SETTINGS" ? canEdit : true,
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: true,
    isLoading: false,
    mode: "api",
    employeeId: "me",
    actingId: "me",
  }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ departments: [], loading: false }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], people: [] }),
}));
vi.mock("@/lib/store/performance", () => ({
  CATEGORY_ORDER: [],
  useRatingScale: () => ({ scale: { levels: [] } }),
  useFramework: () => framework,
  useSections: () => ({ sections: [], loading: false, reload: () => {} }),
  useAppraisals: () => ({ cycles: [], loading: false }),
  useSkills: () => ({
    skills: {
      employeeId: "me",
      employeeName: "Me",
      rows: [],
      summary: { total: 0, rated: 0, gaps: 0 },
    },
    loading: false,
    error: null,
    source: "api",
    reload: () => {},
  }),
  useGaps: () => ({ gaps: [], loading: false, error: null, reload: () => {} }),
  useRating: () => ({ editable: true, rate: async () => {} }),
  useScoringWeights: () => ({
    weights: null,
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

beforeEach(() => {
  canEdit = true;
  framework = { competencies: [], groups: [], loading: false, error: null };
});

describe("the words", () => {
  it("never promise that anything is created for the company", () => {
    for (const text of [NO_FRAMEWORK_TITLE, NO_FRAMEWORK_EXPLAINED]) {
      expect(text).not.toMatch(/finish setup|created for you|standard/i);
    }
  });
});

describe("the person's own list of competencies", () => {
  it("draws nothing about a framework that is not written, whoever is reading", async () => {
    const { SkillsTab } = await import("@/app/(app)/performance/skills");
    for (const mayEdit of [true, false]) {
      canEdit = mayEdit;
      const view = render(
        <SkillsTab canSeeCompany={false} isManager={false} />,
      );
      expect(screen.queryByText(NO_FRAMEWORK_TITLE)).not.toBeInTheDocument();
      expect(screen.queryByText(/created for you/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Edit competencies/)).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe("the card that explains how appraisals work", () => {
  it("says nobody has written the competencies, for every reader", async () => {
    const { FrameworkDisclosure } =
      await import("@/app/(app)/performance/how-it-works");
    render(<FrameworkDisclosure />);
    await userEvent.click(
      screen.getByRole("button", { name: /What an appraisal is made of/ }),
    );
    expect(screen.getByText(NO_FRAMEWORK_EXPLAINED)).toBeInTheDocument();
    expect(screen.queryByText(/created for you/)).not.toBeInTheDocument();
  });

  it("does not claim the groups are there on day one", async () => {
    const { FrameworkDisclosure } =
      await import("@/app/(app)/performance/how-it-works");
    render(<FrameworkDisclosure />);
    expect(screen.queryByText(/ready on day one/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/the four groups/i)).not.toBeInTheDocument();
  });
});
