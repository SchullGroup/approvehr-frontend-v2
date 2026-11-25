import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { can, detail } from "./queries-fixtures";

/**
 * The security pass over everything Stages 3 and 4 added to the web.
 *
 * Two kinds of check, because a rule that lives only in a comment is one refactor from broken:
 *
 * - **Source checks** read the files and fail on a pattern: a way to put markup into the page, a
 *   console write, a download that fires on render, a link whose address is not built from an id,
 *   a cast on wire data, a secret in a fixture. They are blunt on purpose; if one is wrong for a
 *   legitimate use, the right fix is to name the file and say why here.
 * - **Render checks** feed typed text that is hostile (markup, an address, a script) through the
 *   screens that draw it and assert it came out as text: no element made from it, no link made
 *   from it, and the printed letter escaping it the same way.
 */

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** Every file that draws or sends a query's words. */
const QUERY_FILES = [
  ...walk("src/app/(app)/people/queries"),
  ...walk("src/app/(app)/settings/queries"),
  ...walk("src/components/queries"),
  ...walk("src/lib/queries"),
  "src/lib/api/queries.ts",
  "src/lib/api/query-ties.ts",
  "src/lib/store/queries.ts",
  "src/lib/store/query-citation-options.ts",
];

/** The files this stage added, which hold the stricter wire rules (no cast on a wire value). */
const WIRE_FILES = [
  "src/lib/api/query-ties.ts",
  "src/lib/queries/citation-rows.ts",
  "src/lib/store/query-citation-options.ts",
];

