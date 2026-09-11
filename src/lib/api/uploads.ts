import { ApiError, request } from "./client";
import { downloadBlob, fetchBinary } from "./download";

/**
 * Putting a file somewhere, from the browser.
 *
 * ## Two requests, and the API never sees the file
 *
 * Ask this app for a URL, then PUT the bytes **straight to storage**. The
 * second request does not go through the API at all, which is not an
 * optimisation: `src/app.ts` on the API caps a request body at 100kb, and a
 * scan of somebody's work permit is not going through a payroll server's event
 * loop.
 *
 * It also means the two halves can come apart. An upload that lands and is
 * never recorded is an orphan object nobody sees; a row recorded against an
 * upload that failed is a personnel file claiming to hold a certificate it does
 * not. So `upload()` resolves only when the bytes are actually stored, and the
 * caller records the key **after** it resolves, never beside it.
 *
 * ## What the caller has to handle
 *
 * `UploadRefused` for anything the person can fix — wrong kind of file, too
 * big, storage switched off for this deployment. Its `message` is the API's own
 * sentence and belongs on screen verbatim; paraphrasing a server refusal
 * locally is how the two stop agreeing.
 *
 * ## Progress
 *
 * `XMLHttpRequest` rather than `fetch`, for one reason: `fetch` cannot report
 * upload progress, and a 20MB file over a Lagos mobile connection with no
 * progress bar reads as a frozen page. That is the whole justification — if
 * `fetch` ever grows request streaming everywhere this can go back.
 */

/** Every scope that can take a file, and the endpoint each one asks. */
export type UploadScope =
  | { kind: "employee-document"; employeeId: string }
  | { kind: "receipt" }
  | { kind: "cv"; orgSlug: string; postingSlug: string };

export type PresignedUpload = {
  key: string;
  url: string;
  expiresAt: string;
  maxBytes: number;
};

/** A refusal somebody can act on, carrying the API's own sentence. */
export class UploadRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRefused";
  }
}

function endpointFor(scope: UploadScope): string {
  switch (scope.kind) {
    case "employee-document":
      return `/documents/employees/${scope.employeeId}/upload-url`;
    case "receipt":
      return "/reimbursements/receipt-upload-url";
    case "cv":
      return `/careers/public/${scope.orgSlug}/${scope.postingSlug}/upload-url`;
  }
}

/**
 * Ask for somewhere to put a file.
 *
 * A 422 here is always a refusal a person can read — the type, the size, or
 * storage not being switched on — so it is raised as `UploadRefused` rather
 * than left as a generic `ApiError` for every call site to unwrap.
 */
export async function presign(
  file: File,
  scope: UploadScope,
): Promise<PresignedUpload> {
  try {
    return await request<PresignedUpload>(endpointFor(scope), {
      method: "POST",
      body: {
        filename: file.name,
        /* Some browsers give an empty type for an unrecognised extension. The
           API's allowlist refuses that, which is the right answer — an empty
           string is not a claim about what the file is. */
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      },
    });
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 422) {
      throw new UploadRefused(caught.message);
    }
    throw caught;
  }
}

/**
 * PUT the bytes, reporting progress.
 *
 * `Content-Type` has to match what was presigned exactly — it is signed into
 * the URL, so storage itself refuses a mismatch. That is deliberate on the API
 * side: a size and type the client alone enforces is not a limit.
 */
export function putToStorage(
  file: File,
  presigned: PresignedUpload,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presigned.url, true);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      /* Storage refused the signature or the object. Nothing here can tell the
         reader anything useful about which, and the status code is not
         something to put in front of a payroll clerk — see
         `components/portal/load-failure.tsx` for the same argument. */
      reject(
        new Error("The file could not be stored. Try attaching it again."),
      );
    });

    xhr.addEventListener("error", () =>
      reject(
        new Error(
          "The upload did not finish. Check your connection and try again.",
        ),
      ),
    );
    xhr.addEventListener("abort", () =>
      reject(new Error("The upload was stopped.")),
    );

    xhr.send(file);
  });
}

/**
 * The whole thing: presign, upload, hand back the key.
 *
 * The key is what the caller records. It resolves **only** once the bytes are
 * stored, so a caller that awaits this and then saves cannot record a document
 * that is not there.
 */
export async function upload(
  file: File,
  scope: UploadScope,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const presigned = await presign(file, scope);
  await putToStorage(file, presigned, onProgress);
  return presigned.key;
}

/**
 * 10MB, matching `MAX_DOCUMENT_BYTES` on the API.
 *
 * Duplicated rather than fetched, and the duplication is the lesser evil: the
 * point of checking here is to refuse a 40MB video **before** spending a
 * minute base64-ing it and pushing it up the wire. The API checks the decoded
 * length itself and its refusal is the one that counts; this is only so the
 * answer arrives immediately.
 */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * A file, ready to be sent with whatever record it belongs to.
 *
 * Two shapes because there are two places a file can be, and a caller has to
 * send a different field for each. Never both — see `addDocumentSchema` on the
 * API, which refuses a write carrying two answers.
 */
