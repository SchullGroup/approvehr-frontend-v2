import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/ui";
import { MOOD_FIGURE, type EmptyMood } from "@/components/ui/feedback";
import { PEEPS } from "@/lib/peeps";

/**
 * The figure above an empty state: which one, when, and when never.
 * `docs/illustrations.md` has the table of moods and the list of places a person does not belong.
 */

const moods = Object.keys(MOOD_FIGURE) as EmptyMood[];
const src = (container: HTMLElement) =>
  container.querySelector("img")?.getAttribute("src");

describe("EmptyState figure", () => {
  it.each(moods)("mood %s draws its own figure", (mood) => {
    const { container } = render(<EmptyState mood={mood} title="Nothing" />);
    expect(src(container)).toBe(
      `/illustrations/peeps/${MOOD_FIGURE[mood]}.svg`,
    );
  });

  it("every mood is a figure that exists, and no two moods share one", () => {
    const names = moods.map((m) => MOOD_FIGURE[m]);
    for (const name of names) expect(name in PEEPS).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("with no mood, a state with an action is `start` and one without is `nothing`", () => {
    const withAction = render(
      <EmptyState title="No adverts yet" action={<button>Write one</button>} />,
    );
    expect(src(withAction.container)).toContain(MOOD_FIGURE.start);
    withAction.unmount();
    const without = render(<EmptyState title="Nothing here" />);
    expect(src(without.container)).toContain(MOOD_FIGURE.nothing);
  });

  it("a mood beats the default that the action would have picked", () => {
    const { container } = render(
      <EmptyState
        mood="search"
        title="Nobody matches"
        action={<button>Clear the filters</button>}
      />,
    );
    expect(src(container)).toContain(MOOD_FIGURE.search);
  });

  it("is drawn at a quiet size", () => {
    const { container } = render(<EmptyState title="Nothing" />);
    expect(container.querySelector("img")?.getAttribute("height")).toBe("136");
  });

  it("takes the place of the grey icon circle", () => {
    const { container } = render(
      <EmptyState icon={<span data-testid="icon" />} title="Nothing" />,
    );
    expect(container.querySelector("img")).not.toBeNull();
    expect(screen.queryByTestId("icon")).toBeNull();
  });

  it("`plain` keeps the icon and draws no figure, whatever the mood or the action", () => {
    const { container } = render(
      <EmptyState
        plain
        mood="start"
        icon={<span data-testid="icon" />}
        title="You cannot see hiring"
        action={<button>Back</button>}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("icon")).toBeTruthy();
    expect(screen.getByText("You cannot see hiring")).toBeTruthy();
  });

  it("`art={null}` is the same opt-out", () => {
    const { container } = render(
      <EmptyState
        art={null}
        icon={<span data-testid="icon" />}
        title="Not here"
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("icon")).toBeTruthy();
  });

  it("a plain state with no icon draws nothing above the words", () => {
    const { container } = render(<EmptyState plain title="Not available" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByRole("heading", { name: "Not available" })).toBeTruthy();
  });

  it("a compact state keeps its icon: it sits in a card, a drawer or a table cell", () => {
    const { container } = render(
      <EmptyState
        compact
        icon={<span data-testid="icon" />}
        title="No interviews yet"
        action={<button>Add</button>}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("icon")).toBeTruthy();
  });

  it("a compact state that is asked for a mood draws a smaller figure", () => {
    const { container } = render(
      <EmptyState compact mood="caught-up" title="Nothing waiting" />,
    );
    expect(src(container)).toContain(MOOD_FIGURE["caught-up"]);
    expect(container.querySelector("img")?.getAttribute("height")).toBe("104");
  });

  it("explicit art wins over mood, plain and compact", () => {
    const { container } = render(
      <EmptyState
        plain
        compact
        mood="search"
        art={<span data-testid="mascot" />}
        title="Wellness"
      />,
    );
    expect(screen.getByTestId("mascot")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("is hidden from assistive tech: empty alt, an aria-hidden wrapper, and the words are the heading", () => {
    const { container } = render(
      <EmptyState
        mood="waiting"
        title="No interviews are yours yet"
        description="They appear here when somebody invites you."
      />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "No interviews are yours yet" }),
    ).toBeTruthy();
    expect(
      screen.getByText("They appear here when somebody invites you."),
    ).toBeTruthy();
  });

  it("draws exactly one figure", () => {
    const { container } = render(
      <EmptyState mood="documents" title="Nothing" />,
    );
    // One figure: a light file and its dark copy, of which a theme shows one.
    expect(container.querySelectorAll("[data-illustration]")).toHaveLength(1);
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });
});
