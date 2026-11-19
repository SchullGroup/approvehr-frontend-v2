import { existsSync, readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState, Illustration, SuccessMoment } from "@/components/ui";
import { PEEPS, type PeepName } from "@/lib/peeps";

/**
 * The Open Peeps figures: decorative, drawn as they are, and only in the two slots made for them.
 * `docs/illustrations.md` in the mobile app and HANDOVER.md here say where one belongs.
 */

const names = Object.keys(PEEPS) as PeepName[];

describe("Illustration", () => {
  it("is a decorative image: empty alt, hidden from assistive tech, lazy, at the shape of its figure", () => {
    const { container } = render(<Illustration name="on-phone" height={120} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("src")).toBe("/illustrations/peeps/on-phone.svg");
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("height")).toBe("120");
    const [w, h] = PEEPS["on-phone"];
    expect(img?.getAttribute("width")).toBe(String(Math.round((120 * w) / h)));
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    // Nothing a screen reader could land on.
    expect(screen.queryByRole("img")).toBeNull();
  });

  it.each(names)(
    "%s has its file, an svg that draws in an <img>, cropped to its own shape",
    (name) => {
      const path = `public/illustrations/peeps/${name}.svg`;
      expect(existsSync(path)).toBe(true);
      const svg = readFileSync(path, "utf8");
      // Without the namespace an SVG does not draw as an <img src>.
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      const [w, h] = PEEPS[name];
      const box = /viewBox="([\d.\s]+)"/
        .exec(svg)?.[1]
        ?.trim()
        .split(/\s+/)
        .map(Number);
      expect(box?.[2]).toBe(w);
      expect(box?.[3]).toBe(h);
    },
  );

  it("is drawn as it is: no filter, no fade and no colour of its own", () => {
    const { container } = render(<Illustration name="shrug" />);
    const classes = container.innerHTML;
    expect(classes).not.toMatch(/mask|gradient|filter|opacity|blur/);
  });
});

describe("the slots a figure goes in", () => {
  it("EmptyState draws the figure in place of the grey icon circle", () => {
    const { container } = render(
      <EmptyState
        icon={<span data-testid="icon" />}
        art={<Illustration name="hand-on-hip" />}
        title="Nothing waiting on you"
      />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "hand-on-hip",
    );
    expect(screen.queryByTestId("icon")).toBeNull();
    expect(screen.getByText("Nothing waiting on you")).toBeTruthy();
  });

  it("EmptyState without art keeps its icon", () => {
    const { container } = render(
      <EmptyState
        icon={<span data-testid="icon" />}
        title="Nothing here yet"
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("icon")).toBeTruthy();
  });

  it("SuccessMoment draws the figure in place of the check, and says the same words", () => {
    const { container } = render(
      <SuccessMoment
        art={<Illustration name="welcome" />}
        title="You are set up"
        lead="Payroll is on."
      />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "welcome",
    );
    expect(container.querySelector(".ahr-success-mark")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("You are set up");
  });

  it("SuccessMoment without art keeps its check, and a compact one ignores art", () => {
    const plain = render(<SuccessMoment title="Done" />);
    expect(plain.container.querySelector(".ahr-success-mark")).not.toBeNull();
    plain.unmount();
    const compact = render(
      <SuccessMoment
        compact
        art={<Illustration name="welcome" />}
        title="Done"
      />,
    );
    expect(compact.container.querySelector("img")).toBeNull();
    expect(compact.container.querySelector(".ahr-success-mark")).not.toBeNull();
  });
});
