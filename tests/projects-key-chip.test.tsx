import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectKeyChip, textOnColor } from "@/components/projects/glyphs";

/** A project's key is drawn on the project's own colour, which may be pale. */
describe("the project key chip", () => {
  it("uses white on the dark hues the app offers", () => {
    for (const color of [
      "#2B3990",
      "#0F766E",
      "#B4421F",
      "#6D3FC0",
      "#8F5F08",
      "#1F5F8A",
      "#A3336B",
      "#3F6212",
    ]) {
      expect(textOnColor(color)).toBe("#ffffff");
    }
  });

  it("uses dark ink where white would be under 4.5:1, as on the API's own bronze", () => {
    expect(textOnColor("#B0780A")).toBe("#1a1815");
    expect(textOnColor("#FFD700")).toBe("#1a1815");
  });

  it("falls back to white for a colour it cannot read", () => {
    expect(textOnColor("not a colour")).toBe("#ffffff");
  });

  it("draws the key in that colour", () => {
    render(<ProjectKeyChip project={{ key: "OFC", color: "#B0780A" }} />);
    const chip = screen.getByText("OFC");
    expect(chip.style.color).toBe("rgb(26, 24, 21)");
    expect(chip.style.backgroundColor).toBe("rgb(176, 120, 10)");
  });
});
