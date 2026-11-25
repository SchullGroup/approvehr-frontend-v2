"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useCan } from "@/lib/permissions";
import { SectionsDialog } from "../sections-dialog";

/**
 * Where the company's competencies are written, once.
 *
 * They used to be reached from every appraisal period, so each period felt like
 * it needed its own set-up. A competency belongs to the company: it is written
 * here, and every new period asks it by itself. Mounted on first open and kept
 * after, so the two reads behind the dialog are not spent on every visit and
 * the dialog can still play its exit.
 */
export function EditCompetenciesButton() {
  const canManage = useCan("MANAGE_SETTINGS");
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  if (!canManage) return null;
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          setEverOpened(true);
          setOpen(true);
        }}
      >
        Edit competencies
      </Button>
      {everOpened && (
        <SectionsDialog open={open} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
