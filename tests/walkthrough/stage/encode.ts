import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  cardStartMs,
  onVideoClock,
  parseBrightness,
  toFfMetadata,
  toVtt,
  type Chapter,
} from "../harness/timeline";

/**
 * Turns a run's `walkthrough.webm` into `walkthrough.mp4`, with the run's
 * chapters in it.
 *
 * ```
 * WALK_FFMPEG=/path/to/ffmpeg npx tsx tests/walkthrough/stage/encode.ts <run folder>
 * ```
 *
 * ffmpeg is **not a dependency of this project** and is not found on the
 * machine by searching: it is named, by the person running this, in
 * `WALK_FFMPEG`. Without it nothing is encoded and this says so, because the
 * alternative, a `.mp4` that is the webm with a new name, would be a file that
 * does not play in half the places somebody sends it. The webm is a complete
 * recording on its own; the mp4 is the one for a phone and for chat.
 *
 * The chapters come from `chapters.json`, which comes from `timeline.json`, which
 * is what the captions in the PDF come from too, so the player's chapter list and
 * the PDF's contents cannot disagree. They are put onto the video's clock by
 * measuring where the title card appears in the file (see `cardStartMs`), because
 * the recorder starts a couple of seconds after the page does.
 */

const folder = process.argv[2];
if (!folder) {
  process.stderr.write("Usage: encode.ts <run folder>\n");
  process.exit(1);
}
const ffmpeg = process.env["WALK_FFMPEG"];
if (!ffmpeg || !existsSync(ffmpeg)) {
  process.stdout.write(
    "WALK_FFMPEG is not set to an ffmpeg binary, so there is no walkthrough.mp4. walkthrough.webm is the recording.\n",
  );
  process.exit(0);
}

const input = path.join(folder, "walkthrough.webm");
const output = path.join(folder, "walkthrough.mp4");

/* How far into the video the run's clock started: the moment the white blank
   page turned into the dark title card. */
const luma = execFileSync(
  ffmpeg,
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    "-t",
    "12",
    "-vf",
    "fps=20,scale=64:36,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
    "-f",
    "null",
    "-",
  ],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
);
const card = cardStartMs(parseBrightness(luma));
if (card === null) {
  throw new Error(
    "The recording has no white frame before the title card, so it began after the run's clock did and its chapters cannot be lined up. Run it again.",
  );
}

/* The length of the finished file, which also bounds the chapters. */
let report = "";
try {
  execFileSync(ffmpeg, ["-hide_banner", "-i", input], {
    stdio: ["ignore", "ignore", "pipe"],
  });
} catch (error) {
  report = String((error as { stderr?: Buffer }).stderr ?? "");
}
const lengthText = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(report);
const durationMs = lengthText
  ? Math.round(
      (Number(lengthText[1]) * 3600 +
        Number(lengthText[2]) * 60 +
        Number(lengthText[3])) *
        1000,
    )
  : Number.MAX_SAFE_INTEGER;

const chapters = onVideoClock(
  JSON.parse(
    readFileSync(path.join(folder, "chapters.json"), "utf8"),
  ) as Chapter[],
  card,
  durationMs,
);
const metadata = path.join(folder, "chapters.ffmetadata");
writeFileSync(metadata, toFfMetadata(chapters));
writeFileSync(path.join(folder, "chapters.vtt"), toVtt(chapters));
writeFileSync(
  path.join(folder, "video.json"),
  `${JSON.stringify({ runClockStartsAtVideoMs: card, durationMs }, null, 2)}\n`,
);

const args = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-i",
  input,
  "-i",
  metadata,
  "-map",
  "0:v",
  "-map_metadata",
  "1",
  "-map_chapters",
  "1",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-preset",
  "medium",
  "-crf",
  "23",
  "-movflags",
  "+faststart",
  output,
];
process.stdout.write(`$ ${ffmpeg} ${args.join(" ")}\n`);
execFileSync(ffmpeg, args, { stdio: ["ignore", "ignore", "inherit"] });
process.stdout.write(
  `wrote ${output} (the run's clock started ${String(card)} ms into the video)\n`,
);
