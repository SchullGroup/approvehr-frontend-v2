/**
 * Runs synchronously, before first paint, from a plain `<script>` tag mounted
 * in each app-side layout — never the shared root layout, which stays
 * portable into the standalone marketing export (see that file's own note).
 *
 * Reads the theme choice straight out of localStorage and sets `data-theme`
 * on `<html>` directly via `document.documentElement`, bypassing React
 * entirely. That is what avoids a hydration mismatch here: React never
 * asserts anything about `data-theme` in its own render output, on the
 * server or the client, so an attribute set by plain JS before hydration is
 * invisible to React's diffing — the same reasoning that already covers a
 * browser extension writing to `<body>` before hydration, in the root
 * layout's own comment.
 *
 * This duplicates the read half of `lib/store/theme.ts` /
 * `lib/store/persisted.ts` on purpose — a `<script>` tag's content cannot
 * import a TS module. Keep the key ("approvehr.theme.store") and the
 * `{v, data}` envelope shape in sync with `createPersistedState` if either
 * ever changes; `v` is hardcoded to `1` here because that store never passes
 * a custom `version`.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
  var raw = localStorage.getItem("approvehr.theme.store");
  var choice = "system";
  if (raw) {
    var p = JSON.parse(raw);
    if (p && p.v === 1 && p.data && typeof p.data.choice === "string") choice = p.data.choice;
  }
  var dark = choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.setAttribute("data-theme", "dark");
} catch (e) {}})();`;
