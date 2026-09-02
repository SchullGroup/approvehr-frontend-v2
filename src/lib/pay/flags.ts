import { formatMoney, type BadgeTone } from "@/components/ui";
import {
  naira,
  ratePercent,
  type ApiPayComponent,
  type ApiPayComponentBasisSource,
  type PayComponentApplyMode,
} from "@/lib/api/pay-components";

/**
 * Pay component flags, in words a business owner reads.
 *
 * The API carries `taxable`, `pensionable` and `preTax` as booleans because
 * that is what the engine needs. Nobody outside a payroll department reads
 * "taxable: true" and knows what it will do to their staff's money, so nothing
 * on screen ever prints the field name. This module is the one place the
 * translation lives, so the words cannot drift between the library table, the
 * create form and the per-person panel.
 *
 * Three rules held to here:
 *
 * 1. **The label is readable on its own.** "Counts for pension", not
 *    "pensionable: true" and not a bare icon. `why` is the extra line for a
 *    tooltip or a switch description — it explains the consequence, never the
 *    field.
 * 2. **The consequence quotes live rates, not literals.** The pension line
 *    reads 8% and 10% because that is what this company's payroll settings say;
 *    a company contributing 12% sees 12%. A hardcoded figure in copy is a
 *    figure that goes wrong silently.
 * 3. **Both states get a label.** "Tax-free" is as much a decision as "Taxed",
 *    and a blank cell reads as missing data rather than as a declared exemption.
 */

export type FlagChip = {
  label: string;
  tone: BadgeTone;
  /** One line on the consequence. For a tooltip or a switch description. */
  why: string;
};

/** Just enough of a component to describe how its amount is worked out. */
export type AmountSource = ApiPayComponentBasisSource;

/* ------------------------------------------------------------------- flags */

export function taxableChip(taxable: boolean): FlagChip {
  return taxable
    ? {
        label: "Taxed",
        tone: "neutral",
        why: "PAYE is worked out on this amount along with the rest of pay.",
      }
    : {
        label: "Tax-free",
        tone: "info",
        why: "Left out of the PAYE calculation, so it does not raise the tax bill.",
      };
}

/**
 * The pension flag, with its cost spelled out.
 *
 * This is the flag that costs money on both sides of the payslip: the
 * employee's contribution comes out of take-home, the employer's is added to
 * the cost of employing them. Getting it wrong is a statutory error, so the
 * consequence is stated in full wherever the switch appears.
 */
export function pensionChip(
  pensionable: boolean,
  rates: { employeeRate: number; employerRate: number },
): FlagChip {
  const employee = percent(rates.employeeRate);
  const employer = percent(rates.employerRate);
  return pensionable
    ? {
        label: "Counts for pension",
        tone: "accent",
        why: `Adds ${employee} employee and ${employer} employer contribution on this amount.`,
      }
    : {
        label: "No pension",
        tone: "neutral",
        why: "No pension is charged on it, so all of it reaches take-home pay.",
      };
}

export function preTaxChip(preTax: boolean): FlagChip {
  return preTax
    ? {
        label: "Before tax",
        tone: "accent",
        why: "Comes off before PAYE, so it also lowers the tax bill.",
      }
    : {
        label: "After tax",
        tone: "neutral",
        why: "Comes off take-home pay. PAYE is worked out before it.",
      };
}

/**
 * Whether the component charges itself. `PERMANENT` is the one flag here that
 * is not a tax rule but a distribution rule: it decides *who* is on the
 * component, not what happens to the amount once they are.
 */
export function applyModeChip(applyMode: PayComponentApplyMode): FlagChip {
  return applyMode === "PERMANENT"
    ? {
        label: "Everyone, automatically",
        tone: "accent",
        why: "Charged to every active employee on every run. Nobody needs to be assigned it.",
      }
    : {
        label: "Assigned",
        tone: "neutral",
        why: "Applies to nobody until somebody is assigned it, one person or several at once.",
      };
}

/**
 * The chips for one component, in the order they should read.
 *
 * `applyMode` is optional: it describes the component's own definition, not
 * any one person's line, so a resolved per-person assignment (which carries
 * no such field) still gets a full chip set — just without that one, since
 * there is nothing wrong to default it to.
 */
export function flagChips(
  component: Pick<ApiPayComponent, "kind" | "taxable" | "pensionable" | "preTax"> & {
    applyMode?: PayComponentApplyMode;
  },
  rates: { employeeRate: number; employerRate: number },
): FlagChip[] {
  return [
    ...(component.kind === "ALLOWANCE"
      ? [taxableChip(component.taxable), pensionChip(component.pensionable, rates)]
      : [preTaxChip(component.preTax)]),
    ...(component.applyMode === undefined ? [] : [applyModeChip(component.applyMode)]),
  ];
}

