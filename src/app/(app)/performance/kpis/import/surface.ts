import { OBJECTIVES, countUnfiled } from "@/lib/imports/objectives";
import type { ImportSurface } from "@/lib/imports/surface";
import { useCanUploadObjectives } from "./access";
import { useObjectiveTemplateLists } from "./lists";

/**
 * What the import screen says when the thing being imported is an objective.
 *
 * The only objectives-specific files in this route besides the access rule and
 * the template lists. The dictionary (`lib/imports/objectives.ts`) is the data
 * contract; this is the copy — the page title, where the objectives are once
 * they are in, and where the things a row can name get made.
 *
 * `prerequisites` is keyed by the `missing` keys the API returns: `people`,
 * `departments`, `periods` and `parents`. Parents have no screen of their own —
 * a parent is an objective, so the link is the KPIs screen where one is added.
 */
export const OBJECTIVES_IMPORT_SURFACE: ImportSurface = {
  dictionary: OBJECTIVES,
  title: "Upload objectives",
  breadcrumb: [
    { href: "/performance", label: "Performance" },
    { href: "/performance/kpis", label: "KPIs" },
  ],
  home: { href: "/performance/kpis", label: "See the objectives" },
  useAccess: useCanUploadObjectives,
  useTemplateLists: useObjectiveTemplateLists,
  noAccess: {
    title: "Uploading objectives is for people who lead a team",
    description:
      "You can add your own objectives one at a time on the KPIs screen. To upload for a team, somebody needs to report to you, you need to head a department, or you need the records permission.",
  },
  prerequisites: {
    people: {
      title: "Some work emails match nobody on your staff list",
      consequence:
        "will be skipped. The person an objective is assigned to has to be on your staff list, by work email.",
      action: { href: "/people", label: "Check your staff list" },
    },
    departments: {
      title: "Some departments do not exist yet",
      consequence: "will be skipped until they exist.",
      action: { href: "/people/departments", label: "Add the departments" },
    },
    /* No link: a department head, who is who this screen is for, cannot make a
       period, and the Periods tab is not theirs to open. Naming it is the help. */
    periods: {
      title: "Some appraisal periods do not exist",
      consequence:
        "will be skipped. Name a period that is still open, or leave the cell blank to take the parent objective's period if it has one — whoever runs appraisals can tell you what they are called.",
    },
    parents: {
      title: "Some parent objectives do not exist yet",
      consequence:
        "will be skipped. Add the department or company objective first, then upload the rows beneath it.",
      action: { href: "/performance/kpis", label: "Go to KPIs" },
    },
  },
  /* The one consequence of this upload that is easy to cause for fifty rows at
     once and that nothing downstream complains about: an objective filed in no
     appraisal period is agreed, tracked and scored for nobody. The rows carry the
     warning and the report groups it, closed, under Appraisal period; this says it
     once, open, with the count. It never blocks — a company may mean it — and it
     names the three ways out, each of which exists: a period named in the file, a
     value typed beside the row in the report, and Edit on a draft (which offers the
     period until the target is agreed and frozen). */
  checkNotices: (rows) => {
    const unfiled = countUnfiled(rows);
    if (unfiled === 0) return [];
    const one = unfiled === 1;
    return [
      {
        tone: "warning",
        title: `${one ? "1 objective has" : `${unfiled.toLocaleString("en-NG")} objectives have`} no appraisal period`,
        body: `${one ? "It still imports" : "They still import"}, but an objective that is not filed in an appraisal period counts towards nobody's appraisal mark, even once it is agreed. To file ${one ? "it" : "them"} in one, name a period that is still open under Appraisal period (you can type it beside each row below), or choose one with Edit on ${one ? "the objective" : "each objective"} before it is agreed.`,
      },
    ];
  },
  refusalWithoutApi: DEMO_ENABLED
    ? "This is demo mode. The file has been read and checked as far as a browser can, and that is where it stops: who may raise an objective for whom is decided on the server, so uploading here would show a team a quarter that nobody was allowed to give them."
    : "",
  linkedStats: [
    {
      key: "measuresAdded",
      label: "Measures added",
      hint: "numbers to hit, added with their objectives",
    },
  ],
};
