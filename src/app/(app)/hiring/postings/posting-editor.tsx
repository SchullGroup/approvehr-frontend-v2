"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
} from "@/components/ui";
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABEL,
  careersPath,
  kobo,
  naira,
  type ApiPosting,
  type CreatePostingBody,
  type EmploymentType,
  type UpdatePostingBody,
} from "@/lib/api/careers";

/**
 * Write a job advert.
 *
 * One dialog for both new and existing adverts, because they are the same form
 * with one field that stops being editable.
 *
 * ## The link
 *
 * A draft's link can still be changed. A published one cannot: the API refuses
 * it by name, because a link to a job advert gets shared once in a WhatsApp
 * group and then lives there, and changing it turns every copy into a dead page.
 * So after publishing, the field is replaced by the link itself — there is
 * nothing to try and nothing to be refused for.
 *
 * ## Why the salary band is two fields and a switch
 *
 * Plenty of Nigerian job adverts do not quote pay. Withholding the band is a
 * decision the company makes, not a gap in the record, so the figures are kept
 * even when the switch is off and the public page simply does not receive them.
 *
 * ## The approved role
 *
 * Screening an applicant in needs an approved role to move them onto — the API
 * creates the candidate and the pipeline record against it. **This API has no
 * requisitions endpoint**, so there is no list to pick from and the field takes
 * the id. Without it the advert still publishes and still collects applications;
 * only screening in is blocked, and the queue says so at the point it matters.
 */

type Draft = {
  title: string;
  summary: string;
  description: string;
  slug: string;
  location: string;
  employmentType: EmploymentType;
  showSalary: boolean;
  salaryMin: string;
  salaryMax: string;
  closesOn: string;
  requisitionId: string;
};

const blank = (): Draft => ({
  title: "",
  summary: "",
  description: "",
  slug: "",
  location: "",
  employmentType: "FULL_TIME",
  showSalary: false,
  salaryMin: "",
  salaryMax: "",
  closesOn: "",
  requisitionId: "",
});

const fromPosting = (posting: ApiPosting): Draft => ({
  title: posting.title,
  summary: posting.summary,
  description: posting.description,
  slug: posting.slug,
  location: posting.location ?? "",
  employmentType: posting.employmentType,
  showSalary: posting.showSalary,
  salaryMin:
    posting.salaryMinKobo === null ? "" : String(naira(posting.salaryMinKobo)),
  salaryMax:
    posting.salaryMaxKobo === null ? "" : String(naira(posting.salaryMaxKobo)),
  closesOn: posting.closesOn ?? "",
  requisitionId: posting.requisitionId ?? "",
});

/** Naira typed into a box. Blank and nonsense both mean "not set". */
function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (cleaned === "") return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

type Problems = Partial<Record<keyof Draft, string>>;

/**
 * The same limits the API enforces, checked here so the button is not offered
 * for a body that will come back refused.
 */
function check(draft: Draft): Problems {
  const problems: Problems = {};
  const title = draft.title.trim();
  const summary = draft.summary.trim();
  const description = draft.description.trim();

  if (title.length < 3) problems.title = "Give the role a title people search for.";
  else if (title.length > 120) problems.title = "Too long for a job board listing.";

  if (summary.length < 20) problems.summary = "Write a line or two saying what the job is.";
  else if (summary.length > 400) problems.summary = "Keep it to a couple of lines.";

  if (description.length < 50)
    problems.description =
      "Say what the work involves, who they report to, and what you need.";
  else if (description.length > 20_000)
    problems.description = "Longer than anybody will read. Trim it.";

  if (draft.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug))
    problems.slug = "Lowercase letters, numbers and hyphens only.";

  const min = parseAmount(draft.salaryMin);
  const max = parseAmount(draft.salaryMax);
  if (min !== null && max !== null && min > max)
    problems.salaryMax = "The top of the range has to be at least the bottom.";

  return problems;
}

