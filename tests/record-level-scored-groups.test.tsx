import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCompetency, ApiSection } from "@/lib/api/performance";
import { RecordLevelDialog } from "@/app/(app)/performance/rating-dialog";
import { splitScoredGroups } from "@/lib/performance/scored-groups";

/**
 * Record a level offers only what counts towards the score (UAT 23 Nov, U39).
 *
 * "Key result area" was offered beside the three weighted groups and counts for
 * nothing, so a level recorded under it moved nobody's score. A group whose
 * section counts towards no part, or a part weighted at nothing, is not offered,
 * and one line names it so its absence is not a mystery. Until the sections are
 * read (or with no API) nothing is hidden: an unknown weight is not a zero.
 */

const competency = (over: Partial<ApiCompetency>): ApiCompetency => ({
  id: "c",
  name: "Competency",
  sectionId: "s-core",
  sectionName: "Core competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 0,
  ...over,
});

const CORE = competency({ id: "c-core", name: "Punctuality" });
const KRA = competency({
  id: "c-kra",
  name: "Delivery against objectives",
  sectionId: "s-kra",
  sectionName: "Key result area",
});
const LEAD = competency({
  id: "c-lead",
  name: "Coaching",
  sectionId: "s-lead",
  sectionName: "Leadership",
});
const GROUPS = [
  { sectionId: "s-core", sectionName: "Core competency", competencies: [CORE] },
  { sectionId: "s-kra", sectionName: "Key result area", competencies: [KRA] },
  { sectionId: "s-lead", sectionName: "Leadership", competencies: [LEAD] },
];

const section = (over: Partial<ApiSection>): ApiSection => ({
  id: "s",
  name: "Section",
  order: 0,
  competencyCount: 1,
  component: "CORE_COMPETENCY",
  weightBp: 2500,
  ...over,
});

let sections: ApiSection[];

vi.mock("@/lib/store/performance", () => ({
  useRatingScale: () => ({ scale: { levels: [] } }),
  useFramework: () => ({
    competencies: [CORE, KRA, LEAD],
    groups: GROUPS,
    loading: false,
    error: null,
  }),
  useSections: () => ({ sections, loading: false, reload: () => {} }),
  useAppraisals: () => ({ cycles: [], loading: false }),
  useSkills: () => ({
    skills: null,
    loading: false,
    error: null,
    reload: () => {},
  }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ people: [] }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ employeeId: "me" }),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));

const groupLabels = () =>
  Array.from(
    screen.getByLabelText(/Which competency/).querySelectorAll("optgroup"),
  ).map((group) => group.label);

beforeEach(() => {
  sections = [
    section({ id: "s-core", name: "Core competency" }),
    section({
      id: "s-kra",
      name: "Key result area",
      component: null,
      weightBp: null,
    }),
    section({
      id: "s-lead",
      name: "Leadership",
      component: "LEADERSHIP",
      weightBp: 0,
    }),
  ];
});

describe("Record a level offers only groups that count", () => {
  it("leaves out a group that counts towards no part, and one weighted at nothing", () => {
    render(<RecordLevelDialog open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(groupLabels()).toEqual(["Core competency"]);
    expect(
      screen.getByText(
        "Not offered, because they count for nothing in the score: Key result area and Leadership.",
      ),
    ).toBeInTheDocument();
  });

  it("offers everything while the sections are not known", () => {
    sections = [];
    render(<RecordLevelDialog open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(groupLabels()).toEqual([
      "Core competency",
      "Key result area",
      "Leadership",
    ]);
    expect(screen.queryByText(/Not offered/)).not.toBeInTheDocument();
  });
});

describe("splitScoredGroups", () => {
  it("keeps a group whose section it cannot find", () => {
    const orphan = {
      sectionId: null,
      sectionName: "Other",
      competencies: [CORE],
    };
    const { offered, hidden } = splitScoredGroups(
      [orphan, GROUPS[1]!],
      [section({ id: "s-kra", component: null, weightBp: null })],
    );
    expect(offered.map((group) => group.sectionName)).toEqual(["Other"]);
    expect(hidden).toEqual(["Key result area"]);
  });
});
