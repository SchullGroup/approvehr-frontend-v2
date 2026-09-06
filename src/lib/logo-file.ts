/**
 * Turning a file somebody chose into a logo this product can store.
 *
 * Three jobs, in this order: decide whether the format is one we accept, make
 * an SVG safe to keep, and bring anything too large down to size rather than
 * refusing it.
 *
 * ## SVG is accepted now, and the reason it was refused is still true
 *
 * `logo-card.tsx` used to refuse SVG outright, with a comment saying an SVG is
 * a document that can carry script and this value goes on a payslip. Both
 * halves of that are correct. What makes it safe to accept anyway is *where*
 * the value is rendered, which is exactly two places and both are `<img
 * src={…}>` — the settings preview and the payslip masthead.
 *
 * **An `<img>` is a script-disabled context.** The SVG specification requires
 * it and every browser enforces it: script does not run, external resources
 * are not fetched, and nothing in the document can navigate. So the markup
 * that worried the old comment cannot execute on the path this value actually
 * takes.
 *
 * That is an argument about today's callers, not about the value, so it is not
 * enough on its own. `sanitiseSvg` strips the dangerous constructs anyway,
 * before the file is ever encoded, so the stored value stays safe if somebody
 * later renders it inline, serves it as a file, or puts it through a PDF
 * renderer that is not a browser. And the API refuses the same constructs
 * independently — see `company/schemas.ts`. A client-side sanitiser is a
 * convenience; it is not a boundary, because nothing stops somebody sending
 * the PATCH by hand.
 *
 * **If you add a third renderer for `logoUrl`, keep it an `<img>`.** Inline
 * `<svg>`, `<object>` and `<embed>` all re-enable script.
 *
 * ## Too large is resized, not refused
 *
 * A logo arrives from a designer at whatever size the designer exported. That
 * is not a mistake somebody made, and answering it with "export it smaller"
 * sends a person who wanted a logo on their payslip to go and find image
 * software. So a raster over budget is redrawn smaller and re-encoded until it
 * fits, and what happened is stated rather than done quietly.
 *
 * **Resizing does not shrink an SVG**, which is the asymmetry worth knowing
 * about: its size is markup, not pixels, so scaling the canvas changes nothing
 * at all. An oversized SVG is minified instead — editor metadata and comments
 * are most of the weight in a typical Illustrator or Inkscape export — and one
 * that is *still* too big is almost always carrying an embedded photograph or
 * a traced bitmap. That one is rasterised, which is the only thing that
 * actually makes it smaller.
 */

/**
 * The budget is on the **data URI**, not on the file, because that is what the
 * API measures and what the JSON body carries. Base64 inflates by a third, so
 * this is roughly a 48KB file — which is the number the screen quotes, since a
 * person choosing a file can see its size and cannot see its encoding.
 */
export const LOGO_DATA_URI_BUDGET = 64 * 1024;

/**
 * The payslip masthead renders at `max-h-12 max-w-[12rem]` — 48 by 192 CSS
 * pixels. 512 on the long edge is over 2.5× that for a retina screen, and it
 * is the size a too-large logo is brought down to before quality is touched.
 */
const MAX_EDGE = 512;

export const ACCEPTED_LOGO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
] as const;

/** What a person is told the picker will take. */
export const ACCEPTED_LOGO_WORDS = "PNG, JPEG, GIF, WebP or SVG";

export type PreparedLogo = {
  dataUri: string;
  /**
   * What was done to the file, when anything was. Null when it was stored as
   * chosen — there is nothing to report about a file that fit.
   */
  note: string | null;
};

export class LogoError extends Error {}

/** Elements that cannot appear in a stored logo, whatever renders it. */
const BANNED_ELEMENTS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
  "set",
  "animate",
  "handler",
]);

/**
 * A reference is kept only when it points inside the document or carries its
 * own bytes. Anything else is a fetch, and a logo that fetches is a logo that
 * reports who opened a payslip and when.
 */
function referenceIsSafe(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("#") || trimmed.startsWith("data:image/");
}

/**
 * Strip everything from an SVG that could do something.
 *
 * The parse-and-reserialise round trip is load-bearing on its own, separately
 * from the walk below it: it drops the DOCTYPE and any internal subset with
 * it, which is what closes entity expansion — a `<!ENTITY>` chain is how a
 * two-kilobyte file becomes a gigabyte in the reader.
 */
