import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CareersNotice } from "@/components/marketing/careers-notice";
import { JsonLd } from "@/components/marketing/json-ld";
import { Closed, RoleView } from "@/components/marketing/role-view";
import {
  cleanSource,
  careersPageUrl,
  formFromDetail,
  jobPostingJsonLd,
  readableDate,
} from "@/lib/marketing/careers";
import { getRole } from "@/lib/marketing/careers-read";
import { SITE_URL } from "@/lib/marketing/site";
import { ApplyForm } from "./apply-form";

/**
 * One job advert, and the form to answer it.
 *
 * ## Read once per visit, not twice
 *
 * `generateMetadata` and the page both need the advert. The read is wrapped in
 * React's `cache` so the pair share one request — the public read routes are rate
 * limited to sixty an hour per network, which is generous for a person reading a
 * careers page and stingy if every page view costs two.
 *
 * ## A closed advert stays readable
 *
 * The API serves it deliberately: a link already shared in a WhatsApp group
 * should explain itself rather than 404. So the page renders in full and the form
 * is replaced by the closing date and a way back to what is still open.
 */
const readRole = cache(async (org: string, role: string) => getRole(org, role));

/** Never prerendered: an advert's state is only true at the moment it is read. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; role: string }>;
}): Promise<Metadata> {
  const { org, role } = await params;
  const result = await readRole(org, role);
  if (!result.ok) return { title: "Job" };
  const detail = result.value;
  const title = detail.seo?.title ?? `${detail.title}, ${detail.company}`;
  const url = careersPageUrl(SITE_URL, org, detail.slug);
  return {
    title,
    description: detail.summary,
    alternates: { canonical: url },
    /* A company that asked not to be listed stays readable by anybody with the
       link and out of search results; so does an advert that has closed. */
    ...(detail.seo?.indexable === false || !detail.acceptingApplications
      ? { robots: { index: false, follow: true } }
      : {}),
    openGraph: {
      type: "website",
      title,
      description: detail.summary,
      url,
      siteName: detail.company,
    },
    twitter: { card: "summary", title, description: detail.summary },
  };
}

export default async function RolePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; role: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org, role: roleSlug } = await params;
  /* `?src=` is where the visitor came from. Taken here, on the server, so the
     form is handed a cleaned string and no client code reads the address bar. */
  const query = searchParams ? await searchParams : {};
  const first = (value: string | string[] | undefined) =>
    cleanSource(Array.isArray(value) ? value[0] : value);
  const src = first(query["src"]);
  const utm = {
    ...(first(query["utm_source"])
      ? { source: first(query["utm_source"])! }
      : {}),
    ...(first(query["utm_medium"])
      ? { medium: first(query["utm_medium"])! }
      : {}),
    ...(first(query["utm_campaign"])
      ? { campaign: first(query["utm_campaign"])! }
      : {}),
  };
  const result = await readRole(org, roleSlug);

  /* A draft, a closed-and-unpublished advert and a typo are all the same 404 —
     distinguishing them would confirm that a role exists but has not been
     published, which is information about a company's hiring plans. */
  if (!result.ok && result.reason === "missing") notFound();

  if (!result.ok) {
    return (
      <section className="px-4 pb-28 pt-16 sm:pt-24">
        <div className="container-page max-w-2xl">
          <CareersNotice
            reason={result.reason}
            retryAfterSeconds={result.retryAfterSeconds}
            message={result.message}
            subject="this role"
            backHref={`/careers/${org}`}
            backLabel="See the open roles"
          />
        </div>
      </section>
    );
  }

  const role = result.value;
  const { form, uploadsEnabled } = formFromDetail(role);
  const jsonLd = jobPostingJsonLd(role, {
    siteUrl: SITE_URL,
    org,
    roleSlug: role.slug,
  });

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <RoleView
        role={role}
        aside={
          role.acceptingApplications ? (
            <ApplyForm
              org={org}
              roleSlug={role.slug}
              roleTitle={role.title}
              company={role.company}
              captchaRequired={role.captchaRequired === true}
              uploadsEnabled={uploadsEnabled}
              form={form}
              src={src}
              utm={utm}
            />
          ) : (
            <Closed
              org={org}
              closedOn={role.closesOn ? readableDate(role.closesOn) : null}
            />
          )
        }
      />
    </>
  );
}
