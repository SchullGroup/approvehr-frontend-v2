"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  RadioCard,
  Skeleton,
  AttentionMark,
  useToast,
} from "@/components/ui";
import Link from "next/link";
import { LoadFailure } from "@/components/portal/load-failure";
import { NOTICE_LINK, NoticeLine } from "@/components/portal/notice-line";
import { whatAcceptingDoes } from "@/lib/hiring/hired/copy";
import type { OnOfferAccepted } from "@/lib/hiring/hired/model";
import { useHiredSettings } from "@/lib/hiring/hired/use-hired";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { HiringSettingsShell } from "../settings-shell";

/**
 * What happens when somebody accepts an offer.
 *
 * ## This used to have no choice
 *
 * Accepting an offer created the employee record in the same moment. A company that
 * was relying on that is looking at a changed product, so the page says what the
 * default is now, what the old behaviour is called, and where the two differ. It does
 * not hide the change in a footnote.
 *
 * ## Core HR decides what is possible
 *
 * A company without Core HR has nowhere to create an employee. The second option is
 * off for it, with the reason beside it, and the page says plainly that the Hired list
 * is where people stay. It is never a setting that quietly does nothing.
 */

const OPTIONS: {
  value: OnOfferAccepted;
  label: string;
  description: string;
}[] = [
  {
    value: "HIRED_LIST_ONLY",
    label: "Add them to the Hired list",
    description:
      "Accepting an offer puts the person on the Hired list and stops there. You make their employee record yourself, from the list, when you are ready: one person at a time or many at once. Nothing is created until you do.",
  },
  {
    value: "CREATE_EMPLOYEE",
    label: "Create their employee record at once",
    description:
      "Accepting an offer puts the person on the Hired list and creates their employee record in the same moment, as it did before the Hired list existed. Needs Core HR.",
  },
];

export function AcceptedOffersScreen() {
  const store = useHiredSettings();
  const toast = useToast();
  const [choice, setChoice] = useState<OnOfferAccepted | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const settings = store.settings;
  const current = choice ?? settings?.onOfferAccepted ?? "HIRED_LIST_ONLY";
  const dirty = settings !== null && current !== settings.onOfferAccepted;
  useUnsavedGuard(dirty);

  async function save() {
    setSaving(true);
    setProblem(null);
    try {
      const saved = await store.save(current);
      setChoice(null);
      toast.push({
        title: "Accepted offers saved",
        tone: "success",
        detail: whatAcceptingDoes({
          setting: saved.onOfferAccepted,
          coreHr: saved.coreHr,
        }).headline,
      });
    } catch (error) {
      setProblem(sentenceOf(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <HiringSettingsShell
      active="/hiring/settings/accepted-offers"
      title="Accepted offers"
      description="What happens when somebody accepts an offer. Whichever you choose, they go on the Hired list."
    >
      {store.loading ? (
        <>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading this setting</span>
        </>
      ) : store.error || !settings ? (
        <LoadFailure
          subject="this setting"
          error={store.error}
          onRetry={store.reload}
          missingMeans="module"
        />
      ) : (
        <>
          {settings.onOfferAccepted === "CREATE_EMPLOYEE" ? (
            <NoticeLine tone="muted">
              <span>Accepting an offer makes the employee record</span>
              <AttentionMark
                tone="info"
                text={`This is how accepting an offer worked before the Hired list existed: the employee record is made at that moment. ${
                  settings.effective === "HIRED_LIST_ONLY"
                    ? "Your plan no longer includes Core HR, though, so for now accepting an offer only adds the person to the Hired list. "
                    : ""
                }Companies that are new to hiring now start with the Hired list alone, where accepting an offer adds the person and stops there. You can switch to that below.`}
              />
              <Link className={NOTICE_LINK} href="/hiring/hired">
                Open the Hired list
              </Link>
            </NoticeLine>
          ) : (
            <NoticeLine tone="muted">
              <span>How accepting an offer works now</span>
              <AttentionMark
                tone="info"
                text="Accepting an offer puts the person on the Hired list and stops there. Before the Hired list existed it also created the employee record straight away, and you can choose that again below. Offers accepted before the change are already on the list, and the people who became employees show as Employee created."
              />
              <Link className={NOTICE_LINK} href="/hiring/hired">
                Open the Hired list
              </Link>
            </NoticeLine>
          )}

          <Callout
            tone={settings.coreHr ? "info" : "warning"}
            title={settings.coreHr ? "Core HR is on" : "Core HR is not on"}
          >
            {settings.coreHr
              ? "Your company has Core HR, so employee records can be created from the Hired list."
              : "Your company does not use Core HR, so there are no employee records to create. People stay on the Hired list, and you can export it. The second option is off until Core HR is on."}
          </Callout>

          <Card>
            <CardHeader title="When an offer is accepted" />
            <CardBody className="flex flex-col gap-4">
              <div
                role="radiogroup"
                aria-label="When an offer is accepted"
                className="grid gap-3 md:grid-cols-2"
              >
                {OPTIONS.map((fallback) => {
                  /* The API's own wording and availability win where it sent them. */
                  const said = settings.options?.find(
                    (entry) => entry.value === fallback.value,
                  );
                  const option = {
                    value: fallback.value,
                    label: said?.label ?? fallback.label,
                    description: said?.description ?? fallback.description,
                  };
                  const unavailable = said
                    ? !said.available
                    : option.value === "CREATE_EMPLOYEE" && !settings.coreHr;
                  const why =
                    said?.unavailableReason ??
                    "Off for your company, because it does not use Core HR.";
                  return (
                    <RadioCard
                      key={option.value}
                      name="on-offer-accepted"
                      label={option.label}
                      description={
                        unavailable
                          ? `${option.description} ${why}`
                          : option.description
                      }
                      checked={current === option.value}
                      disabled={unavailable || !settings.canChange}
                      onChange={() => setChoice(option.value)}
                    />
                  );
                })}
              </div>

              {!settings.canChange && (
                <p className="text-body-sm text-muted">
                  You can read this but not change it. Ask whoever manages your
                  company settings.
                </p>
              )}

              <p className="text-body-sm text-body">
                <span className="font-medium text-ink">With this choice:</span>{" "}
                {
                  whatAcceptingDoes({
                    setting: current,
                    coreHr: settings.coreHr,
                  }).headline
                }
              </p>

              {problem && (
                <p role="alert" className="text-body-sm text-danger-text">
                  {problem}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="accent"
                  loading={saving}
                  disabled={!dirty || !settings.canChange}
                  onClick={() => void save()}
                >
                  {!saving && <Save aria-hidden="true" className="size-3.5" />}
                  Save
                </Button>
                {dirty && (
                  <Button
                    variant="ghost"
                    disabled={saving}
                    onClick={() => {
                      setChoice(null);
                      setProblem(null);
                    }}
                  >
                    Discard
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </HiringSettingsShell>
  );
}
