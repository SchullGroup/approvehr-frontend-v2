"use client";

import { ApiError, request } from "@/lib/api/client";
import type {
  LeaveAttachmentPolicy,
  LeaveAttachmentRef,
} from "@/lib/api/leave";
import {
  LINKED_KINDS,
  linkedUploadConfigured,
  uploadLinkedFile,
} from "@/lib/api/linked-upload";
import { putToStorage } from "@/lib/api/uploads";
import { megabytes } from "@/lib/file-size";

export { megabytes };

/**
 * Files on a leave request — `/api/v1/leave/attachments` and
 * `/api/v1/leave/requests/:id/attachments`.
 *
 * **These are often medical certificates.** Everything here is stricter than
 * the request they hang off, and four of the rules are about this module rather
 * than any screen:
 *
 * 1. **The open link is a credential that lasts five minutes.**
 *    `leaveFilesApi.open` is called from a click and from nowhere else, and what
 *    it returns goes to the browser's address bar and no further: never stored,
 *    logged, prefetched, put in a URL, a toast or an error report. Each call is
 *    also a *look* in the audit trail for anybody but the owner, so it is not a
 *    way to check a file is still there.
 * 2. **A file's name is only ever in the file list**, to people the API lets in.
 *    No sentence in this file is built from one, so none can reach a toast.
 * 3. **Controls come from what the API says** (`access`, `canRemove`,
 *    `attachmentCount`), not from the reader's role.
 * 4. **Absent is not zero.** Whether a file is required comes from the API's own
 *    arithmetic on the request's days; this side never counts them.
 *
 * ## The flow, in the order a screen does it
 *
 * `limits` once, for the picker. `preview` as dates are chosen, for "a file is
 * required". Then per file `uploadUrl` → `PUT` the bytes with **exactly** the
 * returned headers → `record` (on an existing request) or the refs go in the
 * `POST /leave/requests` body, so the request and its files are one write.
 *
 * ## Two ways a file can get onto a request
 *
 * **Stored here** (`storage: true`): the API's own signed upload, private, and
 * the request is told the key. That is the route and it is unchanged.
 *
 * **Linked** (`storage: false`, `links: true`, and this build knows where the
 * old platform's uploader is): the file goes to that uploader, which answers with
 * an address, and the request is told the address. **Those files are public to
 * anybody who has it**, which is why the picker says so (`LINKED_FILES_NOTE`) and
 * why the route is off unless a deployment configures it. `fileRoute` is the one
 * place that chooses, and `storage` always wins: a server that can keep a file
 * privately is never sent down the other route.
 *
 * ## Refusals
 *
 * Every refusal arrives as one of a few stable codes. `fileProblem` turns one
 * into a sentence for the control it belongs to: the API's own where it wrote
 * one about this refusal (its messages carry the limits and never a name), and a
 * plain default for each code where it did not.
 */

/* ------------------------------------------------------------------ the wire */

export type LeaveFileType = {
  contentType: string;
  label: string;
  /** With or without a leading dot; compare through `extensionOf`. */
  extensions: string[];
  /**
   * A smaller limit for this kind alone. Absent means `LeaveFileLimits.maxBytes`.
   * The API never sends it: `fileRoute` sets it for the linked route, where a
   * document and an image have different limits.
   */
  maxBytes?: number;
};

/** What the picker needs before anything is chosen. */
export type LeaveFileLimits = {
  maxFiles: number;
  /** Per file, measured by the API in bytes. */
  maxBytes: number;
  types: LeaveFileType[];
  /** False on a server with no file storage of its own. */
  storage: boolean;
  /**
   * This server takes a link to a file that was uploaded elsewhere (from a host
   * it allows). Absent is false: a server that predates it says nothing.
   */
  links?: boolean;
};

export type LeaveFileScanStatus =
  "NOT_SCANNED" | "PENDING" | "CLEAN" | "INFECTED" | "SCAN_FAILED";

