/**
 * The equipment module's public surface.
 *
 * `index.ts` is inert to the App Router — only `page`, `layout`, `route` and
 * their siblings are special — so this is a plain barrel, and it exists so a
 * screen somewhere else can compose an equipment component without importing a
 * path into a route directory:
 *
 * ```tsx
 * import { MyAssets } from "@/app/(app)/people/assets";
 * ```
 *
 * `MyAssets` is what `/profile` needs: what somebody has been given, so they
 * can see what they will have to hand back. It takes an optional `employeeId`,
 * which is also what an offboarding screen wants — one component that knows
 * what equipment looks like to the person holding it, rather than two that
 * drift apart.
 *
 * `HandOverDialog` and `TakeBackDialog` are exported for the same reason: an
 * exit checklist ticking off "return the laptop" should open the same form the
 * register does, so the two cannot disagree about what a return records.
 */
export { MyAssets } from "./my-equipment";
export { HandOverDialog } from "./hand-over-dialog";
export { TakeBackDialog } from "./take-back-dialog";
