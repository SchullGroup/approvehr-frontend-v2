import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichText } from "@/components/marketing/rich-text";
import {
  cleanHtml,
  decodeEntities,
  parseRichText,
  richTextToPlain,
  safeHref,
} from "@/lib/marketing/rich-text";

/**
 * A job description from the API, drawn without ever being handed to the DOM as
 * markup. The attacks below are the ones that get through a denylist; every one is
 * checked by what ends up in the **rendered page**, not by looking for a string.
 */

const page = (html: string) => render(<RichText html={html} />).container;

describe("what a description keeps", () => {
  it("draws paragraphs, bold, italic, lists and a link", () => {
    const root = page(
      '<p>You will <strong>own</strong> the <em>run</em>.</p><ul><li>Excel</li><li>SQL</li></ul><p><a href="https://example.com/team">Meet the team</a></p>',
    );
    expect(root.querySelectorAll("p")).toHaveLength(2);
    expect(root.querySelector("strong")?.textContent).toBe("own");
    expect(root.querySelector("em")?.textContent).toBe("run");
    expect(
      Array.from(root.querySelectorAll("li")).map((li) => li.textContent),
    ).toEqual(["Excel", "SQL"]);
    const link = root.querySelector("a");
    expect(link).toHaveAttribute("href", "https://example.com/team");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link?.getAttribute("rel")).toContain("noopener");
    expect(link?.getAttribute("rel")).toContain("nofollow");
  });

  it("turns b and i into strong and em, and an h1 into a section heading", () => {
    const root = page("<h1>About</h1><p><b>x</b> <i>y</i></p>");
    expect(root.querySelector("h1")).toBeNull();
    expect(root.querySelector("h2")?.textContent).toBe("About");
    expect(root.querySelector("strong")?.textContent).toBe("x");
    expect(root.querySelector("em")?.textContent).toBe("y");
  });

  it("decodes the entities a writer typed, as text", () => {
    expect(decodeEntities("Fish &amp; chips &lt;3 &#8212; &pound;5")).toBe(
      "Fish & chips <3 — £5",
    );
    expect(page("<p>Salary &gt; &#8358;300k</p>").textContent).toContain(
      "Salary > ₦300k",
    );
  });
});

describe("what it will not draw, whatever the API said", () => {
  it("drops a script, its contents, and an inline handler", () => {
    const root = page(
      '<p onclick="steal()">Hello</p><script>window.hacked = true</script><img src=x onerror="steal()">',
    );
    expect(root.querySelector("script")).toBeNull();
    expect(root.querySelector("img")).toBeNull();
    expect(root.innerHTML).not.toContain("onclick");
    expect(root.innerHTML).not.toContain("onerror");
    expect(root.textContent).toBe("Hello");
    expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it("drops style, iframe and form, including what is inside them", () => {
    const root = page(
      '<style>body{display:none}</style><iframe src="https://evil.test">frame text</iframe><form action="/x"><input name=a>typed</form><p>Kept</p>',
    );
    expect(root.textContent).toBe("Kept");
  });

  it("keeps the words of an unknown tag but not the tag", () => {
    const root = page("<blink>Look</blink> <custom-thing>here</custom-thing>");
    expect(root.querySelector("blink")).toBeNull();
    expect(root.textContent).toContain("Look");
  });

  it("refuses a link that is not http, https or mailto, but keeps its words", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "//evil.test/x",
      "/relative/path",
    ]) {
      const root = page(`<p><a href="${href}">click me</a></p>`);
      expect(root.querySelector("a")).toBeNull();
      expect(root.textContent).toBe("click me");
    }
  });

  it("keeps a mailto link and an https link, and nothing but href on them", () => {
    const root = page(
      '<a href="mailto:hr@example.com" onclick="x()" style="color:red" class="a">Write</a>',
    );
    const link = root.querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("mailto:hr@example.com");
    expect(link.getAttribute("onclick")).toBeNull();
    expect(link.getAttribute("style")).toBeNull();
    expect(link.getAttribute("class")).toContain("font-medium");
    expect(link.hasAttribute("target")).toBe(false);
  });

  it("does not let a > inside a quoted attribute end the tag early", () => {
    const root = page('<a title="a > b" href="javascript:alert(1)">x</a>after');
    expect(root.querySelector("a")).toBeNull();
    expect(root.textContent).toBe("xafter");
  });

  it("treats nested and malformed tags as text, never as markup", () => {
    const root = page("<scr<script>ipt>alert(1)</scr</script>ipt>");
    expect(root.querySelector("script")).toBeNull();
    expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it("ignores comments and doctype", () => {
    const root = page("<!DOCTYPE html><!-- <script>x</script> --><p>Hi</p>");
    expect(root.textContent).toBe("Hi");
  });

  it("closes what was left open and ignores a stray closing tag", () => {
    const root = page("<ul><li>One<li>Two</ul></p></strong><p>Three");
    expect(root.querySelectorAll("li")).toHaveLength(2);
    expect(root.textContent).toBe("OneTwoThree");
  });

  it("stays cheap on a hostile, deeply nested string", () => {
    const nasty = "<p>".repeat(5000) + "x";
    const started = Date.now();
    const tree = parseRichText(nasty);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(tree.length).toBeGreaterThan(0);
  });

  it("never emits dangerouslySetInnerHTML: the output is built from elements", () => {
    const root = page("<p>a</p>");
    expect(
      root.querySelector("[data-testid=rich-text]")?.children,
    ).toHaveLength(1);
  });
});

describe("links", () => {
  it("accepts only addresses a reader may follow", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com/");
    expect(safeHref("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(safeHref(" https://example.com ")).toBe("https://example.com/");
    expect(safeHref("javascript:1")).toBeNull();
    expect(safeHref("https://exa mple.com")).toBeNull();
    expect(safeHref("")).toBeNull();
  });
});

describe("the same words for a search engine", () => {
  it("serialises only allowed tags and escapes text, so it is safe to embed", () => {
    const html = cleanHtml(
      '<p>1 < 2 & 3 > 2</p><script>x</script><a href="javascript:1">no</a><strong>yes</strong>',
    );
    expect(html).toBe("<p>1 &lt; 2 &amp; 3 &gt; 2</p>no<strong>yes</strong>");
    expect(html).not.toContain("<script");
  });

  it("reads as plain text with line breaks and bullets", () => {
    expect(
      richTextToPlain(
        "<p>Hello</p><ul><li>One</li><li>Two</li></ul><p>Bye</p>",
      ),
    ).toBe("Hello\n- One\n- Two\nBye");
  });
});
