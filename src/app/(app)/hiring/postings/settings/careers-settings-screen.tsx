"use client";

import { useState } from "react";
import { Lock, Save } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SourceBadge } from "@/components/hiring/source-badge";
import type {
  ApiCareersSettings,
  UpdateCareersSettingsBody,
} from "@/lib/api/careers";
import { ApiError } from "@/lib/api/client";
import { accentFor } from "@/lib/marketing/accent";
import { logoSrc } from "@/lib/marketing/careers";
import { usePermissions } from "@/lib/permissions";
import { useCareersSettings } from "@/lib/store/careers-form";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";

/**
 * How the company appears on its careers page, and what applicants are told.
 *
 * ## What lives here, and not on an advert
 *
 * The company's name on the page, its logo, its one-line description, its colour,
 * the privacy notice applicants are asked to accept, and the confirmation email
 * they are sent are properties of the **company**, not of any one job. They are
 * set once and every advert carries them.
 *
 * ## The privacy notice is not legal advice
 *
 * Until the company writes its own, applicants are shown ApproveHR's standard
 * wording, and this screen says in plain words that nobody has reviewed it for this
 * company. The API sends that sentence (`needsReview`); it is shown as written
 * every time the standard text is in use.
 *
 * ## Said, not assumed
 *
 * Whether a confirmation email would go out right now is the API's answer, with
 * its reasons ("add a reply-to address", "email is not set up on this
 * deployment"). The screen lists them rather than showing a switch that looks on
 * and does nothing.
 */

type Draft = {
  displayName: string;
  description: string;
  websiteUrl: string;
  accentColor: string;
  replyToEmail: string;
  privacyNotice: string;
  privacyNoticeUrl: string;
  consentRequired: boolean;
  ackEmailEnabled: boolean;
  searchIndexing: boolean;
};

const fromSettings = (settings: ApiCareersSettings): Draft => ({
  displayName: settings.branding.displayName ?? "",
  description: settings.branding.description ?? "",
  websiteUrl: settings.branding.websiteUrl ?? "",
  accentColor: settings.branding.accentColor ?? "",
  replyToEmail: settings.contact.replyToEmail ?? "",
  privacyNotice: settings.consent.customText ?? "",
  privacyNoticeUrl: settings.consent.url ?? "",
  consentRequired: settings.consent.required,
  ackEmailEnabled: settings.acknowledgement.enabled,
  searchIndexing: settings.search.indexable,
});

/** What changed, as the API takes it: `null` clears a text field. */
export function changesFrom(
  base: Draft,
  draft: Draft,
): UpdateCareersSettingsBody {
  const body: UpdateCareersSettingsBody = {};
  const text = (
    key:
      | "displayName"
      | "description"
      | "websiteUrl"
      | "accentColor"
      | "replyToEmail"
      | "privacyNotice"
      | "privacyNoticeUrl",
  ) => {
    if (draft[key].trim() === base[key].trim()) return;
    body[key] = draft[key].trim() === "" ? null : draft[key].trim();
  };
  text("displayName");
  text("description");
  text("websiteUrl");
  text("accentColor");
  text("replyToEmail");
  text("privacyNotice");
  text("privacyNoticeUrl");
  if (draft.consentRequired !== base.consentRequired)
    body.consentRequired = draft.consentRequired;
  if (draft.ackEmailEnabled !== base.ackEmailEnabled)
    body.ackEmailEnabled = draft.ackEmailEnabled;
  if (draft.searchIndexing !== base.searchIndexing)
    body.searchIndexing = draft.searchIndexing;
  return body;
}

/** Checked here so the button is not offered for a body that will be refused. */
export function problemsWith(
  draft: Draft,
): Partial<Record<keyof Draft, string>> {
  const found: Partial<Record<keyof Draft, string>> = {};
  if (draft.displayName.trim().length > 80)
    found.displayName = "Keep the name under 80 characters.";
  if (draft.description.trim().length > 600)
    found.description = "Keep it under 600 characters, a couple of sentences.";
  if (
    draft.accentColor.trim() !== "" &&
    !/^#[0-9a-fA-F]{6}$/.test(draft.accentColor.trim())
  )
    found.accentColor = "Use a six-digit colour like #2b3990.";
  if (
    draft.replyToEmail.trim() !== "" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(draft.replyToEmail.trim())
  )
    found.replyToEmail = "Enter a valid email address.";
  const notice = draft.privacyNotice.trim();
  if (notice !== "" && notice.length < 40)
    found.privacyNotice =
      "A privacy notice is a few sentences. Write more, or clear it to use the standard wording.";
  if (notice.length > 6000)
    found.privacyNotice =
      "Keep the notice under 6,000 characters and link to your full policy instead.";
  return found;
}

const CRUMBS = [
  { href: "/hiring", label: "Hiring" },
  { href: "/hiring/postings", label: "Job adverts" },
  { href: "/hiring/postings/settings", label: "Careers page settings" },
];

