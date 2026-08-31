"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  Clock3,
  IdCard,
  Landmark,
  MapPin,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  Field,
  Input,
  Select,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { AccountVerificationHint } from "@/components/payments/account-verification";
import { NIGERIAN_STATES } from "@/lib/reference/lists";
import { banksIncluding } from "@/lib/reference/banks";
import {
  SELF_SERVICE_OFFLINE,
  useMyPendingChanges,
  useMyRecordMutations,
} from "@/lib/store/my-record";
import type { Employee } from "@/lib/types";

/**
 * Your own details, in the two tiers the API actually enforces.
 *
 * ## Why the screen is grouped rather than listed
 *
 * The record has thirty-odd fields on it. A form that shows all of them at once
 * is the shape this product is sold against — the incumbent's own employee page
 * is exactly that, and nobody can find anything on it. So: **one open group,
 * the rest closed, each closed line saying what is inside and whether anything
 * in it needs attention.**
 *
 * "How to reach you" is open by default because it is the reason most people
 * come here. Pay and statutory is closed, and its closed line carries the
 * count of anything waiting — a reveal that hides something outstanding is the
 * failure mode `PARITY.md` Rule 5 names, so the pending banner sits *outside*
 * every group.
 *
 * ## The two tiers are stated before the field, not after the refusal
 *
 * Every group says which it is, in the closed line and again inside. Somebody
 * editing their account number should know payroll will look at it **before**
 * they type, not learn it from a toast afterwards — a rule this codebase
 * already follows for a frozen objective and a locked appraiser.
 *
 * The API is still the gate. `self-service.ts` decides the tier and this
 * mirrors it for the reader; a field moved there and not here shows up as a
 * refusal naming who can, which is the honest failure rather than a wrong
 * promise.
 */

/** Mirrors `SELF_IMMEDIATE` on the API. Changing one means changing both. */
type Draft = {
  phone: string;
  addressLine: string;
  stateOfOrigin: string;
  lgaOfOrigin: string;
  nextOfKinName: string;
  nextOfKinRelationship: string;
  nextOfKinPhone: string;
  bankName: string;
  bankAccount: string;
  pensionProvider: string;
  pensionPin: string;
  tin: string;
  nhfNumber: string;
  nin: string;
};

const EMPTY: Draft = {
  phone: "",
  addressLine: "",
  stateOfOrigin: "",
  lgaOfOrigin: "",
  nextOfKinName: "",
  nextOfKinRelationship: "",
  nextOfKinPhone: "",
  bankName: "",
  bankAccount: "",
  pensionProvider: "",
  pensionPin: "",
  tin: "",
  nhfNumber: "",
  nin: "",
};

/** Which group a field belongs to, and which tier that group is. */
const GROUPS = [
  {
    id: "contact",
    title: "How to reach you",
    icon: <UserRound aria-hidden="true" className="size-4" />,
    tier: "immediate" as const,
    fields: ["phone", "addressLine"] as (keyof Draft)[],
  },
  {
    id: "kin",
    title: "Next of kin",
    icon: <ShieldCheck aria-hidden="true" className="size-4" />,
    tier: "immediate" as const,
    fields: [
      "nextOfKinName",
      "nextOfKinRelationship",
      "nextOfKinPhone",
    ] as (keyof Draft)[],
  },
  {
    id: "origin",
    title: "Where you are from",
    icon: <MapPin aria-hidden="true" className="size-4" />,
    tier: "immediate" as const,
    fields: ["stateOfOrigin", "lgaOfOrigin"] as (keyof Draft)[],
  },
  {
    id: "bank",
    title: "Where your salary is paid",
    icon: <Landmark aria-hidden="true" className="size-4" />,
    tier: "approval" as const,
    fields: ["bankName", "bankAccount"] as (keyof Draft)[],
  },
  {
    id: "pension",
    title: "Pension",
    icon: <Banknote aria-hidden="true" className="size-4" />,
    tier: "approval" as const,
    fields: ["pensionProvider", "pensionPin"] as (keyof Draft)[],
  },
  {
    id: "statutory",
    title: "Tax and identity numbers",
    icon: <IdCard aria-hidden="true" className="size-4" />,
    tier: "approval" as const,
    fields: ["tin", "nhfNumber", "nin"] as (keyof Draft)[],
  },
];

const LABEL: Record<keyof Draft, string> = {
  phone: "Phone",
  addressLine: "Address",
  stateOfOrigin: "State of origin",
  lgaOfOrigin: "LGA of origin",
  nextOfKinName: "Their name",
  nextOfKinRelationship: "Relationship",
  nextOfKinPhone: "Their phone",
  bankName: "Bank",
  bankAccount: "Account number",
  pensionProvider: "Pension provider",
  pensionPin: "Pension PIN",
  tin: "Tax identification number",
  nhfNumber: "NHF number",
  nin: "National identity number",
};

