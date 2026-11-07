import { megabytes } from "@/lib/file-size";

/**
 * Putting a file on the old platform's uploader, to be linked to a leave
 * request by its address.
 *
 * ## What this is, and why it exists at all
 *
 * A port of `approvehr-platform-frontend/src/services/api/s3.service.ts`, kept
 * as close to it as `fetch` allows (that file uses axios, which this app does
 * not carry): the same file name cleaning, the same JSON body of one base64
 * string, `upload-file` for a document and `upload-image` for an image, the same
 * query parameters and the same two response fields. It is **temporary and said
 * to be**. The proper route is the API's own signed upload
 * (`lib/api/uploads.ts`), which needs a bucket on the API's own deployment and
 * has none yet; this is what lets a leave request carry a file in the meantime,
 * and it is to be replaced.
 *
 * ## The one thing about it that is not ordinary
 *
 * **A file sent this way is public.** The uploader is not behind a login: it
 * stores the file and answers with an address, and anybody who has the address
 * can open it. That is the whole reason `LINKED_FILES_NOTE` exists and is shown
 * beside the picker.
 *
 * ## Where the uploader is
 *
 * `LINKED_UPLOAD_DEFAULT`, the same address `s3.service.ts` has built in, which is
 * what "use it the same way" means: this path is **on** with nothing set. It used
 * to be off until a deployment supplied the address, and the result was that no
 * deployment ever showed an attachment area. `NEXT_PUBLIC_LINKED_UPLOAD_URL`
 * overrides it, and **blank, or anything that is not an https address (`off`), is
 * off**: unset and switched off are different answers, as they are for the API's
 * `LINKED_FILE_HOSTS`, which has to agree or the picker is never offered.
 *
 * The tests never send a request to it. `tests/setup` pins the variable blank for
 * the whole suite, and the tests that exercise an upload stub `fetch` and an
 * address of their own.
 *
 * ## What it never sends
 *
 * No `Authorization` header and no cookies: the uploader is a third party to
 * this app's session, and the bearer token is for the API alone. Only the file
 * (as base64) and the query parameters leave the browser.
 *
 * ## What it answers with
 *
 * The address and nothing else (`LinkedFileRef`): the leave API is then told
 * about the file by that address, and it accepts one only from a host it allows
 * and says so in its own words if it does not. A refusal before anything is
 * sent, a connection that did not finish and an answer that carries no address
 * are three different sentences, none of which has a status code or a file's
 * name in it.
 *
 * ## Progress
 *
 * `fetch` cannot report upload progress, and an `XMLHttpRequest` here would
 * not be the port it was asked to be. `onProgress` reports the **read** of the
 * file, as `readAsAttachment` in `uploads.ts` does and for the same reason: it
 * is honest about what is measurable, and it reaches 1 when the bytes are in
 * memory and the request is about to go. A full bar with the request still out
 * is "sent, waiting for the answer".
 */

/** The folder the uploader is told to keep a leave file in. */
export const LINKED_FOLDER = "approvehr-leave";

/**
 * Said beside the picker whenever a file is going this way.
 *
 * One constant so a single edit changes every surface that shows it. It states
 * the one consequence that matters: the address is the only protection.
 */
export const LINKED_FILES_NOTE =
  "For now these files are kept where anyone with their address can open them. Do not attach anything you would not want shared.";

/** Thirty seconds, as the original. A slow connection gets as long as it did. */
const TIMEOUT_MS = 30_000;

/**
 * `MB` here are the binary megabytes the rest of this app prints
 * (`megabytes()`), not the original's decimal 2,000,000 and 3,000,000: a limit
 * that is refused as "Keep files under 1.9 MB" for a file shown as "1.9 MB" is
 * a sentence that contradicts itself. 2 MiB and 3 MiB are the same limits to
 * within five per cent, and a base64 body of the larger is about 4.2 MB, which
 * a gateway in front of a function takes.
 */
const MIB = 1024 * 1024;

/** What the uploader takes, which is also all the leave API's allow list needs. */
export type LinkedKind = {
  contentType: string;
  label: string;
  extensions: readonly string[];
  /** The original's default for the endpoint this kind goes to. */
  maxBytes: number;
  /** Which of the uploader's two endpoints takes it. */
  endpoint: "upload-file" | "upload-image";
};

/**
 * The same routing as `uploadFile` in the original, narrowed to the three kinds
 * the leave API accepts: a PDF goes to `upload-file`, an image to
 * `upload-image`. Word, HEIC and the rest are not sent, because the original
 * has no route for them and a refusal here is kinder than a request that the
 * uploader answers with nothing.
 */
