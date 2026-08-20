/**
 * The handbook module's public surface.
 *
 * `index.ts` is inert to the App Router — only `page`, `layout`, `route` and
 * their siblings are special — so this is a plain barrel, and it exists so a
 * screen somewhere else can compose a handbook component without importing a
 * path into a route directory:
 *
 * ```tsx
 * import { MyPolicies } from "@/app/(app)/settings/policies";
 * ```
 *
 * `MyPolicies` is what `/profile` needs: the sections waiting on the signed-in
 * person, with Accept beside each. `PolicyDrawer` is exported alongside it so
 * anywhere that needs to show the *text* of a section — a notification landing
 * page, an onboarding checklist — opens the same drawer rather than a second one
 * that renders the wording differently.
 */
export { MyPolicies } from "./my-policies";
export { PolicyDrawer } from "./policy-drawer";
