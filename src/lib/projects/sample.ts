/**
 * "Checkout Revamp" — the sample project the demo opens with.
 *
 * Four sprints (two closed, one active, one planned), four epics, eighteen
 * issues, four sub-tasks and two comments, so every view has something real to
 * draw: a burndown that has moved, a velocity history, a roadmap with an epic
 * that needs dates, a board with a column over its WIP limit.
 *
 * Dates are written as offsets from `today` and turned into days here, so the
 * sample is always "in the middle of Sprint 3" whenever it is built. It is only
 * ever built in demo mode: in a production build `DEMO_ENABLED` folds the call
 * away, and no sample reaches a customer's company.
 *
 * Assignees come from the employees the caller passes in. With fewer than four
 * people the later ones fall back to the first, so a small company still gets a
 * full board.
 */

import { addDays } from "./dates";
import { PROJECT_COLORS } from "./types";
import type {
  Issue,
  IssueActivity,
  IssueComment,
  Project,
  Sprint,
} from "./types";

export const SAMPLE_KEY = "CHK";

export const SAMPLE_PROJECT_ID = "pj-chk";

export type SampleResult = {
  project: Project;
  sprints: Sprint[];
  issues: Issue[];
  comments: Record<string, IssueComment[]>;
  activity: Record<string, IssueActivity[]>;
  /** The highest issue number used, so the demo counter carries on from it. */
  lastNumber: number;
};

const STATUS = {
  todo: "st-chk-todo",
  prog: "st-chk-prog",
  review: "st-chk-review",
  done: "st-chk-done",
} as const;

type RowStatus = keyof typeof STATUS;

