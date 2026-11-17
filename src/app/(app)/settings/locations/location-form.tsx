"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Callout,
  Checkbox,
  Disclosure,
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
import { GeofencePicker } from "@/components/geofence-picker/geofence-picker";
import {
  distanceMetres,
  fenceMoved,
  fieldsFromPin,
  pointFromFields,
  radiusFromField,
  readout,
  type Point,
} from "@/components/geofence-picker/sync";

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
 * ## The fence is drawn on a map, and the numbers are still there
 *
 * An office manager does not have a latitude to hand; they have an address and a
 * front door. So the fence is set on a map (`GeofencePicker`): search the
 * address, use where you are standing, or click, then drag the pin to the
 * entrance and watch the circle the radius draws. The map is free — OpenStreetMap
 * tiles and an address search the API makes on our behalf through Photon — and
 * both are best-effort public services, so the typed latitude and longitude stay
 * under "Enter coordinates by hand", synced both ways with the pin. If the map or
 * the search fails, those fields open on their own and the form still saves.
 *
 * ## The typed fields stay the truth
 *
 * The map writes the three strings below and reads the pin back from them (see
 * `geofence-picker/sync.ts`). There is one copy of each value, so the map and
 * the numbers cannot disagree.
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
 *
 * ## The Address field belongs to the person
 *
 * A place the search picked, or the map's nearest address, may fill the Address
 * field — but only while it is empty, checked when the answer arrives rather than
 * when it was asked for, so a slow answer never overwrites what somebody typed in
 * the meantime. If the pin then moves more than 100 m from where that address
 * came from, the form says the two may no longer match instead of rewriting it.
 */

/** Digits, one optional sign, one optional decimal point. Nothing else. */
const NUMERIC = /^-?\d*\.?\d*$/;

/** How far the pin may move from a filled-in address before we say so. */
const ADDRESS_DRIFT_METRES = 100;

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
  fenced:
    location?.radiusMetres !== null && location?.radiusMetres !== undefined,
  latitude:
    location?.latitude === null || location?.latitude === undefined
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