export const LINKED_KINDS: readonly LinkedKind[] = [
  {
    contentType: "application/pdf",
    label: "PDF",
    extensions: ["pdf"],
    maxBytes: 2 * MIB,
    endpoint: "upload-file",
  },
  {
    contentType: "image/jpeg",
    label: "JPEG",
    extensions: ["jpg", "jpeg"],
    maxBytes: 3 * MIB,
    endpoint: "upload-image",
  },
  {
    contentType: "image/png",
    label: "PNG",
    extensions: ["png"],
    maxBytes: 3 * MIB,
    endpoint: "upload-image",
  },
];

/** The file, by where it now lives. What a leave request is told about it. */
export type LinkedFileRef = {
  fileUrl: string;
  filename: string;
  contentType: string;
};

/**
 * A refusal made before anything was sent. Its `message` is the sentence to
 * show, and is worded without the file's name.
 */
export class LinkedUploadRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkedUploadRefused";
  }
}

/** The request did not finish: no answer, a timeout, or the browser refused. */
export const LINKED_UPLOAD_INTERRUPTED =
  "The upload did not finish. Check your connection and try again.";

/** The uploader answered, and what it answered is not an address to use. */
export const LINKED_UPLOAD_NOT_STORED =
  "The file could not be stored. Try attaching it again.";

/** The longest address the leave API takes. */
const MAX_URL_LENGTH = 500;

/* ------------------------------------------------------------- the address */

/**
 * The old platform's uploader, as `approvehr-platform-frontend`'s `s3.service.ts`
 * has it: the base without `/upload-file` or `/upload-image`. `next.config.ts`
 * cannot import this file (it is outside the `@/` alias), so it holds the same
 * string, and `tests/linked-upload-default.test.ts` fails if the two differ.
 */
export const LINKED_UPLOAD_DEFAULT =
  "https://qerhd0lxje.execute-api.us-east-1.amazonaws.com/prod";

/**
 * Where the uploader is, or null.
 *
 * `NEXT_PUBLIC_LINKED_UPLOAD_URL` when it is set, the default when it is not, and
 * null when it is blank or is not an address this accepts. Read from the
 * environment on every call and written out in full so that Next can substitute
 * it at build time. Only `https:` is accepted, and `http` for
 * `localhost` and `127.0.0.1` outside production: anything else is dropped
 * rather than trusted, the rule `next.config.ts` applies to the same address
 * for the Content-Security-Policy. The two have to agree: an address this module
 * accepts and the policy refuses would be blocked by the browser and read as a
 * dropped connection.
 */
function configuredBase(): string | null {
  const set = process.env.NEXT_PUBLIC_LINKED_UPLOAD_URL;
  const raw = set === undefined ? LINKED_UPLOAD_DEFAULT : set.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local =
      process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !local) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** Whether this build has an uploader to send to. False means this path is off. */
export const linkedUploadConfigured = (): boolean => configuredBase() !== null;

/* ------------------------------------------------------------- the file */

const extensionOf = (name: string): string =>
  name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";

/**
 * Which kind this file is, or null when it is not one the uploader takes.
 *
 * The browser's own type wins when it names one of the three. Where it says
 * nothing useful (empty, a generic binary type, or the non-standard
 * `image/jpg`), the extension decides, so a `.jpg` that a browser gave no type
 * for is still a JPEG. Where the browser names something else entirely, such as
 * a GIF called `.png`, the file is refused rather than sent under a name that
 * says it is something it is not.
 */
export function linkedKindOf(file: File): LinkedKind | null {
  const byType = LINKED_KINDS.find((kind) => kind.contentType === file.type);
  if (byType) return byType;
  const vague =
    file.type === "" ||
    file.type === "application/octet-stream" ||
    file.type === "image/jpg";
  if (!vague) return null;
  const extension = extensionOf(file.name);
  return (
    LINKED_KINDS.find((kind) => kind.extensions.includes(extension)) ?? null
  );
}

