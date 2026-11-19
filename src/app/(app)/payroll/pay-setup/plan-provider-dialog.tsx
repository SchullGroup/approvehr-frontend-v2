"use client";

import { useState } from "react";
import { Button, Field, Input, Modal, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiBenefitPlan } from "@/lib/api/benefits";
import { useBenefitMutations } from "@/lib/store/benefits";

/**
 * Change who a plan is with.
 *
 * A plan could be created with a provider and never edited afterwards, so a
 * misspelt HMO stayed misspelt for good. This is deliberately **only** the
 * provider: the prices and the pre-tax switch decide what comes off a payslip,
 * and a form that quietly lets somebody reprice a plan beside a spelling fix is
 * a different, heavier act that does not belong behind a small "Change provider".
 *
 * An emptied box takes the provider off (`null`); both are optional.
 */
export function PlanProviderDialog({
  plan: planProp,
  onClose,
  onDone,
}: {
  plan: ApiBenefitPlan | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const mutations = useBenefitMutations();
  const toast = useToast();

  /* Holds the last plan while the modal fades, so the title does not blank. */
  const [plan, setPlan] = useState(planProp);
  const [draft, setDraft] = useState(planProp?.provider ?? "");
  const [saving, setSaving] = useState(false);
  if (planProp !== null && planProp !== plan) {
    setPlan(planProp);
    setDraft(planProp.provider ?? "");
  }

  const submit = async () => {
    if (!plan || saving) return;
    setSaving(true);
    try {
      const next = draft.trim();
      await mutations.updatePlan(plan.id, {
        provider: next === "" ? null : next,
      });
      toast.push({ tone: "success", title: "Provider saved" });
      onDone();
    } catch (error) {
      toast.push({
        tone: "danger",
        title: "That did not save",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={planProp !== null}
      onClose={onClose}
      size="sm"
      title={`Provider for ${plan?.name ?? "this plan"}`}
      description="Who the plan is with. Staff on it see this next to their member ID."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            onClick={() => void submit()}
          >
            Save
          </Button>
        </>
      }
    >
      <Field optional label="Provider" help="The HMO or insurer.">
        <Input
          value={draft}
          maxLength={160}
          autoFocus
          placeholder="Name of the HMO"
          onChange={(e) => {
            const value = e.target.value;
            setDraft(value);
          }}
        />
      </Field>
    </Modal>
  );
}
