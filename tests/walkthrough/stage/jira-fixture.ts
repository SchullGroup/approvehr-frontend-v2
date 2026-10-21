import { PEOPLE } from "../people";

/**
 * What the Atlassian stand-in "has in Jira": one site, two projects and a dozen
 * tickets, assigned by **email** to the walkthrough's own people so the
 * work-tracker can match a ticket to somebody.
 *
 * Dates are made from the moment the stand-in starts, never written down: a
 * fixture with `2026-10-21` in it is a fixture whose "due in three days" quietly
 * becomes "due last month" a week later, and the walkthrough's wording about
 * overdue work would change for a reason nobody can see.
 */

export const SITE = {
  id: "walk-site-0001",
  name: "Fictional Works",
  url: "https://fictional-works.example",
} as const;

export const PROJECTS = [
  {
    id: "10001",
    key: "WALK",
    name: "Walkthrough Platform",
    projectTypeKey: "software",
  },
  {
    id: "10002",
    key: "OPS",
    name: "Operations Desk",
    projectTypeKey: "business",
  },
] as const;

type Category = "new" | "indeterminate" | "done";

export type FixtureIssue = {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { key: Category } };
    assignee: {
      accountId: string;
      emailAddress: string;
      displayName: string;
    } | null;
    duedate: string | null;
    resolutiondate: string | null;
    statuscategorychangedate: string;
    created: string;
    updated: string;
    labels: string[];
    parent?: { key: string };
    project: { key: string };
  };
};

const person = (
  key: "employee" | "projectMember" | "projectLead" | "interviewer",
) => ({
  accountId: `acct-${key}`,
  emailAddress: PEOPLE[key].email,
  displayName: PEOPLE[key].name,
});

const STATUS: Record<Category, string> = {
  new: "To Do",
  indeterminate: "In Progress",
  done: "Done",
};

export function fixtureIssues(now: Date): FixtureIssue[] {
  const day = 24 * 60 * 60 * 1000;
  const ago = (days: number) =>
    new Date(now.getTime() - days * day).toISOString();
  const due = (days: number) =>
    new Date(now.getTime() + days * day).toISOString().slice(0, 10);

  const make = (
    n: number,
    project: "WALK" | "OPS",
    summary: string,
    category: Category,
    assignee: ReturnType<typeof person> | null,
    extra: {
      due?: number;
      doneAgo?: number;
      updatedAgo: number;
      labels?: string[];
      epic?: string;
    },
  ): FixtureIssue => {
    const key = `${project}-${String(n)}`;
    const updated = ago(extra.updatedAgo);
    return {
      id: String(20000 + n + (project === "OPS" ? 500 : 0)),
      key,
      fields: {
        summary,
        status: { name: STATUS[category], statusCategory: { key: category } },
        assignee,
        duedate: extra.due === undefined ? null : due(extra.due),
        resolutiondate:
          category === "done" && extra.doneAgo !== undefined
            ? ago(extra.doneAgo)
            : null,
        statuscategorychangedate: updated,
        created: ago(40),
        updated,
        labels: extra.labels ?? [],
        ...(extra.epic ? { parent: { key: extra.epic } } : {}),
        project: { key: project },
      },
    };
  };

  return [
    make(100, "WALK", "Hiring revamp", "indeterminate", person("projectLead"), {
      updatedAgo: 2,
      labels: ["epic"],
    }),
    make(1, "WALK", "Draft the careers page copy", "done", person("employee"), {
      doneAgo: 3,
      updatedAgo: 3,
      epic: "WALK-100",
    }),
    make(
      2,
      "WALK",
      "Fix long names wrapping on the candidate card",
      "indeterminate",
      person("projectMember"),
      {
        due: 2,
        updatedAgo: 1,
        epic: "WALK-100",
      },
    ),
    make(
      3,
      "WALK",
      "Export interview scorecards for the panel",
      "new",
      person("projectMember"),
      {
        due: 6,
        updatedAgo: 4,
        epic: "WALK-100",
      },
    ),
    make(4, "WALK", "Review the names of the pipeline stages", "new", null, {
      updatedAgo: 5,
    }),
    make(
      5,
      "WALK",
      "Agree the interview feedback template",
      "indeterminate",
      person("interviewer"),
      {
        due: 1,
        updatedAgo: 1,
      },
    ),
    make(
      6,
      "WALK",
      "Archive last quarter's closed roles",
      "done",
      person("projectLead"),
      {
        doneAgo: 9,
        updatedAgo: 9,
      },
    ),
    make(
      1,
      "OPS",
      "Order laptops for the new hires",
      "indeterminate",
      person("employee"),
      {
        due: 3,
        updatedAgo: 1,
      },
    ),
    make(
      2,
      "OPS",
      "Prepare a desk for the starter",
      "new",
      person("employee"),
      {
        due: 7,
        updatedAgo: 2,
      },
    ),
    make(
      3,
      "OPS",
      "Renew the printer contract",
      "done",
      person("projectLead"),
      {
        doneAgo: 14,
        updatedAgo: 14,
      },
    ),
    make(4, "OPS", "Collect the welcome packs", "new", null, {
      due: 10,
      updatedAgo: 6,
    }),
    make(5, "OPS", "Book the induction room", "done", person("employee"), {
      doneAgo: 1,
      updatedAgo: 1,
    }),
  ];
}
