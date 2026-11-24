import { readFileSync, readdirSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Illustration } from "@/components/ui";
import {
  HERO_BLUE,
  HERO_BLUE_DARK,
  HeroBackdrop,
} from "@/components/ui/hero-backdrop";
import { NoConnectionCard } from "@/components/ui/no-connection";
import { SceneImage } from "@/components/wellness";
import { AuthVisual } from "@/components/portal/auth-visual";
import OfflinePage from "@/app/offline/page";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init-script";
import { PEEPS, type PeepName } from "@/lib/peeps";
import { darken, darkTokens, expectedDarkFiles } from "../scripts/dark-art";

/**
 * The owner's ask (24 Nov 2026): "In dark mode let's make all illustrations in the app fit dark mode
 * appropriately." Before this, the Open Peeps figures and the Wellness scenes sat on a light lavender tile in
 * the dark theme (a white box on a dark page), the sign-in panel's two product cards stayed white, the hero
 * gradient was as bright as in daylight, and the offline page never turned dark at all.
 */

const css = readFileSync("src/app/globals.css", "utf8");
const DARK = css.slice(css.indexOf(':root[data-theme="dark"] {'));
const LIGHT = css.slice(0, css.indexOf(':root[data-theme="dark"] {'));
const token = (block: string, name: string) =>
  new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1];

const peeps = Object.keys(PEEPS) as PeepName[];
const scenes = readdirSync("public/wellness/scenes")
  .filter((f) => f.endsWith(".svg"))
  .map((f) => f.replace(/\.svg$/, ""));

