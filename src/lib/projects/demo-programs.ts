/**
 * The programs the demo opens with.
 *
 * Two programs, so every screen above a project has something to show and every
 * level of access has somebody holding it:
 *
 * - **Operations**, led by Halima. Content calendar (a Kanban with five stages,
 *   Ngozi on it alone) and HR onboarding. Musa has read, Grace read and write.
 * - **Technology**, led by Adaeze. Checkout Revamp (the cycle-based sample) and
 *   Mobile app. Tunde has read. Emeka is on Checkout Revamp and nothing else, so
 *   he cannot see Mobile app.
 * - **Unassigned**: Office move, in no program.
 *
 * Dates are offsets from `today`, as the Checkout Revamp sample's are, so the
 * demo is always in the middle of something. Built only in demo mode.
 */

import { addDays } from "./dates";
import { buildIssue } from "./mutations";
import type { StoredProgram } from "./programs";
import { SAMPLE_PROJECT_ID, type SampleResult } from "./sample";
import type { ProgramLevel } from "./access";
import {
  PROJECT_COLORS,
  type Issue,
  type Priority,
  type Project,
  type ProjectData,
  type ProjectStatus,
  type StatusCategory,
} from "./types";

export const OPERATIONS_ID = "pg-ops";
export const TECHNOLOGY_ID = "pg-tech";

/** Who holds what in the demo, as employee ids from the demo directory. */
export const DEMO_ROLES = {
  operationsLead: "p-10",
  operationsRead: "p-07",
  operationsWrite: "p-08",
  contentMember: "p-04",
  technologyLead: "p-01",
  technologyRead: "p-02",
  checkoutOnly: "p-09",
} as const;

type Task = {
  title: string;
  stage: number;
  /** Days from today; negative is past. */
  due: number | null;
  who?: readonly (string | null)[];
  priority?: Priority;
  /** For a finished task: how many days ago it was finished. */
  doneAgo?: number;
};

type Stage = [name: string, category: StatusCategory, limit?: number];

function project(args: {
  id: string;
  key: string;
  name: string;
  description: string;
  color: string;
  lead: string;
  members: readonly string[];
  stages: readonly Stage[];
  tasks: readonly Task[];
  programId: string | null;
  today: string;
  now: string;
}): { data: ProjectData; last: number } {
  const statuses: ProjectStatus[] = args.stages.map(
    ([name, category, limit], position) => ({
      id: `st-${args.key.toLowerCase()}-${position}`,
      name,
      category,
      wipLimit: limit ?? null,
      position,
    }),
  );
  const base: Project = {
    id: args.id,
    key: args.key,
    name: args.name,
    description: args.description,
    type: "KANBAN",
    color: args.color,
    departmentId: null,
    departmentName: null,
    leadId: args.lead,
    leadName: null,
    goalId: null,
    memberIds: [...new Set([args.lead, ...args.members])],
    statuses,
    createdById: args.lead,
    createdAt: `${addDays(args.today, -40)}T09:00:00.000Z`,
    updatedAt: args.now,
    openIssueCount: null,
    issueCount: null,
    activeSprintId: null,
    canManage: null,
    programId: args.programId,
  };
  let data: ProjectData = { project: base, issues: [], sprints: [] };
  const issues: Issue[] = [];
  args.tasks.forEach((task, index) => {
    const status = statuses[task.stage]!;
    const who = (task.who ?? [args.lead]).filter(
      (id): id is string => typeof id === "string",
    );
    const issue = buildIssue(
      data,
      {
        type: "TASK",
        title: task.title,
        statusId: status.id,
        priority: task.priority ?? "MEDIUM",
        assigneeIds: who,
        dueDate: task.due === null ? null : addDays(args.today, task.due),
      },
      {
        id: `${args.id}-t${index + 1}`,
        now: args.now,
        actorId: args.lead,
        number: index + 1,
      },
    );
    const finished = status.category === "DONE";
    const doneDay = addDays(args.today, -(task.doneAgo ?? 1));
    const created = `${addDays(args.today, -(12 + index))}T10:00:00.000Z`;
    const placed: Issue = {
      ...issue,
      rank: index + 1,
      createdAt: created,
      doneAt: finished ? `${doneDay}T14:00:00.000Z` : null,
      updatedAt: finished ? `${doneDay}T14:00:00.000Z` : created,
    };
    issues.push(placed);
    data = { ...data, issues: [...issues] };
  });
  return { data, last: args.tasks.length };
}

