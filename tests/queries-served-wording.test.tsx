import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import {
  SERVED_HOW_HELP,
  SERVED_HOW_LABEL,
  type ApiQueryDetail,
} from "@/lib/api/queries";
import { can, detail } from "./queries-fixtures";

/**
 * The words for how a query letter is served, and the one word that must not come back.
 *
 * A company reader does not know what "the product" is: "In the product" and "Outside the product"
 * read as jargon on the field "How it will be served", and so did every sentence that said
 * "nobody was told in the product". Everywhere a Queries screen means this application it says
 * "ApproveHR", and the three ways of serving read "In ApproveHR", "In person" and "By post or
 * email". The enum values (`IN_PRODUCT`, `IN_PERSON`, `OUTSIDE_PRODUCT`) are the wire contract and
 * did not change.
 *
 * What is proved:
 *  - the three labels and the three help sentences, word for word;
 *  - the draft's field offers exactly those three options and shows the matching sentence under the
 *    choice, and the issue confirmation says "Nobody is told in ApproveHR." where nobody is;
 *  - the printed letter and a sent reply use the same words;
 *  - no user-facing string in any Queries source file says "product" at all (comments are not read:
 *    a comment may explain why an enum value is spelt as it is). The scan reads the strings the
 *    TypeScript parser finds, and is itself checked to see a string it should flag, so it cannot
 *    pass by reading nothing.
 */

let employeeId: string | null = "e-1";
let held = new Set<string>();
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: true,
    employeeId,
    user: { id: "u-me" },
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: (key: string) => held.has(key),
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/store/company", () => ({
  useLiveCompanyProfile: () => ({ profile: null, reload: () => undefined }),
}));
vi.mock("@/lib/store/conduct", () => ({
  dayLabel: (day: string | null) => (day ? `D(${day})` : "—"),
}));

const publish = vi.fn();
let current: ApiQueryDetail | null = null;
const actions = {
  readOnly: false,
  create: vi.fn(),
  update: vi.fn(),
  issue: vi.fn(),
  addFile: vi.fn(),
  removeFile: vi.fn(),
  fileContent: vi.fn(),
  confirmReceipt: vi.fn(),
  saveReply: vi.fn(),
  sendReply: vi.fn(),
  replyFromPaper: vi.fn(),
  extend: vi.fn(),
  outcome: vi.fn(),
  withdraw: vi.fn(),
  archive: vi.fn(),
  updateSettings: vi.fn(),
};
vi.mock("@/lib/store/queries", async (original) => ({
  ...(await original<typeof import("@/lib/store/queries")>()),
  useQueryDetail: () => ({
    detail: current,
    loading: false,
    error: null,
    reload: vi.fn(),
    publish,
    unavailable: false,
  }),
  useQueryActions: () => actions,
}));

const { QueryScreen } =
  await import("@/app/(app)/people/queries/[id]/query-screen");

const mount = (read: ApiQueryDetail) => {
  current = read;
  return render(
    <ToastProvider>
      <QueryScreen id={read.id} />
    </ToastProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  employeeId = "e-1";
  held = new Set();
  current = null;
});

/** A draft the issuer is writing, with the way it will be served left as given. */
const draft = (how: ApiQueryDetail["served"]["how"]) => {
  employeeId = "e-9";
  held = new Set(["ISSUE_QUERIES"]);
  return detail({
    status: "DRAFT",
    reference: null,
    issuedBy: null,
    issuedAt: null,
    issuedById: "u-me",
    served: { ...detail().served, how, at: null },
    can: can({ edit: true, issue: true, withdraw: true }),
  });
};

