import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NAV, NOTHING_ANSWERED_YET, visibleNav } from "@/components/portal/nav";
import type { PermissionKey } from "@/lib/permission-keys";
import { scaleLabel } from "@/app/(app)/surveys/answer-dialog";

/**
 * UAT 23 Nov, U45 (HR-11, SELF-25): Surveys could not be created or published,
 * a rating said "1 of 5" with nothing to say which end agreed, and every
 * employee visit asked for the administrator's list and was refused.
 */

const state = vi.hoisted(() => ({ canManage: false, asked: [] as boolean[] }));

vi.mock("@/lib/permissions", () => ({ useCan: () => state.canManage }));
vi.mock("@/lib/store/surveys", () => ({
  DEMO_SURVEY_HEADING: "",
  DEMO_SURVEY_REASON: "",
  useMySurveys: () => ({
    invites: [],
    loading: false,
    error: null,
    unavailable: false,
    reload: () => {},
  }),
  useSurveys: (enabled?: boolean) => {
    state.asked.push(enabled !== false);
    return {
      surveys: [],
      loading: false,
      error: null,
      unavailable: false,
      reload: () => {},
    };
  },
  useSurveyActions: () => ({}),
}));
vi.mock("@/app/(app)/surveys/results-panel", () => ({
  ResultsPanel: () => null,
}));

import { SurveysScreen } from "@/app/(app)/surveys/surveys-screen";

describe("the Surveys row", () => {
  it("is in nobody's menu while a survey cannot be made", () => {
    for (const permissions of [
      new Set<PermissionKey>(),
      new Set<PermissionKey>(["MANAGE_SETTINGS", "EDIT_RECORDS"]),
    ]) {
      const labels = visibleNav(
        NAV,
        permissions,
        { surveys: true },
        NOTHING_ANSWERED_YET,
      ).flatMap((group) => group.items.map((item) => item.label));
      expect(labels).not.toContain("Surveys");
    }
  });
});

describe("a rating question", () => {
  it("says what each point means on five points", () => {
    expect(scaleLabel(1, 5)).toBe("1 · Strongly disagree");
    expect(scaleLabel(3, 5)).toBe("3 · Neither agree nor disagree");
    expect(scaleLabel(5, 5)).toBe("5 · Strongly agree");
  });

  it("names the two ends on any other scale", () => {
    expect(scaleLabel(1, 10)).toBe("1 · Strongly disagree");
    expect(scaleLabel(6, 10)).toBe("6 of 10");
    expect(scaleLabel(10, 10)).toBe("10 · Strongly agree");
  });
});

describe("the surveys screen", () => {
  it("does not ask for the company's list for somebody who cannot run surveys", () => {
    state.canManage = false;
    state.asked = [];
    render(<SurveysScreen />);
    expect(state.asked.every((asked) => asked === false)).toBe(true);
    expect(screen.getByText("Nothing to answer")).toBeTruthy();
  });

  it("asks for it for somebody who can", () => {
    state.canManage = true;
    state.asked = [];
    render(<SurveysScreen />);
    expect(state.asked.some((asked) => asked === true)).toBe(true);
  });
});
