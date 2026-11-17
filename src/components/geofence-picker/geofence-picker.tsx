"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import { LocateFixed, MapPinOff, Search } from "lucide-react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  attendanceApi,
  geocodeFailure,
  type ApiPlace,
} from "@/lib/api/attendance";
import { PositionError, readPosition } from "@/lib/geolocation";
import { RADIUS_PRESETS } from "./region";
import { radiusFromField, type Point } from "./sync";

/**
 * Where a clock-in counts: search for the office, use where you stand, or drop the
 * pin on the map, and see the circle the radius draws.
 *
 * ## What this owns, and what it hands back
 *
 * The picker has no form state of its own, so the setup wizard can use it too. The
 * form owns the three typed fields and the Address field; this component owns the
 * search box, the map, the "use my location" request and a one-step undo, and it
 * reports what happened:
 *
 * - `onPin(point, how)` — the pin moved. The form writes the fields (and a default
 *   radius if there is none; see `fieldsFromPin`).
 * - `onAddressSuggestion(label, origin, at)` — a place name the form may put in an
 *   empty Address field. The form decides, because only it knows whether the
 *   field is still empty when the answer arrives.
 * - `onMapFailed` / `onMapRecovered` — the map could not load, or came back. The
 *   form opens the typed fields so nobody is stuck.
 *
 * ## Address search, politely
 *
 * The box is prefilled from the Address field but does not search on its own:
 * opening an edit form must not cost a call to a free public service. It searches
 * after somebody types (350 ms after the last key, two letters or more) or presses
 * Enter or Search, and only the newest request may answer — an earlier, slower one
 * is cancelled, so "Ade" can never replace the results for "Adeola Odeku".
 *
 * A reverse lookup (point → address) is asked for only when the form says the
 * Address field is empty (`wantsAddress`), only after a click, a drag ends or a
 * location fix — never during a drag, and never after a search pick, which already
 * named the place.
 */

const GeofenceMap = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

function MapSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-[280px] w-full animate-pulse rounded-lg border border-line bg-canvas sm:h-[360px]"
    />
  );
}

const SEARCH_DELAY_MS = 350;
const UNDO_MS = 6_000;

export type PinOrigin = "search" | "click" | "drag" | "location" | "undo";

export type GeofencePickerProps = {
  /** The pin the typed fields describe, or `null` while they describe none. */
  pin: Point | null;
  /** The radius field's text. The picker reads and writes it; the form validates it. */
  radiusText: string;
  radiusError?: string | undefined;
  onRadiusText: (text: string) => void;
  /** The fence on record, drawn dashed while it is being moved. */
  saved?: (Point & { radiusMetres: number }) | null;
  /** The Address field, to prefill the search box. */
  addressQuery: string;
  /** True while the Address field is empty, so a reverse lookup is worth asking for. */
  wantsAddress: boolean;
  /** Increment to move the map to the pin (the form does this when typing ends). */
  flyRequest: number;
  onPin: (point: Point, how: PinOrigin) => void;
  onAddressSuggestion: (
    label: string,
    origin: "search" | "reverse",
    at: Point,
  ) => void;
  onMapFailed: () => void;
  onMapRecovered: () => void;
  /** Other points to show as grey dots. Nothing passes these yet. */
  points?: Point[];
};

type SearchState =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "results"; places: ApiPlace[]; query: string }
  | { kind: "failed"; message: string };

type Locating =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "found"; accuracy: number }
  | { kind: "failed"; title: string; message: string };