export type LeaveFile = {
  id: string;
  /** Only ever returned by the list, to people who may open the file. */
  filename: string;
  /** What the bytes are, not what the browser said. */
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  scanStatus: LeaveFileScanStatus;
  /** Flagged by the scanner. Never served: say it cannot be opened. */
  flagged: boolean;
  /** A browser can show it: PDF, PNG, JPEG. HEIC and Word cannot. */
  viewable: boolean;
  uploadedByYou: boolean;
  /** Yours, and the request is still open. */
  canRemove: boolean;
  /**
   * A link to a file kept elsewhere, not a file this server holds. Absent is
   * false. It decides what removing it says: only the record comes off.
   */
  linked?: boolean;
};

export type LeaveFileAccess = {
  role: "owner" | "hr" | "approver";
  canView: true;
  /** False for an approver, after a decision, and at the limit. */
  canAdd: boolean;
};

export type LeaveFileRequirement = {
  policy: LeaveAttachmentPolicy;
  requiredOverDays: number | null;
  /** The leave type asks for one, for a request this long, and this server can store it. */
  required: boolean;
  /** For this request: `required` and no file yet is the state to flag. */
  met: boolean;
};

export type LeaveFileList = {
  files: LeaveFile[];
  access: LeaveFileAccess;
  requirement: LeaveFileRequirement;
  limits: LeaveFileLimits;
};

/** What a leave type asks of a request of a given length, from `preview`. */
export type AttachmentRule = {
  policy: LeaveAttachmentPolicy;
  requiredOverDays: number | null;
  required: boolean;
};

/**
 * A file already uploaded, as the request or the record route takes it: either
 * a key (stored here) or an address (linked). See `LeaveAttachmentRef`.
 */
export type FileRef = LeaveAttachmentRef;

export type OpenedFile = {
  /**
   * A credential for five minutes for a stored file: use it at once and do not
   * keep it. For a linked file it is the file's own address, which is not a
   * credential and does not expire.
   */
  url: string;
  /** Null for a linked file: its address does not expire. */
  expiresAt: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** What was issued and logged, which is not always what was asked for. */
  mode: "view" | "download";
};

type UploadUrl = {
  storageKey: string;
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
};

