"use client";

import { useState } from "react";
import { Building2, Check, Plus } from "lucide-react";
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
  Select,
  Skeleton,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { usePermissions } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import { company as companyApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import {
  useCompanySettings,
  useLiveCompanyProfile,
  useOrgTaxState,
  validateProfile,
  type CompanyProfile,
  type ProfileError,
} from "@/lib/store/company";
import { CompanyLogoCard } from "./logo-card";
import { useEmployeeStore } from "@/lib/store/employees";
import { NIGERIAN_STATES } from "@/lib/reference/lists";

/*
 * The 36 states plus the FCT — a Nigerian company files PAYE to one of these.
 *
 * This list used to be declared here, and a five-entry version of it was
 * declared again in the employee form, where the two disagreed on whether the
 * capital is called `FCT` or `Abuja`. Both now come from one place; see the
 * header of `lib/reference/lists.ts` for why that mattered.
 */
const STATES = NIGERIAN_STATES;

/**
 * Company profile.
 *
 * The entity table is the part that matters. A Nigerian group files PAYE per
 * state, per entity, and payroll's statutory schedules are grouped by exactly
 * that — so this page shows how many people currently sit in each tax state,
 * read live from the employee store. An entity with nobody on it is either a
 * new company or a mistake, and it is worth being able to tell which.
 *
 * ## The permission gate sits above the hooks
 *
 * The same reason `AuditScreen` and `WebhooksScreen` split their check into a
 * separate component: checking `MANAGE_SETTINGS` inside the form and returning
 * early would still run every hook below it first.
 */
export function CompanyProfileForm() {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <Header />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only">Loading the company profile</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_SETTINGS")) {
    return (
      <>
        <Header />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Building2 aria-hidden="true" />}
              title="You cannot manage the company profile"
              description="Registered details feed contracts, payslips and statutory filings, so changing them is kept to the people who manage company settings. Ask whoever handles access to add that permission to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Form />;
}

function Header() {
  return (
    <PageHeader
      title="Company profile"
      breadcrumb={[{ href: "/settings", label: "Settings" }]}
    />
  );
}