/** The fence on record, if the location has a whole one. */
function savedFence(
  location?: ApiWorkLocation,
): (Point & { radiusMetres: number }) | null {
  if (
    location?.latitude == null ||
    location.longitude == null ||
    location.radiusMetres == null
  ) {
    return null;
  }
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    radiusMetres: location.radiusMetres,
  };
}

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
  open,
  onClose,
  onSave,
}: {
  /** Absent when adding. */
  location?: ApiWorkLocation;
  open: boolean;
  onClose: () => void;
  onSave: (draft: LocationDraft) => Promise<void>;
}) {
  const editing = location !== undefined;
  const saved = savedFence(location);
  const [draft, setDraft] = useState<Draft>(() => toDraft(location));
  const [busy, setBusy] = useState(false);

  /* The latest draft, for answers that arrive after a render has moved on. */
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  });

  /* Hand entry starts open when there are numbers to show; it opens itself when
     the map cannot load, so nobody is left without a way to set the pin. */
  const [handOpen, setHandOpen] = useState(saved !== null);
  const [mapFailed, setMapFailed] = useState(false);
  const [flyRequest, setFlyRequest] = useState(0);

  /* Where a filled-in address came from, while it is still the one we filled. */
  const [addressFrom, setAddressFrom] = useState<{
    label: string;
    at: Point;
    origin: "search" | "reverse";
  } | null>(null);

  /* A fresh form every time the dialog opens.
   *
   * The screen keeps this component mounted while the dialog is closed, so the
   * Modal can play its exit animation (commit 0420bf84). That made the edit form's
   * state belong to the *first* render — no location — so every Edit opened blank
   * and a second Add opened with the first one's leftovers. So the draft is reset
   * here, during render, whenever the dialog opens or opens on a different location
   * (React's "adjust state while rendering" pattern: no effect, no blank frame). */
  const opening = open ? (location?.id ?? "new") : null;
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (opening !== openedFor) {
    setOpenedFor(opening);
    if (opening !== null) {
      setDraft(toDraft(location));
      setHandOpen(saved !== null);
      setMapFailed(false);
      setAddressFrom(null);
    }
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prior) => ({ ...prior, [key]: value }));

  const name = draft.name.trim();
  const latitude = draft.latitude.trim() === "" ? null : Number(draft.latitude);
  const longitude =
    draft.longitude.trim() === "" ? null : Number(draft.longitude);
  const radius =
    draft.radiusMetres.trim() === "" ? null : Number(draft.radiusMetres);

  const pin = pointFromFields(draft.latitude, draft.longitude);

  /* Each bound is the API's, so a refusal is caught here rather than after a
     round trip. Ranges rather than a shape check: -91 is a well-formed number
     and not a place. */
  const latitudeError =
    latitude !== null &&
    (Number.isNaN(latitude) || latitude < -90 || latitude > 90)
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

  /* ---------------------------------------------------------- map events */

  /* Every way the pin moves (search, click, drag, location, undo) writes the
     same three fields; how it moved only matters to the picker. */
  function placePin(point: Point) {
    setDraft((prior) => ({
      ...prior,
      ...fieldsFromPin(point, prior.radiusMetres),
    }));
  }

  function suggestAddress(
    label: string,
    origin: "search" | "reverse",
    at: Point,
  ) {
    /* Checked against the draft as it is now, not as it was when the search or
       the reverse lookup was asked for: a person who typed an address while the
       answer was on its way keeps what they typed. */
    if (latest.current.addressLine.trim() !== "") return;
    set("addressLine", label);
    setAddressFrom({ label, at, origin });
  }

  const addressDrifted =
    addressFrom !== null &&
    pin !== null &&
    draft.addressLine === addressFrom.label &&
    distanceMetres(addressFrom.at, pin) > ADDRESS_DRIFT_METRES;

  const moved = draft.fenced && fenceMoved(saved, pin);
  const removing = editing && saved !== null && !draft.fenced;

  const finishTyping = () => {
    if (pointFromFields(latest.current.latitude, latest.current.longitude)) {
      setFlyRequest((n) => n + 1);
    }
  };

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
      open={open}
      onClose={onClose}
      size={draft.fenced ? "lg" : "md"}
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

        <div className="flex flex-col gap-1.5">
          <Field
            optional
            label="Address"
            help="For the record, not for the fence."
          >
            <Input
              value={draft.addressLine}
              placeholder="12 Allen Avenue, Ikeja, Lagos"
              onChange={(e) => {
                const value = e.target.value;
                set("addressLine", value);
                setAddressFrom(null);
              }}
            />
          </Field>
          {addressFrom !== null &&
            draft.addressLine === addressFrom.label &&
            (addressDrifted ? (
              <p className="text-caption text-warning-text">
                Address may not match the pin.
              </p>
            ) : (
              <p className="text-caption text-muted">
                Filled from the map. Edit if needed.
              </p>
            ))}
        </div>

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

          {removing && (
            <Callout
              tone="warning"
              title="Saving removes this location's fence"
            >
              Staff here will be able to clock in from anywhere until a fence is
              set again.
            </Callout>
          )}

          {draft.fenced && (
            <>
              {mapFailed && (
                <Callout tone="warning" title="Map couldn't load">
                  Enter the coordinates below. They save exactly as a pin on the
                  map would.
                </Callout>
              )}

              <GeofencePicker
                key={openedFor ?? "closed"}
                pin={pin}
                radiusText={draft.radiusMetres}
                radiusError={radiusError}
                onRadiusText={(text) => set("radiusMetres", text)}
                saved={saved}
                addressQuery={draft.addressLine}
                wantsAddress={draft.addressLine.trim() === ""}
                flyRequest={flyRequest}
                onPin={placePin}
                onAddressSuggestion={suggestAddress}
                onMapFailed={() => {
                  setMapFailed(true);
                  setHandOpen(true);
                }}
                onMapRecovered={() => setMapFailed(false)}
              />

              <Disclosure
                dense
                title="Enter coordinates by hand"
                meta={
                  <span className="text-body-sm tabular-nums text-muted">
                    {readout(pin, radiusFromField(draft.radiusMetres))}
                  </span>
                }
                open={handOpen}
                onToggle={() => setHandOpen((open) => !open)}
              >
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
                      onBlur={finishTyping}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") finishTyping();
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
                      onBlur={finishTyping}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") finishTyping();
                      }}
                    />
                  </Field>
                </div>
              </Disclosure>

              {partial && (
                <Callout tone="warning" title="The fence is not finished">
                  {pin === null
                    ? "Place the pin on the map or enter the coordinates."
                    : `${GEOFENCE_ALL_OR_NOTHING} Choose a radius, or switch the check off: a fence with a piece missing decides nothing and would turn clock-ins down with no visible cause.`}
                </Callout>
              )}

              {moved && !partial && (
                <Callout tone="warning" title="The fence has moved">
                  Staff outside the new circle won&rsquo;t be able to clock in
                  once you save.
                </Callout>
              )}

              {draft.remoteAllowed && !partial && (
                <Callout tone="info" title="This fence will not be applied">
                  Staff here may clock in from anywhere, so the radius is kept
                  on the record and nothing checks against it. Turn that off to
                  make the fence bite.
                </Callout>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
