import { describe, expect, it } from "vitest";
import { PERSONAS, groupsFor } from "./sidebar-personas";

/**
 * Who has the Team tasks row, across the people the sidebar is proven for.
 *
 * Somebody who leads people has it (the rows decide), and HR, who read
 * everybody's finished work there, have it whether or not anybody reports to
 * them. Everyone else who leads nobody does not: the row is absent, not drawn
 * and switched off. The persona facts are inputs to `visibleNav`, so this also
 * keeps them honest about what the shell derives from `EDIT_RECORDS`.
 */

const labels = (name: string) => {
  const persona = PERSONAS.find((p) => p.name === name);
  if (!persona) throw new Error(`no persona ${name}`);
  return groupsFor(persona)
    .flatMap((g) => g.items)
    .map((i) => i.label);
};

describe("the Team tasks row", () => {
  it("is carried by every persona that holds EDIT_RECORDS with Projects on", () => {
    const hr = PERSONAS.filter(
      (p) => p.permissions.has("EDIT_RECORDS") && p.features.projects !== false,
    );
    expect(hr.length).toBeGreaterThan(2);
    for (const persona of hr) {
      expect(persona.facts.rows["team-tasks"], persona.name).toBe(true);
    }
  });

  it("is drawn for the HR manager and the administrator, who may lead nobody", () => {
    expect(labels("HR manager")).toContain("Team tasks");
    expect(labels("administrator")).toContain("Team tasks");
    expect(labels("HR with programs")).toContain("Team tasks");
  });

  it("is absent for somebody who leads nobody and holds no HR permission", () => {
    expect(labels("employee")).not.toContain("Team tasks");
    expect(labels("project-only member")).not.toContain("Team tasks");
    expect(labels("program read")).not.toContain("Team tasks");
    expect(labels("panelist")).not.toContain("Team tasks");
  });

  it("is present for a program lead who leads people, as before", () => {
    expect(labels("program lead")).toContain("Team tasks");
  });

  it("is never there with Projects switched off, whoever asks", () => {
    expect(labels("company with modules off")).not.toContain("Team tasks");
  });
});
