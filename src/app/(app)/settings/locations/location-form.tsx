"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Checkbox,
  Field,
  Input,
  Modal,
  Switch,
} from "@/components/ui";
import {
  GEOFENCE_ALL_OR_NOTHING,
  GEOFENCE_EXPLANATION,
  type ApiWorkLocation,
} from "@/lib/api/attendance";

/**
 * Adding or editing one work location.
 *
 * ## The geofence is opt-in, and the form is arranged to say so
 *
 * Three quarters of companies will never draw one. So the fence is behind a
 * switch that starts off, the name and address sit above it, and nothing about
 * the form implies coordinates are expected. This matches the API, which takes
 * a name alone and refuses **two thirds** of a fence — a latitude with no radius
 * decides nothing, and a fence that silently never matches turns clock-ins down
 * with no visible cause.
 *
 * ## Why there is no map, and what stands in for one
 *
 * A map needs a tile provider, which is a credential nobody has wired, and the
 * seam pattern in this codebase is explicit that a capability we cannot perform
 * is declared rather than faked. What actually makes coordinates usable without
 * one is a sentence saying what a radius *does* — see `GEOFENCE_EXPLANATION`,
 * which is written once in `lib/api/attendance.ts` so this form and the table
 * cannot come to describe it differently — plus a hint about where the numbers
 * come from, because "latitude" is not a thing an office manager has to hand.
 *
 * ## One `onSave`, and the whole location in it
 *
 * The form hands back every field, always, with `null` where a value is absent —
 * not a create body and not a patch. Two callbacks were the first shape and it
 * meant the add form carried an unreachable `onUpdate` and the edit form an
 * unreachable `onCreate`, which is two dead arms somebody has to read past. The
 * screen converts: a patch takes this straight, and a create drops the nulls,
 * because the API's create schema has no way to say "no fence" other than
 * silence.
 *
 * ## Three fields, one value each, and blank is a real state
 *
 * The inputs hold **strings**, not numbers. `Number("")` is 0, and 0 is a real
 * latitude — the equator — so parsing on every keystroke would turn a cleared
 * field into a fence off the coast of Ghana. The strings are parsed once, on
 * save, and a blank one is `undefined` rather than zero.
 */

/** Digits, one optional sign, one optional decimal point. Nothing else. */
const NUMERIC = /^-?\d*\.?\d*$/;

type Draft = {
  name: string;
  addressLine: string;
  remoteAllowed: boolean;
  fenced: boolean;
  latitude: string;
  longitude: string;
  radiusMetres: string;
};

const toDraft = (location?: ApiWorkLocation): Draft => ({
  name: location?.name ?? "",
  addressLine: location?.addressLine ?? "",
  remoteAllowed: location?.remoteAllowed ?? false,
  fenced: location?.radiusMetres !== null && location?.radiusMetres !== undefined,
  latitude: location?.latitude === null || location?.latitude === undefined
    ? ""
    : String(location.latitude),
  longitude:
    location?.longitude === null || location?.longitude === undefined
      ? ""
      : String(location.longitude),
  radiusMetres:
    location?.radiusMetres === null || location?.radiusMetres === undefined
      ? ""
      : String(location.radiusMetres),
});

/** Every field the form owns, with `null` for absent. Not a create, not a patch. */
export type LocationDraft = {
  name: string;
  addressLine: string | null;
  remoteAllowed: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusMetres: number | null;
};

