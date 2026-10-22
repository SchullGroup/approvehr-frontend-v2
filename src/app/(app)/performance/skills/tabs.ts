/**
 * The tab ids for Competency ratings, and nothing else.
 *
 * Its own module with no `"use client"` so `page.tsx` can validate `?tab=` on
 * the server (see `lib/url-tab.ts`); the labels and counts are in the screen.
 */
export const SKILLS_TABS = ["mine", "gaps", "heatmap"] as const;

export type SkillsTabId = (typeof SKILLS_TABS)[number];
