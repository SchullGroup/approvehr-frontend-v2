import { apply, toApplyBody, type ApplyOutcome } from "@/lib/marketing/careers";
import type { Answers, UploadedFile } from "@/lib/marketing/apply-form";
import { uploadFile, type UploadOutcome } from "@/lib/marketing/apply-upload";
import { refuseFile, type FileProfile } from "@/lib/marketing/apply-files";

/**
 * What the apply form talks to.
 *
 * The form never calls `fetch` itself. It is given a client, and there are three:
 *
 * - **live** — the real thing: files go to storage through the API's upload
 *   address, and the application goes to the API.
 * - **preview** — for the person writing the advert. Same form, same checks, and
 *   **nothing leaves the browser**: a file is "accepted" without being sent, and
 *   Send answers a made-up success. It is labelled as a preview wherever it speaks.
 * - **demo** — the same as a preview, worded for a demo workspace.
 *
 * That split is what makes the builder's preview exactly what an applicant sees:
 * it is the very component, with only the two network calls swapped.
 */

export type ApplyMode = "live" | "preview" | "demo";

/**
 * Everything a person typed, as the form hands it over.
 *
 * The form speaks in this shape and nothing else; turning it into the API's body
 * is `toApplyBody`'s job, so a change to the wire is one function.
 */
export type ApplyPayload = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  coverNote: string;
  cv: UploadedFile | null;
  answers: Answers;
  /** Present only when the form asked, and only ever `true`. */
  consent: { text: string; ref: string | null } | null;
  /** Where they came from, from `?src=`. */
  src: string | null;
  /** `utm_source`, `utm_medium`, `utm_campaign` on the link, as they arrived. */
  utm?: { source?: string; medium?: string; campaign?: string } | null;
  /** The honeypot and the captcha token, which are not the person's answers. */
  extra: Record<string, string>;
};

export type UploadCall = {
  file: File;
  profile: FileProfile;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export type ApplyClient = {
  mode: ApplyMode;
  upload: (call: UploadCall) => Promise<UploadOutcome>;
  submit: (payload: ApplyPayload) => Promise<ApplyOutcome>;
};

export function liveClient(org: string, roleSlug: string): ApplyClient {
  return {
    mode: "live",
    upload: (call) => uploadFile({ org, roleSlug, ...call }),
    submit: (payload) =>
      apply(org, roleSlug, toApplyBody(payload), payload.extra),
  };
}

/** Pretend to move bytes: a few steps, so a progress bar can be seen working. */
async function fakeUpload(call: UploadCall): Promise<UploadOutcome> {
  const refusal = refuseFile(call.file, call.profile);
  if (refusal) return { ok: false, message: refusal, retryable: false };

  for (const step of [0.25, 0.6, 1]) {
    if (call.signal?.aborted)
      return {
        ok: false,
        message: "Upload cancelled.",
        retryable: true,
        cancelled: true,
      };
    await new Promise((resolve) => setTimeout(resolve, 120));
    call.onProgress?.(step);
  }
  return {
    ok: true,
    file: {
      key: `preview/${call.file.name}`,
      name: call.file.name,
      sizeBytes: call.file.size,
    },
  };
}

/**
 * A client that sends nothing.
 *
 * `reference` is what the real success would carry; the preview invents one that
 * says what it is, so nobody mistakes a preview for a record.
 */
export function previewClient(
  mode: "preview" | "demo",
  context: { company: string; postingTitle: string },
): ApplyClient {
  return {
    mode,
    upload: fakeUpload,
    submit: async () => ({
      ok: true,
      value: {
        id: `${mode}-application`,
        company: context.company,
        postingTitle: context.postingTitle,
        note: `This is a ${mode}. Nothing was sent and nothing was saved.`,
        cvNote: null,
        reference: null,
        confirmationEmail: false,
      },
    }),
  };
}