/* ------------------------------------------------------- how much, in words */

/** What a percentage basis is a percentage *of*, in words. */
export function basisOf(basis: AmountSource["basis"]): string {
  return basis === "PERCENT_OF_BASIC" ? "basic pay" : "monthly pay";
}

/**
 * How the amount is worked out — the column beside the name.
 *
 * "Set per person" is the honest answer for the components that have no
 * default, and most of them do not: a car allowance differs by person every
 * time, and a default nobody checked is worse than a blank somebody fills in.
 */
export function amountLine(component: AmountSource): string {
  if (component.basis === "FIXED") {
    return component.defaultAmountKobo === null
      ? "Set per person"
      : `${money(component.defaultAmountKobo)} a month`;
  }
  return component.defaultRate === null
    ? `A percentage of ${basisOf(component.basis)}, set per person`
    : `${percent(component.defaultRate)} of ${basisOf(component.basis)}`;
}

/**
 * How one person's line is worked out.
 *
 * `fromDefault` matters on screen: an amount inherited from the definition
 * changes for everybody when the definition changes, and an amount set on the
 * person does not. Saying which is which is how somebody predicts a rise.
 */
export function assignmentLine(assignment: {
  basis: AmountSource["basis"];
  amountKobo: number | null;
  rate: number | null;
  fromDefault: boolean;
}): string {
  const suffix = assignment.fromDefault ? " (from the default)" : "";
  if (assignment.rate !== null) {
    return `${percent(assignment.rate)} of ${basisOf(assignment.basis)}${suffix}`;
  }
  if (assignment.amountKobo !== null) {
    return `${money(assignment.amountKobo)} a month${suffix}`;
  }
  return "From the component default";
}

/* ------------------------------------------------------ the two kind labels */

export const KIND_LABEL: Record<ApiPayComponent["kind"], string> = {
  ALLOWANCE: "Allowance",
  DEDUCTION: "Deduction",
};

/* ------------------------------------------------------------------ helpers */

/** Two decimals, always. This is a figure somebody reconciles against a bank. */
export const money = (amountKobo: number): string =>
  formatMoney(naira(amountKobo), "NGN", { decimals: true });

/**
 * A signed figure, for a change. "+₦50,000.00" reads as a direction.
 *
 * Zero gets no sign: "+₦0.00" reads as an increase of nothing, which is a
 * sentence nobody means.
 */
export const signedMoney = (amountKobo: number): string =>
  amountKobo === 0
    ? money(0)
    : `${amountKobo < 0 ? "−" : "+"}${money(Math.abs(amountKobo))}`;

/** A fraction as a percentage, without trailing zeros. 0.075 → "7.5%". */
export function percent(rate: number): string {
  const value = ratePercent(rate);
  return `${Number.isInteger(value) ? value : Number(value.toFixed(2))}%`;
}

/* ----------------------------------------------------- the form's switches */

/**
 * A switch's label is the question; the line under it is the answer.
 *
 * A switch whose label flips between "Taxed" and "Tax-free" cannot be read with
 * confidence — you cannot tell whether the label describes the current state or
 * the thing turning it would do. So the label is fixed and the description
 * changes, which means the sentence on screen is always the one that describes
 * what saving would do.
 *
 * These live beside the badge copy on purpose. The table and the form are
 * describing the same three booleans, and the day they disagree is the day
 * somebody sets a flag they did not mean to set.
 */
export type SwitchCopy = { label: string; why: string };

export function taxableSwitch(on: boolean): SwitchCopy {
  return {
    label: "PAYE applies to it",
    why: on
      ? "Taxed — it goes into the PAYE calculation with the rest of pay."
      : "Tax-free — left out of the PAYE calculation entirely.",
  };
}

export function pensionSwitch(
  on: boolean,
  rates: { employeeRate: number; employerRate: number },
): SwitchCopy {
  return {
    label: "Counts for pension",
    why: on
      ? `Counts for pension — adds ${percent(rates.employeeRate)} employee and ${percent(
          rates.employerRate,
        )} employer contribution on this amount.`
      : "No pension — nothing is charged on it, so all of it reaches take-home pay. Right unless it is contractual monthly pay.",
  };
}

export function preTaxSwitch(on: boolean): SwitchCopy {
  return {
    label: "Comes off before tax",
    why: on
      ? "Before tax — it lowers the PAYE bill too. Only for schemes the tax law recognises, like NHIS."
      : "After tax — PAYE is worked out first, then this comes off take-home pay.",
  };
}

export function applyModeSwitch(on: boolean): SwitchCopy {
  return {
    label: "Charge every employee automatically",
    why: on
      ? "Permanent — every active employee carries it on every run, at the amount or rate above. Nobody needs assigning."
      : "Optional — applies to nobody until you assign it, to one person or several at once.",
  };
}