function Form() {
  const { settings, updateProfile } = useCompanySettings();
  /**
   * The company's real profile, when there is an API to ask.
   *
   * This screen used to read the demo store unconditionally, so a second
   * organisation signed in and was shown the first one's legal name, RC number,
   * TIN and registered address — as its own, on an editable form, above a panel
   * explaining that these are what statutory filings use. The form's own
   * comment recorded the gap and deferred it; a second organisation is what
   * made deferring it untenable.
   *
   * `useLiveCompanyProfile` is shared with the payslip masthead, which had the
   * identical bug and was fixed alone. One hook, both readers: a copy in a page
   * is how those two came to disagree about the same company.
   */
  const live = useLiveCompanyProfile();
  const { isConnected } = useSession();
  const { directory } = useEmployeeStore();
  const toast = useToast();

  /**
   * The org's own PAYE state, split out from the rest of the profile.
   *
   * The rest of this form is demo-store only — converting all of it is its own
   * piece of work — but this one field cannot wait for that: an employee create
   * and every import refuse outright with no default set, and until now this
   * screen let somebody "save" one that only ever reached their own browser.
   * Saves itself immediately rather than joining the batched draft below, so
   * setting it here actually reaches the row `POST /employees` and the importer
   * both read.
   */
  const orgTax = useOrgTaxState();
  const [savingOrgTax, setSavingOrgTax] = useState(false);
  const [orgTaxError, setOrgTaxError] = useState<string | null>(null);

  async function saveOrgTaxState(state: string) {
    setSavingOrgTax(true);
    setOrgTaxError(null);
    const ok = await orgTax.setTaxState(state);
    setSavingOrgTax(false);
    if (!ok) {
      setOrgTaxError("That could not be saved. Try again.");
      return;
    }
    toast.push({
      title: "Primary tax state saved",
      tone: "success",
      detail: "Payroll and the staff importer use this from now on.",
    });
  }

  const [draft, setDraft] = useState<Partial<CompanyProfile>>({});
  const [errors, setErrors] = useState<ProfileError[]>([]);

  const value = <K extends keyof CompanyProfile>(key: K): CompanyProfile[K] =>
    (draft[key] ?? profile[key]) as CompanyProfile[K];

  /**
   * What this form is editing.
   *
   * Connected, that is the organisation's own row. Offline it is the demo
   * store. **Never a blend**: while the live read is in flight the fields are
   * empty rather than showing seed values that would be replaced a moment
   * later, because a fabricated RC number on screen for half a second is still
   * a fabricated RC number somebody can read and act on.
   */
  const profile: CompanyProfile = isConnected
    ? {
        legalName: live.profile?.legalName ?? "",
        tradingName: live.profile?.tradingName ?? "",
        rcNumber: live.profile?.rcNumber ?? "",
        tin: live.profile?.tin ?? "",
        industry: live.profile?.industry ?? "",
        address: live.profile?.addressLine ?? "",
        city: live.profile?.city ?? "",
        state: live.profile?.taxState ?? "",
        entities: (live.profile?.entities ?? []).map((e) => ({
          id: e.id,
          name: e.name,
          rcNumber: e.rcNumber ?? "",
          taxState: e.taxState,
          address: e.addressLine ?? "",
          isPrimary: e.isPrimary,
        })),
      }
    : settings.profile;

  const dirty = Object.keys(draft).length > 0;
  const errorFor = (field: keyof CompanyProfile) =>
    errors.find((e) => e.field === field)?.message;

  const set = <K extends keyof CompanyProfile>(key: K, v: CompanyProfile[K]) => {
    setDraft((d) => ({ ...d, [key]: v }));
    setErrors((e) => e.filter((x) => x.field !== key));
  };

  const [saving, setSaving] = useState(false);

  /**
   * Saves to the organisation's row when connected; to this browser when not.
   *
   * It used to call `updateProfile` unconditionally, which writes to
   * localStorage — so a connected company could edit its RC number, be told
   * "Company profile saved", and have changed nothing anybody else would ever
   * see. That is the same class as a green "Paid" against money nobody moved,
   * and on the screen whose sidebar says these details are what statutory
   * filings use.
   *
   * The demo path keeps the local write and says so, as every other demo write
   * in this product does.
   */
  async function save() {
    const found = validateProfile(draft);
    setErrors(found);
    if (found.length > 0) return;

    if (!isConnected) {
      updateProfile(draft);
      setDraft({});
      toast.push({
        title: "Company profile saved in this browser",
        tone: "success",
        detail: "Demo mode: it does not reach a server or another device.",
      });
      return;
    }

    setSaving(true);
    try {
      /* Only what was typed, and in the API's own field names — `address` and
         `state` are this form's words for `addressLine` and `taxState`. */
      const body: Record<string, unknown> = {};
      if (draft.legalName !== undefined) body["legalName"] = draft.legalName;
      if (draft.tradingName !== undefined) body["tradingName"] = draft.tradingName;
      if (draft.rcNumber !== undefined) body["rcNumber"] = draft.rcNumber;
      if (draft.tin !== undefined) body["tin"] = draft.tin;
      if (draft.industry !== undefined) body["industry"] = draft.industry;
      if (draft.address !== undefined) body["addressLine"] = draft.address;
      if (draft.city !== undefined) body["city"] = draft.city;
      if (draft.state !== undefined) body["taxState"] = draft.state;

      await companyApi.updateProfile(body);
      live.reload();
      setDraft({});
      toast.push({
        title: "Company profile saved",
        tone: "success",
        detail: "Letters and statutory filings use these details.",
      });
    } catch (caught: unknown) {
      toast.push({
        title: "Could not save the company profile",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  /* Live headcount per tax state, so an entity row means something. */
  const headcountByState = directory.reduce<Record<string, number>>(
    (acc, e) => ({ ...acc, [e.taxState]: (acc[e.taxState] ?? 0) + 1 }),
    {},
  );

  return (
    <>
      <PageHeader
        title="Company profile"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        action={
          dirty ? (
            <Button variant="accent" size="sm" onClick={save}>
              <Check aria-hidden="true" className="size-4" />
              Save changes
            </Button>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader
              title="Registered details"
              description="As they appear at the Corporate Affairs Commission."
            />
            <CardBody>
              <div className="flex flex-col gap-5">
                <Field
                  label="Registered name"
                  required
                  error={errorFor("legalName")}
                  help="The name on the certificate of incorporation."
                >
                  <Input
                    value={value("legalName")}
                    onChange={(e) => set("legalName", e.target.value)}
                  />
                </Field>

                <Field label="Trading name" help="Shown in the product and on payslips.">
                  <Input
                    value={value("tradingName")}
                    onChange={(e) => set("tradingName", e.target.value)}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="RC number" error={errorFor("rcNumber")}>
                    <Input
                      value={value("rcNumber")}
                      onChange={(e) => set("rcNumber", e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Company TIN"
                    error={errorFor("tin")}
                    help="Ten digits."
                  >
                    <Input
                      digits={10}
                      value={value("tin")}
                      onChange={(e) => set("tin", e.target.value)}
                    />
                  </Field>
                </div>

                <Field label="Industry">
                  <Input
                    value={value("industry")}
                    onChange={(e) => set("industry", e.target.value)}
                  />
                </Field>

                <Field label="Registered address">
                  <Input
                    value={value("address")}
                    onChange={(e) => set("address", e.target.value)}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="City">
                    <Input
                      value={value("city")}
                      onChange={(e) => set("city", e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Primary tax state"
                    help="Where PAYE is filed for staff on the main entity."
                    {...(orgTaxError ? { error: orgTaxError } : {})}
                  >
                    <Select
                      value={orgTax.taxState ?? ""}
                      disabled={orgTax.loading || savingOrgTax}
                      onChange={(e) => void saveOrgTaxState(e.target.value)}
                    >
                      <option value="" disabled>
                        {orgTax.loading ? "Loading…" : "Not set"}
                      </option>
                      {STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
            </CardBody>
          </Card>

          <div className="flex flex-col gap-6">
            <CompanyLogoCard />

            <Card>
              <CardHeader title="Where this is used" level={3} />
              <CardBody className="flex flex-col gap-2.5 text-body-sm leading-relaxed text-body">
                <p>Contracts, offer letters and confirmation letters.</p>
                <p>The header of every payslip.</p>
                <p>PAYE, pension and NHF schedules filed on your behalf.</p>
                <p>Your data processing record under the NDPA.</p>
              </CardBody>
            </Card>

            {dirty && (
              <Callout tone="info" title="Unsaved changes">
                Nothing is written until you save. Filings already generated keep
                the details they were generated with.
              </Callout>
            )}
          </div>
        </div>

        <Card>
          <CardHeader
            title="Legal entities"
            description="Each entity files separately. Headcount is live from the directory."
            action={
              <Button variant="secondary" size="sm" disabled>
                <Plus aria-hidden="true" className="size-3.5" />
                Add entity
              </Button>
            }
          />
          <TableWrap className="rounded-none border-0">
            <THead>
              <TH>Entity</TH>
              <TH>RC number</TH>
              <TH>Tax state</TH>
              <TH align="right">Employees</TH>
              <TH>Address</TH>
            </THead>
            <TBody>
              {profile.entities.map((entity) => (
                <TR key={entity.id}>
                  <TDPrimary
                    title={
                      <span className="flex items-center gap-2">
                        <Building2
                          aria-hidden="true"
                          className="size-3.5 text-faint"
                        />
                        {entity.name}
                        {entity.isPrimary && (
                          <Badge tone="accent" size="sm">
                            Primary
                          </Badge>
                        )}
                      </span>
                    }
                  />
                  <TD className="tabular">{entity.rcNumber}</TD>
                  <TD>{entity.taxState}</TD>
                  <TD align="right" className="tabular font-medium text-ink">
                    {headcountByState[entity.taxState] ?? 0}
                  </TD>
                  <TD className="text-muted">{entity.address}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          <CardBody className="border-t border-line">
            <p className="text-body-sm leading-relaxed text-muted">
              Adding and removing entities is not wired up yet: it changes which
              tax office each employee is filed to, so it needs the migration
              step that moves people across, not just a form. The button above is
              disabled rather than hidden so you can see it is coming.
            </p>
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