/** `PDF, JPEG and PNG`. */
const acceptedKinds = (): string => {
  const labels = LINKED_KINDS.map((kind) => kind.label);
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1] ?? ""}`;
};

/**
 * Why this file must not be sent, or null.
 *
 * `apiMaxBytes` is the leave API's own per-file limit: the limit that applies is
 * the smaller of it and this uploader's default for the kind, and the sentence
 * names that one.
 */
export function linkedRefusal(file: File, apiMaxBytes?: number): string | null {
  if (file.size <= 0) return "That file is empty. Choose it again.";
  const kind = linkedKindOf(file);
  const cap = Math.min(
    kind?.maxBytes ?? Math.max(...LINKED_KINDS.map((k) => k.maxBytes)),
    apiMaxBytes ?? Number.POSITIVE_INFINITY,
  );
  if (file.size > cap) {
    return `That file is ${megabytes(file.size)}. Keep files under ${megabytes(cap)}.`;
  }
  if (!kind) {
    return `That kind of file cannot be attached. You can attach ${acceptedKinds()}.`;
  }
  return null;
}

/**
 * Spaces and special characters become underscores, so the address the uploader
 * answers with has nothing in it that gets URL-encoded. A copy of the original,
 * character for character: its comment gives
 * `IFT 212 COMPUTER ORGANIZATION.pdf` becoming `IFT_212_COMPUTER_ORGANIZATION.pdf`.
 */
export const sanitizeFileName = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf(".");
  const name =
    lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;
  const extension = lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : "";

  const sanitizedName = name
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");

  return sanitizedName + extension;
};

/** The file as base64, without the `data:…;base64,` prefix. */
function toBase64(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    };
    reader.onerror = () =>
      reject(
        new LinkedUploadRefused(
          "That file could not be read. Choose it again.",
        ),
      );
    reader.onload = () => {
      const encoded = String(reader.result ?? "").split(",")[1] ?? "";
      if (encoded === "") {
        reject(
          new LinkedUploadRefused(
            "That file could not be read. Choose it again.",
          ),
        );
        return;
      }
      onProgress?.(1);
      resolve(encoded);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Where the answer keeps the address, by endpoint. `pdf_url` for a document and
 * `Location` for an image: the original's two fields, and the reason a document
 * and an image cannot share a reader.
 */
function addressIn(body: unknown, endpoint: LinkedKind["endpoint"]): unknown {
  if (typeof body !== "object" || body === null) return undefined;
  const data = body as {
    responseObj?: { pdf_url?: unknown };
    uploadResult?: { Location?: unknown };
  };
  return endpoint === "upload-file"
    ? data.responseObj?.pdf_url
    : data.uploadResult?.Location;
}

/** An address the leave API could take: https, and short enough. */
function usable(address: unknown): address is string {
  if (typeof address !== "string" || address.length > MAX_URL_LENGTH) {
    return false;
  }
  try {
    return new URL(address).protocol === "https:";
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ upload */

/**
 * Upload one file and hand back its address.
 *
 * Resolves **only** once the uploader has answered with an address, so a caller
 * that sends the ref with a request cannot name a file that is not there.
 * Throws `LinkedUploadRefused` for anything refused before sending (and for a
 * path that is off), and a plain `Error` carrying one of the two sentences above
 * for anything that went wrong after. Both messages are safe to put on screen.
 *
 * `maxBytes` is the leave API's own limit: see `linkedRefusal`.
 */
export async function uploadLinkedFile(
  file: File,
  options: {
    maxBytes?: number;
    onProgress?: (fraction: number) => void;
  } = {},
): Promise<LinkedFileRef> {
  const base = configuredBase();
  if (base === null) {
    throw new LinkedUploadRefused("Files cannot be attached on this site yet.");
  }
  const refusal = linkedRefusal(file, options.maxBytes);
  if (refusal) throw new LinkedUploadRefused(refusal);
  const kind = linkedKindOf(file);
  /* `linkedRefusal` returned null, so there is a kind. */
  if (!kind) throw new LinkedUploadRefused(acceptedKinds());

  const base64 = await toBase64(file, options.onProgress);

  /* `encodeURIComponent`, as the original: a space is `%20`, not `+`. */
  const parameters = [
    `fileName=${encodeURIComponent(sanitizeFileName(file.name))}`,
    `projectFolder=${encodeURIComponent(LINKED_FOLDER)}`,
    /* The original takes it from `file.type.slice(6)`: "jpeg", "png". The kind's
       own type is the same answer, and does not depend on what a browser said. */
    ...(kind.endpoint === "upload-image"
      ? [`fileFormat=${encodeURIComponent(kind.contentType.slice(6))}`]
      : []),
  ].join("&");

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${base}/${kind.endpoint}?${parameters}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: base64 }),
      /* A third party's origin: no cookies, and none of this app's headers. */
      credentials: "omit",
      signal,
    });
  } catch {
    /* A timeout, a refused connection and a block by the browser are all "it
       did not finish", from here. */
    throw new Error(LINKED_UPLOAD_INTERRUPTED);
  }
  if (!response.ok) throw new Error(LINKED_UPLOAD_NOT_STORED);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    /* The timeout can fire while the answer is still being read. */
    throw new Error(
      signal.aborted ? LINKED_UPLOAD_INTERRUPTED : LINKED_UPLOAD_NOT_STORED,
    );
  }

  const address = addressIn(body, kind.endpoint);
  if (!usable(address)) throw new Error(LINKED_UPLOAD_NOT_STORED);
  return {
    fileUrl: address,
    filename: file.name,
    contentType: kind.contentType,
  };
}