export function buildSample(args: {
  today: string;
  /** An ISO instant, the moment the sample is built. */
  now: string;
  /** Employee ids. The first leads the project. */
  people: readonly string[];
  departmentId?: string | null;
}): SampleResult {
  const { today, now } = args;
  const people = args.people.length ? args.people : [""];
  const p0 = people[0]!;
  const p1 = people[1] ?? p0;
  const p2 = people[2] ?? p0;
  const p3 = people[3] ?? null;

  const d = (n: number) => addDays(today, n);
  const at = (n: number) => `${d(n)}T11:00:00.000Z`;

  const sp = (
    n: number,
    name: string,
    goal: string,
    start: number,
    end: number,
    state: Sprint["state"],
    created: number,
    extra: Partial<Sprint> = {},
  ): Sprint => ({
    id: `sp-chk-${n}`,
    projectId: SAMPLE_PROJECT_ID,
    name,
    goal,
    startDate: d(start),
    endDate: d(end),
    state,
    committedPoints: null,
    completedPoints: null,
    closedAt: null,
    createdAt: at(created),
    ...extra,
  });

  const sprints: Sprint[] = [
    sp(
      1,
      "CHK Sprint 1",
      "Card payments end to end in staging",
      -34,
      -21,
      "CLOSED",
      -36,
      {
        committedPoints: 21,
        completedPoints: 18,
        closedAt: at(-21),
      },
    ),
    sp(
      2,
      "CHK Sprint 2",
      "New cart drawer behind a flag",
      -20,
      -7,
      "CLOSED",
      -22,
      {
        committedPoints: 24,
        completedPoints: 22,
        closedAt: at(-7),
      },
    ),
    sp(
      3,
      "CHK Sprint 3",
      "Ship 3-D Secure and cut payment errors in half",
      -6,
      7,
      "ACTIVE",
      -8,
      {
        committedPoints: 26,
      },
    ),
    sp(4, "CHK Sprint 4", "", 8, 21, "PLANNED", -2),
  ];

  const epics: [
    string,
    string,
    string,
    string | null,
    string | null,
    RowStatus,
  ][] = [
    [
      "e1",
      "Payments API v2",
      "Replace the legacy charge endpoint with a provider-agnostic payments service.",
      d(-34),
      d(14),
      "prog",
    ],
    [
      "e2",
      "Cart & checkout UX",
      "Single-page checkout with an inline cart drawer and address autocomplete.",
      d(-20),
      d(35),
      "prog",
    ],
    [
      "e3",
      "Fraud screening",
      "Score orders before capture and route risky ones to manual review.",
      d(10),
      d(60),
      "todo",
    ],
    [
      "e4",
      "Saved cards",
      "Let returning customers pay with a stored, tokenized card.",
      null,
      null,
      "todo",
    ],
  ];

  // id, type, title, status, priority, points, assignee, sprint, epic, doneOffset, labels
  type Row = [
    string,
    Issue["type"],
    string,
    RowStatus,
    Issue["priority"],
    number,
    string | null,
    string | null,
    string,
    number | null,
    string[],
  ];
  const rows: Row[] = [
    [
      "i1",
      "STORY",
      "Charge endpoint accepts provider-agnostic payment intents",
      "done",
      "HIGH",
      5,
      p0,
      "1",
      "e1",
      -25,
      ["api"],
    ],
    [
      "i2",
      "TASK",
      "Write contract tests for the payments service",
      "done",
      "MEDIUM",
      3,
      p1,
      "1",
      "e1",
      -23,
      ["api", "testing"],
    ],
    [
      "i3",
      "BUG",
      "Duplicate charges when the confirm button is double-clicked",
      "done",
      "HIGHEST",
      3,
      p2,
      "1",
      "e1",
      -22,
      ["payments"],
    ],
    [
      "i4",
      "STORY",
      "Cart drawer slides in from product pages",
      "done",
      "MEDIUM",
      5,
      p1,
      "2",
      "e2",
      -14,
      ["web"],
    ],
    [
      "i5",
      "STORY",
      "Address autocomplete on the shipping step",
      "done",
      "MEDIUM",
      8,
      p2,
      "2",
      "e2",
      -9,
      ["web"],
    ],
    [
      "i6",
      "STORY",
      "3-D Secure challenge flow for EU cards",
      "prog",
      "HIGHEST",
      8,
      p0,
      "3",
      "e1",
      null,
      ["payments", "compliance"],
    ],
    [
      "i7",
      "TASK",
      "Retry failed webhooks with exponential backoff",
      "done",
      "HIGH",
      3,
      p1,
      "3",
      "e1",
      -4,
      ["api"],
    ],
    [
      "i8",
      "BUG",
      "Promo code field clears when the page reloads",
      "review",
      "MEDIUM",
      2,
      p2,
      "3",
      "e2",
      null,
      ["web"],
    ],
    [
      "i9",
      "STORY",
      "Show line-item tax breakdown in the order summary",
      "done",
      "MEDIUM",
      5,
      p3,
      "3",
      "e2",
      -2,
      ["web"],
    ],
    [
      "i10",
      "TASK",
      "Instrument payment error rates by provider",
      "todo",
      "HIGH",
      3,
      p0,
      "3",
      "e1",
      null,
      ["observability"],
    ],
    [
      "i11",
      "BUG",
      "Apple Pay button misaligned on Safari 17",
      "done",
      "LOW",
      1,
      p1,
      "3",
      "e2",
      -1,
      ["web", "ios"],
    ],
    [
      "i12",
      "STORY",
      "Guest checkout without creating an account",
      "prog",
      "HIGH",
      5,
      p2,
      "3",
      "e2",
      null,
      ["web"],
    ],
    [
      "i13",
      "TASK",
      "Load test checkout at 3x Black Friday peak",
      "todo",
      "MEDIUM",
      3,
      null,
      "4",
      "e1",
      null,
      ["performance"],
    ],
    [
      "i14",
      "STORY",
      "Rules engine for order risk scores",
      "todo",
      "MEDIUM",
      8,
      null,
      "4",
      "e3",
      null,
      ["risk"],
    ],
    [
      "i15",
      "STORY",
      "Manual review queue for flagged orders",
      "todo",
      "MEDIUM",
      5,
      null,
      null,
      "e3",
      null,
      ["risk", "ops"],
    ],
    [
      "i16",
      "STORY",
      "Tokenize and store cards with the vault provider",
      "todo",
      "HIGH",
      8,
      null,
      null,
      "e4",
      null,
      ["payments"],
    ],
    [
      "i17",
      "BUG",
      "Currency shows USD for NGN shoppers on the receipt email",
      "todo",
      "HIGH",
      2,
      p3,
      null,
      "e2",
      null,
      ["email", "i18n"],
    ],
    [
      "i18",
      "TASK",
      "Remove the legacy /charge v1 endpoint",
      "todo",
      "LOW",
      2,
      null,
      null,
      "e1",
      null,
      ["api", "cleanup"],
    ],
  ];

  const subs: [
    string,
    string,
    string,
    RowStatus,
    string | null,
    number | null,
  ][] = [
    ["k1", "i6", "Handle challenge timeout and abandon", "done", p0, -3],
    ["k2", "i6", "Map provider error codes to user copy", "prog", p0, null],
    ["k3", "i6", "Add 3DS test cards to the QA plan", "todo", p3, null],
    ["k4", "i12", "Email-only order lookup page", "todo", p2, null],
  ];

  const ids = new Map<string, string>();
  const idOf = (key: string) => {
    let id = ids.get(key);
    if (!id) {
      id = `is-chk-${key}`;
      ids.set(key, id);
    }
    return id;
  };

  const issues: Issue[] = [];
  const activity: Record<string, IssueActivity[]> = {};
  let number = 0;
  let rank = 0;

  const base = (
    key: string,
    o: Partial<Issue> & Pick<Issue, "type" | "title" | "statusId">,
  ) => {
    number += 1;
    rank += 1;
    const createdAt = at(-36 + number);
    const id = idOf(key);
    const issue: Issue = {
      id,
      projectId: SAMPLE_PROJECT_ID,
      number,
      key: `${SAMPLE_KEY}-${number}`,
      description: "",
      priority: "MEDIUM",
      assigneeId: null,
      reporterId: p0,
      epicId: null,
      parentId: null,
      sprintId: null,
      points: null,
      labels: [],
      startDate: null,
      dueDate: null,
      rank,
      doneAt: null,
      goalId: null,
      createdAt,
      updatedAt: o.doneAt ?? createdAt,
      ...o,
    };
    issues.push(issue);
    activity[id] = [
      {
        id: `ac-chk-${key}-created`,
        issueId: id,
        actorId: p0,
        field: "created",
        from: undefined,
        to: undefined,
        at: createdAt,
      },
    ];
  };

  for (const [key, title, description, start, end, status] of epics) {
    base(key, {
      type: "EPIC",
      title,
      description,
      statusId: STATUS[status],
      startDate: start,
      dueDate: end,
      priority: "HIGH",
    });
  }
  for (const [
    key,
    type,
    title,
    status,
    priority,
    points,
    assignee,
    sprint,
    epic,
    doneOffset,
    labels,
  ] of rows) {
    base(key, {
      type,
      title,
      statusId: STATUS[status],
      priority,
      points,
      assigneeId: assignee,
      sprintId: sprint ? `sp-chk-${sprint}` : null,
      epicId: idOf(epic),
      labels,
      doneAt: doneOffset !== null ? at(doneOffset) : null,
      dueDate: key === "i17" ? d(-2) : key === "i10" ? d(5) : null,
      description:
        key === "i6"
          ? "EU cards over ₦30 now require Strong Customer Authentication. Trigger the provider’s challenge when the intent returns requires_action, and resume checkout once the bank confirms.\n\nDone when: challenge works on desktop and mobile web, and abandoned challenges release the cart hold within 15 minutes."
          : "",
    });
  }
  for (const [key, parent, title, status, assignee, doneOffset] of subs) {
    const parentIssue = issues.find((i) => i.id === idOf(parent))!;
    base(key, {
      type: "SUBTASK",
      title,
      statusId: STATUS[status],
      assigneeId: assignee,
      parentId: parentIssue.id,
      sprintId: parentIssue.sprintId,
      epicId: parentIssue.epicId,
      doneAt: doneOffset !== null ? at(doneOffset) : null,
    });
  }

  const i6 = idOf("i6");
  const hoursAgo = (h: number) =>
    new Date(Date.parse(now) - h * 3_600_000).toISOString();
  const comments: Record<string, IssueComment[]> = {
    [i6]: [
      {
        id: "cm-chk-1",
        issueId: i6,
        authorId: p1,
        createdAt: hoursAgo(5),
        body: `Provider sandbox now returns requires_action for the EU test cards. <@${p0}> can you check the redirect URL config?`,
      },
      {
        id: "cm-chk-2",
        issueId: i6,
        authorId: p0,
        createdAt: hoursAgo(3),
        body: "Fixed in staging. The return URL was missing the order id.",
      },
    ],
  };

  const project: Project = {
    id: SAMPLE_PROJECT_ID,
    key: SAMPLE_KEY,
    name: "Checkout Revamp",
    description:
      "Rebuild web checkout: faster payments, a clearer cart and fewer fraud false positives.",
    type: "SCRUM",
    color: PROJECT_COLORS[0],
    departmentId: args.departmentId ?? null,
    departmentName: null,
    leadId: p0,
    goalId: null,
    memberIds: [...new Set(args.people.filter(Boolean))],
    statuses: [
      {
        id: STATUS.todo,
        name: "To Do",
        category: "TODO",
        wipLimit: null,
        position: 0,
      },
      {
        id: STATUS.prog,
        name: "In Progress",
        category: "IN_PROGRESS",
        wipLimit: 5,
        position: 1,
      },
      {
        id: STATUS.review,
        name: "In Review",
        category: "IN_PROGRESS",
        wipLimit: 3,
        position: 2,
      },
      {
        id: STATUS.done,
        name: "Done",
        category: "DONE",
        wipLimit: null,
        position: 3,
      },
    ],
    createdById: p0,
    createdAt: at(-40),
    updatedAt: at(-40),
    openIssueCount: null,
  };

  return { project, sprints, issues, comments, activity, lastNumber: number };
}
