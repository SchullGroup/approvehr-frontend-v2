"use client";

import { sourceNote } from "@/lib/demo";
import { useState } from "react";
import Link from "next/link";
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Field,
  Select,
  Switch,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  ADVANCED_FEATURE_KEYS,
  FEATURE_KEYS,
  MODULE_FEATURE_KEYS,
  RECORD_FIELD_KEYS,
  type FeatureKey,
  type HeadcountBand,
} from "@/lib/api/setup";
import {
  FEATURE_COPY,
  HEADCOUNT_LABELS,
  useFeatureSettings,
} from "@/lib/store/features";

/**
 * Turn on more features.
 *
 * The other half of Rule 2 in `PARITY.md`. Setup hides most of the product on
 * day one, which is only defensible if there is one obvious place that shows
 * everything hidden and turns it on in a click. This is that place: every
 * capability in the system, one plain line each, and a switch.
 *
 * ## Off is hidden, never deleted
 *
 * Switching something off hides its screens and keeps its data — the API is
 * built that way on purpose, and the page says so once, at the top, because it
 * is the fear that stops somebody trying a switch at all.
 *
 * ## The headcount answer is not a switch
 *
 * "How many people do you pay?" sits above the switches because it moves two of
 * them: below ten people, departments and grades go off, since a hierarchy of
 * four people is a fiction somebody has to maintain. The API applies that rule,
 * and this page **reports what actually changed** rather than predicting it —
 * the response is the truth, and a switch that flips without a word looks like
 * a bug.
 *
 * ## Three groups, because three different things are being switched
 *
 * The first group decides which **screens** exist, and the setup wizard writes
 * it. The second decides which **fields** an employee record asks for — tax,
 * pension, bank — and nothing writes it but this page. Mixing them into one
 * list of ten made "Bank accounts" read as a module, and made the honest
 * consequence of switching it off impossible to state in the same voice as
 * "Hiring". The headcount rule deliberately does not touch the second group:
 * PAYE and pension are statutory for four people exactly as much as for four
 * hundred.
 *
 * The third group is **depth inside a module that is already on** — today, more
 * than one appraiser per person. It sits last and it is the only group whose
 * switches can be unavailable rather than merely off: the API refuses
 * `multiAppraiser` while `appraisals` is off, so the row says why and names the
 * switch above that opens it. Hiding the row instead would make the capability
 * undiscoverable, which is the failure this whole page exists to prevent.
 */
