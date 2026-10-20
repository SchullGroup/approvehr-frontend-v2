import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ScoreFilterFields,
  useScoreFilterState,
} from "@/components/hiring/screening/score-filters";
import { fakeGateway } from "./screening-helpers";

/**
 * What the score filters offer depends on what the server can tell apart.
 *
 * The API files a scan and a damaged file under one status, and a list row does
 * not say which it was. A menu that offered "Could not read the CV" there would
 * list scans under a label that says something else, so a connected screen offers
 * the one status the list can answer, and a practice board, which knows, offers both.
 */

const current = { gateway: fakeGateway() };
vi.mock("@/lib/hiring/screening/use-gateway", () => ({
  useScreeningGateway: () => current.gateway,
}));

function Fields() {
  const state = useScoreFilterState();
  return <ScoreFilterFields state={state} />;
}

const options = () =>
  screen
    .getByRole("combobox", { name: "Score status" })
    .querySelectorAll("option");

beforeEach(() => {
  current.gateway = fakeGateway();
});

describe("the score status menu", () => {
  it("offers both ways of not being read on a practice board", () => {
    render(<Fields />);
    const labels = [...options()].map((option) => option.textContent);
    expect(labels).toContain("Needs a person to read it");
    expect(labels).toContain("Could not read the CV");
  });

  it("offers only what a connected list can tell apart", () => {
    current.gateway = fakeGateway({ mode: "api" });
    render(<Fields />);
    const labels = [...options()].map((option) => option.textContent);
    expect(labels).toContain("Needs a person to read it");
    expect(labels).not.toContain("Could not read the CV");
  });
});
