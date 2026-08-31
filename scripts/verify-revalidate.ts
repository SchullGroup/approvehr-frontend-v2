/**
 * The revalidation rules, and that every API store is wired to them.
 *
 * ## Why this is a script and not a browser check
 *
 * `lib/revalidate.ts` decides between two DOM events — was that a real absence,
 * has enough time passed since the last one — and both halves are invisible to
 * `tsc`. Worse, they are close to untestable in a driven browser: an automated
 * pane reports `document.hasFocus() === false` and `visibilityState ===
 * "hidden"` for its whole life, so the module correctly refuses to do anything
 * and the check would pass while proving nothing. That is the same trap
 * `verify-demo.ts` records for its own bundle half, and the same answer: drive
 * the real code with the environment stubbed, rather than assert against a
 * situation that cannot arise.
 *
 * ## The two things checked
 *
 * 1. **The rules** — a return after a real absence bumps; a quick there-and-back
 *    does not; two returns inside the floor produce one bump; a return while
 *    still hidden produces none.
 *
 * 2. **The wiring** — every store in `lib/store/` that fetches also subscribes.
 *    This is the half that rots: somebody adds a store next month, it works
 *    perfectly, and it is the one panel on the screen that never refreshes.
 *    Nothing else would ever say so.
 */

import fs from "node:fs";
import path from "node:path";
/* Static, not dynamic: the module touches the DOM only inside `subscribe`, so
   importing it before the stubs exist is safe and keeps this script free of a
   top-level await, which the transform does not support. */
import {
  REVALIDATE_TUNING,
  revalidationCount,
  subscribeToRevalidation,
} from "../src/lib/revalidate";

const ROOT = path.resolve(import.meta.dirname, "..");
const STORES = path.join(ROOT, "src", "lib", "store");

let failures = 0;
const fail = (what: string, detail: string) => {
  failures += 1;
  console.error(`  FAIL  ${what}\n        ${detail}`);
};
const pass = (what: string) => console.log(`  pass  ${what}`);

/* ------------------------------------------------------ 1. the rules */

/** A stubbed window and document, driven by hand. */
type Handler = () => void;
const handlers: Record<string, Handler[]> = {};
let focused = true;
let visible = true;
let clock = 1_000_000;

const listen = (type: string, fn: Handler) => {
  (handlers[type] ??= []).push(fn);
};
const emit = (type: string) => {
  for (const fn of handlers[type] ?? []) fn();
};

const g = globalThis as unknown as Record<string, unknown>;
g["window"] = { addEventListener: listen };
g["document"] = {
  addEventListener: listen,
  hasFocus: () => focused,
  get visibilityState() {
    return visible ? "visible" : "hidden";
  },
};
const realNow = Date.now;
Date.now = () => clock;

const { AWAY_MS, MIN_INTERVAL_MS } = REVALIDATE_TUNING;

let notified = 0;
subscribeToRevalidation(() => {
  notified += 1;
});

/** Click into the other window, spend `ms` there, click back. */
const away = (ms: number) => {
  focused = false;
  emit("blur");
  clock += ms;
  focused = true;
  emit("focus");
};

const before = revalidationCount();
away(AWAY_MS + 500);
if (revalidationCount() === before + 1) pass("a return after a real absence bumps");
else fail("a return after a real absence bumps", `count went ${before} -> ${revalidationCount()}`);

if (notified === 1) pass("and subscribers are told exactly once");
else fail("and subscribers are told exactly once", `notified ${String(notified)} times`);

/* The floor. A second return straight away must not bump again. */
const afterFirst = revalidationCount();
away(AWAY_MS + 500);
if (revalidationCount() === afterFirst)
  pass("a second return inside the floor does not bump again");
else
  fail(
    "a second return inside the floor does not bump again",
    `count went ${afterFirst} -> ${revalidationCount()} within ${String(MIN_INTERVAL_MS)}ms`,
  );

/* Past the floor, it bumps again. */
clock += MIN_INTERVAL_MS;
away(AWAY_MS + 500);
if (revalidationCount() === afterFirst + 1) pass("past the floor it bumps again");
else fail("past the floor it bumps again", `count is ${revalidationCount()}`);