describe("the three ways of serving a letter", () => {
  it("read In ApproveHR, In person and By post or email", () => {
    expect(SERVED_HOW_LABEL).toEqual({
      IN_PRODUCT: "In ApproveHR",
      IN_PERSON: "In person",
      OUTSIDE_PRODUCT: "By post or email",
    });
  });

  it("each say, in one short sentence, whether anybody is told in ApproveHR", () => {
    expect(SERVED_HOW_HELP).toEqual({
      IN_PRODUCT:
        "They are told in ApproveHR and can read and answer it there. Somebody with no sign-in cannot be told this way.",
      IN_PERSON:
        "You hand it over on paper and record when and by whom. Nobody is told in ApproveHR.",
      OUTSIDE_PRODUCT:
        "Sent by post, email or any other way outside ApproveHR. Nobody is told in ApproveHR.",
    });
  });
});

describe("the draft's field 'How it will be served'", () => {
  it("offers exactly In ApproveHR, In person and By post or email", () => {
    mount(draft(null));
    const select = screen.getByRole("combobox", {
      name: /How it will be served/,
    });
    const options = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "Choose how it will be served",
      "In ApproveHR",
      "In person",
      "By post or email",
    ]);
  });

  it("shows the sentence for the choice under the field", async () => {
    const user = userEvent.setup();
    mount(draft(null));
    const select = screen.getByRole("combobox", {
      name: /How it will be served/,
    });

    await user.selectOptions(select, "By post or email");
    expect(
      screen.getByText(
        "Sent by post, email or any other way outside ApproveHR. Nobody is told in ApproveHR.",
      ),
    ).toBeInTheDocument();

    await user.selectOptions(select, "In ApproveHR");
    expect(
      screen.getByText(
        "They are told in ApproveHR and can read and answer it there. Somebody with no sign-in cannot be told this way.",
      ),
    ).toBeInTheDocument();
  });

  it("says in the issue confirmation that nobody is told in ApproveHR when it goes by post or email", async () => {
    const user = userEvent.setup();
    mount(draft("OUTSIDE_PRODUCT"));
    await user.click(screen.getByRole("button", { name: "Issue the query" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Nobody is told in ApproveHR."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/in the product/i)).toBeNull();
  });

  it("says in the issue confirmation that they are told when it is served in ApproveHR", async () => {
    const user = userEvent.setup();
    mount(draft("IN_PRODUCT"));
    await user.click(screen.getByRole("button", { name: "Issue the query" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/told that a letter from HR is waiting/),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText("Nobody is told in ApproveHR."),
    ).toBeNull();
  });
});

describe("the toast after issuing", () => {
  it("says nobody was told in ApproveHR when the person has no sign-in", async () => {
    const user = userEvent.setup();
    const letter = draft("IN_PRODUCT");
    mount({
      ...letter,
      served: { ...letter.served, subjectHasSignInNow: false },
    });
    actions.issue.mockResolvedValue({
      detail: detail({ reference: "Q-2026-021" }),
      warnings: [],
      citations: [],
      subjectHasSignIn: false,
      toldInProduct: false,
      nobodyToldInProduct: true,
    });
    await user.click(screen.getByRole("button", { name: "Issue the query" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Issue it",
      }),
    );
    expect(await screen.findByText("Q-2026-021 issued")).toBeInTheDocument();
    expect(
      screen.getByText("Nobody was told in ApproveHR."),
    ).toBeInTheDocument();
  });
});

describe("where the words are read back", () => {
  it("the printed letter says how it was served in the same words", () => {
    employeeId = "e-9"; /* staff, not the person the letter is addressed to */
    mount(
      detail({
        issuedById: "u-other",
        can: can({ withdraw: true }),
        served: { ...detail().served, how: "OUTSIDE_PRODUCT" },
      }),
    );
    const paper = document.querySelector("article");
    expect(paper).not.toBeNull();
    expect(paper?.textContent).toContain("Served: By post or email.");
    expect(paper?.textContent).not.toMatch(/the product/i);
  });

  it("the printed letter says In ApproveHR when it was served there", () => {
    employeeId = "e-9";
    mount(detail({ issuedById: "u-other", can: can({ withdraw: true }) }));
    expect(document.querySelector("article")?.textContent).toContain(
      "Served: In ApproveHR.",
    );
  });

  it("a sent reply says it was sent in ApproveHR", () => {
    mount(
      detail({
        status: "REPLIED",
        replyState: "replied_on_time",
        replyStateLabel: "Replied on 19 Nov 2026, 9:00 am.",
        reply: {
          body: "I was ill.",
          source: "IN_PRODUCT",
          sent: true,
          sentAt: "2026-11-19T08:00:00.000Z",
          receivedOn: null,
          enteredByName: null,
          replyHash: null,
        },
        can: can(),
      }),
    );
    expect(screen.getByText(/^Sent in ApproveHR on /)).toBeInTheDocument();
  });

  it("a reply with no recorded time still says it was sent in ApproveHR", () => {
    mount(
      detail({
        status: "REPLIED",
        replyState: "replied_on_time",
        replyStateLabel: "Replied on time.",
        reply: {
          body: "I was ill.",
          source: "IN_PRODUCT",
          sent: true,
          sentAt: null,
          receivedOn: null,
          enteredByName: null,
          replyHash: null,
        },
        can: can(),
      }),
    );
    expect(screen.getByText("Sent in ApproveHR.")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------ the word does not come back */

const SRC = path.resolve(import.meta.dirname, "../src");

/** Every file and folder that is the Queries module, relative to `src`. */
const QUERIES_PATHS = [
  "app/(app)/people/queries",
  "app/(app)/settings/queries",
  "components/queries",
  "lib/queries",
  "lib/api/queries.ts",
  "lib/api/query-ties.ts",
  "lib/store/queries.ts",
  "lib/store/query-citation-options.ts",
];

function filesUnder(entry: string): string[] {
  const full = path.join(SRC, entry);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => {
    const child = path.join(full, name);
    return statSync(child).isDirectory()
      ? filesUnder(path.relative(SRC, child))
      : /\.tsx?$/.test(name)
        ? [child]
        : [];
  });
}

/** The text a person can read: string literals, template text and JSX text. Comments are not. */
function userFacingText(source: string, file: string): string[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      found.push(node.text);
    } else if (ts.isJsxText(node)) {
      found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/** The word, on its own. `IN_PRODUCT` and `nobodyToldInProduct` are identifiers and do not match. */
const JARGON = /\bproduct\b/i;

describe("no Queries screen says 'the product' again", () => {
  it("the scan reads real files and sees the strings it should (so it cannot pass by reading nothing)", () => {
    const files = QUERIES_PATHS.flatMap(filesUnder);
    expect(files.length).toBeGreaterThan(15);
    const all = files.flatMap((file) =>
      userFacingText(readFileSync(file, "utf8"), file),
    );
    expect(all).toContain("In ApproveHR");
    expect(all).toContain("By post or email");
    /* The enum value is a string too, and must not look like the word. */
    expect(all).toContain("IN_PRODUCT");
    expect(JARGON.test("IN_PRODUCT")).toBe(false);
  });

  it("flags the word in a string, a template and JSX text, and ignores a comment", () => {
    const sample = [
      '// "in the product" in a comment is allowed',
      "/* Nobody was told in the product. */",
      'const a = "Nobody was told in the product.";',
      "const b = `Sent in the product on ${when}.`;",
      "const c = <p>Nobody is told in the product.</p>;",
    ].join("\n");
    const texts = userFacingText(sample, "sample.tsx");
    expect(texts.filter((text) => JARGON.test(text))).toEqual([
      "Nobody was told in the product.",
      "Sent in the product on ",
      "Nobody is told in the product.",
    ]);
    expect(
      userFacingText(
        '// the product\nconst d = "In ApproveHR";',
        "s.ts",
      ).filter((text) => JARGON.test(text)),
    ).toEqual([]);
  });

  for (const entry of QUERIES_PATHS) {
    it(`${entry} has no user-facing string that says "product"`, () => {
      const offenders = filesUnder(entry).flatMap((file) =>
        userFacingText(readFileSync(file, "utf8"), file)
          .filter((text) => JARGON.test(text))
          .map((text) => `${path.relative(SRC, file)}: ${text.trim()}`),
      );
      expect(offenders).toEqual([]);
    });
  }
});
