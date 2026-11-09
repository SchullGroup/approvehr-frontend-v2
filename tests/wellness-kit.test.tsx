import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ART_NAMES,
  HeatMap,
  PillTabs,
  Podium,
  ProgressArc,
  RankRow,
  StatTile,
  StreakCard,
  WeekBars,
  WellnessArt,
  YouRow,
  ordinal,
  rankWords,
  tiedRanks,
  type ArtMood,
  type RankedPerson,
} from "@/components/wellness";
import { heatGrid, weekDots } from "@/lib/wellness/streak";

/**
 * The Wellness kit, in isolation: what it says to a screen reader, what it
 * refuses to say to anybody, and how it behaves with the awkward shapes (a shared
 * rank, one person, a long name, a run that has ended).
 */

const person = (
  rank: number,
  name: string,
  over: Partial<RankedPerson> = {},
): RankedPerson => ({
  key: `${String(rank)}-${name}`,
  rank,
  name,
  total: `${String(rank * 1000)} steps`,
  ...over,
});

describe("the mascots", () => {
  it("are decorative unless told otherwise, whatever the mood", () => {
    const moods: ArtMood[] = ["happy", "cheering", "sleepy"];
    for (const name of ART_NAMES) {
      for (const mood of moods) {
        const { container, unmount } = render(
          <WellnessArt name={name} mood={mood} />,
        );
        const svg = container.querySelector("svg");
        expect(svg, `${name} ${mood}`).not.toBeNull();
        expect(svg).toHaveAttribute("aria-hidden", "true");
        expect(svg).not.toHaveAttribute("role");
        unmount();
      }
    }
  });

  it("gets a name only when the picture is the only thing that says it", () => {
    render(<WellnessArt name="cherries" title="Two cherries holding hands" />);
    expect(
      screen.getByRole("img", { name: "Two cherries holding hands" }),
    ).toBeInTheDocument();
  });

  it("can be told not to move, and moves only through classes reduced motion switches off", () => {
    const { container } = render(<WellnessArt name="apple" animate={false} />);
    expect(container.querySelector(".well-bob")).toBeNull();
    const moving = render(<WellnessArt name="apple" />);
    expect(moving.container.querySelector(".well-bob")).not.toBeNull();
  });
});

describe("ranks", () => {
  it("are worded as ordinals, and as joint when shared", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
    ]);
    expect(rankWords(9, true)).toBe("joint 9th");
    expect(rankWords(9, false)).toBe("9th");
    expect([...tiedRanks([1, 2, 2, 4, 5, 5, 5])].sort()).toEqual([2, 5]);
  });
});

describe("the podium", () => {
  const three = [
    person(1, "Ada Obi"),
    person(2, "Tunde Bello"),
    person(3, "Kemi Ade"),
  ];

  it("is read first, second, third, though it is drawn second, first, third", () => {
    render(<Podium people={three} tied={new Set()} />);
    const list = screen.getByRole("list", { name: "Top three" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^1st: Ada Obi/),
      expect.stringMatching(/^2nd: Tunde Bello/),
      expect.stringMatching(/^3rd: Kemi Ade/),
    ]);
    /* The winner is the middle seat: the CSS order, not the reading order. */
    expect(items[0]?.className).toMatch(/\border-2\b/);
    expect(items[1]?.className).toMatch(/\border-1\b/);
    expect(items[2]?.className).toMatch(/\border-3\b/);
  });

  it("says joint when two people share the top place", () => {
    const tiedTop = [
      person(1, "Ada Obi"),
      person(1, "Tunde Bello"),
      person(3, "Kemi Ade"),
    ];
    render(<Podium people={tiedTop} tied={tiedRanks([1, 1, 3])} />);
    expect(screen.getByText(/joint 1st: Ada Obi/)).toBeInTheDocument();
    expect(screen.getByText(/joint 1st: Tunde Bello/)).toBeInTheDocument();
    expect(screen.getByText(/^3rd: Kemi Ade/)).toBeInTheDocument();
  });

  it("draws open seats, not an error, when fewer than three have joined", () => {
    render(
      <Podium
        people={[person(1, "Me Myself", { mine: true })]}
        tied={new Set()}
      />,
    );
    expect(screen.getAllByText("Room for you")).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/1st: Me Myself.*, you\./)).toBeInTheDocument();
  });

  it("keeps a very long name on its own seat, with the whole name for a tooltip", () => {
    const long = "Oluwadamilola Adebayo-Ogunleye the Third of Lagos";
    render(<Podium people={[person(1, long)]} tied={new Set()} />);
    expect(screen.getByTitle(long)).toBeInTheDocument();
  });

  it("calls the viewer's own seat what the caller says", () => {
    render(
      <Podium
        people={[person(1, "Platform", { mine: true })]}
        tied={new Set()}
        mineLabel="Your team"
      />,
    );
    expect(screen.getByText("Your team")).toBeInTheDocument();
  });
});