const TIER_NOTE = {
  immediate: "Saved as soon as you press save.",
  approval:
    "Payroll checks these before they change — your salary is paid on them.",
};

export function MyDetails({
  me,
  only,
  title,
  description,
}: {
  me: Employee | null;
  /**
   * Which tier to render. The profile is already split into a Details tab and
   * a Pay tab, and the tiers land on exactly that line — contact details on
   * one, everything payroll checks on the other. Rendering both in one card
   * would put the account number on the tab people open to fix a phone number.
   */
  only?: "immediate" | "approval";
  title?: string;
  description?: string;
}) {
  const toast = useToast();
  const pending = useMyPendingChanges();
  const { save, editable } = useMyRecordMutations();

  const initial = useMemo<Draft>(() => {
    if (!me) return EMPTY;
    const row = me as unknown as Record<string, unknown>;
    const text = (key: keyof Draft) =>
      typeof row[key] === "string" ? (row[key] as string) : "";
    return {
      ...EMPTY,
      phone: text("phone"),
      addressLine: text("addressLine"),
      stateOfOrigin: text("stateOfOrigin"),
      lgaOfOrigin: text("lgaOfOrigin"),
      nextOfKinName: text("nextOfKinName"),
      nextOfKinRelationship: text("nextOfKinRelationship"),
      nextOfKinPhone: text("nextOfKinPhone"),
      bankName: text("bankName"),
      bankAccount: text("bankAccount"),
      pensionProvider: text("pensionProvider"),
      pensionPin: text("pensionPin"),
      tin: text("tin"),
      nhfNumber: text("nhfNumber"),
      nin: text("nin"),
    };
  }, [me]);

  const [draft, setDraft] = useState<Draft>(initial);
  /**
   * What "unchanged" means right now.
   *
   * Not `initial`, which is derived from the employee record and does not move
   * until that refetches. Without this the footer kept reading "1 change:
   * Phone" after a successful save, and Save stayed lit — so the only feedback
   * that the save worked was a toast that had already gone.
   *
   * A field sent for approval joins the baseline too. It is *submitted*, which
   * is not the same as unsaved, and the "waiting" badge on the field is what
   * carries the distinction — leaving it counted as an unsaved change would
   * invite somebody to press save again and supersede their own request.
   */
  const [baseline, setBaseline] = useState<Draft>(initial);
  const [open, setOpen] = useState<string | null>(
    () => GROUPS.find((group) => !only || group.tier === only)?.id ?? null,
  );
  const [busy, setBusy] = useState(false);

  const set = (key: keyof Draft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  /* Only what moved. Sending the whole draft would raise an approval for every
     sensitive field on the record every time somebody corrects their phone. */
  const changed = (Object.keys(draft) as (keyof Draft)[]).filter(
    (key) => draft[key] !== baseline[key],
  );

  /** Fields with something already waiting — shown on the field, not just above. */
  const waiting = new Set(pending.changes.map((change) => change.field));

  async function submit() {
    if (changed.length === 0) return;
    setBusy(true);
    const patch: Record<string, unknown> = {};
    for (const key of changed) patch[key] = draft[key].trim() || null;
    const result = await save(patch);
    setBusy(false);

    if (!result.ok) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail: result.error?.message ?? SELF_SERVICE_OFFLINE,
      });
      return;
    }

    const { applied, pending: raised, refused } = result.outcome;
    pending.reload();
    /* Everything the API accepted — written or proposed — is the new baseline.
       Anything it refused stays flagged as an unsaved change, which is honest:
       it did not go anywhere. */
    const accepted = new Set<string>([
      ...applied,
      ...raised.map((one) => one.field),
    ]);
    setBaseline((current) => {
      const next = { ...current };
      for (const key of changed) {
        if (accepted.has(key)) next[key] = draft[key];
      }
      return next;
    });

    /* Three outcomes, said as one sentence each rather than a generic "Saved".
       A person who changed two things and had one held needs to know which. */
    if (applied.length > 0 && raised.length === 0) {
      toast.push({ title: "Saved", tone: "success" });
    } else if (raised.length > 0) {
      toast.push({
        title:
          applied.length > 0
            ? "Some saved, some sent to payroll"
            : "Sent to payroll",
        tone: "success",
        detail: `${raised.map((one) => one.label).join(", ")} ${
          raised.length === 1 ? "changes" : "change"
        } once payroll agrees. Nothing has moved yet.`,
      });
    }
    if (refused.length > 0) {
      toast.push({
        title: "Some of that is not yours to change",
        tone: "warning",
        detail: refused[0]?.reason,
      });
    }
  }

  if (!me) return null;

  return (
    <div className="flex flex-col gap-4">
      <LoadFailure
        subject="what you have waiting"
        error={pending.error}
        onRetry={pending.reload}
      />

      {/* Outside every group on purpose: a reveal that hides something
          outstanding is the one thing PARITY.md Rule 5 forbids. */}
      {pending.changes.length > 0 && (
        <Callout
          tone="info"
          icon={<Clock3 aria-hidden="true" />}
          title={
            pending.changes.length === 1
              ? "One change is with payroll"
              : `${pending.changes.length} changes are with payroll`
          }
        >
          <ul className="mt-1 flex flex-col gap-1">
            {pending.changes.map((change) => (
              <li key={change.id} className="text-body-sm">
                <span className="font-medium text-ink">{change.label}</span>
                <span className="text-muted"> · {change.summary}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-meta text-muted">
            Your record still shows the old value until somebody agrees.
          </p>
        </Callout>
      )}

      {!editable && (
        <Callout tone="warning" title="Read-only here">
          {SELF_SERVICE_OFFLINE}
        </Callout>
      )}

      <Card>
        <CardHeader
          level={2}
          title={title ?? "Your details"}
          description={
            description ??
            "Contact details are yours to change. Anything your pay is worked out from, payroll checks first."
          }
        />
        <CardBody className="flex flex-col gap-2">
          {GROUPS.filter((group) => !only || group.tier === only).map((group) => {
            const held = group.fields.filter((f) => waiting.has(f)).length;
            const edited = group.fields.filter(
              (f) => draft[f] !== baseline[f],
            ).length;
            return (
              <Disclosure
                key={group.id}
                /* Single-open, which is the point: the record has thirty-odd
                   fields and the reason this screen is not the incumbent's is
                   that only one group is ever in front of you. */
                open={open === group.id}
                onToggle={() =>
                  setOpen((current) => (current === group.id ? null : group.id))
                }
                title={
                  <span className="flex items-center gap-2">
                    <span className="text-accent-text">{group.icon}</span>
                    {group.title}
                  </span>
                }
                meta={
                  <span className="flex items-center gap-1.5">
                    {group.tier === "approval" && (
                      <Badge tone="neutral" size="sm">
                        Payroll checks this
                      </Badge>
                    )}
                    {held > 0 && (
                      <Badge tone="info" size="sm" dot>
                        {held} waiting
                      </Badge>
                    )}
                    {edited > 0 && (
                      <Badge tone="warning" size="sm">
                        {edited} unsaved
                      </Badge>
                    )}
                  </span>
                }
                hint={TIER_NOTE[group.tier]}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.fields.flatMap((key) => {
                    const field = (
                      <Field
                        key={key}
                        label={LABEL[key]}
                        {...(waiting.has(key)
                          ? {
                              help: "A change to this is already with payroll. Saving again replaces it.",
                            }
                          : {})}
                      >
                        {key === "stateOfOrigin" ? (
                          <Select
                            value={draft[key]}
                            disabled={!editable}
                            onChange={(event) => set(key, event.target.value)}
                          >
                            <option value="">Not recorded</option>
                            {NIGERIAN_STATES.map((state) => (
                              <option key={state} value={state}>
                                {state}
                              </option>
                            ))}
                          </Select>
                        ) : key === "bankName" ? (
                          <Select
                            value={draft[key]}
                            disabled={!editable}
                            onChange={(event) => set(key, event.target.value)}
                          >
                            <option value="">Not recorded</option>
                            {banksIncluding(initial.bankName).map((bank) => (
                              <option key={bank.label} value={bank.label}>
                                {bank.label}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Input
                            value={draft[key]}
                            disabled={!editable}
                            onChange={(event) => set(key, event.target.value)}
                          />
                        )}
                      </Field>
                    );

                    /* BE-10: confirms the account once both fields beside it
                       are filled in. Placed after `bankAccount` rather than
                       inside its `Field` — a live confirmation is not the
                       field's own help text. */
                    if (key !== "bankAccount") return [field];
                    return [
                      field,
                      <div key={`${key}-verify`} className="sm:col-span-2">
                        <AccountVerificationHint
                          bankName={draft.bankName}
                          accountNumber={draft.bankAccount}
                        />
                      </div>,
                    ];
                  })}
                </div>
              </Disclosure>
            );
          })}
        </CardBody>

        <CardBody className="flex flex-wrap items-center justify-between gap-3 border-t border-line">
          <p className="text-meta text-muted">
            {changed.length === 0 ? (
              <span className="flex items-center gap-1.5">
                <BadgeCheck aria-hidden="true" className="size-3.5" />
                Nothing changed yet
              </span>
            ) : (
              /* Names what will happen to each half before the press, not
                 after — the same rule the payroll approval dialog follows. */
              `${String(changed.length)} ${changed.length === 1 ? "change" : "changes"}: ${changed
                .map((key) => LABEL[key])
                .join(", ")}`
            )}
          </p>
          <div className="flex gap-2">
            {changed.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraft(baseline)}
              >
                Undo
              </Button>
            )}
            <Button
              variant="accent"
              size="sm"
              loading={busy}
              disabled={!editable || changed.length === 0 || busy}
              onClick={() => void submit()}
            >
              Save changes
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
