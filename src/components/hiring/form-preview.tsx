"use client";

import { useMemo } from "react";
import { ApplyForm } from "@/components/marketing/apply/apply-form";
import { previewClient } from "@/lib/marketing/apply-client";
import type { FormDefinition } from "@/lib/marketing/apply-form";

/**
 * The form as an applicant sees it, drawn by the applicant's own component.
 *
 * Not a lookalike. It is `ApplyForm`, given the form being edited and a client
 * that sends nothing, so whatever the builder changes — a kind of question, a
 * word limit, a required flag, a message — changes here for the same reason it
 * changes on the public page: there is one piece of code.
 *
 * It sits on the marketing sand, light whatever the app's theme, because that is
 * the ground the applicant has under it.
 */
export function FormPreview({
  definition,
  company,
  roleTitle,
  filesAvailable,
  mode = "preview",
}: {
  definition: FormDefinition;
  company: string;
  roleTitle: string;
  /** Whether the public form can take a file at all. */
  filesAvailable: boolean;
  mode?: "preview" | "demo";
}) {
  const client = useMemo(
    () => previewClient(mode, { company, postingTitle: roleTitle }),
    [mode, company, roleTitle],
  );
  return (
    <div
      data-testid="form-preview"
      className="rounded-xl bg-sand p-3 text-slate-soft sm:p-5"
    >
      <ApplyForm
        client={client}
        form={definition}
        roleTitle={roleTitle || "This role"}
        company={company}
        uploadsEnabled={filesAvailable}
      />
    </div>
  );
}
