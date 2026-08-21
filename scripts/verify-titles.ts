import fs from "node:fs";
import path from "node:path";

/**
 * Page titles must not repeat the brand.
 *
 * `src/app/layout.tsx` sets `title.template = "%s · ApproveHR"`, so Next appends
 * the brand to whatever a page exports. A page that also writes "· ApproveHR"
 * into its own title renders "Payments · ApproveHR · ApproveHR" in the tab.
 *
 * Nine pages had it, written by different people at different times, and none
 * of them were wrong to expect the suffix — they just could not see that
 * something else already added it. `tsc` cannot catch this and neither can lint;
 * it is only visible in a browser tab, which is exactly the class of bug this
 * repo keeps finding late. So it is a check.
 */

const APP = path.join(process.cwd(), "src", "app");
const BRAND = "ApproveHR";

function pages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return pages(full);
    return entry.name === "page.tsx" || entry.name === "layout.tsx" ? [full] : [];
  });
}

const ROOT_LAYOUT = path.join(APP, "layout.tsx");
const rootSource = fs.readFileSync(ROOT_LAYOUT, "utf8");
const template = /template:\s*"([^"]+)"/.exec(rootSource)?.[1];

if (!template) {
  console.error(
    "Could not find a title template in src/app/layout.tsx. If the template " +
      "was removed on purpose, this check should be removed with it — pages " +
      "would then need to carry the brand themselves.",
  );
  process.exit(1);
}

const offenders: { file: string; title: string }[] = [];
let checked = 0;

for (const file of pages(APP)) {
  if (file === ROOT_LAYOUT) continue;
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/title:\s*"([^"]+)"/g)) {
    const title = match[1] ?? "";
    checked += 1;
    if (title.includes(BRAND)) {
      offenders.push({ file: path.relative(process.cwd(), file), title });
    }
  }
}

if (offenders.length > 0) {
  console.error(
    `\nTitle check failed. The root layout already applies "${template}", so ` +
      `these render the brand twice:\n`,
  );
  for (const o of offenders) {
    const rendered = template.replace("%s", o.title);
    console.error(`  ${o.file}`);
    console.error(`    title:    "${o.title}"`);
    console.error(`    renders:  "${rendered}"\n`);
  }
  console.error("Drop the brand from the page title and let the template add it.");
  process.exit(1);
}

console.log(
  `Title check passed. ${checked} page titles, none repeating the brand ` +
    `that "${template}" already appends.`,
);