/** Comments are prose about the rules and may name the very things banned in code. */
const code = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("typed text is never markup", () => {
  it.each(QUERY_FILES)("%s writes nothing but text nodes", (path) => {
    const source = code(path);
    expect(source).not.toMatch(/dangerouslySetInnerHTML/);
    expect(source).not.toMatch(/\.innerHTML\s*=/);
    expect(source).not.toMatch(/\.insertAdjacentHTML/);
    expect(source).not.toMatch(/document\.write/);
    expect(source).not.toMatch(/\beval\(|new Function\(/);
    expect(source).not.toMatch(/RichText|LinkedText/);
  });
});

describe("nothing about a letter leaves the screen by a side door", () => {
  it.each(QUERY_FILES)(
    "%s has no console output, storage, beacon or title write",
    (path) => {
      const source = code(path);
      expect(source).not.toMatch(/\bconsole\.(log|info|warn|error|debug)/);
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
      expect(source).not.toMatch(
        /sendBeacon|reportError|trackEvent|analytics/i,
      );
      expect(source).not.toMatch(/document\.title\s*=/);
      expect(source).not.toMatch(
        /window\.open\(|location\.(href|assign|replace)\s*=/,
      );
    },
  );

  it.each(QUERY_FILES)("%s puts no letter text into an address", (path) => {
    const source = code(path);
    /* An address is built from an id with `queryHref` / `leadHref`, or is a literal. */
    const links = [...source.matchAll(/href=\{(`[^`]*`|[^}]*)\}/g)].map(
      (match) => match[1] ?? "",
    );
    for (const expression of links) {
      expect(expression).toMatch(
        /^`\/people\/(queries\/)?\$\{[A-Za-z.]*\.id\}`$|^`\/people\/queries\?subject=\$\{employeeId\}`$|^(queryHref|leadHref)\(|^"\//,
      );
    }
  });

  it("builds no query string or path from a subject line, a file name or a citation title", () => {
    for (const path of QUERY_FILES) {
      const source = code(path);
      expect(source).not.toMatch(
        /\?[a-z]+=\$\{[^}]*(subjectLine|filename|title|whatHappened|question)/,
      );
      expect(source).not.toMatch(
        /encodeURIComponent\([^)]*(subjectLine|filename|title|whatHappened)/,
      );
    }
  });
});

describe("a link out", () => {
  it.each(QUERY_FILES)(
    "%s opens no new tab without noreferrer and noopener",
    (path) => {
      const source = code(path);
      for (const tag of source.match(
        /<(a|Link|TextLink)\b[^>]*target="_blank"[^>]*>/g,
      ) ?? []) {
        expect(tag).toMatch(
          /rel="noreferrer noopener"|rel="noopener noreferrer"/,
        );
      }
    },
  );

  it("none of the new components takes an address from the API: a link is an id", () => {
    const linked = code("src/app/(app)/people/queries/[id]/linked-records.tsx");
    expect(linked).toMatch(/leadHref\(lead, detail\.subject\.id\)/);
    expect(linked).not.toMatch(/lead\.(href|url|link)/);
    const field = code("src/components/queries/linked-query.tsx");
    expect(field).toMatch(/queryHref\(queryId\)/);
  });
});

describe("a file is a click and never a render", () => {
  it("the stage 3 and 4 files fetch no file at all", () => {
    for (const path of QUERY_FILES.filter(
      (file) => !file.endsWith("query-files.tsx"),
    )) {
      const source = code(path);
      if (
        path.endsWith("src/lib/api/queries.ts") ||
        path.endsWith("src/lib/store/queries.ts")
      )
        continue;
      expect(source, path).not.toMatch(
        /fileContent|fetchBinary|createObjectURL/,
      );
    }
  });

  it("the one place a file is fetched stays inside a click handler", () => {
    const files = code("src/app/(app)/people/queries/[id]/query-files.tsx");
    const uses = [...files.matchAll(/fileContent\(/g)];
    expect(uses.length).toBeGreaterThan(0);
    /* It is called from `open`, which is only ever an onClick. */
    expect(files).toMatch(/async function open\(/);
    expect(files).toMatch(/onClick=\{\(\) => void open\(/);
    expect(files).not.toMatch(/useEffect[^]*fileContent/);
  });
});

describe("wire data is parsed, not cast", () => {
  it.each(WIRE_FILES)("%s has no `any` and no cast on a wire value", (path) => {
    const source = code(path);
    expect(source).not.toMatch(/:\s*any\b|<any>|\bas any\b/);
    /* `as const` and `satisfies` are fine; `as <Type>` on a value is not. */
    const casts = [...source.matchAll(/\bas\s+(?!const\b)[A-Za-z_{[]/g)];
    expect(casts.map((match) => match[0])).toEqual([]);
  });

  it("the stage 4 additions to the detail reader add no cast", () => {
    const source = code("src/lib/api/queries.ts");
    const after = source.slice(
      source.indexOf('citations: list(r["citations"])'),
    );
    const block = after.slice(0, after.indexOf('can: toCan(r["can"]),') + 30);
    expect(block).not.toMatch(/\bas\s+[A-Za-z_{[]/);
  });
});

describe("no secret in a fixture", () => {
  const TESTS = readdirSync(join(ROOT, "tests")).filter(
    (name) =>
      /^quer(y|ies)-/.test(name) &&
      /\.(ts|tsx)$/.test(name) &&
      name !== "query-ties-security.test.tsx",
  );

  it.each(TESTS)("%s carries no token, key or password", (name) => {
    const source = read(join("tests", name));
    expect(source).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(source).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
    expect(source).not.toMatch(/sk-[A-Za-z0-9]{12,}|AKIA[A-Z0-9]{12,}/);
    expect(source).not.toMatch(/password\s*[:=]\s*["'][^"']+["']/i);
    expect(source).not.toMatch(/api[_-]?key\s*[:=]\s*["'][^"']+["']/i);
  });
});

describe("no dependency was added for this", () => {
  it("package.json names nothing the queries screens need that it did not before", () => {
    const manifest = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    /* The screens use the repo's own components only: nothing for markdown, sanitising or charts. */
    for (const name of [
      "dompurify",
      "marked",
      "react-markdown",
      "sanitize-html",
      "recharts",
    ]) {
      expect(Object.keys(manifest.dependencies ?? {})).not.toContain(name);
    }
  });
});

/* ---------------------------------------------------------------- render checks */

const HOSTILE =
  '<img src=x onerror="alert(1)"><script>alert(2)</script> https://evil.example/x www.evil.example javascript:alert(3)';

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: true,
    employeeId: "e-1",
    user: { id: "u-me" },
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/company", () => ({
  useLiveCompanyProfile: () => ({
    profile: {
      legalName: HOSTILE,
      rcNumber: HOSTILE,
      addressLine: HOSTILE,
      city: HOSTILE,
      logoUrl: null,
    },
    reload: () => undefined,
  }),
}));
vi.mock("@/lib/store/conduct", () => ({
  dayLabel: (day: string | null) => (day ? `D(${day})` : "-"),
  LEVEL_LABEL: {},
}));

const { LetterDocument } =
  await import("@/app/(app)/people/queries/[id]/letter-document");
const { LetterView } =
  await import("@/app/(app)/people/queries/[id]/letter-view");

const hostileDetail = () =>
  detail({
    can: can(),
    subjectLine: HOSTILE,
    whatHappened: HOSTILE,
    rulesRelied: HOSTILE,
    question: HOSTILE,
    subject: { id: "e-1", name: HOSTILE, employeeNo: HOSTILE },
    issuedBy: HOSTILE,
    served: {
      ...detail().served,
      how: "IN_PERSON",
      handedByName: HOSTILE,
      witnessName: HOSTILE,
      note: HOSTILE,
    },
    citations: [
      {
        id: "c-1",
        kind: "POLICY",
        title: HOSTILE,
        takenAt: null,
        frozen: true,
        asItStood: {
          kind: "POLICY",
          title: HOSTILE,
          category: HOSTILE,
          version: 1,
          publishedAt: null,
          requiresAcknowledgement: null,
          withdrawn: null,
          body: HOSTILE,
          bodyTruncated: null,
          personAcknowledged: null,
          acknowledgedAt: null,
          publishedAfterIncident: null,
        },
      },
    ],
  });

describe("hostile text comes out as text, on screen and on paper", () => {
  const assertText = (container: HTMLElement) => {
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(
      container.querySelector("[onerror], [onclick], [onload]"),
    ).toBeNull();
    expect(
      container.querySelector(
        'a[href*="evil.example"], a[href^="javascript:"]',
      ),
    ).toBeNull();
    expect(container.textContent).toContain("<script>alert(2)</script>");
  };

  it("the printed letter escapes the letter, the people and the references the same way", () => {
    const { container } = render(<LetterDocument detail={hostileDetail()} />);
    assertText(container);
    /* The company's own header is typed text too. */
    expect(container.querySelector("header")?.textContent).toContain("<img");
  });

  it("the letter on screen shows every typed field as text and makes no link from any", () => {
    const { container } = render(
      <LetterView detail={hostileDetail()} refresh={async () => undefined} />,
    );
    assertText(container);
  });
});
