"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { DEFAULT_REGION, PIN_ZOOM, mapAttribution, mapTileUrl } from "./region";
import type { Point } from "./sync";

/**
 * The map itself: plain Leaflet, driven from props.
 *
 * ## Why not react-leaflet
 *
 * react-leaflet 5 is published under the Hippocratic License 2.1, which is not an
 * open-source licence and carries conditions a commercial product would have to
 * clear with a lawyer. Leaflet itself is BSD-2. One component that creates the map
 * in an effect and updates three layers is less code than the wrapper would save.
 *
 * ## Loaded only when the fence is switched on
 *
 * This file is imported through `next/dynamic` with `ssr: false` (see
 * `geofence-picker.tsx`): Leaflet touches `window` at import, and nobody who never
 * opens a fence should download it.
 *
 * ## The map is told, it does not decide
 *
 * Every coordinate comes in as a prop and every gesture goes out as a callback.
 * The pin, the circle and the saved fence are redrawn from props; the view moves
 * only when `flyKey` or `fitKey` changes, so typing a digit never yanks the map.
 *
 * ## Failure is detected, not assumed
 *
 * Tiles fail quietly in Leaflet: a grey square and an event nobody hears. So the
 * map reports failure when three tiles error before any loads, or when none has
 * loaded eight seconds after the map first had a size. The timer waits for a size
 * because a map mounted inside a modal that is still opening has none, requests
 * no tiles, and would otherwise be called broken while the network is fine. A tile
 * that arrives late reports recovery.
 *
 * ## Touch screens
 *
 * A full-width map inside a scrolling dialog swallows the finger that meant to
 * scroll the page. On a coarse pointer the map starts still, under a "Tap to move
 * the map" veil; a tap lifts it until the map loses focus. Leaflet has no built-in
 * two-finger pan and the plugins for it are unmaintained, so this is the whole of
 * the gesture handling. A mouse pans at once but only zooms on the wheel after a
 * click, so scrolling the dialog past the map does not zoom it.
 */

const FAILED_TILES = 3;
const FIRST_TILE_MS = 8_000;

export type GeofenceMapProps = {
  pin: Point | null;
  radiusMetres: number | null;
  saved: (Point & { radiusMetres: number }) | null;
  points?: Point[];
  /** Change it to move the view to the pin and fit the circle. */
  flyKey: number;
  /** Change it to fit the circle without moving the centre first. */
  fitKey: number;
  onPick: (point: Point, how: "click" | "drag") => void;
  onFailed: () => void;
  onRecovered: () => void;
  className?: string;
};

