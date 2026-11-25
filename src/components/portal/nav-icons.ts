import { Network, Scale, type LucideIcon } from "lucide-react";

/**
 * The icon for a page that has a sidebar row AND a shortcut elsewhere (the
 * period page header). One map, read by both, so a shortcut cannot wear a
 * different icon from the row it points at. Keyed by the page's address.
 */
export const PAGE_ICONS: Record<string, LucideIcon> = {
  "/performance/appraisers": Network,
  "/performance/fairness": Scale,
};
