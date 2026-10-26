"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Field,
  Input,
  LoadState,
  useToast,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import type { ApiWellnessSettings } from "@/lib/api/wellness";
import { useCan } from "@/lib/permissions";
import { useWellnessActions, useWellnessSettings } from "@/lib/store/wellness";
import { NotYours } from "./wellness-shell";

/**
 * Settings: the privacy floor, for whoever runs the company's programme.
 *
 * ## What the floor is
 *
 * The smallest group an employer is ever shown a number for. A count of two
 * people is itself a fact about two people, so below the floor the number is
 * withheld along with whatever was measured, and a challenge nobody joined looks
 * the same to the employer as one that two people joined.
 *
 * ## It can be raised and never lowered past 3
 *
 * Three layers hold that line on the server (the request, the service and a
 * database check), and this field holds it too, so a number below the minimum
 * cannot be sent from here. The minimum and maximum are read from the API rather
 * than written here, so the field and the server cannot disagree about them.
 *
 * ## It never un-promises anything
 *
 * Each person is told the floor in force when they join, and a challenge's
 * results use the highest of that and the company's current setting. So lowering
 * the number later cannot expose somebody who agreed to be shown only in a
 * larger group, and raising it hides smaller groups at once.
 */

export function SettingsScreen() {
  const canManage = useCan("MANAGE_SETTINGS");
  if (!canManage) return <NotYours />;
  return <FloorCard />;
}

function FloorCard() {
  const settings = useWellnessSettings();
  const s = settings.data;

  return (
    <LoadState
      loading={settings.loading}
      error={settings.error}
      onRetry={settings.reload}
      hasData={s !== null}
      subject="the wellness settings"
      skeleton="list"
    >
      {s && (
        <FloorForm
          key={s.privacyFloor}
          settings={s}
          onSaved={settings.reload}
        />
      )}
    </LoadState>
  );
}

function FloorForm({
  settings,
  onSaved,
}: {
  settings: ApiWellnessSettings;
  onSaved: () => void;
}) {
  const actions = useWellnessActions();
  const toast = useToast();
  const {
    privacyFloor,
    privacyFloorMinimum: min,
    privacyFloorMaximum: max,
  } = settings;
  const [text, setText] = useState(String(privacyFloor));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const value = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
  const invalid =
    value === null || value < min || value > max
      ? `Use a whole number from ${String(min)} to ${String(max)}.`
      : null;
  const unchanged = value === privacyFloor;

  const save = async () => {
    if (invalid || value === null) return;
    setBusy(true);
    setProblem(null);
    try {
      await actions.setPrivacyFloor(value);
      toast.push({
        tone: "success",
        title: `The floor is now ${String(value)}`,
      });
      onSaved();
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader
        level={2}
        title={
          <span className="flex items-center gap-2">
            Privacy floor
            <InfoTooltip
              id="wellness-floor-setting"
              label="About the privacy floor"
              text="An employer is shown a count or a total only once at least this many people are in it, and never anybody's own figure. Raising it hides smaller groups at once. Lowering it never exposes people who joined under a higher number."
            />
          </span>
        }
        description="The smallest group an employer is ever shown a number for."
      />
      <CardBody>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field
            label="People"
            help={`Never lower than ${String(min)}, and at most ${String(max)}.`}
            {...(text !== String(privacyFloor) && invalid
              ? { error: invalid }
              : problem
                ? { error: problem }
                : {})}
          >
            <Input
              inputMode="numeric"
              autoComplete="off"
              className="max-w-32"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setProblem(null);
              }}
            />
          </Field>
        </form>
      </CardBody>
      <CardFooter>
        <span className="text-meta text-muted">
          In force now, {privacyFloor}
        </span>
        <Button
          variant="accent"
          loading={busy}
          disabled={invalid !== null || unchanged}
          onClick={() => void save()}
        >
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}
