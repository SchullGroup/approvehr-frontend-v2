import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ask colleagues (F38, 25 Nov walkthrough). The list offered the person asking
 * (Adaeze asked herself for feedback on Chidi, and it worked) and said nothing
 * of who already appraises him. Now the asker is not offered, the subject's own
 * appraisers are labelled and still choosable, and where the "who appraises
 * them" answer does not come nobody is labelled or left out.
 */

const state = vi.hoisted(() => ({
  asker: "adaeze" as string | null,
  appraisers: [] as { appraiserId: string }[] | null,
}));

vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({
    loading: false,
    people: [
      { id: "chidi", fullName: "Chidi Nwosu", jobTitle: "Analyst" },
      { id: "adaeze", fullName: "Adaeze Okonkwo", jobTitle: "Manager" },
      { id: "amara", fullName: "Amara Nwachukwu", jobTitle: "Administrator" },
      { id: "ngozi", fullName: "Ngozi Eze", jobTitle: "Designer" },
    ],
  }),
}));
vi.mock("@/lib/store/features", () => ({
  useFeatureSettings: () => ({ workInAnswers: false }),
}));
vi.mock("@/lib/store/shared-projects", () => ({
  useSharedProjects: () => ({ colleagues: null }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ employeeId: state.asker }),
}));
vi.mock("@/lib/store/performance", () => ({
  useMyAppraisers: () => ({
    row: state.appraisers ? { appraisers: state.appraisers } : null,
    loading: false,
    error: null,
  }),
}));
vi.mock("@/components/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui")>()),
  useToast: () => ({ push: vi.fn() }),
}));

const { AskPeersDialog } =
  await import("@/app/(app)/performance/periods/[id]/ask-peers");

const show = () =>
  render(
    <AskPeersDialog
      open
      cycleId="c1"
      subjectId="chidi"
      subjectName="Chidi Nwosu"
      onClose={() => undefined}
      onAsked={() => undefined}
    />,
  );

beforeEach(() => {
  state.asker = "adaeze";
  state.appraisers = [{ appraiserId: "adaeze" }, { appraiserId: "amara" }];
});
afterEach(() => cleanup());

describe("who Ask colleagues offers", () => {
  it("does not offer the person asking, or the person asked about", () => {
    show();
    expect(screen.queryByText("Adaeze Okonkwo")).toBeNull();
    expect(
      screen.queryByText("Chidi Nwosu", { selector: "label *" }),
    ).toBeNull();
    expect(screen.getByText("Amara Nwachukwu")).toBeInTheDocument();
    expect(screen.getByText("Ngozi Eze")).toBeInTheDocument();
  });

  it("labels the subject's other appraisers, and still offers them", () => {
    show();
    expect(screen.getByText(/Also appraises Chidi Nwosu/)).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Amara Nwachukwu/ }),
    ).toBeEnabled();
  });

  it("labels nobody else", () => {
    show();
    expect(screen.getAllByText(/Also appraises/)).toHaveLength(1);
  });

  it("labels nobody, and leaves nobody out, where the answer did not come", () => {
    state.appraisers = null;
    show();
    expect(screen.queryByText(/Also appraises/)).toBeNull();
    expect(screen.getByText("Amara Nwachukwu")).toBeInTheDocument();
    expect(screen.getByText("Ngozi Eze")).toBeInTheDocument();
  });

  it("hides nobody for an account with no staff record", () => {
    state.asker = null;
    show();
    expect(screen.getByText("Adaeze Okonkwo")).toBeInTheDocument();
  });
});
