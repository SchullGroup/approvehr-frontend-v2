import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichText } from "@/components/ui";
import { blocksOf, plainText, spansOf } from "@/lib/inline-markdown";

/**
 * The help centre printed `**Gross**` with its asterisks to every employee who
 * opened an article. What is pinned here is the other half of that fix: what is
 * *not* read as emphasis, because a renderer that guesses is how a payslip
 * article ends up with half a sentence in bold.
 */

describe("spansOf", () => {
  it("reads bold", () => {
    expect(spansOf("**Gross** is your pay")).toEqual([
      { text: "Gross", bold: true, italic: false },
      { text: " is your pay", bold: false, italic: false },
    ]);
  });

  it("reads italics with * and _", () => {
    expect(spansOf("a *b* and _c_ d").map((s) => [s.text, s.italic])).toEqual([
      ["a ", false],
      ["b", true],
      [" and ", false],
      ["c", true],
      [" d", false],
    ]);
  });

  it("leaves arithmetic, snake_case and unmatched markers exactly as typed", () => {
    for (const text of [
      "2 * 3 * 4",
      "use snake_case_names here",
      "**never closed",
      "a ** b",
      "50% off * terms",
    ]) {
      const spans = spansOf(text);
      expect(spans.map((s) => s.text).join("")).toBe(text);
      expect(spans.some((s) => s.bold || s.italic)).toBe(false);
    }
  });

  it("lets bold carry italics, one level deep", () => {
    expect(
      spansOf("**a *b* c**").map((s) => [s.text, s.bold, s.italic]),
    ).toEqual([
      ["a ", true, false],
      ["b", true, true],
      [" c", true, false],
    ]);
  });
});

describe("blocksOf", () => {
  it("splits on blank lines and joins soft-wrapped lines", () => {
    const blocks = blocksOf("one\ntwo\n\nthree");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ kind: "paragraph" });
    expect((blocks[0] as { spans: { text: string }[] }).spans[0]?.text).toBe(
      "one two",
    );
  });

  it("reads bulleted and numbered lists, and only when every line is one", () => {
    expect(blocksOf("- a\n- b")[0]).toMatchObject({
      kind: "list",
      ordered: false,
    });
    expect(blocksOf("1. a\n2. b")[0]).toMatchObject({
      kind: "list",
      ordered: true,
    });
    expect(blocksOf("- a\nnot a bullet")[0]).toMatchObject({
      kind: "paragraph",
    });
  });
});

describe("plainText", () => {
  it("takes the markers out of an excerpt, including a cut one", () => {
    expect(plainText("**Gross** is your contractual pay")).toBe(
      "Gross is your contractual pay",
    );
    expect(plainText("…the **PAYE** is what **Gro…")).toBe(
      "…the PAYE is what Gro…",
    );
  });
});

describe("RichText", () => {
  it("renders bold as bold and shows no asterisk", () => {
    render(
      <RichText>{"**Gross** is your pay.\n\n**PAYE** is the tax."}</RichText>,
    );
    expect(screen.getByText("Gross").tagName).toBe("STRONG");
    expect(screen.getByText("PAYE").tagName).toBe("STRONG");
    expect(document.body.textContent).not.toContain("*");
  });

  it("renders lists and keeps links clickable", () => {
    render(
      <RichText>
        {"- first\n- see https://example.com/page for more\n\nafter"}
      </RichText>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "https://example.com/page" }),
    ).toHaveAttribute("href", "https://example.com/page");
  });

  it("produces no markup from what was typed", () => {
    const { container } = render(
      <RichText>{"<script>alert(1)</script> **b**"}</RichText>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });
});