/**
 * A file read into memory, ready to send with the record it belongs to.
 *
 * Narrower than `AttachedFile` on purpose: `readAsAttachment` and `FileField`
 * only ever produce this one, so a caller does not have to narrow a union
 * against a branch that cannot occur.
 */
export type InlineFile = Extract<AttachedFile, { kind: "inline" }>;

export type AttachedFile =
  | {
      kind: "inline";
      /** The file itself. Goes in the create call as `contentBase64`. */
      contentBase64: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
    }
  | {
      kind: "storage";
      storageKey: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
    };

/**
 * Read a file into an inline attachment.
 *
 * `readAsDataURL` and then the part after the comma, rather than reading an
 * ArrayBuffer and encoding it by hand: `btoa` on a binary string throws on any
 * byte above 0xff once the string has been through a `String.fromCharCode`
 * round trip, which is every PDF. The browser's own base64 is correct and is
 * already there.
 *
 * `onProgress` reports the **read**, which is honest about what is happening:
 * the upload itself is one request whose progress `fetch` does not expose, so
 * a bar that claimed to track it would be a decoration. It reaches 1 when the
 * bytes are in memory and the request is about to go.
 */
export function readAsAttachment(
  file: File,
  onProgress?: (fraction: number) => void,
  /**
   * A tighter cap than `MAX_DOCUMENT_BYTES`, where the endpoint has one.
   *
   * Signatures do: `MAX_SIGNABLE_BYTES` is 5MB, because a document to sign is
   * kept whole in the record so the signature keeps meaning something. Without
   * this the browser would happily spend a minute encoding an 8MB scan and
   * then hand it to an API that refuses it — the refusal would be honest and
   * the wait would be wasted.
   */
  maxBytes = MAX_DOCUMENT_BYTES,
): Promise<InlineFile> {
  if (file.size === 0) {
    return Promise.reject(
      new UploadRefused("That file is empty. Pick it again."),
    );
  }
  if (file.size > maxBytes) {
    return Promise.reject(
      new UploadRefused(
        `That file is ${Math.ceil(file.size / 1024 / 1024)} MB. Keep ` +
          `documents under ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    };
    reader.onerror = () =>
      reject(new UploadRefused("That file could not be read. Pick it again."));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      if (comma === -1) {
        reject(
          new UploadRefused("That file could not be read. Pick it again."),
        );
        return;
      }
      onProgress?.(1);
      resolve({
        kind: "inline",
        contentBase64: result.slice(comma + 1),
        filename: file.name,
        /* The browser's guess, or nothing. The API defaults an absent type to
           `application/octet-stream` and sends it as an attachment either way,
           so an empty string here is not a hole. */
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * What one stored document can be opened with, or why it cannot be.
 *
 * `url` is null with a `note` whenever there is nothing to open — no bucket on
 * this deployment, or a key recorded before storage existed. Both are ordinary
 * states rather than errors, and the note is the API's own sentence.
 */
export type FileAccess = {
  id: string;
  employeeId: string;
  name: string;
  /**
   * Which mechanism opens this file, or null when nothing does.
   *
   * `"inline"` — the file is in the database; fetch it with the caller's token
   * through `saveDocument` below. There is no `url` and deliberately no signed
   * one: a credential-free link to somebody's passport is forwardable to
   * anybody. `"storage"` — open `url`, which is presigned and short-lived.
   */
  source: "inline" | "storage" | null;
  url: string | null;
  expiresAt: string | null;
  note: string | null;
};

/** A short-lived link for one employee document. Gated and audited on the API. */
export const documentFile = (id: string): Promise<FileAccess> =>
  request<FileAccess>(`/documents/${id}/file`);

/**
 * Fetch a document held in the database and hand it to the browser.
 *
 * Through `fetchBinary`, which already carries the token, sets `no-store` and
 * pulls the filename out of `Content-Disposition` — so the name somebody sees
 * in their downloads folder is the one the API sent rather than one invented
 * here. `response.text()` would corrupt it: a PDF decoded as UTF-8 loses every
 * byte above 0x7f and opens in nothing.
 */
export async function saveDocument(
  id: string,
  fallbackName: string,
): Promise<void> {
  const file = await fetchBinary(`/documents/${id}/content`, fallbackName, "");
  downloadBlob(file.filename, file.blob);
}

/* There is deliberately no `uploadsAvailable()` here.
   ------------------------------------------------------------------
   The first draft had one, and it asked `/health` — which answers whether the
   API is up, not whether a bucket is configured, so it would have reported
   "you can attach a file" on every deployment that cannot store one. A probe
   that answers a different question than its name is worse than no probe.

   The honest signal is the refusal the API already sends: `presign` raises
   `UploadRefused` carrying the server's own sentence, and a caller renders
   that. One round trip, one source of truth, and the answer arrives at the
   moment somebody actually tries rather than being cached from page load. */