describe("the Open Peeps figures in the dark theme", () => {
  it("draw the dark copy under data-theme=dark and the light one otherwise, with no light tile", () => {
    const { container } = render(<Illustration name="shrug" height={120} />);
    const [light, dark] = [...container.querySelectorAll("img")];
    expect(light?.getAttribute("src")).toBe("/illustrations/peeps/shrug.svg");
    expect(light?.className).toContain("[[data-theme=dark]_&]:hidden");
    expect(dark?.getAttribute("src")).toBe(
      "/illustrations/peeps/dark/shrug.svg",
    );
    expect(dark?.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(dark?.className).toContain("[[data-theme=dark]_&]:block");
    // Both decorative, both lazy, both the figure's own shape.
    for (const img of [light, dark]) {
      expect(img?.getAttribute("alt")).toBe("");
      expect(img?.getAttribute("loading")).toBe("lazy");
      expect(img?.getAttribute("height")).toBe("120");
    }
    // The light sticker that made a white box on a dark page is gone.
    expect(container.innerHTML).not.toMatch(/well-sticker|bg-/);
  });

  it.each(peeps)("%s has a dark copy drawn in the dark tokens", (name) => {
    const svg = readFileSync(
      `public/illustrations/peeps/dark/${name}.svg`,
      "utf8",
    );
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toMatch(/fill="#(fff|000)"/);
    expect(svg).toContain(`fill="${token(DARK, "accent-text")}"`);
    expect(svg).toContain(`fill="${token(DARK, "accent-soft")}"`);
  });
});

describe("the Wellness scenes in the dark theme", () => {
  it("draw the dark copy on the dark peri wash, not the light sticker", () => {
    const { container } = render(<SceneImage name="coffee" size={88} />);
    const tile = container.firstElementChild;
    expect(tile?.className).toContain(
      "[[data-theme=dark]_&]:bg-well-peri-soft",
    );
    const [light, dark] = [...container.querySelectorAll("img")];
    expect(light?.getAttribute("src")).toBe("/wellness/scenes/coffee.svg");
    expect(light?.className).toContain("[[data-theme=dark]_&]:hidden");
    expect(dark?.getAttribute("src")).toBe("/wellness/scenes/dark/coffee.svg");
    expect(dark?.className).toContain("[[data-theme=dark]_&]:block");
  });

  it.each(scenes)("%s has a dark copy with no black line left", (name) => {
    const svg = readFileSync(`public/wellness/scenes/dark/${name}.svg`, "utf8");
    expect(svg).not.toMatch(/fill="#000000"/i);
    expect(svg).toContain(`fill="${token(DARK, "accent-text")}"`);
  });
});

describe("scripts/dark-art.ts", () => {
  it("reads the dark tokens out of globals.css", () => {
    expect(darkTokens(css)).toEqual({
      line: token(DARK, "accent-text"),
      fill: token(DARK, "accent-soft"),
      pink: token(DARK, "well-pink-text"),
    });
  });

  it("every dark file on disk is what the light file and the tokens make now", () => {
    const expected = expectedDarkFiles(process.cwd());
    expect(expected.size).toBe(peeps.length + scenes.length);
    for (const [path, content] of expected) {
      expect(readFileSync(path, "utf8"), path).toBe(content);
    }
  });

  it("refuses a colour it has no dark colour for, rather than drawing it as it is", () => {
    expect(() =>
      darken(
        '<svg><path fill="#123456"/></svg>',
        { "#000": "#aab8f5" },
        "new.svg",
      ),
    ).toThrow(/#123456 has no dark colour/);
  });
});

describe("the blue hero gradient", () => {
  it("follows the theme through tokens, with the light pair as the fallback", () => {
    const { container } = render(<HeroBackdrop />);
    const stops = [...container.querySelectorAll("stop")].map((s) =>
      s.getAttribute("style"),
    );
    expect(stops[0]).toContain(`var(--color-hero-from, ${HERO_BLUE.from})`);
    expect(stops[1]).toContain(`var(--color-hero-to, ${HERO_BLUE.to})`);
  });

  it("is a step deeper in the dark theme, and the constants match the tokens", () => {
    expect(token(LIGHT, "hero-from")).toBe(HERO_BLUE.from);
    expect(token(LIGHT, "hero-to")).toBe(HERO_BLUE.to);
    expect(token(DARK, "hero-from")).toBe(HERO_BLUE_DARK.from);
    expect(token(DARK, "hero-to")).toBe(HERO_BLUE_DARK.to);
  });

  it("the No connection card's own fill follows it too", () => {
    const { container } = render(<NoConnectionCard />);
    expect(
      (container.firstElementChild as HTMLElement).style.backgroundColor,
    ).toContain("--color-hero-from");
  });
});

describe("the offline page", () => {
  it("runs the theme script itself, so the dark theme gets a dark page", () => {
    const { container } = render(<OfflinePage />);
    const scripts = [...container.querySelectorAll("script")].map(
      (s) => s.textContent,
    );
    expect(scripts).toContain(THEME_INIT_SCRIPT);
  });

  it("sets the dark hero pair in its own stylesheet, which it cannot borrow", () => {
    const { container } = render(<OfflinePage />);
    const style = container.querySelector("style")?.textContent ?? "";
    expect(style).toContain(`--color-hero-from: ${HERO_BLUE_DARK.from}`);
    expect(style).toContain(`--color-hero-to: ${HERO_BLUE_DARK.to}`);
  });
});

describe("the sign-in panel's product cards", () => {
  it("take the dark theme's surfaces instead of staying white", () => {
    const { container } = render(<AuthVisual />);
    const wrapper = container.querySelector(
      '[class*="--color-white:var(--color-surface)"]',
    );
    expect(wrapper?.className).toContain(
      "[[data-theme=dark]_&]:[--color-white:var(--color-surface)]",
    );
    expect(wrapper?.className).toContain(
      "[[data-theme=dark]_&]:[--color-slate:var(--color-ink)]",
    );
    expect(wrapper?.className).toContain(
      "[[data-theme=dark]_&]:[--color-wash-amber:var(--color-warning-soft)]",
    );
    // Both product cards are inside it.
    expect(wrapper?.children.length).toBe(2);
  });

  it("glow darker at the top in the dark theme, not lighter", () => {
    const { container } = render(<AuthVisual />);
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain(
      "[[data-theme=dark]_&]:[--ahr-auth-glow:var(--color-hero-from)]",
    );
    expect(panel.getAttribute("style")).toContain("var(--ahr-auth-glow");
  });
});
