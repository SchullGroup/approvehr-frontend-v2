import { OBJECTIVES } from "@/lib/imports/objectives";
import type { ImportSurface } from "@/lib/imports/surface";
import { useCanUploadObjectives } from "./access";

/**
 * What the import screen says when the thing being imported is an objective.
 *
 * The only objectives-specific file in this route besides the access rule. The
 * dictionary (`lib/imports/objectives.ts`) is the data contract; this is the
 * copy — the page title, where the objectives are once they are in, and where the
 * things a row can name get made.
 *
 * `prerequisites` is keyed by the `missing` keys the API returns: `people`,
 * `departments` and `parents`. Parents have no screen of their own — a parent is
 * an objective, so the link is the KPIs screen where one is added.
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
  noAccess: {
    title: "Uploading objectives is for people who lead a team",
    description:
      "You can add your own objectives one at a time on the KPIs screen. To upload for a team, somebody needs to report to you, you need to head a department, or you need the records permission.",
  },
  prerequisites: {
    people: {
      title: "Some owner emails match nobody",
      consequence:
        "will be skipped. The owner has to be on your staff list, by work email.",
      action: { href: "/people", label: "Check your staff list" },
    },
    departments: {
      title: "Some departments do not exist yet",
      consequence: "will be skipped until they exist.",
      action: { href: "/people/departments", label: "Add the departments" },
    },
    parents: {
      title: "Some parent objectives do not exist yet",
      consequence:
        "will be skipped. Add the department or company objective first, then upload the rows beneath it.",
      action: { href: "/performance/kpis", label: "Go to KPIs" },
    },
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
