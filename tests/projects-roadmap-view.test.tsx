import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import type { Issue, ProjectData } from "@/lib/projects/types";
import { contextFor, sampleData } from "./projects-fixture";

/**
 * The roadmap, as a person meets it: the epics on a timeline, what a bar says, and
 * how to open one without a mouse. The arithmetic behind the positions is in
 * `projects-roadmap.test.ts`; this is what is drawn and what a click does.
 */

const { RoadmapView } = await import("@/app/(app)/projects/[id]/roadmap-view");

function renderRoadmap(
  data: ProjectData = sampleData(),
  overrides: Partial<ProjectContextValue> = {},
) {
  const ctx = contextFor(data, overrides);
  render(
    <ProjectProvider value={ctx}>
      <RoadmapView />
    </ProjectProvider>,
  );
  return { ctx };
}

const epicByKey = (data: ProjectData, key: string): Issue =>
  data.issues.find((i) => i.key === key)!;

const bar = (name: RegExp) => screen.getByRole("button", { name });

describe("the view's place in the project", () => {
  it("is what ?view=roadmap shows", async () => {
    const { viewById } = await import("@/app/(app)/projects/[id]/views");
    expect(viewById("roadmap").Component).toBe(RoadmapView);
  });
});

describe("the timeline", () => {
  it("draws a bar for each epic with both dates, labelled with its key and progress", () => {
    renderRoadmap();
    const timeline = screen.getByRole("list", {
      name: "Epics on the timeline",
    });
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(3);
    /* The label is written on the bar, visibly, in two layers. */
    expect(screen.getAllByText("CHK-1 · 47%")).toHaveLength(2);
    expect(screen.getAllByText("CHK-2 · 68%")).toHaveLength(2);
    expect(screen.getAllByText("CHK-3 · 0%").length).toBeGreaterThan(0);
  });

  it("says each epic's dates and count in the bar's name and its tooltip", () => {
    renderRoadmap();
    const first = bar(/^CHK-1 /);
    expect(first).toHaveAccessibleName(
      "CHK-1 Payments API v2, 11 Sep – 29 Oct, 4 of 8 done",
    );
    expect(first).toHaveAttribute(
      "title",
      "CHK-1 Payments API v2, 11 Sep – 29 Oct, 4 of 8 done",
    );
  });

  it("writes each epic's name and count beside its bar, where nobody has to hover", () => {
    renderRoadmap();
    expect(screen.getByText("Payments API v2")).toBeVisible();
    expect(screen.getByText("4 of 8 done")).toBeInTheDocument();
    expect(screen.getByText("4 of 7 done")).toBeInTheDocument();
    expect(screen.getByText("0 of 2 done")).toBeInTheDocument();
  });

  it("heads the timeline with its months and marks today", () => {
    renderRoadmap();
    for (const label of ["Sep 2026", "Oct", "Nov", "Dec", "Jan 2027"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("sizes the timeline in pixels from the month range and keeps it in its own scroller", () => {
    renderRoadmap();
    const timeline = screen.getByRole("list", {
      name: "Epics on the timeline",
    });
    /* 153 days at eight pixels. */
    expect(timeline.parentElement).toHaveStyle({ width: "1224px" });
    expect(timeline.closest(".scroll-x")).not.toBeNull();
  });

  it("puts a bar where its dates put it", () => {
    renderRoadmap();
    /* CHK-1 runs 11 Sep to 29 Oct: 10 days into September, 49 days long. */
    expect(bar(/^CHK-1 /)).toHaveStyle({ left: "80px", width: "392px" });
  });

  it("fills a bar by progress", () => {
    renderRoadmap();
    const fill = bar(/^CHK-1 /).querySelector("span") as HTMLElement;
    expect(fill.style.width).toBe("47%");
    const none = bar(/^CHK-3 /).querySelector("span") as HTMLElement;
    expect(none.style.width).toBe("0%");
  });
});

describe("opening an epic", () => {
  it("opens it from its bar", async () => {
    const data = sampleData();
    const { ctx } = renderRoadmap(data);
    await userEvent.click(bar(/^CHK-2 /));
    expect(ctx.openIssue).toHaveBeenCalledTimes(1);
    expect(ctx.openIssue).toHaveBeenCalledWith(epicByKey(data, "CHK-2"));
  });

  it("opens it from anywhere on its row, once", async () => {
    const data = sampleData();
    const { ctx } = renderRoadmap(data);
    const row = bar(/^CHK-2 /).closest("li")!;
    await userEvent.click(row);
    expect(ctx.openIssue).toHaveBeenCalledTimes(1);
    expect(ctx.openIssue).toHaveBeenCalledWith(epicByKey(data, "CHK-2"));
  });

  it("opens it from its name", async () => {
    const data = sampleData();
    const { ctx } = renderRoadmap(data);
    await userEvent.click(screen.getByText("Fraud screening"));
    expect(ctx.openIssue).toHaveBeenCalledWith(epicByKey(data, "CHK-3"));
  });

  it("opens it from the keyboard, with one tab stop a row", async () => {
    const data = sampleData();
    const { ctx } = renderRoadmap(data);
    const first = bar(/^CHK-1 /);
    first.focus();
    expect(first).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(ctx.openIssue).toHaveBeenCalledTimes(1);
    expect(ctx.openIssue).toHaveBeenCalledWith(epicByKey(data, "CHK-1"));
    /* Tab from a bar goes on to the next bar, not to a second control on the row. */
    await userEvent.tab();
    expect(bar(/^CHK-2 /)).toHaveFocus();
  });
});

describe("epics that need dates", () => {
  it("lists each epic missing a date, and opens it to set them", async () => {
    const data = sampleData();
    const { ctx } = renderRoadmap(data);
    const strip = screen.getByRole("region", { name: "Epics that need dates" });
    const button = within(strip).getByRole("button", { name: /CHK-4/ });
    expect(button).toHaveTextContent("Saved cards");
    await userEvent.click(button);
    expect(ctx.openIssue).toHaveBeenCalledWith(epicByKey(data, "CHK-4"));
  });

  it("lists an epic with only one of its two dates", () => {
    const data = sampleData();
    const withHalf = {
      ...data,
      issues: data.issues.map((i) =>
        i.key === "CHK-3" ? { ...i, dueDate: null } : i,
      ),
    };
    renderRoadmap(withHalf);
    const strip = screen.getByRole("region", { name: "Epics that need dates" });
    expect(
      within(strip).getByRole("button", { name: /CHK-3/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Epics on the timeline" }).children,
    ).toHaveLength(2);
  });

  it("has no strip when every epic is dated", () => {
    const data = sampleData();
    renderRoadmap({
      ...data,
      issues: data.issues.map((i) =>
        i.key === "CHK-4"
          ? { ...i, startDate: "2026-11-01", dueDate: "2026-11-30" }
          : i,
      ),
    });
    expect(
      screen.queryByRole("region", { name: "Epics that need dates" }),
    ).not.toBeInTheDocument();
  });

  it("says there is nothing to draw when no epic has both dates", () => {
    const data = sampleData();
    renderRoadmap({
      ...data,
      issues: data.issues.map((i) =>
        i.type === "EPIC" ? { ...i, startDate: null, dueDate: null } : i,
      ),
    });
    expect(screen.getByText(/nothing to draw/)).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Epics on the timeline" }),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "Epics that need dates" }),
      ).getAllByRole("button"),
    ).toHaveLength(4);
  });
});

describe("making an epic", () => {
  it("offers New epic to somebody who can work, and asks for an epic", async () => {
    const { ctx } = renderRoadmap();
    await userEvent.click(screen.getByRole("button", { name: "New epic" }));
    expect(ctx.openCreate).toHaveBeenCalledWith({ type: "EPIC" });
  });

  it("offers nothing to somebody who cannot", () => {
    renderRoadmap(sampleData(), { canWork: false });
    expect(
      screen.queryByRole("button", { name: "New epic" }),
    ).not.toBeInTheDocument();
    /* The timeline is still theirs to read and open. */
    expect(bar(/^CHK-1 /)).toBeInTheDocument();
  });
});

describe("a project with no epics", () => {
  const empty = () => {
    const data = sampleData();
    return { ...data, issues: data.issues.filter((i) => i.type !== "EPIC") };
  };

  it("says so, and offers to make one", async () => {
    const { ctx } = renderRoadmap(empty());
    expect(screen.getByText("No epics yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "New epic" }));
    expect(ctx.openCreate).toHaveBeenCalledWith({ type: "EPIC" });
    expect(screen.getAllByRole("button", { name: "New epic" })).toHaveLength(1);
  });

  it("only says so to somebody who cannot make one", () => {
    renderRoadmap(empty(), { canWork: false });
    expect(screen.getByText("No epics yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "New epic" }),
    ).not.toBeInTheDocument();
  });
});

describe("an epic with no issues, and a short one", () => {
  const withEpics = (...epics: Partial<Issue>[]) => {
    const data = sampleData();
    const template = epicByKey(data, "CHK-1");
    return {
      ...data,
      issues: [
        ...data.issues.filter((i) => i.type !== "EPIC"),
        ...epics.map((e, n) => ({
          ...template,
          id: `extra-${n}`,
          key: `CHK-9${n}`,
          title: `Extra ${n}`,
          ...e,
        })),
      ],
    };
  };

  it("says there are no issues rather than showing 0%", () => {
    renderRoadmap(
      withEpics({ startDate: "2026-10-10", dueDate: "2026-11-20" }),
    );
    expect(screen.getAllByText("CHK-90 · No issues").length).toBeGreaterThan(0);
    expect(screen.getByText("No issues yet")).toBeInTheDocument();
    expect(screen.queryByText(/CHK-90 · 0%/)).not.toBeInTheDocument();
  });

  it("writes the label beside a bar too short to hold it, and not inside it", () => {
    renderRoadmap(
      withEpics({ startDate: "2026-10-20", dueDate: "2026-10-24" }),
    );
    const short = bar(/^CHK-90 /);
    expect(short).toHaveStyle({ width: "40px" });
    expect(within(short).queryByText(/CHK-90/)).not.toBeInTheDocument();
    const outside = screen.getAllByText("CHK-90 · No issues");
    expect(outside).toHaveLength(1);
    expect(outside[0]!.parentElement).toBe(short.closest("li"));
  });

  it("puts that label on the left when the right would run off the end", () => {
    renderRoadmap(
      withEpics({ startDate: "2027-01-29", dueDate: "2027-01-31" }),
    );
    const [label] = screen.getAllByText("CHK-90 · No issues");
    expect(label!.style.right).not.toBe("");
    expect(label!.style.left).toBe("");
  });
});

describe("keeping to the box", () => {
  it("scrolls the timeline inside its own container and leaves the page alone", () => {
    renderRoadmap();
    const scroller = screen
      .getByRole("list", { name: "Epics on the timeline" })
      .closest(".scroll-x") as HTMLElement;
    expect(scroller).toHaveClass("scroll-x");
    /* The names stay put while the timeline moves. */
    const names = scroller.querySelector("[aria-hidden='true']") as HTMLElement;
    expect(names).toHaveClass("sticky", "left-0");
  });

  it("does not move the view when the epics change", () => {
    const ctx = contextFor(sampleData());
    const { rerender } = render(
      <ProjectProvider value={ctx}>
        <RoadmapView />
      </ProjectProvider>,
    );
    const scroller = screen
      .getByRole("list", { name: "Epics on the timeline" })
      .closest(".scroll-x") as HTMLElement;
    scroller.scrollLeft = 123;
    rerender(
      <ProjectProvider value={{ ...ctx, issues: [...ctx.issues] }}>
        <RoadmapView />
      </ProjectProvider>,
    );
    expect(scroller.scrollLeft).toBe(123);
  });
});
