/**
 * The shifts module's public surface.
 *
 * `index.ts` is inert to the App Router — only `page`, `layout`, `route` and
 * their siblings are special — so this is a plain barrel, and it exists so a
 * screen somewhere else can compose a rota component without importing a path
 * into a route directory:
 *
 * ```tsx
 * import { MyRota } from "@/app/(app)/people/shifts";
 * ```
 *
 * `MyRota` is what `/profile` needs. `RequestSwapModal` is exported beside it
 * because "ask somebody to cover" belongs anywhere a shift is shown — a
 * dashboard tile, an approvals inbox — and it should open the same form rather
 * than a second one that drifts from it.
 */
export { MyRota } from "./my-rota";
export { RequestSwapModal } from "./request-swap";
export { SwapPanel } from "./swaps";
