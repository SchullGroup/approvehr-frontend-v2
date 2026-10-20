// @vitest-environment node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The default share card (`src/app/opengraph-image.tsx`).
 *
 * What a type cannot see here: the card is a picture, so a copy of the logo's
 * paths that has drifted from the real asset, or a hard-coded host that stops
 * being the site's host, both render a perfectly good PNG. These tests render
 * the card with the asset and the environment changed, and assert the picture
 * changed with them — which is the only way to prove it is reading them.
 */

async function renderCard(): Promise<Uint8Array> {
  const mod = await import("@/app/opengraph-image");
  return new Uint8Array(await mod.default().arrayBuffer());
}

afterEach(() => {
  vi.doUnmock("node:fs/promises");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the default share card", () => {
  it("renders a 1200 × 630 PNG", async () => {
    const { contentType, size } = await import("@/app/opengraph-image");
    const bytes = await renderCard();

    expect([...bytes.slice(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    /* IHDR: width and height are the two big-endian words at byte 16 and 20. */
    const header = new DataView(bytes.buffer, bytes.byteOffset);
    expect(header.getUint32(16)).toBe(size.width);
    expect(header.getUint32(20)).toBe(size.height);
    expect(contentType).toBe("image/png");
  });

  it("has an alt that says what the card says", async () => {
    const { alt } = await import("@/app/opengraph-image");
    expect(alt).toContain("ApproveHR");
    expect(alt).toContain("HR, payroll and hiring intelligence");
  });

  it("draws whatever public/brand/logo.svg holds, not a copy of its paths", async () => {
    const real = await renderCard();

    vi.resetModules();
    const redSquare =
      '<svg width="149" height="24" viewBox="0 0 149 24" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="149" height="24" fill="#d00000"/></svg>';
    vi.doMock("node:fs/promises", async (original) => ({
      ...(await original<typeof import("node:fs/promises")>()),
      readFile: async () => Buffer.from(redSquare).toString("base64"),
    }));
    const swapped = await renderCard();

    expect(Buffer.from(swapped).equals(Buffer.from(real))).toBe(false);

    /* And the source holds no path data of its own to fall back on: a `d="M…"`
       attribute is what a pasted copy of the wordmark is made of. */
    const source = await readFile(
      join(process.cwd(), "src/app/opengraph-image.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/\sd="M/);
  });

  it("prints the host the site is configured with, not a literal", async () => {
    const approvehr = await renderCard();

    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://hr.example.test");
    const elsewhere = await renderCard();

    expect(Buffer.from(elsewhere).equals(Buffer.from(approvehr))).toBe(false);
  });
});
