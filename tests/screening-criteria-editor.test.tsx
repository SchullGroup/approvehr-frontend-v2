import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CriteriaEditor } from "@/components/hiring/screening/criteria-editor";
import {
  validateCriteria,
  FALLBACK_WEIGHTS,
  DEFAULT_SCALE,
} from "@/lib/hiring/screening/criteria";
import {
  NO_CRITERIA,
  type Criteria,
  type Suggestion,
} from "@/lib/hiring/screening/model";
import { kw, sk } from "./screening-helpers";

/**
 * Writing what an advert's applicants are matched against.
 *
 * What these hold: skills are typed or pasted into chips with no repeats, a chip
 * can be given other spellings and a weight, the suggestion from the advert is
 * offered and never applied on its own and can be edited once kept, the five
 * weights are explained and only change when somebody chooses their own, location
 * wants a place before it asks about questions, and the list of what the score
 * never uses is printed.
 */

function Harness({
  start = NO_CRITERIA,
  onSuggest,
  onChange,
  formQuestions,
}: {
  start?: Criteria;
  onSuggest?: () => Promise<Suggestion>;
  onChange?: (next: Criteria) => void;
  formQuestions?: Parameters<typeof CriteriaEditor>[0]["formQuestions"];
}) {
  const [value, setValue] = useState<Criteria>(start);
  return (
    <CriteriaEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      problems={validateCriteria(value)}
      scale={DEFAULT_SCALE}
      defaults={FALLBACK_WEIGHTS}
      neverUsed={["name", "photo", "institution names or rankings"]}
      {...(formQuestions ? { formQuestions } : {})}
      {...(onSuggest ? { onSuggest } : {})}
    />
  );
}

const chipsOf = (name: string) =>
  within(screen.getByRole("list", { name })).getAllByRole("listitem");

describe("typing skills", () => {
  it("makes a chip on Enter and on a comma, and clears the box", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole("textbox", { name: /^Must-have skills/ });
    await user.type(box, "Payroll{Enter}");
    await user.type(box, "PAYE,");
    expect(chipsOf("Must-have skills").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Payroll"),
      expect.stringContaining("PAYE"),
    ]);
    expect(box).toHaveValue("");
  });

  it("makes several chips from a pasted list, once", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole("textbox", { name: /^Must-have skills/ });
    await user.click(box);
    await user.paste("Excel, SQL; Payroll\nexcel");
    expect(chipsOf("Must-have skills")).toHaveLength(3);
    await user.click(box);
    await user.paste("EXCEL, Tax");
    expect(chipsOf("Must-have skills")).toHaveLength(4);
  });

  it("has an Add button for a phone keyboard, which has no easy comma", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const add = screen.getByRole("button", { name: "Add to Must-have skills" });
    expect(add).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: /^Must-have skills/ }),
      "Tax",
    );
    await user.click(add);
    expect(chipsOf("Must-have skills")).toHaveLength(1);
  });

  it("removes a chip, and names the one it removes", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        start={{ ...NO_CRITERIA, mustHave: [kw("Excel"), kw("SQL")] }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove Excel" }));
    expect(chipsOf("Must-have skills")).toHaveLength(1);
    expect(screen.queryByText("Excel")).not.toBeInTheDocument();
  });

  it("says a skill is in both lists, on the second", async () => {
    render(
      <Harness
        start={{
          ...NO_CRITERIA,
          mustHave: [kw("Excel")],
          niceToHave: [kw("excel")],
        }}
      />,
    );
    expect(screen.getByText(/is in both lists/)).toBeInTheDocument();
  });
});

describe("other spellings and weights", () => {
  it("adds other ways of writing a skill, never repeating the name", async () => {
    const user = userEvent.setup();
    render(<Harness start={{ ...NO_CRITERIA, mustHave: [kw("Node.js")] }} />);
    await user.click(
      screen.getByRole("button", {
        name: "Edit Node.js and its other spellings",
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /Other ways it is written/ }),
      "NodeJS, node.js, Node",
    );
    await user.click(screen.getByRole("button", { name: "Done" }));
    const chip = chipsOf("Must-have skills")[0] as HTMLElement;
    expect(chip).toHaveTextContent("Node.js");
    expect(chip).toHaveTextContent("also NodeJS, Node");
    expect(chip).not.toHaveTextContent("node.js, ");
  });

  it("will not rename a skill to one already in the list", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        start={{ ...NO_CRITERIA, mustHave: [kw("Excel"), kw("SQL")] }}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Edit SQL and its other spellings" }),
    );
    const name = screen.getByRole("textbox", { name: /^Skill/ });
    await user.clear(name);
    await user.type(name, "excel");
    expect(screen.getByText(/already in this list/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
  });

  it("lets a skill count for more, and says so on the chip", async () => {
    const user = userEvent.setup();
    const seen: Criteria[] = [];
    render(
      <Harness
        start={{ ...NO_CRITERIA, mustHave: [kw("Payroll")] }}
        onChange={(next) => seen.push(next)}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Edit Payroll and its other spellings",
      }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /How much it counts/ }),
      "3",
    );
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(chipsOf("Must-have skills")[0]).toHaveTextContent(
      "counts 3 times as much",
    );
    expect(seen.at(-1)?.mustHave[0]?.weight).toBe(3);
  });
});

