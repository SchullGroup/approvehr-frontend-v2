"use client";

import { useState } from "react";
import { Card, CardBody, Disclosure, Switch, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { RECORD_FIELD_KEYS, type RecordFieldKey } from "@/lib/api/setup";
import { FEATURE_COPY, useFeatureSettings } from "@/lib/store/features";

/**
 * What an employee record asks for — on the Directory, closed by default.
 *
 * The three `RECORD_FIELD_KEYS` flags are the only genuinely toggle-shaped
 * "Core HR settings" that belong here: they decide whether the add-employee
 * form and every record ask for tax, pension or bank fields. `/settings/roles`
 * (a full permission editor) and the company tax-state field on
 * `/settings/company` (a single, save-immediately field) are deliberately not
 * moved here — neither fits a bar of switches. Reuses `useFeatureSettings()`
 * and `FEATURE_COPY`, the same store and copy `/settings/features` already
 * reads and writes, so there is one underlying value with two doors onto it.
 */
export function DirectoryFieldSettings() {
  const features = useFeatureSettings();
  const toast = useToast();
  const [pending, setPending] = useState<RecordFieldKey | null>(null);

  if (!features.editable) return null;

  const toggle = async (key: RecordFieldKey, value: boolean) => {
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

  const fieldsOn = RECORD_FIELD_KEYS.filter(
    (key) => features.flags[key],
  ).length;

  return (
    <Disclosure
      title="What an employee record asks for"
      hint={`${fieldsOn} of ${RECORD_FIELD_KEYS.length} on. These change the add-an-employee form and every record, not the modules menu.`}
    >
      <Card>
        <CardBody className="flex flex-col divide-y divide-line py-0">
          {RECORD_FIELD_KEYS.map((key) => (
            <div key={key} className="py-4">
              <Switch
                label={FEATURE_COPY[key].label}
                description={FEATURE_COPY[key].line}
                checked={features.flags[key]}
                disabled={features.loading || pending === key}
                onChange={(event) => void toggle(key, event.target.checked)}
              />
            </div>
          ))}
        </CardBody>
      </Card>
    </Disclosure>
  );
}