/* A glance away is not an absence. */
clock += MIN_INTERVAL_MS;
const beforeGlance = revalidationCount();
away(AWAY_MS - 1);
if (revalidationCount() === beforeGlance)
  pass("a glance shorter than the away threshold does not bump");
else fail("a glance shorter than the away threshold does not bump", "it bumped");

/* Coming back to a still-hidden document is not coming back. */
clock += MIN_INTERVAL_MS;
const beforeHidden = revalidationCount();
focused = false;
visible = false;
emit("blur");
clock += AWAY_MS + 500;
emit("visibilitychange");
if (revalidationCount() === beforeHidden)
  pass("a return while still hidden does not bump");
else fail("a return while still hidden does not bump", "it bumped");

/* And once it is genuinely visible again, it does. */
visible = true;
focused = true;
emit("visibilitychange");
if (revalidationCount() === beforeHidden + 1)
  pass("becoming visible again does bump");
else fail("becoming visible again does bump", `count is ${revalidationCount()}`);

Date.now = realNow;

/* --------------------------------------------------- 2. the wiring */

/**
 * Stores deliberately left out, each with the reason it is not an oversight.
 * Adding a name here is a decision; the check exists so it has to be one.
 */
const EXEMPT: Record<string, string> = {
  "session.ts":
    "the auth lifecycle, not data — re-running it on focus turns a token refresh into a sign-out",
  "ai.ts": "a capability check answered once, not shared state",
  "payslip-quote.ts": "a computation over what the reader is typing",
  "account-verification.ts":
    "a computation over what the reader is typing — BE-10's bank name and account number, same class as the payslip quote above",
};

const files = fs
  .readdirSync(STORES)
  .filter((f) => f.endsWith(".ts"))
  .sort();

let wired = 0;
let localOnly = 0;
const missing: string[] = [];

for (const file of files) {
  const src = fs.readFileSync(path.join(STORES, file), "utf8");
  /* A store that fetches: an effect whose body awaits, chains, or fires a
     loader. Anything else is localStorage-only and has nothing to re-ask. */
  const fetches = /useEffect\(/.test(src) && /await |\.then\(|void \w+\(/.test(src);
  if (!fetches) {
    localOnly += 1;
    continue;
  }
  if (file in EXEMPT) continue;
  if (/useRevalidation\(\)/.test(src)) wired += 1;
  else missing.push(file);
}

if (missing.length === 0) {
  pass(`every fetching store subscribes (${String(wired)} of them)`);
} else {
  fail(
    "every fetching store subscribes",
    `these fetch and never re-ask: ${missing.join(", ")}`,
  );
}

/* The generation must never reach a staleness key, or every return blanks the
   screen it was meant to refresh. `notifications.ts` is the one deliberate
   exception and says why on the line above it. */
const keyed: string[] = [];
for (const file of files) {
  if (file === "notifications.ts") continue;
  const src = fs.readFileSync(path.join(STORES, file), "utf8");
  for (const line of src.split("\n")) {
    if (/\bkey\b\s*=/.test(line) && /revalidation/.test(line)) keyed.push(`${file}: ${line.trim()}`);
  }
}
if (keyed.length === 0) pass("no staleness key includes the generation");
else fail("no staleness key includes the generation", keyed.join("\n        "));

/* --------------------------------------------------------- verdict */

if (failures > 0) {
  console.error(
    `\nRevalidation check failed with ${String(failures)} problem${failures === 1 ? "" : "s"}.\n\n` +
      "The rule is in the header of src/lib/revalidate.ts: a store that fetches\n" +
      "puts `revalidation` in its effect's dependency list and nowhere else. A\n" +
      "store that does not is the one panel on the screen that never refreshes,\n" +
      "and nothing but this check would ever say so.\n",
  );
  process.exit(1);
}

console.log(
  `\nRevalidation check passed. ${String(wired)} fetching stores subscribe, ` +
    `${String(Object.keys(EXEMPT).length)} are exempt with a stated reason, ` +
    `${String(localOnly)} are local-only.\n`,
);