describe("suggesting from the advert", () => {
  const suggestion: Suggestion = {
    mustHave: [sk("Payroll", "You must know payroll."), sk("PAYE")],
    niceToHave: [sk("Excel", "Excel is a plus.")],
    minYears: 5,
    minYearsFrom: "At least 5 years of experience.",
    education: "BACHELORS",
    educationFrom: "A degree is required.",
    places: ["Lagos"],
    placesFrom: "The advert's own location.",
    note: "Taken from the words in the advert.",
  };

  it("applies nothing until a person accepts it", async () => {
    const user = userEvent.setup();
    const onSuggest = vi.fn(async () => suggestion);
    render(<Harness onSuggest={onSuggest} />);
    await user.click(
      screen.getByRole("button", { name: "Suggest from the job description" }),
    );
    expect(
      await screen.findByText("Suggestions from the advert"),
    ).toBeVisible();
    expect(onSuggest).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("list", { name: "Must-have skills" })).toBeNull();
    expect(
      screen.queryByRole("list", { name: "Nice-to-have skills" }),
    ).toBeNull();
  });

  it("adds one chip, or a whole group, and the chips are then ordinary chips", async () => {
    const user = userEvent.setup();
    render(<Harness onSuggest={async () => suggestion} />);
    await user.click(
      screen.getByRole("button", { name: "Suggest from the job description" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Add Payroll to must-have" }),
    );
    expect(chipsOf("Must-have skills")).toHaveLength(1);
    await user.click(
      screen.getByRole("button", {
        name: /Add all 1 nice-to-have suggestions/,
      }),
    );
    expect(chipsOf("Nice-to-have skills")).toHaveLength(1);
    /* Editable like any other: the accepted chip can be given a spelling. */
    expect(
      screen.getByRole("button", {
        name: "Edit Payroll and its other spellings",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add Payroll to must-have" }),
    ).not.toBeInTheDocument();
  });

  it("offers the years and the level, and takes them on request", async () => {
    const user = userEvent.setup();
    const seen: Criteria[] = [];
    render(
      <Harness
        onSuggest={async () => suggestion}
        onChange={(next) => seen.push(next)}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Suggest from the job description" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Ask for at least 5" }),
    );
    expect(seen.at(-1)?.minYears).toBe(5);
    await user.click(
      screen.getByRole("button", { name: /Ask for Bachelor's degree/ }),
    );
    expect(seen.at(-1)?.education).toBe("BACHELORS");
  });

  it("says when there is nothing new to add", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        onSuggest={async () => ({
          mustHave: [],
          niceToHave: [],
          minYears: null,
          minYearsFrom: null,
          education: null,
          educationFrom: null,
          places: [],
          placesFrom: null,
          note: null,
        })}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Suggest from the job description" }),
    );
    expect(await screen.findByText(/Nothing new to add/)).toBeInTheDocument();
  });

  it("says when the suggestion could not be made", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        onSuggest={async () => {
          throw new Error("The advert has no text to read.");
        }}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Suggest from the job description" }),
    );
    expect(
      await screen.findByText("The advert has no text to read."),
    ).toBeInTheDocument();
  });

  it("has no button when the screen offers none", () => {
    render(<Harness />);
    expect(
      screen.queryByRole("button", { name: /Suggest from/ }),
    ).not.toBeInTheDocument();
  });
});