export const leaveFilesApi = {
  limits: (signal?: AbortSignal): Promise<LeaveFileLimits> =>
    request<LeaveFileLimits>("/leave/attachments/limits", {
      ...(signal ? { signal } : {}),
    }),

  /**
   * Whether a file is required for these dates, while they are still being
   * picked. `days` is the API's count, not ours: the rule is "over N days" and
   * what counts as a day (working or calendar, minus holidays) is its decision.
   */
  rule: async (
    input: { leaveTypeId: string; startDate: string; endDate: string },
    signal?: AbortSignal,
  ): Promise<AttachmentRule | null> => {
    const preview = await request<{ attachment?: AttachmentRule }>(
      "/leave/requests/preview",
      { query: input, ...(signal ? { signal } : {}) },
    );
    /* An API that predates files sends no `attachment`. That is "nothing is
       asked", not "a file is not required": the caller reads null as not
       knowing and says nothing. */
    return preview.attachment ?? null;
  },

  /**
   * `employeeId` is whose leave it is, and needs `APPROVE_LEAVE_ALL` when it is
   * not yours: HR booking sick leave for somebody who phoned in. The key it
   * returns belongs to that person, so a file uploaded for one employee cannot
   * be attached to another's request.
   */
  uploadUrl: (input: {
    employeeId?: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<UploadUrl> =>
    request<UploadUrl>("/leave/attachments/upload-url", {
      method: "POST",
      body: input,
    }),

  list: (requestId: string, signal?: AbortSignal): Promise<LeaveFileList> =>
    request<LeaveFileList>(`/leave/requests/${requestId}/attachments`, {
      ...(signal ? { signal } : {}),
    }),

  /** This is where the API reads the bytes: up to the size limit, by content. */
  record: (requestId: string, ref: FileRef): Promise<LeaveFile> =>
    request<LeaveFile>(`/leave/requests/${requestId}/attachments`, {
      method: "POST",
      body: ref,
    }),

  /** See the header: from a click, used at once, never kept. */
  open: (
    requestId: string,
    fileId: string,
    mode: "view" | "download",
  ): Promise<OpenedFile> =>
    request<OpenedFile>(
      `/leave/requests/${requestId}/attachments/${fileId}/url`,
      { query: { mode } },
    ),

  remove: (requestId: string, fileId: string): Promise<void> =>
    request<void>(`/leave/requests/${requestId}/attachments/${fileId}`, {
      method: "DELETE",
    }),
};

/* ------------------------------------------------------------ choosing a file */

/** `.PDF` and `pdf` are the same extension. */
const extensionOf = (name: string): string =>
  name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";

const bare = (extension: string): string =>
  extension.replace(/^\./, "").toLowerCase();

/**
 * The type to declare for a file.
 *
 * **Not simply `File.type`**, which is the browser's guess and a poor one: some
 * give nothing for a `.heic`, and some say `image/heif`, which the API's
 * allowlist does not know. The API reads the bytes and refuses a file whose
 * content is not the type it was declared as, so the aim is to declare what an
 * honest file is. The browser's type is kept when it is one the API accepts;
 * otherwise the extension decides; and only then is the browser's answer passed
 * through, to be refused in the API's words rather than guessed at here.
 */
export function declaredType(
  file: File,
  limits: LeaveFileLimits | null,
): string {
  const types = limits?.types ?? [];
  if (file.type && types.some((type) => type.contentType === file.type)) {
    return file.type;
  }
  const extension = extensionOf(file.name);
  const byName = extension
    ? types.find((type) => type.extensions.some((e) => bare(e) === extension))
    : undefined;
  return byName?.contentType ?? (file.type || "application/octet-stream");
}

/** `PDF`, `PDF and PNG`, `PDF, PNG and Word`. */
export function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1] ?? ""}`;
}

/** `PDF, PNG, JPEG, HEIC and Word`. */
export function acceptedLabels(limits: LeaveFileLimits | null): string {
  return joinLabels(limits?.types.map((type) => type.label) ?? []);
}

/** The `accept` hint for the picker. A hint: a drop goes around it. */
export function acceptAttribute(limits: LeaveFileLimits | null): string {
  return (limits?.types ?? [])
    .flatMap((type) => type.extensions.map((e) => `.${bare(e)}`))
    .join(",");
}

/**
 * Why a file should not be sent at all, in words, or null.
 *
 * Only so the answer arrives before a minute is spent uploading something that
 * is going to be refused. The API makes the same checks, by the bytes, and its
 * refusal is the one that counts; so an unloaded `limits` checks nothing here
 * rather than guessing a limit.
 */
export function fileRefusal(
  file: File,
  limits: LeaveFileLimits | null,
): string | null {
  if (file.size <= 0) return "That file is empty. Choose it again.";
  if (!limits) return null;
  /* The limit for this kind where it has its own (the linked route's document
     and image differ), else the one for every file. The size is checked before
     the kind, as it always was, so an oversized file of a kind that cannot be
     attached still says it is too big. */
  const type = declaredType(file, limits);
  const kind = limits.types.find((allowed) => allowed.contentType === type);
  const cap = kind?.maxBytes ?? limits.maxBytes;
  if (file.size > cap) {
    /* The size as the list beside it shows it. The API rounds a size *up* to a
       whole megabyte in its own sentence, which reads "7 MB" under a row that
       says "6.0 MB". Its sentence is still what is shown if it is the one to
       refuse. */
    return `That file is ${megabytes(file.size)}. Keep files under ${megabytes(cap)}.`;
  }
  if (!kind) {
    return `That kind of file cannot be attached. You can attach ${acceptedLabels(limits)}.`;
  }
  return null;
}

export const filesFull = (limits: LeaveFileLimits | null): string =>
  `A request can carry up to ${limits ? String(limits.maxFiles) : "five"} files. Remove one to add another.`;

/* ----------------------------------------------------------------- the route */

/**
 * How a file gets onto a request on this server, and what it may be.
 *
 * `limits` is what the **picker** shows and checks with: for a stored file the
 * API's own, untouched; for a linked one the same list narrowed to the three
 * kinds the uploader takes, each with the smaller of the API's limit and the
 * uploader's, so a hint never promises a size the route would refuse.
 *
 * `storage` wins. A server that can keep a file privately is never sent down
 * the public route, whatever else is configured. Unknown limits (not loaded, or
 * the read failed) are `none`, which draws nothing: an offered control that
 * cannot be known to work is the dead button this product refuses, and the API
 * refuses in its own words if somebody gets that far.
 */
export type FileRoute =
  | { kind: "stored"; limits: LeaveFileLimits }
  | { kind: "linked"; limits: LeaveFileLimits }
  | { kind: "none"; limits: null };

export function fileRoute(limits: LeaveFileLimits | null): FileRoute {
  if (!limits) return { kind: "none", limits: null };
  if (limits.storage === true) return { kind: "stored", limits };
  if (limits.links === true && linkedUploadConfigured()) {
    /* A server that lists no kinds at all has said nothing about them, which
       is not the same as naming kinds the uploader cannot send: the uploader's
       own three are offered, and the API refuses in its own words what it does
       not take. Absent is not none, or a server that sends an empty list would
       get a feature nobody could find. */
    const silent = limits.types.length === 0;
    const types = LINKED_KINDS.flatMap((linked): LeaveFileType[] => {
      const theirs: LeaveFileType | undefined = silent
        ? {
            contentType: linked.contentType,
            label: linked.label,
            extensions: linked.extensions.map((extension) => `.${extension}`),
          }
        : limits.types.find((type) => type.contentType === linked.contentType);
      return theirs
        ? [
            {
              ...theirs,
              maxBytes: Math.min(linked.maxBytes, limits.maxBytes),
            },
          ]
        : [];
    });
    /* A server that takes links and names only kinds the uploader cannot send
       has nothing this route could offer. */
    if (types.length > 0) {
      return {
        kind: "linked",
        limits: {
          ...limits,
          types,
          maxBytes: Math.max(...types.map((t) => t.maxBytes ?? 0)),
        },
      };
    }
  }
  return { kind: "none", limits: null };
}

/**
 * Whether a file can be attached here at all, or null when it is not known.
 *
 * What a setting that asks for a file reads: only an answer of `false` stops
 * one being asked for, and null is "not known", which the API settles.
 */
export const filesAvailable = (
  limits: LeaveFileLimits | null,
): boolean | null =>
  limits === null ? null : fileRoute(limits).kind !== "none";

/* ------------------------------------------------------------------- upload */

/**
 * Put one file in storage and hand back what records it.
 *
 * Resolves **only** once the bytes are stored, so a caller that sends the ref
 * with the request cannot name a file that is not there. The request goes after
 * this, never beside it.
 */
export async function uploadLeaveFile(
  file: File,
  limits: LeaveFileLimits | null,
  options: {
    /** Whose leave it is. Always sent: your own id is allowed, and HR's is not
     *  the signed-in person's. */
    employeeId?: string;
    onProgress?: (fraction: number) => void;
  } = {},
): Promise<FileRef> {
  /* A server that stores files keeps the route it always had, and so does
     "not known": the API answers. Only a server that says it cannot, and takes
     links, goes the other way. */
  if (limits && limits.storage !== true) {
    const route = fileRoute(limits);
    if (route.kind !== "linked") {
      throw new Error("Files cannot be attached on this server yet.");
    }
    return uploadLinkedFile(file, {
      maxBytes: limits.maxBytes,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    });
  }

  const contentType = declaredType(file, limits);
  const presigned = await leaveFilesApi.uploadUrl({
    ...(options.employeeId ? { employeeId: options.employeeId } : {}),
    filename: file.name,
    contentType,
    sizeBytes: file.size,
  });
  /* The returned headers, and nothing else. The URL is signed over them. */
  await putToStorage(
    file,
    {
      key: presigned.storageKey,
      url: presigned.url,
      expiresAt: presigned.expiresAt,
      maxBytes: limits?.maxBytes ?? file.size,
      headers: presigned.headers,
    },
    options.onProgress,
  );
  return { storageKey: presigned.storageKey, filename: file.name, contentType };
}

/* --------------------------------------------------------------------- open */

export type OpenResult = "opened" | "blocked";

/**
 * Open one file, from a click.
 *
 * A viewable file opens in a new tab and the rest download, and the tab has to
 * be opened **inside the click**: a browser stops one opened after an `await`.
 * So for a viewable file the tab is opened first, blank, and pointed at the file
 * when the link comes back. If the browser stopped it, no link is asked for at
 * all, because issuing one is a look in the audit trail and there would be
 * nothing to look with.
 *
 * What comes back says whether it was a view or a download, and that is what is
 * done: a file asked for as a view that the API says is a download closes the
 * tab and navigates this window, whose page stays because a download does not
 * replace it. The link goes to `location` and nowhere else.
 */
export async function openLeaveFile(
  requestId: string,
  file: Pick<LeaveFile, "id" | "viewable">,
): Promise<OpenResult> {
  const wantsView = file.viewable;
  const tab = wantsView ? window.open("", "_blank") : null;
  if (wantsView && !tab) return "blocked";
  /* The target is storage's origin, not ours: it gets no handle on this page. */
  if (tab) tab.opener = null;
  try {
    const opened = await leaveFilesApi.open(
      requestId,
      file.id,
      wantsView ? "view" : "download",
    );
    /* A linked file has no expiry and is not served with a download header, so
       sending *this* window to it would replace the page. It goes in the tab
       that was opened for it. */
    if (tab && (opened.mode === "view" || opened.expiresAt === null)) {
      tab.location.href = opened.url;
    } else {
      tab?.close();
      window.location.assign(opened.url);
    }
    return "opened";
  } catch (error) {
    tab?.close();
    throw error;
  }
}

/* ----------------------------------------------------------------- refusals */

/**
 * What to say beside a control when a file call fails.
 *
 * The API's own sentence where it wrote one about this refusal: its messages
 * carry the limits ("Keep files under 5 MB") and the specific cause, and
 * `attachment_type_refused` in particular covers an empty file, a duplicate and
 * a type, which no single local sentence could. None of them contains a file's
 * name, which is the other reason to use them. A default for each code is here
 * for the day a message is missing, and for the three the API does not write
 * (`forbidden`, `not_found`, `rate_limited` are generic).
 *
 * `locked` is said differently to the person who filed it than to an approver,
 * but the screen never offers an approver the control, so there is one wording.
 */
export function fileProblem(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error && error.message
      ? error.message
      : "That did not work. Try again.";
  }
  const own = error.message.trim();
  switch (error.code) {
    case "attachment_required":
      return (
        own ||
        "A supporting file is required. Attach one and send the request again."
      );
    case "attachment_limit":
      return (
        own ||
        "A request can carry up to five files. Remove one to add another."
      );
    case "attachment_too_large":
      return own || "That file is too large. Choose a smaller one.";
    case "attachment_type_refused":
      return own || "That kind of file cannot be attached.";
    case "attachment_flagged":
      return (
        own || "That file did not pass the virus check. Choose another copy."
      );
    case "attachment_missing":
      return (
        own || "The upload did not finish or has expired. Upload it again."
      );
    case "attachment_locked":
      return (
        own ||
        "Files cannot be changed once a request is decided. Reopen it to change them."
      );
    case "attachment_link_refused":
      /* The server's sentence is about the address it was given. Without one,
         the one thing that helps is trying again, and the address is not shown:
         it is a link to somebody's file. */
      return (
        own || "That file's address was not accepted. Try attaching it again."
      );
    case "storage_off":
      return own || "File uploads are not set up on this server.";
    case "storage_unavailable":
      /* Never "missing": nothing is known to be gone, it simply did not answer. */
      return own || "File storage did not answer. Wait a minute and try again.";
    case "forbidden":
      return "You cannot open files on this request.";
    case "not_found":
      return "That request or file is no longer here.";
    case "rate_limited":
      return (
        own ||
        "Too many file requests just now. Wait a few minutes and try again."
      );
    case "validation_failed": {
      const first = error.fieldErrors[0]?.message;
      return first || own || "Check what you entered and try again.";
    }
    default:
      return own || "That did not work. Try again.";
  }
}
