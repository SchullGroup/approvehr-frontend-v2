import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { demoScreening } from "@/lib/hiring/screening/demo-store";

/**
 * What the screening screens are allowed to say.
 *
 * Three rules, held by reading what is written and what is drawn:
 *
 * 1. **No AI.** The score is a count of matches against criteria somebody wrote,
 *    and nothing here may describe it as anything cleverer or send a CV anywhere.
 * 2. **No verdicts.** A person is "below the pass mark" or "needs a look", never
 *    "failed" or "eliminated", and nothing is said to have been done to them.
 * 3. **"Rejected" is a person's act.** Every sentence with the word in it is
 *    either the person's own action (a button, a dialog they opened, a result they
 *    asked for) or says nobody is rejected. A new sentence has to be added to the
 *    list below on purpose, which is the point.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/hiring/postings/demo-advert-req-01",
}));
vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
  useCan: () => true,
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: false, isLoading: false, user: null }),
}));

const SRC = path.resolve(import.meta.dirname, "../src");

const FILES = [
  "lib/hiring/screening",
  "components/hiring/screening",
  "app/(app)/hiring/postings/[id]/below-pass-mark",
  "app/(app)/hiring/postings/[id]/assessment-scores",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

/** Every piece of text a person could read: JSX text and string literals with words in them. */
function copyIn(file: string): { text: string; line: number }[] {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const out: { text: string; line: number }[] = [];
  const add = (node: ts.Node, text: string) => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length < 4 || !/[A-Za-z]{3}/.test(clean) || !/\s/.test(clean))
      return;
    /* Class lists and module paths are not copy. */
    if (
      /^[\w:[\]./%()#-]+( [\w:[\]./%()#-]+)*$/.test(clean) &&
      /[:\[\]/-]/.test(clean) &&
      !/[.,]$/.test(clean)
    )
      return;
    out.push({
      text: clean,
      line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxText(node)) add(node, node.text);
    else if (ts.isStringLiteralLike(node)) add(node, node.text);
    else if (
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      add(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const BANNED_ANYWHERE =
  /\bAI\b|artificial intelligence|machine learning|\bLLM\b|\bGPT\b|chatbot|algorithm|neural|predict|sentiment/i;
const VERDICTS =
  /\bfailed\b|eliminat|disqualif|not good enough|unsuitable|auto-?reject|automatically reject|screened out/i;

/**
 * Every sentence allowed to say "reject": the person's own action, or a statement
 * that nobody is. Add to this on purpose.
 */
const MAY_SAY_REJECT: RegExp[] = [
  /nobody is rejected/i,
  /nobody was rejected/i,
  /never rejects/i,
  /it flags\. it never/i,
  /rejecting never emails/i,
  /then reject the rest/i,
  /before anybody is turned down/i,
  /^Reject…?$/,
  /^Rejected$/,
  /Reject \$\{/,
  /^Reject$/,
  /rejects? anybody/i,
  /being rejected/i,
  /rejected because of it/i,
  /where people are turned down/i,
  /keep in the running anybody who should stay/i,
  /rejected by a score/i,
  /\breject\b.*\bthe rest\b/i,
  /rejected until a person confirms/i,
  /If you reject/i,
  /Rejecting /,
  /rejections? /i,
  /the decision is yours/i,
  /rejected: /i,
  /not rejected/i,
  /and reject$/i,
  /Fit \d+/,
  /^Reject… ?$/,
  /reject people/i,
];

describe("what is written", () => {
  const files = FILES.flatMap((dir) => sourceFiles(path.join(SRC, dir)));

  it("reads the screening files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("never describes the score as AI, a model or a prediction", () => {
    const found = files.flatMap((file) =>
      copyIn(file)
        .filter((entry) => BANNED_ANYWHERE.test(entry.text))
        .map(
          (entry) =>
            `${path.relative(SRC, file)}:${String(entry.line)} ${entry.text}`,
        ),
    );
    expect(found).toEqual([]);
  });

  it("never reads as a verdict on a person", () => {
    const found = files.flatMap((file) =>
      copyIn(file)
        .filter((entry) => VERDICTS.test(entry.text))
        .map(
          (entry) =>
            `${path.relative(SRC, file)}:${String(entry.line)} ${entry.text}`,
        ),
    );
    expect(found).toEqual([]);
  });

  it("says 'reject' only as a person's own act, or to say nobody is", () => {
    const found = files.flatMap((file) =>
      copyIn(file)
        .filter(
          (entry) =>
            /reject/i.test(entry.text) &&
            !MAY_SAY_REJECT.some((allowed) => allowed.test(entry.text)),
        )
        .map(
          (entry) =>
            `${path.relative(SRC, file)}:${String(entry.line)} ${entry.text}`,
        ),
    );
    expect(found).toEqual([]);
  });

  it("has no exclamation marks in anything a person reads", () => {
    const found = files.flatMap((file) =>
      copyIn(file)
        .filter(
          (entry) =>
            /[A-Za-z]!( |$)/.test(entry.text) && !/!==|!\w+\(/.test(entry.text),
        )
        .map(
          (entry) =>
            `${path.relative(SRC, file)}:${String(entry.line)} ${entry.text}`,
        ),
    );
    expect(found).toEqual([]);
  });
});

/* ------------------------------------------------------------- what is drawn */

const { ScreeningWorkbench } =
  await import("@/components/hiring/screening/screening-workbench");
const { BelowScreen } =
  await import("@/app/(app)/hiring/postings/[id]/below-pass-mark/below-screen");
const { ApplicationsScreen } =
  await import("@/app/(app)/hiring/postings/applications/applications-screen");

beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
  demoScreening.reset();
});

const text = () => document.body.textContent ?? "";

describe("what is drawn", () => {
  it("the screening tab never says AI, a verdict, or that anybody was rejected", async () => {
    render(
      <ToastProvider>
        <ScreeningWorkbench postingId="demo-advert-req-01" />
      </ToastProvider>,
    );
    await screen.findByTestId("criteria-version");
    await screen.findByTestId("pass-mark-count");
    expect(text()).not.toMatch(BANNED_ANYWHERE);
    expect(text()).not.toMatch(VERDICTS);
    expect(text()).toMatch(/Nobody is rejected until a person confirms it/);
    expect(text()).toMatch(/It flags\. It never rejects\./);
  });

  it("the list below the pass mark says nobody is rejected until you confirm", async () => {
    render(
      <ToastProvider>
        <BelowScreen id="demo-advert-req-01" />
      </ToastProvider>,
    );
    await screen.findAllByText("Below the pass mark");
    expect(text()).not.toMatch(BANNED_ANYWHERE);
    expect(text()).not.toMatch(VERDICTS);
    /* Before anybody acts, the only rejecting on the page is the button. */
    const before = text().replace(/Nobody is rejected until you confirm\./, "");
    expect(before).not.toMatch(/rejected/i);
  });

  it("a queue row, opened out, says what it says and no more", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ApplicationsScreen initialPostingId="demo-advert-req-01" />
      </ToastProvider>,
    );
    await waitFor(() =>
      expect(screen.getAllByText(/^Applied 2026-/).length).toBeGreaterThan(0),
    );
    for (const button of screen.getAllByRole("button", {
      name: "How this score was worked out",
    })) {
      await user.click(button);
    }
    await waitFor(() =>
      expect(screen.getAllByTestId("explanation").length).toBeGreaterThan(3),
    );
    expect(text()).not.toMatch(BANNED_ANYWHERE);
    expect(text()).not.toMatch(VERDICTS);
    /* The only "rejected" on a queue page is the sentence saying nobody is. */
    const rest = text().replace(
      /Nobody is rejected until a person confirms it\./g,
      "",
    );
    expect(rest).not.toMatch(/rejected/i);
  });
});