export function FeaturesScreen() {
  const features = useFeatureSettings();
  const toast = useToast();
  const connected = features.source === "api";

  /* Which row is mid-request, so only that switch goes quiet. */
  const [pending, setPending] = useState<FeatureKey | "headcountBand" | null>(
    null,
  );

  const toggle = async (key: FeatureKey, value: boolean) => {
    setPending(key);
    try {
      await features.setFeature(key, value);
      toast.push({
        title: `${FEATURE_COPY[key].label} ${value ? "is on" : "is off"}`,
        tone: value ? "success" : "info",
        ...(value
          ? {}
          : { detail: "Nothing was deleted. Switch it back on any time." }),
      });
    } catch (error) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setPending(null);
    }
  };

  const changeBand = async (band: HeadcountBand) => {
    const before = features.flags;
    setPending("headcountBand");
    try {
      const after = await features.setHeadcountBand(band);
      /* Report the side effect from the response, never from a guess at the
         rule. Two copies of that rule is how the page starts lying. */
      const switchedOff = FEATURE_KEYS.filter(
        (key) => before[key] && !after[key],
      );
      toast.push({
        title: `Set to ${HEADCOUNT_LABELS[band].toLowerCase()}`,
        tone: switchedOff.length > 0 ? "info" : "success",
        ...(switchedOff.length > 0
          ? {
              /* "Switched off:" rather than a joined sentence — two of these
                 labels contain the word "and" and reading them in a list
                 produced "Departments and teams and Salary grades". */
              detail: `Switched off: ${switchedOff
                .map((key) => FEATURE_COPY[key].label)
                .join(", ")}. Turn ${
                switchedOff.length > 1 ? "them" : "it"
              } back on below.`,
            }
          : {}),
      });
    } catch (error) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setPending(null);
    }
  };

  const modulesOn = MODULE_FEATURE_KEYS.filter((key) => features.flags[key]).length;
  const fieldsOn = RECORD_FIELD_KEYS.filter((key) => features.flags[key]).length;

  /**
   * What a switch depends on, and the sentence for when it is not met.
   *
   * One entry today. Written as a lookup rather than an `if` in the row so the
   * next dependent flag cannot be added without a sentence explaining itself.
   */
  const REQUIRES: Partial<Record<FeatureKey, { key: FeatureKey; why: string }>> = {
    multiAppraiser: {
      key: "appraisals",
      why: "Turn appraisals on first: this changes how an appraisal period works, and there are no appraisal periods without them.",
    },
  };

  /** One switch row, so the groups cannot drift apart visually. */
  const row = (key: FeatureKey) => {
    const needs = REQUIRES[key];
    const blocked = needs !== undefined && !features.flags[needs.key];
    return (
      <div key={key} className="py-4">
        <Switch
          label={
            FEATURE_COPY[key].soon
              ? `${FEATURE_COPY[key].label} (coming soon)`
              : FEATURE_COPY[key].label
          }
          description={
            blocked ? `${FEATURE_COPY[key].line} ${needs.why}` : FEATURE_COPY[key].line
          }
          checked={features.flags[key]}
          disabled={
            !features.editable || features.loading || pending === key || blocked
          }
          onChange={(event) => {
            void toggle(key, event.target.checked);
          }}
        />
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Turn on more features"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        meta={
          sourceNote(connected) && (
            <Badge tone="warning" size="sm" dot>
              {sourceNote(connected)}
            </Badge>
          )
        }
      />

      <PageBody className="flex flex-col gap-6">
        {/* `useFeatures` flattens the error to a string before a screen sees it,
            so there is no `ApiError` left to classify and this renders the
            general advice. Widening that state to `ApiError | null` is what
            would let the API's own 403 sentence through. */}
        <LoadFailure subject="your feature settings" error={features.error}/>

        {!features.editable && (
          <Callout tone="info" title="You cannot change these">
            Ask whoever manages settings for this company.
          </Callout>
        )}

        {features.setupRequired && features.editable && (
          /* Five questions set all of this at once, so the way out of here is a
             link to them rather than a sentence about them. */
          <Callout tone="accent" title="Setup is not finished">
            <Link
              href="/setup"
              className="font-medium underline decoration-accent-line underline-offset-4 hover:decoration-accent"
            >
              Answer the five setup questions
            </Link>{" "}
            and these get set for you.
          </Callout>
        )}

        <Card>
          <CardHeader
            title="How many people do you pay?"
            description="Everyone on the payroll, full-time or not."
            level={2}
          />
          <CardBody>
            {/* The heading above is the label, so the field's own one is for
                screen readers. Nothing explains the side effect up front: the
                toast reports what actually changed, and offers the way back. */}
            <Field label="How many people do you pay?" hideLabel>
              <Select
                value={features.headcountBand}
                disabled={
                  !features.editable ||
                  features.loading ||
                  pending === "headcountBand"
                }
                onChange={(event) => {
                  void changeBand(event.target.value as HeadcountBand);
                }}
                className="max-w-xs"
              >
                {(
                  Object.keys(HEADCOUNT_LABELS) as HeadcountBand[]
                ).map((band) => (
                  <option key={band} value={band}>
                    {HEADCOUNT_LABELS[band]}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Modules"
            description={`${modulesOn} of ${MODULE_FEATURE_KEYS.length} on. Changes save as you make them.`}
            level={2}
          />
          <CardBody className="flex flex-col divide-y divide-line py-0">
            {MODULE_FEATURE_KEYS.map(row)}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="What an employee record asks for"
            description={`${fieldsOn} of ${RECORD_FIELD_KEYS.length} on. These change the add-an-employee form, not the menu.`}
            level={2}
          />
          <CardBody className="flex flex-col gap-4">
            <Callout tone="info" title="Turning one off does not change anybody's pay">
              A person who already has a TIN keeps it, payroll keeps filing with
              it, and their record still shows it. What stops is being asked for
              it on new records, and the payroll run still holds back anybody it
              cannot pay, for the same reasons as before.
            </Callout>
            <div className="flex flex-col divide-y divide-line">
              {RECORD_FIELD_KEYS.map(row)}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="For companies that need more detail"
            description="Depth inside something you already have on. Leave these off unless you recognise the situation."
            level={2}
          />
          <CardBody className="flex flex-col divide-y divide-line py-0">
            {ADVANCED_FEATURE_KEYS.map(row)}
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