export function GeofencePicker({
  pin,
  radiusText,
  radiusError,
  onRadiusText,
  saved = null,
  addressQuery,
  wantsAddress,
  flyRequest,
  onPin,
  onAddressSuggestion,
  onMapFailed,
  onMapRecovered,
  points,
}: GeofencePickerProps) {
  const listId = useId();
  const [query, setQuery] = useState(addressQuery);
  const [touched, setTouched] = useState(false);
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [locating, setLocating] = useState<Locating>({ kind: "idle" });
  const [undo, setUndo] = useState<Point | null>(null);
  const [flyKey, setFlyKey] = useState(0);
  const [fitKey, setFitKey] = useState(0);

  const searchAbort = useRef<AbortController | null>(null);
  const reverseAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      searchAbort.current?.abort();
      reverseAbort.current?.abort();
    };
  }, []);

  const radius = radiusFromField(radiusText);

  /* ------------------------------------------------------------- search */
  async function runSearch(text: string) {
    const q = text.trim();
    if (q.length < 2) {
      setSearch({ kind: "idle" });
      return;
    }
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearch({ kind: "searching" });
    setOpen(true);
    try {
      const places = await attendanceApi.geocodeSearch(q, controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      setSearch({ kind: "results", places, query: q });
      setActive(places.length ? 0 : -1);
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return;
      setSearch({ kind: "failed", message: geocodeFailure(error) });
    }
  }

  /* Debounced type-ahead, only after the person has typed in the box. */
  useEffect(() => {
    if (!touched) return;
    const id = setTimeout(() => void runSearch(query), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [query, touched]);

  function pick(place: ApiPlace) {
    const at = { latitude: place.latitude, longitude: place.longitude };
    setOpen(false);
    setUndo(null);
    onPin(at, "search");
    onAddressSuggestion(place.label, "search", at);
    setFlyKey((k) => k + 1);
  }

  /* --------------------------------------------------------- reverse */
  async function suggestAddress(at: Point) {
    if (!wantsAddress) return;
    reverseAbort.current?.abort();
    const controller = new AbortController();
    reverseAbort.current = controller;
    try {
      const place = await attendanceApi.geocodeReverse(at, controller.signal);
      if (controller.signal.aborted || !mounted.current || !place) return;
      onAddressSuggestion(place.label, "reverse", at);
    } catch {
      /* A suggestion that does not come is not an error anybody needs to read. */
    }
  }

  /* ---------------------------------------------------------- map gestures */
  function onMapPick(at: Point, how: "click" | "drag") {
    if (how === "click" && pin) {
      setUndo(pin);
    } else {
      setUndo(null);
    }
    onPin(at, how);
    void suggestAddress(at);
  }

  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(id);
  }, [undo]);

  /* ------------------------------------------------------ my location */
  async function locateMe() {
    setLocating({ kind: "busy" });
    try {
      const fix = await readPosition();
      /* `getCurrentPosition` cannot be cancelled; an answer after the dialog has
         closed is simply dropped. */
      if (!mounted.current) return;
      const at = { latitude: fix.latitude, longitude: fix.longitude };
      setUndo(null);
      onPin(at, "location");
      setFlyKey((k) => k + 1);
      setLocating({ kind: "found", accuracy: Math.round(fix.accuracyMetres) });
      void suggestAddress(at);
    } catch (error) {
      if (!mounted.current) return;
      setLocating(
        error instanceof PositionError
          ? { kind: "failed", title: error.title, message: error.message }
          : {
              kind: "failed",
              title: "Your location could not be read",
              message: "Try again, or click the map.",
            },
      );
    }
  }

  /* ---------------------------------------------------------- radius */
  function choosePreset(value: number) {
    onRadiusText(String(value));
    setFitKey((k) => k + 1);
  }

  const inaccurate =
    locating.kind === "found" && radius !== null && locating.accuracy > radius;

  const showList = open && search.kind !== "idle";
  const places = search.kind === "results" ? search.places : [];

  return (
    <div className="flex flex-col gap-3">
      {/* Search, and where you are standing */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="relative min-w-0 flex-1">
          <div className="flex gap-2">
            <Input
              aria-label="Search for the office address"
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                showList && active >= 0 ? `${listId}-${active}` : undefined
              }
              icon={<Search aria-hidden="true" />}
              placeholder="Search for the office address"
              value={query}
              onChange={(e) => {
                const value = e.target.value;
                setQuery(value);
                setTouched(true);
              }}
              onFocus={() => {
                if (search.kind !== "idle") setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && places.length) {
                  e.preventDefault();
                  setOpen(true);
                  setActive((i) => (i + 1) % places.length);
                } else if (e.key === "ArrowUp" && places.length) {
                  e.preventDefault();
                  setActive((i) => (i <= 0 ? places.length - 1 : i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const chosen =
                    showList && active >= 0 ? places[active] : undefined;
                  if (chosen) pick(chosen);
                  else void runSearch(query);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
            />
            {!touched && query.trim().length >= 2 && (
              <Button variant="secondary" onClick={() => void runSearch(query)}>
                Search
              </Button>
            )}
          </div>

          {showList && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Places found"
              className="absolute inset-x-0 top-full z-[1000] mt-1 max-h-72 overflow-auto rounded-lg border border-line bg-surface p-1 shadow-lg"
            >
              {search.kind === "searching" && (
                <li
                  className="px-3 py-2 text-body-sm text-muted"
                  aria-live="polite"
                >
                  Searching…
                </li>
              )}
              {search.kind === "failed" && (
                <li
                  className="px-3 py-2 text-body-sm text-muted"
                  aria-live="polite"
                >
                  {search.message}
                </li>
              )}
              {search.kind === "results" && places.length === 0 && (
                <li
                  className="px-3 py-2 text-body-sm text-muted"
                  aria-live="polite"
                >
                  No places match &ldquo;{search.query}&rdquo;. Try a street or
                  area name, or click the map.
                </li>
              )}
              {places.map((place, index) => {
                const [first, ...rest] = place.label.split(", ");
                return (
                  <li
                    key={`${place.label}-${place.latitude}-${place.longitude}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(place)}
                    onMouseEnter={() => setActive(index)}
                    className={cn(
                      "cursor-pointer rounded-md px-3 py-2 text-body-sm",
                      index === active ? "bg-accent-soft" : "hover:bg-canvas",
                    )}
                  >
                    <span className="text-ink">{first}</span>
                    {rest.length > 0 && (
                      <span className="text-muted">, {rest.join(", ")}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Button
          variant="secondary"
          className="shrink-0"
          loading={locating.kind === "busy"}
          onClick={() => void locateMe()}
        >
          <LocateFixed aria-hidden="true" className="size-4" />
          {locating.kind === "busy"
            ? "Finding you…"
            : "Use my current location"}
        </Button>
      </div>
      <p className="-mt-1 text-caption text-muted">
        {locating.kind === "found"
          ? `Accurate to about ${locating.accuracy.toLocaleString("en-NG")} m.`
          : "Search for the office, click the map, or use your location while standing at the entrance."}
      </p>

      {locating.kind === "failed" && (
        <Callout tone="warning" title={locating.title}>
          {locating.message}
        </Callout>
      )}
      {inaccurate && locating.kind === "found" && (
        <Callout tone="warning" title="Your location is rough">
          Your location is only accurate to about{" "}
          {locating.accuracy.toLocaleString("en-NG")} m, wider than the fence.
          Move outdoors and try again, or make the radius bigger.
        </Callout>
      )}

      <GeofenceMap
        pin={pin}
        radiusMetres={radius}
        saved={saved}
        {...(points ? { points } : {})}
        /* Either side may ask the map to move: the form when typed coordinates
           are finished (blur or Enter), the picker after a search pick or a
           location fix. The sum changes whenever either does. */
        flyKey={flyKey + flyRequest}
        fitKey={fitKey}
        onPick={onMapPick}
        onFailed={onMapFailed}
        onRecovered={onMapRecovered}
      />

      {undo && (
        <p
          className="flex items-center gap-2 text-body-sm text-muted"
          aria-live="polite"
        >
          <MapPinOff aria-hidden="true" className="size-4" />
          Pin moved.
          <button
            type="button"
            className="font-medium text-accent-text underline-offset-2 hover:underline"
            onClick={() => {
              onPin(undo, "undo");
              setUndo(null);
            }}
          >
            Undo
          </button>
        </p>
      )}

      {/* The radius, beside the circle it draws */}
      <Field
        label="Radius, in metres"
        required
        error={radiusError}
        help="Phones indoors are often 30 to 100 m off. 150 m suits most single-building offices."
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            className="sm:w-32"
            inputMode="numeric"
            value={radiusText}
            placeholder="150"
            suffix="m"
            onChange={(e) => {
              const value = e.target.value;
              if (/^\d*$/.test(value)) onRadiusText(value);
            }}
            onBlur={() => {
              if (radius !== null) setFitKey((k) => k + 1);
            }}
          />
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Common radii"
          >
            {RADIUS_PRESETS.map((preset) => {
              const selected = radius === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => choosePreset(preset)}
                  className={cn(
                    "min-h-9 rounded-full border px-3 text-body-sm tabular-nums transition-colors",
                    selected
                      ? "border-accent bg-accent-soft text-accent-text"
                      : "border-line bg-surface text-ink hover:border-line-strong hover:bg-canvas",
                  )}
                >
                  {preset.toLocaleString("en-NG")} m
                </button>
              );
            })}
          </div>
        </div>
      </Field>
    </div>
  );
}
