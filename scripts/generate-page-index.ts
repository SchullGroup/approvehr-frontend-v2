import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { trackedFiles } from "./docs/source";
import { buildPageIndex, pageIndexModule } from "./docs/page-index";

const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "src/lib/page-index.generated.ts");
const next = pageIndexModule(buildPageIndex(trackedFiles(ROOT, ["src/app"])));

if (process.argv.includes("--check")) {
  const now = readFileSync(OUT, "utf8");
  if (now !== next) {
    console.error(
      "src/lib/page-index.generated.ts is stale: run npm run page-index",
    );
    process.exit(1);
  }
  console.log("Page index is current.");
} else {
  writeFileSync(OUT, next);
  console.log("wrote src/lib/page-index.generated.ts");
}
