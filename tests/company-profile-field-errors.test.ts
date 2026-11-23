/**
 * U61 (NC-11), web part: saving the company profile with a TIN the API refuses
 * showed only a toast, "Some fields are not valid", and no field was marked,
 * though the API's answer names `tin` and says why. The API's field messages
 * now go under the fields, with this form's own names for them.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ApiError } from "@/lib/api/client";
import { companyFieldErrors } from "@/lib/store/company";

const refusal = (details: { field: string; message: string }[]) =>
  new ApiError(422, "validation", "Some fields are not valid.", details);

describe("the API's field messages on the company profile", () => {
  it("are kept under the field the API names", () => {
    expect(
      companyFieldErrors(
        refusal([{ field: "tin", message: "A company TIN is 10 digits." }]),
      ),
    ).toEqual([{ field: "tin", message: "A company TIN is 10 digits." }]);
  });

  it("use the form's names for the API's fields", () => {
    expect(
      companyFieldErrors(
        refusal([
          { field: "addressLine", message: "Too long." },
          { field: "taxState", message: "Pick a state." },
        ]),
      ).map((e) => e.field),
    ).toEqual(["address", "state"]);
  });

  it("are empty for a refusal that names no field", () => {
    expect(companyFieldErrors(new ApiError(500, "server", "Down."))).toEqual(
      [],
    );
    expect(companyFieldErrors(new Error("x"))).toEqual([]);
  });

  it("are what the form shows after a refused save", () => {
    const form = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../src/app/(app)/settings/company/form.tsx",
      ),
      "utf8",
    );
    expect(form).toContain("companyFieldErrors(caught)");
  });
});
