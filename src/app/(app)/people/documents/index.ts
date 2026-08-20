/**
 * The documents module's public surface.
 *
 * `index.ts` is inert to the App Router — only `page`, `layout`, `route` and
 * their siblings are special — so this is a plain barrel, and it exists so a
 * screen elsewhere can compose a documents component without importing a path
 * into a route directory:
 *
 * ```tsx
 * import { MyDocuments } from "@/app/(app)/people/documents";
 * ```
 *
 * `MyDocuments` is what `/profile` and `/documents` both render.
 * `AskForDocumentModal` is exported beside it because a screen that offers
 * "ask for a document" from somewhere else — an onboarding checklist, an
 * offboarding clearance list — should open the same form rather than a second
 * one that drifts from it.
 */
export { MyDocuments } from "./my-documents";
export { AskForDocumentModal } from "./dialogs";
export { EmployeeFileDrawer } from "./employee-file";
