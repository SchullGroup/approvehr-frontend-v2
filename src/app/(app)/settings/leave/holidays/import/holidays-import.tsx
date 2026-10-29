"use client";

import { useMemo } from "react";
import { ImportFlow } from "@/components/imports/import-flow";
import { holidayImportSurface } from "./surface";

/**
 * The client boundary. A surface carries functions, which cannot cross a
 * server-to-client prop boundary — see `people/attendance/import` — so it is
 * built here from the one plain value the page can pass: the default year.
 */
export function HolidaysImport({ defaultYear }: { defaultYear: number }) {
  const surface = useMemo(
    () => holidayImportSurface(defaultYear),
    [defaultYear],
  );
  return <ImportFlow surface={surface} />;
}
