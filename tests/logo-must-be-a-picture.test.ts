/**
 * L34 (NC-29): a file that was not a picture was accepted as the company logo
 * because its name or type said image, saved at once, and showed as a broken
 * image that would go on every payslip and email. The first bytes must be the
 * picture its type claims, and the picture must open, before it is kept.
 */
import { describe, expect, it } from "vitest";
import { matchesSignature, prepareLogo, LogoError } from "@/lib/logo-file";

const bytes = (...values: number[]) => new Uint8Array(values);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const GIF = new TextEncoder().encode("GIF89a");
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBP");

describe("a logo's first bytes", () => {
  it("match the type it claims", () => {
    expect(matchesSignature(PNG, "image/png")).toBe(true);
    expect(matchesSignature(JPEG, "image/jpeg")).toBe(true);
    expect(matchesSignature(GIF, "image/gif")).toBe(true);
    expect(matchesSignature(WEBP, "image/webp")).toBe(true);
  });
  it("do not match another type, or text", () => {
    expect(matchesSignature(JPEG, "image/png")).toBe(false);
    expect(
      matchesSignature(new TextEncoder().encode("hello"), "image/png"),
    ).toBe(false);
  });
});

describe("preparing a logo", () => {
  it("refuses a file that only says it is a picture", async () => {
    const fake = new File(["this is a text file"], "logo.png", {
      type: "image/png",
    });
    await expect(prepareLogo(fake)).rejects.toBeInstanceOf(LogoError);
    await expect(prepareLogo(fake)).rejects.toThrow(/not a picture/);
  });
});