/** The pin: an accent dot with a white ring, inside a 44 px target for a thumb. */
const pinIcon = L.divIcon({
  className: "",
  html: '<span class="flex size-11 items-center justify-center"><span class="block size-7 rounded-full border-[3px] border-white bg-accent shadow-md"></span></span>',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

function accent(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

const toLatLng = (p: Point) => L.latLng(p.latitude, p.longitude);

export default function GeofenceMap({
  pin,
  radiusMetres,
  saved,
  points,
  flyKey,
  fitKey,
  onPick,
  onFailed,
  onRecovered,
  className,
}: GeofenceMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const circle = useRef<L.Circle | null>(null);
  const savedCircle = useRef<L.Circle | null>(null);
  const dots = useRef<L.LayerGroup | null>(null);
  /* Whether the view has been fitted to a fence yet. Later fits are asked for. */
  const framed = useRef(false);
  const [touch] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches === true,
  );
  const [veiled, setVeiled] = useState(touch);

  /* Callbacks change identity every render; the map's listeners are bound once. */
  const handlers = useRef({ onPick, onFailed, onRecovered });
  useEffect(() => {
    handlers.current = { onPick, onFailed, onRecovered };
  });

  /* --------------------------------------------------------- create, destroy */
  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const start = pin ?? DEFAULT_REGION.centre;
    const m = L.map(el, {
      center: toLatLng(start),
      zoom: pin ? PIN_ZOOM : DEFAULT_REGION.zoom,
      scrollWheelZoom: false,
      dragging: !touch,
      zoomControl: true,
      attributionControl: true,
    });
    m.attributionControl.setPrefix(false);
    map.current = m;

    const tiles = L.tileLayer(mapTileUrl(), {
      attribution: mapAttribution(),
      maxZoom: 19,
      crossOrigin: false,
    }).addTo(m);

    let loaded = false;
    let failures = 0;
    let failed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fail = () => {
      if (failed || loaded) return;
      failed = true;
      handlers.current.onFailed();
    };
    tiles.on("tileload", () => {
      if (!loaded) {
        loaded = true;
        if (timer) clearTimeout(timer);
        if (failed) handlers.current.onRecovered();
        failed = false;
      }
    });
    tiles.on("tileerror", () => {
      failures += 1;
      if (failures >= FAILED_TILES) fail();
    });

    m.on("click", (event: L.LeafletMouseEvent) => {
      m.scrollWheelZoom.enable();
      handlers.current.onPick(
        { latitude: event.latlng.lat, longitude: event.latlng.lng },
        "click",
      );
    });

    /* Size: the dialog opens with an animation and grows from md to lg when the
       fence switches on. Leaflet measures once; this re-measures every time the
       box changes and starts the first-tile clock only once there is a box. */
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      m.invalidateSize();
      if (!timer && !loaded) timer = setTimeout(fail, FIRST_TILE_MS);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      m.remove();
      map.current = null;
      marker.current = null;
      circle.current = null;
      savedCircle.current = null;
      dots.current = null;
    };
    /* Created once per mount. The view and layers follow props in the effects below. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------- the pin */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pin) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const made = L.marker(toLatLng(pin), {
        icon: pinIcon,
        draggable: true,
        keyboard: false,
        title: "Drag to the entrance",
      }).addTo(m);
      made.on("dragend", () => {
        const at = made.getLatLng();
        handlers.current.onPick(
          { latitude: at.lat, longitude: at.lng },
          "drag",
        );
      });
      marker.current = made;
    } else {
      marker.current.setLatLng(toLatLng(pin));
    }
  }, [pin]);

  /* ---------------------------------------------------------- the circle */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pin || radiusMetres === null) {
      circle.current?.remove();
      circle.current = null;
      return;
    }
    const color = accent("--color-accent", "#2b3990");
    if (!circle.current) {
      circle.current = L.circle(toLatLng(pin), {
        radius: radiusMetres,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.15,
        interactive: false,
      }).addTo(m);
      /* The first circle of an edit: open on the whole fence, not a street-level
         crop of its middle. Instant, because nobody has looked at the map yet. */
      if (!framed.current) {
        framed.current = true;
        m.fitBounds(circle.current.getBounds(), {
          maxZoom: PIN_ZOOM,
          padding: [24, 24],
          animate: false,
        });
      }
    } else {
      circle.current.setLatLng(toLatLng(pin));
      circle.current.setRadius(radiusMetres);
    }
  }, [pin, radiusMetres]);

  /* ------------------------------------------------- the fence on record */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    savedCircle.current?.remove();
    savedCircle.current = null;
    if (!saved) return;
    savedCircle.current = L.circle(toLatLng(saved), {
      radius: saved.radiusMetres,
      color: accent("--color-accent", "#2b3990"),
      opacity: 0.5,
      weight: 2,
      dashArray: "6 6",
      fill: false,
      interactive: false,
    }).addTo(m);
  }, [saved]);

  /* ------------------------------------------------ other points, if any */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    dots.current?.remove();
    dots.current = null;
    if (!points?.length) return;
    dots.current = L.layerGroup(
      points.map((p) =>
        L.circleMarker(toLatLng(p), {
          radius: 3,
          color: "#8a8f98",
          fillColor: "#8a8f98",
          fillOpacity: 0.8,
          weight: 0,
          interactive: false,
        }),
      ),
    ).addTo(m);
  }, [points]);

  /* --------------------------------------------------------- moving the view */
  useEffect(() => {
    const m = map.current;
    if (!m || !pin || flyKey === 0) return;
    if (circle.current) {
      m.flyToBounds(circle.current.getBounds(), {
        maxZoom: PIN_ZOOM,
        padding: [24, 24],
      });
    } else {
      m.flyTo(toLatLng(pin), PIN_ZOOM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyKey]);

  useEffect(() => {
    const m = map.current;
    if (!m || fitKey === 0 || !circle.current) return;
    m.flyToBounds(circle.current.getBounds(), {
      maxZoom: PIN_ZOOM,
      padding: [24, 24],
    });
  }, [fitKey]);

  /* ------------------------------------------------------------ touch veil */
  const lift = () => {
    setVeiled(false);
    map.current?.dragging.enable();
  };
  const settle = () => {
    map.current?.scrollWheelZoom.disable();
    if (!touch) return;
    map.current?.dragging.disable();
    setVeiled(true);
  };

  return (
    <div
      className={cn(
        "geofence-map relative isolate overflow-hidden rounded-lg border border-line",
        className,
      )}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          settle();
      }}
    >
      <div
        ref={host}
        role="region"
        aria-label="Map. Use the coordinates fields to set the pin with a keyboard."
        tabIndex={0}
        className="h-[280px] w-full cursor-crosshair bg-canvas sm:h-[360px]"
      />
      {veiled && (
        <button
          type="button"
          onClick={lift}
          className="absolute inset-0 z-[500] flex items-end justify-center bg-ink/5 pb-4"
        >
          <span className="rounded-full bg-surface px-3 py-1.5 text-body-sm text-ink shadow">
            Tap to move the map
          </span>
        </button>
      )}
    </div>
  );
}