export function CareersSettingsScreen() {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader title="Careers page settings" breadcrumb={CRUMBS} />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading the settings</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader title="Careers page settings" breadcrumb={CRUMBS} />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot change these"
              description="They decide what strangers are told and asked to accept in your company's name, so they are kept to whoever hires. Ask whoever manages access to add hiring to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Settings />;
}

function Settings() {
  const store = useCareersSettings();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<Partial<Record<keyof Draft, string>>>(
    {},
  );

  const settings = store.settings;
  const dirty =
    settings !== null &&
    draft !== null &&
    Object.keys(changesFrom(fromSettings(settings), draft)).length > 0;
  useUnsavedGuard(dirty);

  if (store.error && !settings) {
    return (
      <>
        <PageHeader title="Careers page settings" breadcrumb={CRUMBS} />
        <PageBody>
          <LoadFailure
            subject="these settings"
            error={store.error}
            onRetry={store.reload}
          />
        </PageBody>
      </>
    );
  }

  if (!settings) {
    return (
      <>
        <PageHeader title="Careers page settings" breadcrumb={CRUMBS} />
        <PageBody>
          <Skeleton className="h-64 w-full" />
          <span className="sr-only-focusable">Loading the settings</span>
        </PageBody>
      </>
    );
  }

  const base = fromSettings(settings);
  const current = draft ?? base;
  const changes = changesFrom(base, current);

  const found = { ...problemsWith(current), ...refused };
  const problem = (key: keyof Draft) =>
    showProblems ? found[key] : refused[key];

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft({ ...current, [key]: value });
    setRefused((existing) => {
      const { [key]: _gone, ...rest } = existing;
      void _gone;
      return rest;
    });
  };

  async function save() {
    if (Object.keys(problemsWith(current)).length > 0) {
      setShowProblems(true);
      return;
    }
    setSaving(true);
    try {
      await store.save(changes);
      setDraft(null);
      setShowProblems(false);
      setRefused({});
      toast.push({ title: "Settings saved", tone: "success" });
    } catch (error) {
      if (error instanceof ApiError) {
        const fields: Partial<Record<keyof Draft, string>> = {};
        for (const detail of error.fieldErrors) {
          if (detail.field in current)
            fields[detail.field as keyof Draft] = detail.message;
        }
        setRefused(fields);
        setShowProblems(true);
        toast.push({
          title: "Not saved",
          tone: "danger",
          detail: error.message,
        });
      } else {
        toast.push({
          title: "Not saved",
          tone: "danger",
          detail: "Something went wrong. Try again.",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  const accent = accentFor(current.accentColor);
  const logo = logoSrc(settings.branding);
  const blockers = settings.acknowledgement.blockedBy;

  return (
    <>
      <PageHeader
        title="Careers page settings"
        breadcrumb={CRUMBS}
        meta={<SourceBadge live={store.editable} />}
        action={
          <>
            {dirty && (
              <Badge tone="warning" size="sm" dot>
                Unsaved changes
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => {
                setDraft(null);
                setShowProblems(false);
                setRefused({});
              }}
            >
              Discard
            </Button>
            <Button
              variant="accent"
              size="sm"
              loading={saving}
              disabled={!dirty || !store.editable}
              onClick={() => void save()}
            >
              {!saving && <Save aria-hidden="true" className="size-3.5" />}
              Save settings
            </Button>
          </>
        }
      />

      <PageBody>
        {/* A form this narrow reads best as a column, and it sits at the left
            of the page column rather than in its middle so it lines up with the
            title above it on a wide screen. */}
        <div className="flex max-w-3xl flex-col gap-6">
          {DEMO_ENABLED && !store.editable && (
            <Callout tone="warning" title="Read-only in demo mode">
              These stand for what your company has already told applicants. A
              demo has no company to have told them.
            </Callout>
          )}

          <Card>
            <CardHeader
              title="How you appear"
              description="Shown at the top of every advert."
            />
            <CardBody className="flex flex-col gap-5">
              <Field
                label="Name on the page"
                optional
                help={`Leave blank to use ${settings.branding.companyName}.`}
                error={problem("displayName")}
              >
                <Input
                  value={current.displayName}
                  disabled={!store.editable}
                  maxLength={90}
                  placeholder={settings.branding.companyName}
                  onChange={(event) => set("displayName", event.target.value)}
                />
              </Field>

              <Field
                label="About the company"
                optional
                help="A line or two. Shown under the name."
                error={problem("description")}
              >
                <Textarea
                  rows={3}
                  value={current.description}
                  disabled={!store.editable}
                  onChange={(event) => set("description", event.target.value)}
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Website" optional error={problem("websiteUrl")}>
                  <Input
                    value={current.websiteUrl}
                    disabled={!store.editable}
                    placeholder="https://example.com"
                    onChange={(event) => set("websiteUrl", event.target.value)}
                  />
                </Field>
                <Field
                  label="Accent colour"
                  optional
                  help="A six-digit colour like #2b3990."
                  error={problem("accentColor")}
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={current.accentColor}
                      disabled={!store.editable}
                      placeholder="#2b3990"
                      onChange={(event) =>
                        set("accentColor", event.target.value)
                      }
                    />
                    {accent && (
                      <span
                        data-testid="accent-swatch"
                        aria-hidden="true"
                        className="size-9 shrink-0 rounded-md border border-line"
                        style={{ backgroundColor: accent.decorative }}
                      />
                    )}
                  </div>
                </Field>
              </div>
              {accent && accent.button !== accent.decorative && (
                <p
                  data-testid="accent-note"
                  className="text-body-sm text-muted"
                >
                  White text on that colour would be hard to read, so the Send
                  button uses a slightly deeper shade of it ({accent.button}).
                  The colour itself is used as chosen.
                </p>
              )}

              <div className="flex items-center gap-4 rounded-md bg-canvas p-3.5">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the company's own logo, served by the API
                  <img
                    src={logo}
                    alt=""
                    className="size-12 rounded-md border border-line bg-white object-contain p-1"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex size-12 items-center justify-center rounded-md border border-dashed border-line text-meta text-faint"
                  >
                    None
                  </span>
                )}
                <p className="text-body-sm text-body">
                  {logo
                    ? "The logo is the one on your company profile."
                    : "No logo yet. Add one to your company profile and it appears here and on your adverts."}
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Privacy notice"
              description="What applicants are asked to accept before they send."
            />
            <CardBody className="flex flex-col gap-5">
              <Switch
                label="Ask applicants to accept the notice"
                description="A box they have to tick. What they accepted is kept with the application, word for word."
                checked={current.consentRequired}
                disabled={!store.editable}
                onChange={(event) =>
                  set("consentRequired", event.target.checked)
                }
              />

              {settings.consent.needsReview && settings.consent.reviewNote && (
                <Callout tone="warning" title="Not reviewed for your company">
                  {settings.consent.reviewNote}
                </Callout>
              )}

              <Field
                label="Your own notice"
                optional
                help="Plain text. Leave blank to use the standard wording below."
                error={problem("privacyNotice")}
              >
                <Textarea
                  rows={7}
                  value={current.privacyNotice}
                  disabled={!store.editable}
                  onChange={(event) => set("privacyNotice", event.target.value)}
                />
              </Field>

              <Field
                label="Link to your full policy"
                optional
                error={problem("privacyNoticeUrl")}
              >
                <Input
                  value={current.privacyNoticeUrl}
                  disabled={!store.editable}
                  placeholder="https://example.com/privacy"
                  onChange={(event) =>
                    set("privacyNoticeUrl", event.target.value)
                  }
                />
              </Field>

              <div className="rounded-md border border-line p-3.5">
                <p className="text-meta font-semibold text-muted">
                  {settings.consent.isDefault
                    ? "What applicants are shown now: the standard wording"
                    : "What applicants are shown now: your notice"}
                </p>
                <p
                  data-testid="notice-in-use"
                  className="mt-1.5 whitespace-pre-line text-body-sm leading-relaxed text-body"
                >
                  {current.privacyNotice.trim() !== "" &&
                  current.privacyNotice.trim() !==
                    (settings.consent.customText ?? "")
                    ? current.privacyNotice.trim()
                    : settings.consent.text}
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Confirmation email"
              description="Sent to the applicant with their reference, from your company's name."
            />
            <CardBody className="flex flex-col gap-5">
              <Field
                label="Reply-to address"
                optional
                help="Where an applicant's reply goes. No confirmation is sent without one."
                error={problem("replyToEmail")}
              >
                <Input
                  type="email"
                  value={current.replyToEmail}
                  disabled={!store.editable}
                  placeholder="careers@example.com"
                  onChange={(event) => set("replyToEmail", event.target.value)}
                />
              </Field>

              <Switch
                label="Send a confirmation email"
                checked={current.ackEmailEnabled}
                disabled={!store.editable}
                onChange={(event) =>
                  set("ackEmailEnabled", event.target.checked)
                }
              />

              {blockers.length > 0 ? (
                <Callout
                  tone="warning"
                  title="No confirmation will be sent right now"
                >
                  <ul className="list-disc pl-5">
                    {blockers.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </Callout>
              ) : (
                <p className="text-body-sm text-muted">
                  A confirmation email is queued for each new application.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Search engines" />
            <CardBody>
              <Switch
                label="List your open adverts in search results"
                description="Off keeps them readable by anyone with the link and out of search results."
                checked={current.searchIndexing}
                disabled={!store.editable}
                onChange={(event) =>
                  set("searchIndexing", event.target.checked)
                }
              />
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
