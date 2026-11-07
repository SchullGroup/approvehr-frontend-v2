import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Unmount between tests.
 *
 * Without this every test renders into the same document and the second one
 * finds two of everything — which fails as "found multiple elements" and reads
 * like a bug in the component rather than in the harness.
 */
afterEach(cleanup);

/**
 * jsdom has no layout, so it has no `scrollIntoView`. `Tabs` calls it to bring the
 * selected tab into view, and a screen with tabs would otherwise throw as soon as
 * it mounted. A no-op is the honest stand-in: there is nothing to scroll.
 */
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

/**
 * The old platform's uploader is on by default (`LINKED_UPLOAD_DEFAULT` in
 * `src/lib/api/linked-upload.ts`), which would make every test that renders a
 * leave form see a file picker and, if it pressed Send, try the network. Blank is
 * the explicit "off", so the suite starts there. The tests that exercise the
 * uploader stub `fetch` and an address of their own, and no test sends a request to
 * the real one. `tests/linked-upload-default.test.ts` unsets it to prove the default.
 */
process.env["NEXT_PUBLIC_LINKED_UPLOAD_URL"] = "";