export function PostingEditor({
  posting,
  onClose,
  onCreate,
  onUpdate,
}: {
  /** Absent for a new advert. */
  posting?: ApiPosting;
  onClose: () => void;
  onCreate: (body: CreatePostingBody) => Promise<boolean>;
  onUpdate: (id: string, body: UpdatePostingBody) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    posting ? fromPosting(posting) : blank(),
  );
  const [showProblems, setShowProblems] = useState(false);
  const [busy, setBusy] = useState(false);

  const problems = check(draft);
  const ready = Object.keys(problems).length === 0;
  const linkIsFixed = posting !== undefined && posting.status !== "DRAFT";

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const problemFor = (key: keyof Draft) =>
    showProblems ? problems[key] : undefined;

  async function submit() {
    if (!ready) {
      setShowProblems(true);
      return;
    }
    setBusy(true);
    const min = parseAmount(draft.salaryMin);
    const max = parseAmount(draft.salaryMax);
    try {
      if (posting) {
        const body: UpdatePostingBody = {
          title: draft.title.trim(),
          summary: draft.summary.trim(),
          description: draft.description.trim(),
          location: draft.location.trim() === "" ? null : draft.location.trim(),
          employmentType: draft.employmentType,
          showSalary: draft.showSalary,
          salaryMinKobo: min === null ? null : kobo(min),
          salaryMaxKobo: max === null ? null : kobo(max),
          closesOn: draft.closesOn === "" ? null : draft.closesOn,
          requisitionId:
            draft.requisitionId.trim() === "" ? null : draft.requisitionId.trim(),
          /* Only while it is still a draft, and only when it actually changed
             to something. Sending it after publishing is refused by name, so
             the field is not even rendered by then; an empty box means "leave
             the link alone", because nothing here regenerates one. */
          ...(linkIsFixed || draft.slug === "" || draft.slug === posting.slug
            ? {}
            : { slug: draft.slug }),
        };
        if (await onUpdate(posting.id, body)) onClose();
      } else {
        const body: CreatePostingBody = {
          title: draft.title.trim(),
          summary: draft.summary.trim(),
          description: draft.description.trim(),
          ...(draft.slug ? { slug: draft.slug } : {}),
          ...(draft.location.trim() ? { location: draft.location.trim() } : {}),
          employmentType: draft.employmentType,
          showSalary: draft.showSalary,
          ...(min === null ? {} : { salaryMinKobo: kobo(min) }),
          ...(max === null ? {} : { salaryMaxKobo: kobo(max) }),
          ...(draft.closesOn ? { closesOn: draft.closesOn } : {}),
          ...(draft.requisitionId.trim()
            ? { requisitionId: draft.requisitionId.trim() }
            : {}),
        };
        if (await onCreate(body)) onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={posting ? `Edit ${posting.title}` : "New advert"}
      description={
        posting
          ? undefined
          : "It starts as a draft. Nothing is public until you publish it."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void submit()}>
            {posting ? "Save advert" : "Save draft"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Job title" required error={problemFor("title")}>
          <Input
            autoFocus
            value={draft.title}
            placeholder="Payroll Officer"
            onChange={(event) => set("title", event.target.value)}
          />
        </Field>

        <Field
          label="One-line summary"
          required
          help="This is the line people read in the list."
          error={problemFor("summary")}
        >
          <Textarea
            rows={2}
            value={draft.summary}
            placeholder="Run monthly payroll for 40 staff in our Lagos office, reporting to the Finance Manager."
            onChange={(event) => set("summary", event.target.value)}
          />
        </Field>

        <Field
          label="The full advert"
          required
          help="What the work involves, who they report to, and what you need from them."
          error={problemFor("description")}
        >
          <Textarea
            rows={9}
            value={draft.description}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Where" help="Leave blank if it does not matter.">
            <Input
              value={draft.location}
              placeholder="Ikeja, Lagos"
              onChange={(event) => set("location", event.target.value)}
            />
          </Field>

          <Field label="Type of work">
            <Select
              value={draft.employmentType}
              onChange={(event) =>
                set("employmentType", event.target.value as EmploymentType)
              }
            >
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {EMPLOYMENT_TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* ---------------------------------------------------------- money */}

        <div className="flex flex-col gap-4 rounded-lg border border-line bg-canvas p-4">
          <Switch
            label="Show the pay range on the advert"
            description="Off keeps the figures on your record and off the public page."
            checked={draft.showSalary}
            onChange={(event) => set("showSalary", event.target.checked)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From (₦ a month)">
              <Input
                inputMode="decimal"
                value={draft.salaryMin}
                placeholder="450000"
                onChange={(event) => set("salaryMin", event.target.value)}
              />
            </Field>
            <Field label="To (₦ a month)" error={problemFor("salaryMax")}>
              <Input
                inputMode="decimal"
                value={draft.salaryMax}
                placeholder="650000"
                onChange={(event) => set("salaryMax", event.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Last day to apply"
            help="Leave blank to keep it open. It drops off the list the day after."
          >
            <Input
              type="date"
              value={draft.closesOn}
              onChange={(event) => set("closesOn", event.target.value)}
            />
          </Field>

          <Field
            label="Approved role ID"
            help="Needed to screen anyone in. There is no picker for this yet — paste the ID."
          >
            <Input
              value={draft.requisitionId}
              onChange={(event) => set("requisitionId", event.target.value)}
            />
          </Field>
        </div>

        {/* ----------------------------------------------------------- link */}

        {linkIsFixed ? (
          <div className="rounded-lg border border-line bg-canvas p-4">
            <p className="flex items-center gap-2 text-[0.875rem] font-medium text-ink">
              <Link2 aria-hidden="true" className="size-4 text-muted" />
              Its link cannot change
            </p>
            <p className="tabular mt-1.5 break-all text-[0.875rem] text-body">
              {careersPath(posting.publicPath)}
            </p>
            <p className="mt-1.5 text-[0.875rem] text-muted">
              People have this link already. Close this advert and write a new one
              if the address has to be different.
            </p>
          </div>
        ) : (
          <Field
            label="Link"
            help="Leave blank and we make one from the title. It is fixed once you publish."
            error={problemFor("slug")}
          >
            <Input
              value={draft.slug}
              placeholder="payroll-officer"
              onChange={(event) =>
                set("slug", event.target.value.trim().toLowerCase())
              }
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}
