/**
 * Which files an application takes, and what to tell somebody before they pick one.
 *
 * The limits are the API's (`lib/storage.ts` there: PDF, JPEG/PNG/WebP/HEIC, Word,
 * Excel; 25 MB). They are repeated here for one reason: an applicant on a phone
 * with a slow connection should be told "PDF or Word, up to 25 MB" **before** they
 * choose a file and wait, not after. The API still checks every one of them again
 * when it issues the upload address, so a limit that drifts here fails with the
 * API's sentence rather than with a lost file.
 */

export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

type TypeInfo = { mime: string; label: string };

/** Extension to the media type the API's allow-list names. */
const BY_EXTENSION: Record<string, TypeInfo> = {
  pdf: { mime: "application/pdf", label: "PDF" },
  doc: { mime: "application/msword", label: "Word" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word",
  },
  xls: { mime: "application/vnd.ms-excel", label: "Excel" },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "Excel",
  },
  jpg: { mime: "image/jpeg", label: "photo" },
  jpeg: { mime: "image/jpeg", label: "photo" },
  png: { mime: "image/png", label: "photo" },
  webp: { mime: "image/webp", label: "photo" },
  heic: { mime: "image/heic", label: "photo" },
};

/** What a file box takes. A CV is never a spreadsheet; a work sample might be. */
export type FileProfile = "document" | "any";

const DOCUMENT_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
];

const extensionsFor = (profile: FileProfile): string[] =>
  profile === "document" ? DOCUMENT_EXTENSIONS : Object.keys(BY_EXTENSION);

/** The `accept` attribute: opens the right picker on a phone. */
export function acceptAttribute(profile: FileProfile): string {
  return extensionsFor(profile)
    .map((extension) => `.${extension}`)
    .join(",");
}

/** "PDF, Word or a photo", in the words a person uses. */
export function typesPhrase(profile: FileProfile): string {
  return profile === "document"
    ? "PDF, Word or a photo"
    : "PDF, Word, Excel or a photo";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

/** The line shown beside a file box before anything is chosen. */
export function limitsLine(profile: FileProfile): string {
  return `${typesPhrase(profile)}. Up to ${formatBytes(UPLOAD_MAX_BYTES)}.`;
}

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
};

/**
 * The media type to ask for, from the browser's own answer and then the name.
 *
 * Some phones and some browsers leave `file.type` empty for a `.docx` or a
 * `.heic`. The API signs the upload address for exactly the type it is told, and
 * the browser then has to send exactly that, so guessing from the extension here
 * is the difference between an upload and a refusal.
 */
export function mediaTypeOf(file: { name: string; type: string }): string {
  const claimed = file.type.trim().toLowerCase();
  const known = Object.values(BY_EXTENSION).some(
    (info) => info.mime === claimed,
  );
  if (known) return claimed;
  return BY_EXTENSION[extensionOf(file.name)]?.mime ?? claimed;
}

/**
 * Why a file will not be accepted, in a sentence, or `null` when it will.
 * Checked before the first request, so a wrong file costs nobody any time.
 */
export function refuseFile(
  file: { name: string; type: string; size: number },
  profile: FileProfile,
): string | null {
  if (file.size === 0) return "That file is empty. Choose another.";
  if (file.size > UPLOAD_MAX_BYTES)
    return `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(UPLOAD_MAX_BYTES)}.`;
  const mime = mediaTypeOf(file);
  const allowed = extensionsFor(profile)
    .map((extension) => BY_EXTENSION[extension]?.mime)
    .filter((value): value is string => Boolean(value));
  if (!allowed.includes(mime))
    return `${typesPhrase(profile)} only. That file is not one of those.`;
  return null;
}
