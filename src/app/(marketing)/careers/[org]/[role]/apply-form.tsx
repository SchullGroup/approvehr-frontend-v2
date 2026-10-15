"use client";

import { useMemo } from "react";
import { ApplyForm as Form } from "@/components/marketing/apply/apply-form";
import { liveClient } from "@/lib/marketing/apply-client";
import type { FormDefinition } from "@/lib/marketing/apply-form";

/**
 * The form on a live careers page: the shared form, wired to the real API.
 *
 * Everything about how it looks and behaves is in
 * `components/marketing/apply/apply-form.tsx`, which the builder's preview and
 * the demo draw too, with a client that sends nothing. This file is only the
 * public page's choice of client.
 */
export function ApplyForm({
  org,
  roleSlug,
  roleTitle,
  company,
  captchaRequired = false,
  uploadsEnabled = false,
  form,
  src = null,
  utm = null,
}: {
  org: string;
  roleSlug: string;
  roleTitle: string;
  company: string;
  /** True when the API said, with the advert, that the check is on. */
  captchaRequired?: boolean;
  /** True when the API can take a file at all. */
  uploadsEnabled?: boolean;
  /** The advert's own form. Absent for an API that predates the builder. */
  form?: FormDefinition;
  /** `?src=` from the link they followed. */
  src?: string | null;
  /** The `utm_*` values on that link, if any. */
  utm?: { source?: string; medium?: string; campaign?: string } | null;
}) {
  const client = useMemo(() => liveClient(org, roleSlug), [org, roleSlug]);
  return (
    <Form
      client={client}
      roleTitle={roleTitle}
      company={company}
      captchaRequired={captchaRequired}
      uploadsEnabled={uploadsEnabled}
      src={src}
      utm={utm}
      {...(form ? { form } : {})}
    />
  );
}