describe("a ranked row and your place", () => {
  it("is announced with its rank, name, total and whether it is yours", () => {
    render(
      <ul>
        <RankRow person={person(9, "Tolu Balogun")} tied />
        <RankRow
          person={person(23, "Me Myself", { mine: true })}
          tied={false}
        />
      </ul>,
    );
    expect(
      screen.getByText("joint 9th: Tolu Balogun, 9000 steps."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("23rd: Me Myself, 23000 steps, you."),
    ).toBeInTheDocument();
  });

  it("trims a name the API padded, so a one-word name has no trailing gap", () => {
    render(
      <ul>
        <RankRow person={person(2, "Yusuf ")} tied={false} />
      </ul>,
    );
    expect(screen.getByText("2nd: Yusuf, 2000 steps.")).toBeInTheDocument();
  });

  it("is a labelled group for the person whose place it is", () => {
    render(<YouRow rank={23} tied={false} total="98,384 steps" />);
    expect(
      screen.getByRole("group", { name: "Your place: 23rd, 98,384 steps" }),
    ).toBeInTheDocument();
  });
});

describe("the streak card", () => {
  const dots = weekDots(new Set(["2026-11-03", "2026-11-04"]), "2026-11-06");
  const idle = { days: 0, includesToday: false, capped: false } as const;

  it("celebrates a run that is going, and says it is private", () => {
    render(
      <StreakCard
        streak={{ days: 9, includesToday: true, capped: false }}
        last={null}
        dots={dots}
      />,
    );
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("days in a row")).toBeInTheDocument();
    expect(screen.getByText(/Only you can see this/)).toBeInTheDocument();
  });

  it("says a new run can start today, and what the last one was, when a run has ended", () => {
    render(
      <StreakCard
        streak={idle}
        last={{ days: 12 }}
        lastRunText="3 days ago"
        dots={dots}
      />,
    );
    expect(screen.getByText("A new run can start today")).toBeInTheDocument();
    expect(
      screen.getByText("Your last run was 12 days, ending 3 days ago."),
    ).toBeInTheDocument();
  });

  it("never guilts, threatens or counts what was lost", () => {
    const states = [
      { streak: idle, last: { days: 12 } },
      { streak: idle, last: null },
      { streak: { days: 2, includesToday: false, capped: false }, last: null },
    ];
    for (const state of states) {
      const { container, unmount } = render(
        <StreakCard {...state} dots={dots} />,
      );
      expect(container).not.toHaveTextContent(
        /\b(lose|lost|losing|break|broke|broken|miss|missed|fail|failed|don't|do not|reset|streak is|keep it alive|before midnight)\b/i,
      );
      unmount();
    }
  });

  it("lists the week day by day for a screen reader, and calls tomorrow not yet", () => {
    render(<StreakCard streak={idle} last={null} dots={dots} />);
    const week = screen.getByRole("list", { name: "This week" });
    expect(
      within(week).getByText(/Tuesday: you logged something/),
    ).toBeInTheDocument();
    expect(
      within(week).getByText(/Friday \(today\): nothing logged/),
    ).toBeInTheDocument();
    expect(within(week).getByText(/Saturday: not yet/)).toBeInTheDocument();
  });
});

describe("the arc", () => {
  it("reads as one sentence, and puts the number in text", () => {
    render(
      <ProgressArc
        title="Steps"
        value={6200}
        reference={14200}
        valueText="6,200"
        unit="steps today"
        label="Steps today: 6,200 steps. Your best day in the last four weeks was 14,200 steps."
      />,
    );
    expect(
      screen.getByRole("img", { name: /Your best day in the last four weeks/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("6,200")).toBeInTheDocument();
  });

  it("is only a track, with no fill, when there is no mark to draw against", () => {
    const { container } = render(
      <ProgressArc
        title="Water"
        value={250}
        reference={null}
        valueText="250"
        unit="ml today"
        label="Water today: 250 ml."
      />,
    );
    expect(container.querySelectorAll("svg path")).toHaveLength(1);
  });
});

describe("the heat map", () => {
  it("is summarised in words, and a day with nothing is empty rather than a failure", () => {
    const grid = heatGrid(
      {
        from: "2026-08-01",
        to: "2026-11-06",
        days: [{ day: "2026-11-03", metric: "STEPS", total: 5000 }],
      },
      "STEPS",
      "2026-11-06",
      13,
    );
    render(
      <HeatMap
        columns={grid.columns}
        loggedCount={grid.loggedCount}
        total={homeDays(grid)}
        label="Steps"
        valueText={(value) => `${String(value)} steps`}
      />,
    );
    expect(
      screen.getByRole("img", {
        name: /Steps, last 13 weeks: logged on 1 of \d+ days\./,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle(/3 Nov.*5000 steps/)).toBeInTheDocument();
    expect(screen.getAllByTitle(/nothing logged/).length).toBeGreaterThan(10);
  });
});

const homeDays = (grid: ReturnType<typeof heatGrid>) =>
  grid.columns.flat().filter((cell) => !cell.upcoming).length;

describe("pills and tiles", () => {
  it("choose one of several, with a count", async () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState("all");
      return (
        <PillTabs
          label="Show"
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          options={[
            { value: "all", label: "All", count: 3 },
            { value: "joined", label: "Joined" },
          ]}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByRole("radio", { name: /^All/ })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Joined" }));
    expect(onChange).toHaveBeenCalledWith("joined");
    expect(screen.getByRole("radio", { name: "Joined" })).toBeChecked();
  });

  it("is one stop for Tab and moves with the arrow keys, like a native radio group", async () => {
    function Harness() {
      const [value, setValue] = useState("a");
      return (
        <PillTabs
          label="Show"
          value={value}
          onChange={setValue}
          options={[
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
            { value: "c", label: "Gamma" },
          ]}
        />
      );
    }
    render(<Harness />);
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Alpha" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Beta" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Gamma" })).toBeChecked();
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Gamma" })).not.toHaveFocus();
  });

  it("shows an absent figure as words, and can say its label first", () => {
    render(
      <StatTile
        icon={<span />}
        label="Water, last 7 days"
        value="Nothing yet"
        labelFirst
      />,
    );
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("the week as bars", () => {
  const points = [
    { label: "Mon", value: 8000 },
    { label: "Tue", value: null },
    { label: "Wed", value: 3000 },
  ];

  it("draws a day with nothing as a dashed outline, never as a column of no height", () => {
    const { container } = render(
      <WeekBars points={points} todayIndex={2} caption="Steps per day." />,
    );
    expect(container.querySelectorAll(".border-dashed")).toHaveLength(1);
    /* The missing day reads as a dash in the value row, not as 0. */
    expect(screen.getByText("\u2014")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("marks today in green and the other days in periwinkle", () => {
    const { container } = render(
      <WeekBars points={points} todayIndex={2} caption="Steps per day." />,
    );
    const fills = Array.from(
      container.querySelectorAll<HTMLElement>("span.rounded-full[style]"),
    ).map((bar) => bar.style.backgroundColor);
    expect(fills).toEqual([
      "var(--color-well-peri-text)",
      "var(--color-well-green-text)",
    ]);
  });

  it("keeps the table of figures for a screen reader", () => {
    render(
      <WeekBars points={points} todayIndex={2} caption="Steps per day." />,
    );
    expect(screen.getByText("Steps per day.")).toBeInTheDocument();
  });
});