export function sanitiseSvg(source: string): string {
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");

  if (parsed.querySelector("parsererror") || !parsed.documentElement) {
    throw new LogoError(
      "That SVG could not be read. Open it in the program that made it and export it again.",
    );
  }

  const root = parsed.documentElement;
  if (root.nodeName.toLowerCase() !== "svg") {
    throw new LogoError("That file is not an SVG, whatever its name says.");
  }

  const drop: Node[] = [];
  const walker = parsed.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
  );

  for (let node = walker.currentNode; node; node = walker.nextNode() as Node) {
    if (node.nodeType === Node.COMMENT_NODE) {
      drop.push(node);
      continue;
    }

    const element = node as Element;
    const name = element.nodeName.toLowerCase().replace(/^.*:/, "");

    if (BANNED_ELEMENTS.has(name)) {
      drop.push(element);
      continue;
    }

    // Editor bookkeeping. Illustrator and Inkscape write RDF blocks that are
    // routinely larger than the artwork, and nothing renders any of it.
    if (name === "metadata") {
      drop.push(element);
      continue;
    }

    // `@import` is the one fetch a stylesheet can still start. Blocked in an
    // `<img>` anyway; removed so that is not the only thing stopping it.
    if (name === "style" && element.textContent) {
      element.textContent = element.textContent.replace(
        /@import[^;]*;?/gi,
        "",
      );
    }

    for (const attribute of [...element.attributes]) {
      const attributeName = attribute.name.toLowerCase();

      // Every event handler, by shape rather than by list — `onload`,
      // `onclick`, `onbegin`, and whatever SMIL adds next.
      if (attributeName.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (
        (attributeName === "href" || attributeName.endsWith(":href")) &&
        !referenceIsSafe(attribute.value)
      ) {
        element.removeAttribute(attribute.name);
        continue;
      }

      // Editor namespaces: `inkscape:`, `sodipodi:`, `illustrator:`. Weight
      // with no meaning outside the program that wrote it.
      if (/^(inkscape|sodipodi|illustrator|graph|i):/.test(attributeName)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  for (const node of drop) node.parentNode?.removeChild(node);

  return new XMLSerializer()
    .serializeToString(root)
    .replace(/>\s+</g, "><")
    .trim();
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new LogoError("That file could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new LogoError("That file could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function svgDataUri(svg: string): string {
  // `unescape(encodeURIComponent(…))` is the standard round trip to Latin-1
  // before `btoa`, which refuses anything above U+00FF. An SVG carrying a
  // company name in any non-ASCII script hits that immediately.
  return `data:image/svg+xml;base64,${btoa(
    String.fromCharCode(...new TextEncoder().encode(svg)),
  )}`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new LogoError("That image could not be opened."));
    image.src = source;
  });
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)}KB`;
}

/**
 * Redraw an image small enough to fit the budget, and say what it became.
 *
 * Dimensions come down first and quality second, deliberately: a logo at half
 * the pixels is still a clean logo, and a logo at 40% JPEG quality is a smear
 * of artefacts around its own lettering. WebP rather than JPEG throughout,
 * because a logo on a payslip masthead usually has a transparent background
 * and JPEG has no alpha channel — flattening it would put a white box on the
 * page for anybody who prints on anything else.
 */
async function fitByRedrawing(
  image: HTMLImageElement,
  naturalBytes: number,
): Promise<PreparedLogo> {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new LogoError(
      "That image has no size we can read, so it cannot be resized. Export it as a PNG and try again.",
    );
  }

  let scale = Math.min(1, MAX_EDGE / Math.max(width, height));

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new LogoError(
        "This browser would not resize the image. Export it smaller and try again.",
      );
    }
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    // PNG first — it is lossless, and flat artwork with few colours is
    // frequently smaller as a PNG than as anything else. WebP is the fallback
    // for a photographic logo, where PNG is the worst of the three.
    for (const candidate of [
      canvas.toDataURL("image/png"),
      canvas.toDataURL("image/webp", 0.92),
      canvas.toDataURL("image/webp", 0.75),
    ]) {
      if (candidate.length <= LOGO_DATA_URI_BUDGET) {
        return {
          dataUri: candidate,
          note:
            `That was ${kb(naturalBytes)}, which is over the limit, so it was ` +
            `resized to ${targetWidth} × ${targetHeight} and saved at ` +
            `${kb(candidate.length)}. Replace it with a smaller file if this ` +
            `is not what you wanted.`,
        };
      }
    }

    scale *= 0.75;
  }

  throw new LogoError(
    "That image could not be brought under the limit even at a much smaller size. Export it as a PNG under 48KB.",
  );
}

/**
 * The one entry point. Everything a screen needs to know is in the return
 * value or the thrown `LogoError`'s message.
 */
export async function prepareLogo(file: File): Promise<PreparedLogo> {
  if (!(ACCEPTED_LOGO_TYPES as readonly string[]).includes(file.type)) {
    throw new LogoError(`Use a ${ACCEPTED_LOGO_WORDS} file.`);
  }

  if (file.type === "image/svg+xml") {
    const svg = sanitiseSvg(await readAsText(file));
    const dataUri = svgDataUri(svg);

    if (dataUri.length <= LOGO_DATA_URI_BUDGET) {
      // Minifying is not worth reporting. Nothing a person can see changed.
      return { dataUri, note: null };
    }

    // Scaling an SVG changes nothing about its size, so there is one thing
    // left to try: draw it and keep the pixels.
    const image = await loadImage(dataUri);
    const drawn = await fitByRedrawing(image, file.size);
    return {
      dataUri: drawn.dataUri,
      note:
        `That SVG is ${kb(file.size)}, which is over the limit, and an SVG ` +
        `cannot be made smaller by resizing it: its size is the drawing ` +
        `instructions, not the pixels. It has been saved as an image instead. ` +
        drawn.note!.slice(drawn.note!.indexOf("resized to")),
    };
  }

  const dataUri = await readAsDataUri(file);
  if (dataUri.length <= LOGO_DATA_URI_BUDGET) return { dataUri, note: null };

  return fitByRedrawing(await loadImage(dataUri), file.size);
}
