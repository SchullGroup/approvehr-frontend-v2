import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NAV,
  NOTHING_ANSWERED_YET,
  visibleNav,
  type NavFacts,
} from "@/components/portal/nav";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/permission-keys";

/**
 * Signatures, end to end, by role.
 *
 * The feedback: *"Why did we add signatures? I can't find any flows for
 * signature, it is just showing at the side bar for both HR and Employee."*
 * Then: *"Create a full flow for the signatures is not done properly also the
 * styling feels weird create end to end flows taking into account the user
 * roles."*
 *
 * Both sentences describe the same defect, from two angles.
 *
 * ## There was no way to send
 *
 * `POST /signatures` was complete. `signaturesApi.send` was written.
 * `useSignatureMutations().send` was written. **Nothing called it.** So no
 * signature could ever exist, so every tab on the screen was permanently empty
 * for everybody — and a sidebar row led to a room with nothing in it.
 *
 * "I can't find any flows" was not a discoverability problem. There was no
 * flow. The tests below hold the two halves apart, because they are governed
 * by two different things:
 *
 * | Act | Governed by | Can an administrator do it? |
 * |---|---|---|
 * | Send | `EDIT_RECORDS` — it acts with the company's authority | Yes |
 * | Sign | being the named signer. **Not a permission** | No |
 *
 * That asymmetry is the module. An administrator holding all 31 permissions can
 * put a contract in front of anybody and cannot sign one on their behalf, which
 * is why `mine` (the API's own answer) puts the Sign button on screen and a
 * `useCan` never does.
 */

const sourceOf = (relative: string) =>
  readFileSync(path.resolve(import.meta.dirname, relative), "utf8");

const screen = sourceOf(
  "../src/app/(app)/people/signatures/signatures-screen.tsx",
);
const dialog = sourceOf("../src/app/(app)/people/signatures/send-dialog.tsx");
const client = sourceOf("../src/lib/api/signatures.ts");

/* -------------------------------------------------------------- the sidebar */

const EMPLOYEE = new Set<PermissionKey>([]);
const EVERYTHING: ReadonlySet<PermissionKey> = new Set(PERMISSION_KEYS);

const facts = (has: boolean): NavFacts => ({
  assistantWired: true,
  /* One-to-ones on throughout — this file is about signatures, and a row
     hidden for an unrelated reason would be a false negative. */
  rows: { "one-on-ones": true, signatures: has },
});

const labels = (
  permissions: ReadonlySet<PermissionKey>,
  answered: NavFacts,
): string[] =>
  visibleNav(NAV, permissions, {}, answered).flatMap((group) =>
    group.items.map((item) => item.label),
  );

describe("the sidebar row", () => {
  it("is absent for an employee with nothing to sign and nothing sent", () => {
    /* The reported state. They could neither send nor sign, and the row was
       there anyway because the item was `always: true`. */
    expect(labels(EMPLOYEE, facts(false))).not.toContain("Signatures");
  });

  it("is there once they have one, whatever their permissions", () => {
    expect(labels(EMPLOYEE, facts(true))).toContain("Signatures");
  });

  it("is hidden while nothing has answered yet", () => {
    expect(labels(EVERYTHING, NOTHING_ANSWERED_YET)).not.toContain(
      "Signatures",
    );
  });

  it("hides only itself", () => {
    const before = labels(EMPLOYEE, facts(true));
    const after = labels(EMPLOYEE, facts(false));
    expect(before.filter((label) => label !== "Signatures")).toEqual(after);
    expect(after.length).toBeGreaterThan(3);
  });
});

describe("the shell answers it from the permission, not only the rows", () => {
  const shell = sourceOf("../src/components/portal/shell.tsx");

  it("shows the row to anybody who can send", () => {
    /* Somebody with `EDIT_RECORDS` and no signature of their own still needs
       the row — it is where sending happens. A pure rows answer would hide the
       module from the only person who can start anything in it, which is a
       worse version of the bug being fixed. */
    expect(shell).toMatch(
      /signatures: canSendForSignature \|\| haveSignatures/,
    );
  });

  it("lets the screen correct the sidebar without a second request", () => {
    /* `anySignature` does not revalidate on focus, and this fact changes when
       a colleague presses Send — so somebody following a notification link
       could stand on the screen reading their contract while the nav had no
       row for it. The screen already holds the same endpoint's answer, which
       is the one thing `set` is for. */
    const store = sourceOf("../src/lib/store/signatures.ts");
    expect(store).toMatch(
      /anySignature\.set\(sessionKey, read\.data\.length\)/,
    );
    /* Never off a filtered read: a `status` narrows the rows, so publishing
       "you have none" from one would be a guess rather than an answer. */
    expect(store).toMatch(/if \(filtered \|\| read\.data === null\) return;/);
  });

  it("does not spend a request on somebody who has the permission", () => {
    /* They get the row on that ground alone. `enabled` false means the hook
       passes a null key and fetches nothing. */
    expect(shell).toMatch(/useHaveIAnySignatures\(!canSendForSignature\)/);
  });
});

/* ------------------------------------------------------------ sending exists */