describe("what a suggestion shows", () => {
  const suggestion: Suggestion = {
    mustHave: [sk("Payroll", "You must know payroll.")],
    niceToHave: [],
    minYears: null,
    minYearsFrom: null,
    education: null,
    educationFrom: null,
    places: ["Lagos"],
    placesFrom: "The advert's own location.",
    note: null,
  };

  it("gives the sentence of the advert each one was read from", async () => {
    const user = userEvent.setup();
    render(<Harness onSuggest={async () => suggestion} />);
    await user.click(
      screen.getByRole("button", { name: "Suggest from the job description" }),
    );
    expect(
      await screen.findByText(/From the advert: “You must know payroll\.”/),
    ).toBeInTheDocument();
  });

  it("offers the place, and takes it on request", async () => {
    const user = userEvent.setup();
    const seen: Criteria[] = [];
    render(
      <Harness
        onSuggest={async () => suggestion}
        onChange={(next) => seen.push(next)}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Suggest from the job description" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Count Lagos as the place" }),
    );
    expect(seen.at(-1)?.places).toEqual(["Lagos"]);
  });

  it("keeps the skill and its spellings, not the sentence", async () => {
    const user = userEvent.setup();
    const seen: Criteria[] = [];
    render(
      <Harness
        onSuggest={async () => suggestion}
        onChange={(next) => seen.push(next)}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Suggest from the job description" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Add Payroll to must-have" }),
    );
    expect(seen.at(-1)?.mustHave[0]).not.toHaveProperty("from");
    expect(seen.at(-1)?.mustHave[0]?.label).toBe("Payroll");
  });
});

describe("years, level, place and weights", () => {
  it("reads whole and half years, and says when it is not one", async () => {
    const user = userEvent.setup();
    const seen: Criteria[] = [];
    render(<Harness onChange={(next) => seen.push(next)} />);
    const years = screen.getByRole("textbox", { name: /Years of experience/ });
    await user.type(years, "3.5");
    expect(seen.at(-1)?.minYears).toBe(3.5);
    await user.clear(years);
    await user.type(years, "abc");
    expect(
      screen.getByText("Use whole or half years, such as 3 or 3.5."),
    ).toBeInTheDocument();
    expect(seen.at(-1)?.minYears).toBeNull();
  });

  it("asks for a level only, never a school", () => {
    render(<Harness />);
    expect(
      screen.getAllByText(
        "A level only. The score never looks at which school.",
      ).length,
    ).toBeGreaterThan(0);
    const select = screen.getByRole("combobox", { name: /Education level/ });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Not asked",
      "Secondary school",
      "Diploma or certificate",
      "Higher National Diploma",
      "Bachelor's degree",
      "Postgraduate diploma",
      "Master's degree",
      "Doctorate",
    ]);
  });

  it("asks about the form's questions only once a place is named", async () => {
    const user = userEvent.setup();
    const questions = [
      { id: "q1", kind: "SHORT_TEXT", label: "Where do you live?" },
      { id: "q2", kind: "YES_NO", label: "Would you relocate?" },
      { id: "q3", kind: "FILE", label: "Portfolio" },
    ];
    render(<Harness formQuestions={questions} />);
    expect(
      screen.queryByRole("combobox", { name: /asks where they are/ }),
    ).not.toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: /Places that count/ }),
      "Lagos{Enter}",
    );
    const where = screen.getByRole("combobox", { name: /asks where they are/ });
    expect(
      within(where)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["None", "Where do you live?"]);
    const move = screen.getByRole("combobox", { name: /would move/ });
    expect(
      within(move)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["None", "Would you relocate?"]);
  });

  it("explains the default weights in a line and leaves them alone", () => {
    render(<Harness />);
    expect(
      screen.getByText(
        /must-have skills 50, nice-to-have skills 15, years of experience 15, education level 10, location 10/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("The defaults")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Location", hidden: true }),
    ).not.toBeInTheDocument();
  });

  it("shows five boxes once somebody sets their own, and checks each", async () => {
    const user = userEvent.setup();
    const seen: Criteria[] = [];
    render(<Harness onChange={(next) => seen.push(next)} />);
    await user.click(screen.getByRole("button", { name: /^Weights/ }));
    await user.click(
      screen.getByRole("checkbox", { name: "Set my own weights" }),
    );
    expect(seen.at(-1)?.weights).toEqual(FALLBACK_WEIGHTS);
    expect(screen.getByText("Your own")).toBeInTheDocument();
    const box = screen.getByRole("textbox", { name: "Location" });
    expect(
      screen.getAllByRole("textbox", { name: /skills$/ }).length,
    ).toBeGreaterThanOrEqual(2);
    await user.clear(box);
    await user.type(box, "40");
    expect(seen.at(-1)?.weights?.location).toBe(40);
    await user.clear(box);
    await user.type(box, "400");
    expect(screen.getByText("0 to 100")).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: "Set my own weights" }),
    );
    expect(seen.at(-1)?.weights).toBeNull();
  });
});

describe("what the score never uses", () => {
  it("prints the list, in plain words, from the API's own", () => {
    render(<Harness />);
    const list = screen
      .getByText("What the score never uses")
      .parentElement?.querySelector("ul") as HTMLElement;
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Name", "Photo", "Institution names or rankings"]);
  });
});
