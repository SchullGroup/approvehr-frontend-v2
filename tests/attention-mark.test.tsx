import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  AttentionMark,
  Callout,
  CardHeader,
  TBody,
  TDPrimary,
  TR,
  TableWrap,
} from "@/components/ui";

/**
 * The replacement for the big banner.
 *
 * A fact about one person or one section used to be a tinted box over the page.
 * It is a small ochre icon beside the name or the title now, and the reason is
 * one hover away. What is checked here is what the icon has to keep doing for
 * somebody who cannot hover: it is a real button, its name is the message, and
 * the panel opens from a press and from a keyboard.
 */

const REASON = "Their probation has already ended.";

const panel = () =>
  document.querySelector<HTMLElement>(
    '[role="presentation"][aria-hidden="true"]',
  );

describe("AttentionMark", () => {
  it("is a button named by the message, so it is not hover-only", () => {
    render(<AttentionMark text={REASON} />);
    expect(screen.getByRole("button", { name: REASON })).toBeInTheDocument();
  });

  it("reads a list as one sentence after another, and shows it a line each", async () => {
    const user = userEvent.setup();
    render(<AttentionMark text={[REASON, "The record says otherwise."]} />);
    const icon = screen.getByRole("button", {
      name: `${REASON} The record says otherwise.`,
    });
    await user.click(icon);
    expect(panel()?.textContent).toBe(`${REASON}\nThe record says otherwise.`);
  });

  it("renders nothing when there is nothing to say", () => {
    const { container, rerender } = render(<AttentionMark text={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<AttentionMark text={[null, false, "  ", undefined]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<AttentionMark text="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens on a press and closes on the second, which is how a phone uses it", async () => {
    const user = userEvent.setup();
    render(<AttentionMark text={REASON} />);
    expect(panel()).toBeNull();
    await user.click(screen.getByRole("button", { name: REASON }));
    expect(panel()).toHaveTextContent(REASON);
    await user.click(screen.getByRole("button", { name: REASON }));
    expect(panel()).toBeNull();
  });

  it("opens when the keyboard reaches it, and Escape closes it", async () => {
    const user = userEvent.setup();
    render(<AttentionMark text={REASON} />);
    await user.tab();
    expect(screen.getByRole("button", { name: REASON })).toHaveFocus();
    expect(panel()).toHaveTextContent(REASON);
    await user.keyboard("{Escape}");
    expect(panel()).toBeNull();
  });

  it("does not read the sentence twice: there is no hidden copy beside the icon", () => {
    render(<AttentionMark text={REASON} />);
    expect(screen.queryAllByText(REASON)).toHaveLength(0);
  });

  it("is the quieter grey glyph for `info`, with the same name and panel", async () => {
    const user = userEvent.setup();
    render(<AttentionMark tone="info" text="Closed." />);
    const icon = screen.getByRole("button", { name: "Closed." });
    expect(icon.className).not.toMatch(/text-warning-text/);
    await user.click(icon);
    expect(panel()).toHaveTextContent("Closed.");
  });

  it("goes beside a name in a table row, and after a section's title", () => {
    render(
      <>
        <CardHeader title="Probations ending" mark="3 have ended." />
        <TableWrap caption="People">
          <TBody>
            <TR>
              <TDPrimary title="Ifeanyi Obi" mark={REASON} />
            </TR>
          </TBody>
        </TableWrap>
      </>,
    );
    expect(screen.getByRole("button", { name: "3 have ended." })).toBeVisible();
    const row = screen.getByRole("rowheader", { name: /Ifeanyi Obi/ });
    expect(row).toContainElement(screen.getByRole("button", { name: REASON }));
  });
});

describe("Callout is a sentence, never a box", () => {
  const TONES = [
    "info",
    "success",
    "warning",
    "danger",
    "accent",
    "neutral",
  ] as const;
  const BOX = /(^|\s)(border|bg-|rounded-lg|p-4)/;

  it.each(TONES)("draws no fill, border or padding for %s", (tone) => {
    const { container } = render(
      <Callout tone={tone} title="Heading">
        <strong>Somebody</strong> has to look at this.
      </Callout>,
    );
    for (const el of container.querySelectorAll("*")) {
      expect(el.getAttribute("class") ?? "").not.toMatch(BOX);
    }
  });

  it.each(TONES)("keeps every word of a %s one on the page", (tone) => {
    render(
      <Callout tone={tone} title="Heading">
        <span>
          Body with <em>markup</em>.
        </span>
      </Callout>,
    );
    expect(screen.getByText("Heading", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("markup")).toBeInTheDocument();
  });

  it("says a failure in plain red words, with no icon", () => {
    const { container } = render(
      <Callout tone="danger" title="That was refused">
        The name is already in use.
      </Callout>,
    );
    const line = screen.getByText("That was refused").parentElement!;
    expect(line.className).toMatch(/text-danger-text/);
    expect(line).toHaveTextContent("The name is already in use.");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("draws nothing for an empty body, and still says the title", () => {
    render(
      <Callout tone="danger" title="Not going ahead">
        {null}
      </Callout>,
    );
    expect(screen.getByText("Not going ahead")).toBeInTheDocument();
  });

  it("puts a warning's second sentence behind the ochre icon, in text a test can read", () => {
    render(
      <Callout tone="warning">
        Two people have no appraiser. They will finish with no mark.
      </Callout>,
    );
    expect(screen.getByText("Two people have no appraiser.")).toBeVisible();
    const icon = screen.getByRole("button", { name: "Read more" });
    expect(icon.className).toMatch(/text-warning-text/);
    expect(
      screen.getByText("They will finish with no mark."),
    ).toBeInTheDocument();
  });
});
