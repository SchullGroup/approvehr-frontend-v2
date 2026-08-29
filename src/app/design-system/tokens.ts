/**
 * The palette, mirrored from globals.css so the reference page can render
 * swatches and contrast ratios from the same values the CSS uses. If you
 * change a token, change it in both places and re-run `npm run verify-contrast`.
 */

export type Swatch = {
  name: string;
  varName: string;
  hex: string;
  /** Measured contrast on white, where the value is used for text. */
  ratio?: string;
  usage: string;
};

export const NEUTRALS: Swatch[] = [
  { name: "ink", varName: "--color-ink", hex: "#0a1f2d", ratio: "16.8:1", usage: "Headings and primary text" },
  { name: "ink-soft", varName: "--color-ink-soft", hex: "#16334a", ratio: "13.1:1", usage: "Secondary headings" },
  { name: "body", varName: "--color-body", hex: "#4a5a68", ratio: "7.1:1", usage: "Body copy" },
  { name: "muted", varName: "--color-muted", hex: "#64748b", ratio: "4.8:1", usage: "Secondary text, table headers" },
  { name: "faint", varName: "--color-faint", hex: "#83929e", ratio: "3.2:1", usage: "Icons and large text only — never body copy" },
  { name: "control-line", varName: "--color-control-line", hex: "#6b7c89", ratio: "4.3:1", usage: "Buttons, pickers, hover accents" },
  { name: "field-line", varName: "--color-field-line", hex: "#8492a0", ratio: "3.2:1", usage: "Resting border, text and select inputs" },
  { name: "line-strong", varName: "--color-line-strong", hex: "#cdd7de", usage: "Emphasised dividers" },
  { name: "line", varName: "--color-line", hex: "#e3e9ed", usage: "Hairline dividers — decorative only" },
  { name: "sunken", varName: "--color-sunken", hex: "#f1f5f8", usage: "Inset wells, track backgrounds" },
  { name: "canvas", varName: "--color-canvas", hex: "#f7f9fb", usage: "Page background" },
  { name: "surface", varName: "--color-surface", hex: "#ffffff", usage: "Cards, tables, sidebar" },
];

export const BRAND: Swatch[] = [
  { name: "accent", varName: "--color-accent", hex: "#2b3990", ratio: "10.0:1", usage: "Primary actions, active nav, links. From the logo wordmark." },
  { name: "accent-hover", varName: "--color-accent-hover", hex: "#242f76", usage: "Accent hover state" },
  { name: "accent-soft", varName: "--color-accent-soft", hex: "#f0f2f9", usage: "Active nav background, accent callouts" },
  { name: "accent-line", varName: "--color-accent-line", hex: "#c8cfe8", usage: "Accent borders" },
  { name: "success", varName: "--color-success", hex: "#8ac97d", usage: "Approval fills. From the logo checkmark. Carries ink at 8.6:1, never white." },
  { name: "success-strong", varName: "--color-success-strong", hex: "#529546", usage: "Where the light green needs more weight — switches, sparklines" },
  { name: "success-text", varName: "--color-success-text", hex: "#417739", ratio: "5.4:1", usage: "Approval copy" },
  { name: "success-soft", varName: "--color-success-soft", hex: "#f1f8ef", usage: "Approved-state backgrounds" },
];

export const SEMANTIC: Swatch[] = [
  { name: "warning", varName: "--color-warning", hex: "#d99400", usage: "Pending and attention fills" },
  { name: "warning-text", varName: "--color-warning-text", hex: "#8a5a00", ratio: "5.9:1", usage: "Pending copy" },
  { name: "danger", varName: "--color-danger", hex: "#dc3b32", usage: "Rejection and error fills" },
  { name: "danger-text", varName: "--color-danger-text", hex: "#b3261e", ratio: "6.5:1", usage: "Error copy, destructive buttons" },
  { name: "info", varName: "--color-info", hex: "#2b87c4", usage: "Informational fills" },
  { name: "info-text", varName: "--color-info-text", hex: "#1a5f8a", ratio: "6.9:1", usage: "Informational copy" },
];

export const CATEGORICAL: Swatch[] = [
  { name: "cat-1", varName: "--color-cat-1", hex: "#2b3990", usage: "Series 1" },
  { name: "cat-2", varName: "--color-cat-2", hex: "#12a374", usage: "Series 2" },
  { name: "cat-3", varName: "--color-cat-3", hex: "#d99400", usage: "Series 3" },
  { name: "cat-4", varName: "--color-cat-4", hex: "#7c5cd6", usage: "Series 4" },
  { name: "cat-5", varName: "--color-cat-5", hex: "#2b87c4", usage: "Series 5" },
  { name: "cat-6", varName: "--color-cat-6", hex: "#c8873c", usage: "Series 6" },
];

export const TYPE_SCALE = [
  { name: "display", size: "68px", weight: 600, tracking: "-0.035em", usage: "Marketing hero only" },
  { name: "h1", size: "48px", weight: 600, tracking: "-0.03em", usage: "Landing page headings" },
  { name: "h2", size: "34px", weight: 600, tracking: "-0.024em", usage: "Page titles in the app" },
  { name: "h3", size: "24px", weight: 600, tracking: "-0.018em", usage: "Section headings" },
  { name: "h4", size: "19px", weight: 600, tracking: "-0.012em", usage: "Card titles" },
  { name: "lead", size: "19px", weight: 400, tracking: "-0.008em", usage: "Intro paragraphs" },
  { name: "eyebrow", size: "13px", weight: 600, tracking: "0.08em", usage: "Uppercase section labels" },
];

export const RADII = [
  { name: "xs", value: "4px", usage: "Focus rings, chips" },
  { name: "sm", value: "6px", usage: "Small buttons, tags" },
  { name: "md", value: "8px", usage: "Buttons, inputs, nav items" },
  { name: "lg", value: "12px", usage: "Cards, tables, modals" },
  { name: "xl", value: "16px", usage: "Feature panels" },
  { name: "2xl", value: "22px", usage: "Marketing surfaces" },
];

export const SHADOWS = [
  { name: "xs", usage: "Secondary buttons, resting cards" },
  { name: "sm", usage: "Raised cards" },
  { name: "md", usage: "Popovers, dropdowns" },
  { name: "lg", usage: "Drawers" },
  { name: "xl", usage: "Modals" },
];
