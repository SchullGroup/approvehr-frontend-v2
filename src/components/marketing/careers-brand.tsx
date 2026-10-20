import { Globe } from "lucide-react";
import { accentFor } from "@/lib/marketing/accent";
import { logoSrc, type PublicBranding } from "@/lib/marketing/careers";

/**
 * Who is hiring, at the top of their careers page.
 *
 * The company's name, its logo if it has one, a line about it and a link to its
 * website. What the company chose, and nothing it did not: no logo is invented
 * from the name, and a company with no settings gets a plain name and nothing
 * else.
 *
 * The accent colour appears as a thin rule and a ring round the logo, exactly as
 * chosen. It is **not** used for text, which would put an arbitrary colour on a
 * light ground at an unknowable contrast — the one place it carries a label, the
 * Send button, goes through `accentFor` (see `lib/marketing/accent.ts`).
 *
 * The logo is a plain `<img>` from the API's own route, with no referrer sent and
 * a fixed box so a missing or slow image cannot move the page.
 */
export function CareersBrand({
  company,
  branding,
}: {
  company: string;
  branding: PublicBranding | undefined;
}) {
  const logo = logoSrc(branding);
  const accent = accentFor(branding?.accentColor);
  const about = branding?.description?.trim() || null;
  const website = branding?.websiteUrl ?? null;

  return (
    <header
      data-testid="careers-brand"
      className="relative mb-10 flex flex-col gap-4 border-b border-sand-line pb-8"
    >
      {accent && (
        <span
          aria-hidden="true"
          data-testid="careers-accent"
          className="absolute -top-px left-0 h-1 w-16 rounded-full"
          style={{ backgroundColor: accent.decorative }}
        />
      )}
      <div className="flex items-center gap-4">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element -- a company's own logo from the API's route; sized by its box, and not worth the image optimiser's origin allow-list
          <img
            src={logo}
            alt={`${company} logo`}
            width={56}
            height={56}
            loading="eager"
            decoding="async"
            referrerPolicy="no-referrer"
            className="size-14 shrink-0 rounded-xl border bg-white object-contain p-1"
            style={{
              borderColor: accent?.decorative ?? "var(--color-sand-line)",
            }}
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-body-md font-semibold text-slate">
            {company}
          </p>
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-body-sm text-slate-muted underline decoration-slate-muted/40 underline-offset-2 hover:text-slate"
            >
              <Globe aria-hidden="true" className="size-3.5" />
              {website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
      </div>
      {about && (
        <p className="max-w-2xl text-body-sm leading-relaxed text-slate-soft">
          {about}
        </p>
      )}
    </header>
  );
}