export type ProgramSample = {
  programs: Record<string, StoredProgram>;
  access: Record<string, Record<string, ProgramLevel>>;
  projects: ProjectData[];
  counters: Record<string, number>;
};

/**
 * The programs, their people and their projects, and the Checkout Revamp
 * sample filed under Technology.
 */
export function buildProgramSample(args: {
  today: string;
  now: string;
  sample: SampleResult;
  nameOfDepartmentless?: never;
}): ProgramSample {
  const { today, now } = args;
  const at = (n: number) => `${addDays(today, n)}T09:00:00.000Z`;
  const r = DEMO_ROLES;

  const programs: Record<string, StoredProgram> = {
    [OPERATIONS_ID]: {
      id: OPERATIONS_ID,
      name: "Operations",
      description: "Content, people and the day-to-day running of the company.",
      color: PROJECT_COLORS[1],
      departmentId: null,
      departmentName: null,
      leadId: r.operationsLead,
      archivedAt: null,
      createdAt: at(-45),
      updatedAt: at(-45),
    },
    [TECHNOLOGY_ID]: {
      id: TECHNOLOGY_ID,
      name: "Technology",
      description: "Product and engineering work, from checkout to the app.",
      color: PROJECT_COLORS[0],
      departmentId: null,
      departmentName: null,
      leadId: r.technologyLead,
      archivedAt: null,
      createdAt: at(-45),
      updatedAt: at(-45),
    },
  };
  const access: Record<string, Record<string, ProgramLevel>> = {
    [OPERATIONS_ID]: {
      [r.operationsRead]: "READ",
      [r.operationsWrite]: "WRITE",
    },
    [TECHNOLOGY_ID]: { [r.technologyRead]: "READ" },
  };

  const content = project({
    id: "pj-cnt",
    key: "CNT",
    name: "Content calendar",
    description: "What we publish, when, and who is writing it.",
    color: PROJECT_COLORS[1],
    lead: r.operationsLead,
    members: [r.contentMember],
    programId: OPERATIONS_ID,
    today,
    now,
    stages: [
      ["Ideas", "TODO"],
      ["Drafting", "IN_PROGRESS", 4],
      ["In review", "IN_PROGRESS", 3],
      ["Scheduled", "IN_PROGRESS"],
      ["Published", "DONE"],
    ],
    tasks: [
      { title: "Plan the November themes", stage: 0, due: 5 },
      {
        title: "Interview the Lagos office lead",
        stage: 0,
        due: 9,
        who: [r.contentMember],
      },
      {
        title: "Case study: payroll in a day",
        stage: 1,
        due: 2,
        who: [r.contentMember],
      },
      {
        title: "Newsletter, week 46",
        stage: 1,
        due: -1,
        who: [r.contentMember],
        priority: "HIGH",
      },
      { title: "Video script: leave requests", stage: 2, due: 1 },
      {
        title: "Social posts for the product launch",
        stage: 3,
        due: 3,
        who: [r.contentMember],
      },
      {
        title: "Newsletter, week 45",
        stage: 4,
        due: -6,
        who: [r.contentMember],
        doneAgo: 2,
      },
      { title: "Blog: five payroll mistakes", stage: 4, due: -9, doneAgo: 4 },
      {
        title: "Customer profile: the clinic group",
        stage: 4,
        due: -12,
        who: [r.contentMember],
        doneAgo: 8,
      },
    ],
  });
  const onboarding = project({
    id: "pj-hro",
    key: "HRO",
    name: "HR onboarding",
    description: "Everything a new starter needs in their first month.",
    color: PROJECT_COLORS[5],
    lead: "p-05",
    members: ["p-06", r.operationsWrite],
    programId: OPERATIONS_ID,
    today,
    now,
    stages: [
      ["To do", "TODO"],
      ["In progress", "IN_PROGRESS", 5],
      ["Done", "DONE"],
    ],
    tasks: [
      {
        title: "Welcome pack for November starters",
        stage: 1,
        due: 2,
        who: ["p-06"],
      },
      {
        title: "Laptop and access checklist",
        stage: 1,
        due: -2,
        who: [r.operationsWrite],
        priority: "HIGH",
      },
      {
        title: "First-week schedule template",
        stage: 0,
        due: 7,
        who: ["p-05"],
      },
      {
        title: "Buddy matching for the new team",
        stage: 0,
        due: 4,
        who: ["p-06"],
      },
      {
        title: "Update the staff handbook links",
        stage: 2,
        due: -5,
        who: ["p-05"],
        doneAgo: 3,
      },
      {
        title: "Collect signed offer letters",
        stage: 2,
        due: -8,
        who: ["p-06"],
        doneAgo: 6,
      },
    ],
  });
  const mobile = project({
    id: "pj-mob",
    key: "APP",
    name: "Mobile app",
    description: "The employee app: clock in, leave and payslips on a phone.",
    color: PROJECT_COLORS[3],
    lead: "p-03",
    members: [r.technologyLead],
    programId: TECHNOLOGY_ID,
    today,
    now,
    stages: [
      ["To do", "TODO"],
      ["Building", "IN_PROGRESS", 4],
      ["Testing", "IN_PROGRESS", 3],
      ["Released", "DONE"],
    ],
    tasks: [
      {
        title: "Clock in with a location check",
        stage: 1,
        due: 4,
        who: ["p-03"],
      },
      {
        title: "Offline payslip viewing",
        stage: 1,
        due: -3,
        who: [r.technologyLead],
        priority: "HIGH",
      },
      {
        title: "Push notifications for approvals",
        stage: 2,
        due: 1,
        who: ["p-03", r.technologyLead],
      },
      { title: "Biometric sign-in", stage: 0, due: 14, who: ["p-03"] },
      { title: "Dark mode", stage: 0, due: null, who: [null] },
      {
        title: "Leave balance widget",
        stage: 3,
        due: -4,
        who: ["p-03"],
        doneAgo: 2,
      },
      {
        title: "App store listing",
        stage: 3,
        due: -10,
        who: [r.technologyLead],
        doneAgo: 7,
      },
    ],
  });
  const office = project({
    id: "pj-off",
    key: "OFF",
    name: "Office move",
    description: "Moving the Lagos office to the new building in the new year.",
    color: PROJECT_COLORS[4],
    lead: "p-02",
    members: [r.operationsWrite],
    programId: null,
    today,
    now,
    stages: [
      ["To do", "TODO"],
      ["Doing", "IN_PROGRESS"],
      ["Done", "DONE"],
    ],
    tasks: [
      {
        title: "Sign the lease",
        stage: 1,
        due: 6,
        who: ["p-02"],
        priority: "HIGH",
      },
      {
        title: "Choose a removals company",
        stage: 0,
        due: 12,
        who: [r.operationsWrite],
      },
      {
        title: "Tell the team the move date",
        stage: 2,
        due: -3,
        who: ["p-02"],
        doneAgo: 1,
      },
    ],
  });

  const checkout: ProjectData = {
    project: { ...args.sample.project, programId: TECHNOLOGY_ID },
    issues: args.sample.issues,
    sprints: args.sample.sprints,
  };

  return {
    programs,
    access,
    projects: [
      checkout,
      content.data,
      onboarding.data,
      mobile.data,
      office.data,
    ],
    counters: {
      [SAMPLE_PROJECT_ID]: args.sample.lastNumber,
      "pj-cnt": content.last,
      "pj-hro": onboarding.last,
      "pj-mob": mobile.last,
      "pj-off": office.last,
    },
  };
}
