"use client";

import { useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useCompanyLogo } from "@/lib/store/company";

/**
 * The company's logo, which goes on the payslip masthead.
 *
 * ## The file never leaves the browser as a file
 *
 * There is no upload endpoint in this product and no object storage behind
 * one — see the seam note in `careers/storage.ts`. Rather than declare a
 * capability nobody has wired, this reads the file to an image `data:` URI
 * and sends it as one, and the API stores it on `Organization.logoUrl`.
 *
 * That is the right trade for *this* file and the wrong one for every other
 * file in the product: there is one logo per company, it is measured in
 * kilobytes, and every screen that renders it needs it inline anyway. A
 * receipt or a CV is large, numerous, and arrives from outside — those still
 * need real storage, and this is not a precedent for them.
 *
 * ## The limits are checked here and again on the server
 *
 * Not instead of. The server's refusals are the real ones and are rendered
 * verbatim when they arrive; these exist so the common mistakes — a
 * photograph, a PDF, an SVG — are answered before a 64KB round trip rather
 * than after one.
 *
 * SVG is refused deliberately and is the one people ask about: an SVG is a
 * document that can carry script, and this value is rendered inside a
 * payslip. PNG, JPEG, GIF and WebP cannot execute anything.
 */

const ACCEPTED = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/** Matches the API's own cap. The data URI is what is measured, not the file. */
const MAX_DATA_URI_BYTES = 64 * 1024;

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function CompanyLogoCard() {
  const logo = useCompanyLogo();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File) {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError(
        file.type === "image/svg+xml"
          ? "SVG files are not accepted, because an SVG can carry script and this goes on a payslip. Export it as a PNG."
          : "Use a PNG, JPEG, GIF or WebP.",
      );
      return;
    }

    let dataUri: string;
    try {
      dataUri = await readAsDataUri(file);
    } catch {
      setError("That file could not be read. Try another.");
      return;
    }

    if (dataUri.length > MAX_DATA_URI_BYTES) {
      setError(
        "That image is too large. A logo needs well under 48KB — resize it, or export it smaller.",
      );
      return;
    }

    try {
      await logo.save(dataUri);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not save. Try again.",
      );
    }
  }

  async function remove() {
    setError(null);
    try {
      await logo.save(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not save. Try again.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Logo"
        level={3}
        description="Shown at the top of every payslip, beside your company name."
      />
      <CardBody className="flex flex-col gap-4">
        {logo.loading ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </span>
        ) : (
          <>
            {/* The ground is deliberately plain white rather than the card's
                own surface: a payslip is printed on white, and a logo with a
                white matte around it looks fine here and wrong there. This is
                the preview that tells somebody that before they find out. */}
            <div className="flex min-h-[5.5rem] items-center justify-center rounded-md border border-line bg-white p-4">
              {logo.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo.logoUrl}
                  alt="Your company logo"
                  className="max-h-16 max-w-[14rem] object-contain"
                />
              ) : (
                <p className="text-body-sm text-muted">No logo yet</p>
              )}
            </div>

            <input
              ref={input}
              type="file"
              accept={ACCEPTED.join(",")}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                /* Cleared so choosing the same file twice still fires a
                   change — the second attempt after a failed one is exactly
                   the case that would otherwise silently do nothing. */
                event.target.value = "";
                if (file) void choose(file);
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={logo.saving}
                disabled={!logo.available}
                onClick={() => input.current?.click()}
              >
                <ImageUp aria-hidden="true" className="size-3.5" />
                {logo.logoUrl ? "Replace" : "Upload a logo"}
              </Button>
              {logo.logoUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={logo.saving || !logo.available}
                  onClick={() => void remove()}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Remove
                </Button>
              )}
            </div>

            {!logo.available && (
              <p className="text-body-sm text-muted">
                Saving a logo needs the API. One kept in this browser would
                never reach a payslip anybody else opens.
              </p>
            )}

            {error && (
              <p
                role="status"
                className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-ink"
              >
                {error}
              </p>
            )}

            <p className="text-meta leading-relaxed text-muted">
              PNG, JPEG, GIF or WebP, under 48KB. A wide logo reads better than
              a tall one — it sits on a single line above your company name.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
