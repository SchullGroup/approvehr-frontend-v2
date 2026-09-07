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
