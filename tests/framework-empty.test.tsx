import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NO_FRAMEWORK_EXPLAINED,
  noFrameworkWords,
  nothingToRateWords,
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
 * Three screens can be empty, so the words live in one module and each screen
 * is checked: the person's own list, the card that explains how appraisals work,
 * and the dialog that records a level.
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
    for (const text of [
      noFrameworkWords(true),
      noFrameworkWords(false),
      NO_FRAMEWORK_EXPLAINED,
      nothingToRateWords(true),
      nothingToRateWords(false),
    ]) {
      expect(text).not.toMatch(/finish setup|created for you|standard/i);
    }
  });

  it("send the reader who can write the framework to the button that does it", () => {
    expect(noFrameworkWords(true)).toMatch(/Edit competencies/);
    expect(nothingToRateWords(true)).toMatch(/Edit competencies/);
  });

  it("do not send everybody else to a button they do not have", () => {
    expect(noFrameworkWords(false)).not.toMatch(/Edit competencies/);
    expect(nothingToRateWords(false)).not.toMatch(/Edit competencies/);
  });
});

describe("the person's own list of competencies", () => {
  it("tells the reader who can write the framework where to do it", async () => {
    const { SkillsTab } = await import("@/app/(app)/performance/skills");
    render(<SkillsTab canSeeCompany={false} isManager={false} />);
    expect(screen.getByText("No framework yet")).toBeInTheDocument();
    expect(screen.getByText(noFrameworkWords(true))).toBeInTheDocument();
    expect(screen.queryByText(/created for you/)).not.toBeInTheDocument();
  });

  it("tells everybody else only that it is not written", async () => {
    canEdit = false;
    const { SkillsTab } = await import("@/app/(app)/performance/skills");
    render(<SkillsTab canSeeCompany={false} isManager={false} />);
    expect(screen.getByText(noFrameworkWords(false))).toBeInTheDocument();
    expect(screen.queryByText(/Edit competencies/)).not.toBeInTheDocument();
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

describe("Record a level, with nothing to pick", () => {
  const open = async () => {
    const { RecordLevelDialog } =
      await import("@/app/(app)/performance/rating-dialog");
    render(
      <RecordLevelDialog open onClose={() => {}} onSave={async () => {}} />,
    );
  };

  it("says there is nothing to rate once the list has been read and is empty", async () => {
    await open();
    expect(screen.getByText(nothingToRateWords(true))).toBeInTheDocument();
  });

  it("says nothing of the kind while the list is still being read", async () => {
    framework = { ...framework, loading: true };
    await open();
    expect(
      screen.queryByText(/no competencies to rate/i),
    ).not.toBeInTheDocument();
  });

  it("says nothing of the kind when the list could not be read", async () => {
    framework = { ...framework, error: new Error("down") };
    await open();
    expect(
      screen.queryByText(/no competencies to rate/i),
    ).not.toBeInTheDocument();
  });

  it("says nothing of the kind once there is something to pick", async () => {
    framework = {
      competencies: [
        {
          id: "c",
          name: "Punctuality",
          sectionId: "s",
          sectionName: "Core competency",
          scaleMax: 5,
          active: true,
          archived: false,
        },
      ],
      groups: [],
      loading: false,
      error: null,
    };
    await open();
    expect(
      screen.queryByText(/no competencies to rate/i),
    ).not.toBeInTheDocument();
  });
});
