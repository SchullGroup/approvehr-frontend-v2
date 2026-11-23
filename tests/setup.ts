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
 * The old platform's uploader is off unless an address is set
 * (`src/lib/api/linked-upload.ts`). The suite pins it blank as well, so no test
 * that renders a leave form can reach the network. The tests that exercise the
 * uploader stub `fetch` and an address of their own.
 */
process.env["NEXT_PUBLIC_LINKED_UPLOAD_URL"] = "";
