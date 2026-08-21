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
  Field,
  Input,
  Select,
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
import {
  useCompanySettings,
  validateProfile,
  type CompanyProfile,
  type ProfileError,
} from "@/lib/store/company";
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
 */
export function CompanyProfileForm() {
  const { settings, updateProfile } = useCompanySettings();
  const { directory } = useEmployeeStore();
  const toast = useToast();

  const [draft, setDraft] = useState<Partial<CompanyProfile>>({});
  const [errors, setErrors] = useState<ProfileError[]>([]);

  const value = <K extends keyof CompanyProfile>(key: K): CompanyProfile[K] =>
    (draft[key] ?? settings.profile[key]) as CompanyProfile[K];

  const dirty = Object.keys(draft).length > 0;
  const errorFor = (field: keyof CompanyProfile) =>
    errors.find((e) => e.field === field)?.message;

  const set = <K extends keyof CompanyProfile>(key: K, v: CompanyProfile[K]) => {
    setDraft((d) => ({ ...d, [key]: v }));
    setErrors((e) => e.filter((x) => x.field !== key));
  };

  function save() {
    const found = validateProfile(draft);
    setErrors(found);
    if (found.length > 0) return;
    updateProfile(draft);
    setDraft({});
    toast.push({
      title: "Company profile saved",
      tone: "success",
      detail: "Letters and statutory filings use these details.",
    });
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
        description="Used on contracts, letters and every statutory filing the product generates."
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
                  >
                    <Select
                      value={value("state")}
                      onChange={(e) => set("state", e.target.value)}
                    >
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
            <Card>
              <CardHeader title="Where this is used" level={3} />
              <CardBody className="flex flex-col gap-2.5 text-[0.875rem] leading-relaxed text-body">
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
              {settings.profile.entities.map((entity) => (
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
            <p className="text-[0.875rem] leading-relaxed text-muted">
              Adding and removing entities is not wired up yet — it changes which
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
