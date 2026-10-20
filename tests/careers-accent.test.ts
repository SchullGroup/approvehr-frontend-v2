import { describe, expect, it } from "vitest";
import { accentFor, contrastWithWhite, parseHex } from "@/lib/marketing/accent";

/**
 * A company's accent colour, made safe to put a white label on. Decoration keeps
 * the colour as chosen; the button gets the same hue, darkened only as far as it
 * takes to be read.
 */

describe("an accent colour", () => {
  it("keeps one that already carries white text, exactly as chosen", () => {
    const accent = accentFor("#2B3990");
    expect(accent?.decorative).toBe("#2b3990");
    expect(accent?.button).toBe("#2b3990");
    expect(contrastWithWhite(parseHex(accent!.button)!)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("darkens a pale one until white text clears 4.5:1, and keeps the pale one for decoration", () => {
    for (const pale of [
      "#ffd700",
      "#ffff00",
      "#8ac97d",
      "#f0f0f0",
      "#00ffff",
    ]) {
      const accent = accentFor(pale);
      expect(accent?.decorative).toBe(pale);
      expect(accent?.button).not.toBe(pale);
      expect(
        contrastWithWhite(parseHex(accent!.button)!),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("never lightens, and its hover is deeper than the button", () => {
    const accent = accentFor("#ffd700");
    const [r, g, b] = parseHex(accent!.button)!;
    const [dr, dg, db] = parseHex(accent!.decorative)!;
    expect(r).toBeLessThanOrEqual(dr);
    expect(g).toBeLessThanOrEqual(dg);
    expect(b).toBeLessThanOrEqual(db);
    const [hr, hg, hb] = parseHex(accent!.buttonHover)!;
    expect(hr + hg + hb).toBeLessThan(r + g + b);
  });

  it("is nothing for anything that is not a six-digit hex colour", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "red",
      "#fff",
      "#12345",
      "#gggggg",
      "rgb(0,0,0)",
      "url(x)",
    ]) {
      expect(accentFor(bad)).toBeNull();
    }
  });
});
