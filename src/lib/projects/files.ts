"use client";

import { projectsApi } from "@/lib/api/projects";
import { MAX_DOCUMENT_BYTES, putToStorage } from "@/lib/api/uploads";
import type { AttachmentRef, IssueAttachment } from "./types";

/**
 * Files on a task, and on its comments, from the browser.
 *
 * Three steps, never fewer: ask the API for somewhere to put the file
 * (`POST /issues/:id/attachments/upload-url`), PUT the bytes straight to storage
 * (`putToStorage`, the same helper receipts and CVs use, for its progress), then
 * record the key — on the task (`recordAttachment`) or with the comment being
 * posted. Recording only after the PUT resolves is what keeps a task from
 * listing a file that is not there.
 *
 * The checks here (size, kind, how many) are so the answer arrives before a
 * minute is spent uploading; the API makes the same checks and its refusal is
 * the one that counts, shown in its own words.
 */

/** Most files one task, or one comment, may carry. `MAX_ATTACHMENTS` on the API. */
export const MAX_FILES = 10;

export const FILE_TOO_BIG = "That file is over 10 MB. Attach a smaller one.";
export const FILE_WRONG_KIND =
  "That kind of file can't be attached. Use an image, PDF, Office document or text file.";
export const STORAGE_OFF = "File uploads aren't set up on this server.";

/** `ALLOWED_CONTENT_TYPES` in the API's `src/lib/storage.ts`. */
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/** For a browser that gives no type for an extension it does not know. */
const BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** What the file picker suggests. A drop goes around it, so `fileRefusal` decides. */
export const ATTACH_ACCEPT = Object.keys(BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(",");

/** The type to declare for a file: the browser's, or one read from its name. */
export function contentTypeOf(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[ext] ?? "";
}

/** Why a file cannot be attached, in the words the screen shows, or null. */
export function fileRefusal(file: File): string | null {
  if (!ALLOWED.has(contentTypeOf(file))) return FILE_WRONG_KIND;
  if (file.size > MAX_DOCUMENT_BYTES) return FILE_TOO_BIG;
  if (file.size <= 0) return "That file is empty. Pick it again.";
  return null;
}

/** The sentence for a failed upload or record: the API's own, when it gave one. */
export function uploadFailure(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The file could not be attached. Try again.";
}

/**
 * Upload one file for an issue and hand back what records it. Resolves only once
 * the bytes are stored.
 */
export async function uploadIssueFile(
  issueId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<AttachmentRef> {
  const contentType = contentTypeOf(file);
  const presigned = await projectsApi.attachmentUploadUrl(issueId, {
    filename: file.name,
    contentType,
    sizeBytes: file.size,
  });
  /* `putToStorage` sends `file.type`, which is signed into the URL; a file the
     browser gave no type is re-wrapped with the one that was asked for. */
  const body =
    file.type === contentType
      ? file
      : new File([file], file.name, { type: contentType });
  await putToStorage(
    body,
    {
      key: presigned.storageKey,
      url: presigned.url,
      expiresAt: presigned.expiresAt,
      maxBytes: MAX_DOCUMENT_BYTES,
    },
    onProgress,
  );
  return { storageKey: presigned.storageKey, filename: file.name, contentType };
}

/** Upload one file and record it on the task itself. */
export async function attachIssueFile(
  issueId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<IssueAttachment> {
  const ref = await uploadIssueFile(issueId, file, onProgress);
  return projectsApi.recordAttachment(issueId, ref);
}

/** Images a browser draws, shown as thumbnails. HEIC mostly is not. */
export const isPreviewable = (contentType: string): boolean =>
  ["image/jpeg", "image/png", "image/webp"].includes(contentType);

/** `244 KB`, `1.2 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
