import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Sign in to demo mode as one of the seeded personas.
 *
 * Deliberately goes through the real gate rather than seeding `localStorage`.
 * The gate is a screen with its own bugs, and every spec that skipped it would
 * be a spec that never opens the first door a person opens.
 *
 * Tunde by default: he is the seeded **Owner**, and the smoke walk needs
 * somebody who can reach payroll. Pass a name to walk as anybody else — the
 * personas and their real roles are listed on that screen.
 */
export async function signIn(page: Page, name = "Tunde Bakare"): Promise<void> {
  await skipSetupWizard(page);
  await page.goto("/dashboard");
  const persona = page.getByRole("button", { name: new RegExp(name) }).first();
  /* Generous, and for two reasons that are both about `next dev` rather than
     about the app: it compiles a route on first request, and the app's
     reachability probe makes three attempts before it will say the API is
     absent — deliberately, since answering "down" too eagerly is what swapped a
     live session for the demo once. Both are one-off costs per run. */
  await expect(persona).toBeVisible({ timeout: 40_000 });
  await persona.click();
  const confirm = page.getByRole("button", { name: "Open the demo" });
  await confirm.click();
  /* The gate going away, not a URL and not the sidebar. Signing in renders in
     place rather than redirecting, so there is no navigation to wait for — and
     on a phone the sidebar is behind a hamburger, so waiting for a visible
     `navigation` landmark passes on a desktop and hangs on every mobile run. */
  await expect(confirm).toHaveCount(0, { timeout: 20_000 });
}

/**
 * Mark the demo company as having finished the setup wizard.
 *
 * A fresh demo browser has answered nothing, and the product deliberately shows
 * the wizard to a company that has not — `features.ts#demoDefaults` says so in
 * as many words, and it is the right behaviour. It also means every route in a
 * fresh context redirects there, so a smoke walk without this walks one screen
 * seven times.
 *
 * Seeding the store rather than clicking through seven questions: the wizard is
 * a screen with its own spec, and a helper that answered it would make every
 * other test depend on its copy. The shape is `features.ts`'s own — a version
 * mismatch is dropped, so a change there makes this a no-op and the wizard
 * comes back, which is a loud failure rather than a quiet one.
 */
async function skipSetupWizard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "approvehr.features.demo",
      JSON.stringify({
        v: 2,
        data: { setupStep: 7, setupCompletedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
  });
}

/**
 * Whether the page scrolls sideways.
 *
 * `documentElement.scrollWidth` **over-reports** — it counts content inside an
 * `overflow-x: auto` container, so a table doing exactly what `TableWrap` is
 * for reads as a broken layout. This is the metric the responsive pass
 * established: `body.scrollWidth` against its client width, confirmed by
 * actually trying to scroll and reading `scrollX` back.
 */
export async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const wider = document.body.scrollWidth > document.body.clientWidth + 1;
    window.scrollTo(600, 0);
    const moved = window.scrollX > 0;
    window.scrollTo(0, 0);
    return wider || moved;
  });
}