export function LocationForm({
  location,
  onClose,
  onSave,
}: {
  /** Absent when adding. */
  location?: ApiWorkLocation;
  onClose: () => void;
  onSave: (draft: LocationDraft) => Promise<void>;
}) {
  const editing = location !== undefined;
  const [draft, setDraft] = useState<Draft>(() => toDraft(location));
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prior) => ({ ...prior, [key]: value }));

  const name = draft.name.trim();
  const latitude = draft.latitude.trim() === "" ? null : Number(draft.latitude);
  const longitude = draft.longitude.trim() === "" ? null : Number(draft.longitude);
  const radius =
    draft.radiusMetres.trim() === "" ? null : Number(draft.radiusMetres);

  /* Each bound is the API's, so a refusal is caught here rather than after a
     round trip. Ranges rather than a shape check: -91 is a well-formed number
     and not a place. */
  const latitudeError =
    latitude !== null && (Number.isNaN(latitude) || latitude < -90 || latitude > 90)
      ? "Latitude runs from -90 to 90."
      : undefined;
  const longitudeError =
    longitude !== null &&
    (Number.isNaN(longitude) || longitude < -180 || longitude > 180)
      ? "Longitude runs from -180 to 180."
      : undefined;
  const radiusError =
    radius !== null && (Number.isNaN(radius) || radius < 10 || radius > 50_000)
      ? "A radius is between 10 metres and 50 kilometres."
      : undefined;

  /* The API's all-or-nothing rule, in its own sentence. Shown while the fence is
     switched on and incomplete, so nobody presses save to find out. */
  const partial =
    draft.fenced &&
    [latitude, longitude, radius].filter((part) => part !== null).length !== 3;

  const canSave =
    name.length >= 2 &&
    !busy &&
    !partial &&
    !latitudeError &&
    !longitudeError &&
    !radiusError;

  async function save() {
    setBusy(true);
    try {
      /* The fence switched off sends nulls rather than omitting the fields: on an
         edit that is what *removes* a fence, and a create has nothing to remove
         so the screen drops them. Either way the form states all six values. */
      const fence = draft.fenced && !partial;
      await onSave({
        name,
        addressLine:
          draft.addressLine.trim() === "" ? null : draft.addressLine.trim(),
        remoteAllowed: draft.remoteAllowed,
        latitude: fence ? latitude : null,
        longitude: fence ? longitude : null,
        radiusMetres: fence ? radius : null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={editing ? `Edit ${location.name}` : "Add a work location"}
      description={
        editing
          ? undefined
          : "One for each place people report to. A company with five branches sets five."
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!canSave}
            loading={busy}
            onClick={() => void save()}
          >
            {editing ? "Save" : "Add location"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Name"
          required
          help="What people call it. It appears on the clock-in screen and on every timesheet."
        >
          <Input
            value={draft.name}
            autoFocus={!editing}
            placeholder="Ikeja branch"
            onChange={(e) => {
              const value = e.target.value;
              set("name", value);
            }}
          />
        </Field>

        <Field label="Address" help="Optional. For the record, not for the fence.">
          <Input
            value={draft.addressLine}
            placeholder="12 Allen Avenue, Ikeja, Lagos"
            onChange={(e) => {
              const value = e.target.value;
              set("addressLine", value);
            }}
          />
        </Field>

        <Checkbox
          label="Staff may clock in from anywhere"
          description={
            draft.remoteAllowed
              ? "A clock-in is accepted wherever they are. Any geofence below is kept on the record but nothing applies it."
              : "A clock-in is only accepted inside the geofence, if one is set below."
          }
          checked={draft.remoteAllowed}
          onChange={(e) => {
            const next = e.target.checked;
            set("remoteAllowed", next);
          }}
        />

        <div className="flex flex-col gap-4 rounded-lg border border-line bg-canvas p-4">
          <Switch
            label="Check where the clock-in came from"
            description={GEOFENCE_EXPLANATION}
            checked={draft.fenced}
            onChange={(e) => {
              const next = e.target.checked;
              set("fenced", next);
            }}
          />

          {draft.fenced && (
            <>
              <p className="text-body-sm text-muted">
                Stand at the entrance, open any maps app, and read the two
                numbers off the pin — latitude first. Six decimal places is
                about a metre; four is about ten.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Latitude" required error={latitudeError}>
                  <Input
                    inputMode="decimal"
                    value={draft.latitude}
                    placeholder="6.601838"
                    onChange={(e) => {
                      const value = e.target.value;
                      if (NUMERIC.test(value)) set("latitude", value);
                    }}
                  />
                </Field>
                <Field label="Longitude" required error={longitudeError}>
                  <Input
                    inputMode="decimal"
                    value={draft.longitude}
                    placeholder="3.350890"
                    onChange={(e) => {
                      const value = e.target.value;
                      if (NUMERIC.test(value)) set("longitude", value);
                    }}
                  />
                </Field>
              </div>

              <Field
                label="Radius, in metres"
                required
                error={radiusError}
                help="150 covers a building and its car park. 1,000 covers a small industrial estate."
              >
                <Input
                  inputMode="numeric"
                  value={draft.radiusMetres}
                  placeholder="150"
                  onChange={(e) => {
                    const value = e.target.value;
                    if (NUMERIC.test(value)) set("radiusMetres", value);
                  }}
                />
              </Field>

              {partial && (
                <Callout tone="warning" title="The fence is not finished">
                  {GEOFENCE_ALL_OR_NOTHING} Fill all three in, or switch the
                  check off — a fence with a piece missing decides nothing and
                  would turn clock-ins down with no visible cause.
                </Callout>
              )}

              {draft.remoteAllowed && !partial && (
                <Callout tone="info" title="This fence will not be applied">
                  Staff here may clock in from anywhere, so the radius is kept on
                  the record and nothing checks against it. Turn that off to make
                  the fence bite.
                </Callout>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