describe("sending", () => {
  it("has a control, which is the whole gap", () => {
    /* The literal fix for "I can't find any flows for signature". Before this,
       `mutations.send` had zero consumers in the repo. */
    expect(screen).toMatch(/<SendDialog/);
    expect(screen).toMatch(/Send for signature/);
    expect(dialog).toMatch(/mutations\.send\(/);
  });

  it("is gated on the permission the API requires", () => {
    /* `EDIT_RECORDS`, refused by the API with its own sentence. Absent rather
       than present-and-refusing. */
    expect(screen).toMatch(/canManage \? \(/);
  });

  it("collects everything the endpoint needs and nothing it does not", () => {
    for (const field of [
      "title",
      "signerId",
      "documentBase64",
      "contentType",
      "message",
      "dueDate",
    ]) {
      expect(dialog).toContain(field);
    }
  });

  it("moves the reader to the tab the sent document is on", () => {
    /* It is not waiting on the sender, so leaving them on "Waiting on me"
       answers a successful send with an empty screen. */
    expect(screen).toMatch(/setTab\("all"\)/);
  });
});

describe("signing is not a permission, and the code must not make it one", () => {
  it("puts the Sign button on the API's answer", () => {
    expect(screen).toMatch(/record\.mine && record\.status === "PENDING"/);
  });

  it("never gates signing or declining on a permission", () => {
    /* The one thing in this module that would be genuinely damaging: a
       `canManage` anywhere near the sign or decline controls would offer an
       administrator a way to sign on somebody's behalf. `canManage` may appear
       — it gates the Send button and the tab label — so this asserts the
       shape, that the only `canManage ?` in a rendering position is the
       sending one and the signing branch reads `record.mine`. */
    const signingBranch = screen.slice(screen.indexOf("record.mine &&"));
    expect(signingBranch).toMatch(/Sign it/);
    expect(
      signingBranch.slice(0, signingBranch.indexOf("Sign it")),
    ).not.toMatch(/canManage|useCan/);
  });
});

/* ------------------------------------------------------------- the file rules */

describe("the file rules match the API, before a byte is encoded", () => {
  it("accepts a PDF only, and says why", () => {
    expect(client).toMatch(/SIGNABLE_ACCEPT = "\.pdf"/);
    expect(dialog).toMatch(/accept=\{SIGNABLE_ACCEPT\}/);
    /* Not just `accept`, which filters a picker and stops nothing: the type the
       browser reported is checked too, because a renamed file arrives with its
       real one. */
    expect(dialog).toMatch(/file\.mimeType !== SIGNABLE_CONTENT_TYPE/);
  });

  it("caps at the signature limit, not the document limit", () => {
    /* 5MB, not 10. A document to sign is kept whole in the record, so its
       ceiling is lower — and passing the cap down means the refusal arrives
       before the encode rather than after it. */
    expect(client).toMatch(/MAX_SIGNABLE_BYTES = 5 \* 1024 \* 1024/);
    expect(dialog).toMatch(/maxBytes=\{MAX_SIGNABLE_BYTES\}/);
  });

  it("is checked against the API by a gate, not by a comment", () => {
    /* `verify-signature-wording` compares all four constants with the API's
       own source. A header asking somebody to keep two copies in step is not
       a gate — the same argument that script already makes about the wording. */
    const verifier = sourceOf("../scripts/verify-signature-wording.ts");
    expect(verifier).toMatch(/MAX_SIGNABLE_BYTES/);
    expect(verifier).toMatch(/SIGNABLE_CONTENT_TYPE/);
  });
});

/* ----------------------------------------------------------------- the styling */

describe("the styling", () => {
  it("does not give every row two lines of hex", () => {
    /* "The styling feels weird": the SHA-256 was two full-width monospace
       lines in every card body, so ten documents were twenty lines of hex
       with more of the screen than the ten titles. */
    expect(screen).toMatch(/<Disclosure/);
    expect(screen).toMatch(/Document fingerprint/);
  });

  it("still shows it unavoidably where the decision is made", () => {
    /* The sign dialog. Hiding it there would be the opposite mistake — that is
       the moment somebody is adopting these exact bytes. */
    const signDialog = screen.slice(screen.indexOf("function SignDialog"));
    expect(signDialog).toMatch(/Read it first/);
    expect(signDialog).toMatch(/fingerprint/);
    expect(signDialog).not.toMatch(/<Disclosure/);
  });

  it("says what the module is for, to each audience", () => {
    /* The feedback opened with "why did we add signatures". A screen whose own
       name is the only explanation is a screen people click once. */
    expect(screen).toMatch(/description=\{\s*canManage/);
  });

  it("keeps the sentence that stops it overclaiming", () => {
    /* `SIGNATURE_KIND` must survive every layout change: it is the sentence
       that stops somebody reading this as a cryptographic digital signature. */
    expect(screen).toMatch(/SIGNATURE_KIND/);
    expect(dialog).toMatch(/SIGNATURE_KIND/);
  });
});

/* ------------------------------------------------------------------ overdue */

describe("overdue is a date question, not a timestamp one", () => {
  it("does not call something due today overdue", () => {
    /* `dueDate` has no time on it. Comparing it against a raw instant makes a
       document due today read as overdue from one minute past midnight, and
       the reader is looking at a calendar rather than a clock — so both
       `dueDate` and "today" are pinned to midnight before they are compared,
       and neither is `Date.now()`. Task 7d moved "today" from the reader's
       clock to `todayIn(timeZone)`, which is what changed this from
       `Date.UTC(...)` to a second `T00:00:00Z` parse of the same shape. */
    expect(screen).not.toMatch(/Date\.now\(\)/);
    expect(screen).toMatch(/T00:00:00Z/);
    expect(screen).toMatch(/Due today/);
  });

  it("only ever says it about something still pending", () => {
    /* A signed document with a due date in the past was not late. It was
       signed. */
    expect(screen).toMatch(
      /record\.status !== "PENDING" \|\| !record\.dueDate/,
    );
  });
});
