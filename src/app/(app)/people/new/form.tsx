"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Save,
  Trash2,
  UserRoundCheck,
  UserRoundPlus,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  Field,
  Input,
  Modal,
  Money,
  Picker,
  Select,
  Skeleton,
  StepIndicator,
  useStepper,
  useToast,
  type Step,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import {
  nextIdentity,
  useEmployeeStore,
  validateEmployee,
} from "@/lib/store/employees";
import {
  useEmployeeDirectory,
  useEmployeeMutations,
} from "@/lib/store/employees-api";
import {
  BLANK_DRAFT,
  savedAgo,
  useEmployeeDraft,
  type EmployeeDraft,
  type OpenGroups,
} from "@/lib/store/employee-draft";
import { useWorkLocations } from "@/lib/store/attendance";
import { NO_DEPARTMENT } from "@/lib/store/demo-structure";
import { useDepartments } from "@/lib/store/departments";
import { useOrgTaxState } from "@/lib/store/company";
import { AccountVerificationHint } from "@/components/payments/account-verification";
import { NIGERIAN_BANKS } from "@/lib/reference/banks";
import {
  NIGERIAN_STATES,
  PENSION_PROVIDER_OTHER,
  PENSION_PROVIDERS,
  isOtherPensionProvider,
} from "@/lib/reference/lists";
import { koboFromDecimal, naira } from "@/lib/api/payroll";
import { usePayslipQuote } from "@/lib/store/payslip-quote";
import { RECORD_FIELD_KEYS, type RecordFieldKey } from "@/lib/api/setup";
import { SKIP_CONSEQUENCE, useFeatures } from "@/lib/store/features";
import {
  fullName,
  payrollGapsFor,
  type Employee,
  type EmploymentType,
  type PayrollGap,
} from "@/lib/types";

/*
 * Adding a starter, as a wizard.
 *
 * This was one page of thirty-odd fields, and the person we are selling to is
 * not an HR manager — it is somebody with five staff who wants to run their own
 * payroll and has never heard the phrase "pension PIN". Three things follow from
 * that, and they are the whole design:
 *
 * 1. **Two steps get somebody paid.** A name, a job title, a start date and a
 *    salary. That is genuinely all `POST /employees` requires — verified in
 *    `approvehr-api/tests/employees.test.ts`, which exists because this claim
 *    had never been tested and one part of it was false: `taxState` used to be
 *    required, so "skip tax setup" would have been a lie. It now falls back to
 *    the company's own PAYE state.
 *
 * 2. **Everything statutory is a group you open.** Closed by default, each one
 *    saying in one sentence what you lose by leaving it shut — a payslip with no
 *    PAYE on it, a pension nobody remits. That sentence lives in
 *    `SKIP_CONSEQUENCE` beside the Settings copy, so the form and the switch
 *    that hides it cannot describe the same choice differently.
 *
 * 3. **A company can turn the groups off for good.** `/settings/features` →
 *    "What an employee record asks for". Off hides the group here and deletes
 *    nothing, the same promise every other flag makes. All three default **on**,
 *    so nothing changed for a company that already existed.
 *
 * ## The record still saves incomplete, and the readiness panel still says so
 *
 * That was true before this rewrite and is the reason it is safe. In practice
 * the record gets created before the person has handed over a TIN, and refusing
 * to save until they do just moves them into a spreadsheet until they are
 * "ready". The blocker machinery on the record page, the onboarding checklist
 * and the payroll run all pick it up. Hiding a group does **not** excuse it: the
 * panel on the right lists what payroll will still hold back on, and says when
 * the reason it is not being asked for is a company setting.
 *
 * ## Where the record goes
 *
 * Connected, `POST /employees` — which needs `EDIT_RECORDS`, so the form is not
 * offered without it. Demo, the localStorage store, and the screen says so.
 *
 * ## Every picker's options come from the live source
 *
 * Departments and locations take ids, and a *name* posted to the API is stripped
 * by zod rather than refused — so the department would appear to save and quietly
 * not. Both read the same dual-source stores the rest of the app uses.
 *
 * ## The net-pay preview is the API's, and there is no second engine
 *
 * `POST /payroll/quote` with no settings block, so the figures are the ones a
 * real run would produce. It also carries the declared rent, which is the only
 * way somebody can see what declaring is worth to them. With no API there are no
 * figures — see `FirstPayslip`.
 */

/* ------------------------------------------------------------------ options */

/*
 * All three used to be declared here, and all three were wrong in the same way.
 *
 * `TAX_STATES` offered five of the thirty-seven, and called the capital "Abuja"
 * where the company form called it "FCT" — PAYE is remitted to a state revenue
 * service, so those two never joined up. `BANKS` offered seven institutions, so
 * anybody banking elsewhere could not be recorded at all, and it carried no
 * codes, which is why the Bank Code column of every payment file shipped empty.
 *
 * Now one source each. The bank list is 255 institutions with their real
 * NIBSS/CBN codes, generated from Paystack's public register — see the header of
 * `lib/reference/banks.ts` for why the codes are fetched rather than typed.
 */
const TAX_STATES = NIGERIAN_STATES;
const BANKS = NIGERIAN_BANKS;
const PFAS = PENSION_PROVIDERS;

/** Titles and one-line purposes for the three opt-in groups. */
const GROUP_COPY: Record<
  RecordFieldKey,
  { title: string; purpose: string }
> = {
  taxSetup: {
    title: "Set up tax",
    purpose: "Which state gets their PAYE, their TIN, and the rent they pay.",
  },
  pensionSetup: {
    title: "Pension and NHF",
    purpose: "Their RSA PIN, who manages it, and their NHF number.",
  },
  bankDetails: {
    title: "Bank account",
    purpose: "Where their salary is paid.",
  },
};

/** Digits and one decimal point. What a money input is allowed to become. */
const money = (value: string) => value.replace(/[^\d.]/g, "");

/**
 * A message against one field, keyed by the **draft's** field name.
 *
 * Wider than `FieldError` from the employee store, which is keyed by
 * `keyof Employee`. Two of this form's inputs are not `Employee` fields —
 * `annualRent` is typed in naira and stored as `annualRentKobo` — and casting to
 * satisfy a type that does not describe the form is how an error ends up filed
 * under a name nothing on screen is listening for. One string key does the error
 * lookup, the clear-on-type, and the focus target, all from the same name.
 */
type FormError = { field: string; message: string };

/**
 * Puts the caret on the field a message belongs to.
 *
 * A DOM query on a `data-` attribute rather than an `id`, because `Field` owns
 * the id: it generates one and wires the `<label for>` to it, so passing
 * `id="firstName"` to the `Input` — which the previous version of this form did
 * on six fields — silently overrode the generated id and left every one of those
 * labels pointing at nothing. A ref map would work too, and trips the
 * `react-hooks/refs` rule for a callback factory it cannot see through.
 *
 * Only ever called from an event handler, never during render.
 */
function focusField(field: string) {
  document
    .querySelector<HTMLElement>(`[data-employee-field="${field}"]`)
    ?.focus();
}

/** Which step owns each field, for jumping back to an error from the review. */
const OWNER: Record<string, string> = {
  firstName: "who",
  lastName: "who",
  email: "who",
  phone: "who",
  dateOfBirth: "who",
  addressLine: "who",
  nin: "who",
  stateOfOrigin: "who",
  lgaOfOrigin: "who",
  religion: "who",
  jobTitle: "job",
  startDate: "job",
  grossMonthly: "job",
  taxState: "extras",
  tin: "extras",
  annualRent: "extras",
  pensionPin: "extras",
  nhfNumber: "extras",
  bankAccount: "extras",
};

/* -------------------------------------------------------------------------- */

export function NewEmployeeForm() {
  const router = useRouter();
  const toast = useToast();
  /* The local store stays for demo mode only — `nextIdentity` and `create` mint
     and store a `p-NN` record, which is the honest answer with no API and the
     wrong one with one. */
  const local = useEmployeeStore();
  const mutations = useEmployeeMutations();
  const connected = mutations.connected;
  const canCreate = useCan("EDIT_RECORDS");
  /* Picking an existing department or work location only needs `EDIT_RECORDS`,
     but creating a new one is a `MANAGE_SETTINGS` act on both APIs
     (`departments/router.ts`, `attendance/locations.ts`'s create route) — a
     department is a payroll cost centre and a location carries a geofence.
     Offering the "create a new …" control to somebody who only holds
     `EDIT_RECORDS` would let them fill in a name, hit submit, and meet a 403
     they had no way to see coming. Picking from the existing list stays open to
     anybody who can create an employee at all. */
  const canManageStructure = useCan("MANAGE_SETTINGS");
  /* Both modes, so the manager picker offers real colleagues either way. */
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const departments = useDepartments();
  const locations = useWorkLocations();

  /**
   * Which "create a new …" dialog is open, if any.
   *
   * The reason the two pickers are not `<select>`s. Adding the first department
   * used to mean abandoning a half-filled form, going to Settings, creating it,
   * and starting the form again — so in practice people left the field blank and
   * the record went in incomplete.
   */
  const [creating, setCreating] = useState<null | "department" | "location">(null);
  const [newName, setNewName] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function commitCreate() {
    const name = newName.trim();
    if (name === "" || creating === null) return;
    setCreatingBusy(true);
    setCreateError(null);
    try {
      if (creating === "department") {
        const made = await departments.create({ name });
        /* Selected immediately. Making somebody create a thing and then hunt for
           it in the list they were already looking at is a small insult. */
        set("departmentId", made.id);
      } else {
        const made = await locations.create({ name });
        set("workLocationId", made.id);
      }
      setCreating(null);
      setNewName("");
    } catch (failure) {
      /* The API's own words: it names a clash by the name that clashed, and says
         when the thing exists but is switched off — which is a different fix. */
      setCreateError(
        failure instanceof Error ? failure.message : "That could not be created.",
      );
    } finally {
      setCreatingBusy(false);
    }
  }
  const features = useFeatures();
  const drafts = useEmployeeDraft();
  const orgTax = useOrgTaxState();
  const [settingOrgTax, setSettingOrgTax] = useState<string>("");
  const [savingOrgTax, setSavingOrgTax] = useState(false);
  const [orgTaxError, setOrgTaxError] = useState<string | null>(null);

  async function commitOrgTaxState() {
    if (!settingOrgTax) return;
    setSavingOrgTax(true);
    setOrgTaxError(null);
    const ok = await orgTax.setTaxState(settingOrgTax);
    setSavingOrgTax(false);
    if (!ok) {
      setOrgTaxError("That could not be saved. Try again.");
    }
  }

  const [draft, setDraft] = useState<EmployeeDraft>(BLANK_DRAFT);
  const [open, setOpen] = useState<OpenGroups>({
    taxSetup: false,
    pensionSetup: false,
    bankDetails: false,
  });
  const [errors, setErrors] = useState<FormError[]>([]);
  const [busy, setBusy] = useState(false);
  /* Hidden once the person has resumed, discarded, or saved — after any of the
     three, a banner offering to resume is offering them their own typing. */
  const [resumeHidden, setResumeHidden] = useState(false);
  /* Whether the pension-provider field is showing its free-text fallback.
     Kept apart from `isOtherPensionProvider(draft.pensionProvider)`: picking
     "Other (specify)" clears the field ready for typing, and if that were the
     only signal the field would read as unset the instant it was chosen and
     the select would flip straight back to itself. */
  const [providerOtherChosen, setProviderOtherChosen] = useState(false);
  const [added, setAdded] = useState<{
    id: string;
    name: string;
    /** Actually holds their pay back — a missing bank account. */
    blocking: string[];
    /** Worth adding, but does not hold anything back — a PIN or a TIN. */
    advisory: string[];
  } | null>(null);

  const set = <K extends keyof EmployeeDraft>(key: K, value: EmployeeDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((x) => x.filter((e) => e.field !== key));
  };

  const errorFor = (field: string) =>
    errors.find((e) => e.field === field)?.message;

  /* Which groups this company has switched on. Read into a plain record rather
     than memoised: `useFeatures()` hands back a fresh object every render, so a
     memo over it would either never settle or need the whole object as a
     dependency — and filtering three keys costs nothing. */
  const enabled: Record<RecordFieldKey, boolean> = {
    taxSetup: features.taxSetup,
    pensionSetup: features.pensionSetup,
    bankDetails: features.bankDetails,
  };
  const groups = RECORD_FIELD_KEYS.filter((key) => enabled[key]);
  const hasExtras = groups.length > 0;

  /**
   * The rail.
   *
   * "Extras" disappears entirely for a company with all three groups off, which
   * is the point of the setting. Content is chosen by step **id** and never by
   * index, so the step list shrinking under somebody — the flags arrive
   * asynchronously — moves them onto a real step rather than onto whatever
   * happens to sit at index 2.
   */
  const steps = useMemo<Step[]>(
    () => [
      { id: "who", label: "Who they are", hint: "Name and contact" },
      { id: "job", label: "Job and pay", hint: "Role, start date, salary" },
      ...(hasExtras
        ? [
            {
              id: "extras",
              label: "Extras",
              hint: "Tax, pension, bank",
              optional: true,
            },
          ]
        : []),
      { id: "review", label: "Review", hint: "Check and add" },
      { id: "done", label: "Done", hint: "Added" },
    ],
    [hasExtras],
  );

  const stepper = useStepper(steps);
  const stepId = stepper.current?.id ?? "who";
  const finished = stepId === "done";

  /**
   * The typed figure, or **null** when nothing was typed.
   *
   * Not `|| 0`, which is what it used to be: zero would be sent as a salary and
   * the person would be created on ₦0 a month. Null means nobody has agreed
   * one, the column stays empty, and payroll raises `missing_pay` naming them.
   */
  const gross = draft.grossMonthly.trim()
    ? Number(money(draft.grossMonthly)) || null
    : null;

  /* Whole kobo, from the string the user typed rather than from `gross`. A float
     multiply is how a figure ends up a kobo out; `koboFromDecimal` splits on the
     point and works in integers instead. */
  const grossKobo = useMemo(
    () => koboFromDecimal(money(draft.grossMonthly) || "0"),
    [draft.grossMonthly],
  );

  /* Empty is undeclared, and undeclared is not zero — see the field's own help
     text, and `Employee.annualRentKobo`. */
  const rentDeclared = money(draft.annualRent).trim() !== "";
  const annualRentKobo = useMemo(
    () => (rentDeclared ? koboFromDecimal(money(draft.annualRent)) : null),
    [draft.annualRent, rentDeclared],
  );

  /* The names behind the two ids, for the local store and for nothing else.
     Looked up rather than kept in state so they cannot fall out of step with the
     id that was actually chosen. */
  const departmentName =
    departments.flat.find((d) => d.id === draft.departmentId)?.name ?? null;
  const locationName =
    locations.locations.find((l) => l.id === draft.workLocationId)?.name ?? null;

  /**
   * Which statuses and employment types may be *set*.
   *
   * Connected the answer is the database's enum: "Probation" is not in it, and
   * offering it would hand somebody a 422 for picking what the form showed them.
   * Offline the local set is the honest one, because localStorage holds whatever
   * it is given. Same rule, and same lists, as the record page.
   */
  /* Parked with the status field below. Kept rather than deleted so bringing
     the choice back is uncommenting two blocks and a nav entry. */
  // const statuses = connected
  //   ? [
  //       { value: "onboarding", label: "Onboarding" },
  //       { value: "active", label: "Active" },
  //     ]
  //   : [
  //       { value: "onboarding", label: "Onboarding" },
  //       { value: "probation", label: "Probation" },
  //       { value: "active", label: "Active" },
  //     ];

  const types = connected
    ? [
        { value: "full_time", label: "Full time" },
        { value: "part_time", label: "Part time" },
        { value: "contract", label: "Contract" },
        { value: "intern", label: "Internship" },
        { value: "nysc", label: "NYSC" },
      ]
    : [
        { value: "full_time", label: "Full time" },
        { value: "contract", label: "Contract" },
        { value: "internship", label: "Internship" },
      ];

  /* What payroll would actually do with this record if it were saved right
     now — split by consequence, not just by "is it filled in". Only a missing
     bank account is a `wouldBlock`; a missing pension PIN or TIN is
     `wouldAdvise` and never holds a payslip back. See `payrollGapsFor`. */
  const payrollGaps = payrollGapsFor({
    bankAccount: draft.bankAccount || null,
    pensionPin: draft.pensionPin || null,
    tin: draft.tin || null,
  });
  const wouldBlock = payrollGaps.filter((g) => g.blocking).map((g) => g.label);
  const wouldAdvise = payrollGaps.filter((g) => !g.blocking).map((g) => g.label);

  /* ---------------------------------------------------------- validation */

  /**
   * Format checks for the fields "Who they are" owns, run only on ones
   * somebody actually filled in.
   *
   * Kept apart from `formatErrors` below: these three render on the "who"
   * step, not "extras", and validating them there — as one function used to —
   * meant a bad phone number typed on step one silently blocked the Continue
   * button two steps later, with no field on screen to show the error on.
   */
  function identityFormatErrors(): FormError[] {
    return validateEmployee({
      ...(draft.email ? { email: draft.email } : {}),
      ...(draft.phone ? { phone: draft.phone } : {}),
      ...(draft.dateOfBirth ? { dateOfBirth: draft.dateOfBirth } : {}),
    });
  }

  /** Format checks for the fields Extras owns, run only on ones somebody
      actually filled in. */
  function formatErrors(): FormError[] {
    return validateEmployee({
      ...(draft.tin ? { tin: draft.tin } : {}),
      ...(draft.pensionPin ? { pensionPin: draft.pensionPin } : {}),
    });
  }

  /**
   * What is wrong with one step.
   *
   * Required fields are checked on the step that asks for them, and only on it —
   * so somebody on step one is never told about a salary they have not been
   * shown a field for yet. The review step checks everything, because it is the
   * one that submits.
   */
  function problemsWith(id: string): FormError[] {
    const found: FormError[] = [];
    const identity = () => {
      if (!draft.firstName.trim())
        found.push({ field: "firstName", message: "First name is required." });
      if (!draft.lastName.trim())
        found.push({ field: "lastName", message: "Last name is required." });
      found.push(...identityFormatErrors());
    };
    const job = () => {
      if (!draft.jobTitle.trim())
        found.push({ field: "jobTitle", message: "Job title is required." });
      if (!draft.startDate)
        found.push({ field: "startDate", message: "Start date is required." });
      /* Pay is not required to add somebody — an offer is frequently still
         being signed when HR puts them on the list. What is refused is a figure
         that was typed and is not a figure: zero or negative. Payroll names
         anybody with none set rather than paying them a zero. */
      if (draft.grossMonthly.trim() && (gross === null || gross <= 0))
        found.push({
          field: "grossMonthly",
          message: "That is not an amount. Leave it blank if it is not agreed yet.",
        });
    };
    const optional = () => {
      const bank = draft.bankAccount.replace(/\s/g, "");
      if (bank && !/^\d{10}$/.test(bank)) {
        found.push({
          field: "bankAccount",
          message: "A NUBAN account number is 10 digits.",
        });
      }
      if (rentDeclared && !Number.isFinite(Number(money(draft.annualRent)))) {
        found.push({
          field: "annualRent",
          message: "Enter the yearly rent as a number, or leave it blank.",
        });
      }
      found.push(...formatErrors());
    };

    if (id === "who") identity();
    if (id === "job") job();
    if (id === "extras") optional();
    if (id === "review") {
      identity();
      job();
      optional();
    }
    return found;
  }

  /** Whether a step is answered, for the tick on the rail. */
  const satisfied: Record<string, boolean> = {
    who: Boolean(draft.firstName.trim() && draft.lastName.trim()),
    /* Pay is no longer part of "answered": the step is complete with a title
       and a start date, because somebody can be added before their pay is
       agreed. */
    job: Boolean(draft.jobTitle.trim() && draft.startDate),
    /* Extras is optional, so "done" means "you looked at it and nothing you
       typed is malformed" rather than "you filled it in". */
    extras: problemsWith("extras").length === 0,
    review: false,
    done: false,
  };

  const displaySteps = steps.map((step, i) => ({
    ...step,
    /* Visited AND satisfied. Ticking a step somebody has not seen would claim a
       decision they never made. */
    isComplete: i <= stepper.furthest && (satisfied[step.id] ?? false),
  }));

  /* -------------------------------------------------------------- actions */

  /** Which collapsible Extras group a field renders inside, so its error
      is not raised behind an accordion nobody has opened. */
  const GROUP_OF: Partial<Record<string, keyof OpenGroups>> = {
    bankAccount: "bankDetails",
    tin: "taxSetup",
    annualRent: "taxSetup",
    pensionPin: "pensionSetup",
  };

  function raise(found: FormError[]) {
    setErrors(found);
    const first = found[0];
    if (!first) return;
    const group = GROUP_OF[first.field];
    if (group) setOpen((o) => ({ ...o, [group]: true }));
    /* One frame so a group that just opened has actually mounted its field
       before focus lands on it — a synchronous focus here would miss it. */
    requestAnimationFrame(() => focusField(first.field));
  }

  /** Continue. Validates the step in hand, then moves. */
  function forward() {
    const found = problemsWith(stepId);
    if (found.length > 0) {
      raise(found);
      return;
    }
    setErrors([]);
    stepper.next();
  }

  function saveDraft() {
    drafts.save(draft, open, stepper.index);
    setResumeHidden(true);
    toast.push({
      title: "Draft saved",
      tone: "success",
      detail:
        "Come back to Add a new staff to pick it up. In this browser only — it will not be here on another device.",
    });
  }

  function resumeDraft() {
    const saved = drafts.saved;
    setResumeHidden(true);
    if (!saved) return;
    setDraft(saved.draft);
    setOpen(saved.open);
    setErrors([]);
    /* Recomputed from the resumed value, not carried over from whatever this
       session's toggle happened to be — `isOtherPensionProvider` picks the
       free-text view back up on its own if the resumed provider is custom. */
    setProviderOtherChosen(false);
    stepper.goTo(saved.step);
  }

  function discardDraft() {
    drafts.discard();
    setResumeHidden(true);
    toast.push({ title: "Draft discarded", tone: "info" });
  }

  /** Back to a blank step one. Used by "Add another" and after a discard. */
  function blank() {
    setDraft(BLANK_DRAFT);
    setOpen({ taxSetup: false, pensionSetup: false, bankDetails: false });
    setErrors([]);
    setAdded(null);
    setProviderOtherChosen(false);
    stepper.reset();
  }

  async function submit() {
    const found = problemsWith("review");
    if (found.length > 0) {
      /* The offending field can be two steps back, so go there before focusing
         it — an error message on a step nobody is looking at is not a message. */
      const target = OWNER[found[0].field] ?? "who";
      const index = steps.findIndex((s) => s.id === target);
      if (index >= 0) stepper.goTo(index);
      raise(found);
      return;
    }

    const name = `${draft.firstName.trim()} ${draft.lastName.trim()}`;
    setBusy(true);
    try {
      const id = connected ? await createOnApi() : createLocally();

      /* The page clears completely and the modal names the person. The old
         version pushed a toast and navigated, which read as nothing having
         happened at all. */
      setAdded({ id, name, blocking: wouldBlock, advisory: wouldAdvise });
      setDraft(BLANK_DRAFT);
      setOpen({ taxSetup: false, pensionSetup: false, bankDetails: false });
      setErrors([]);
      /* A draft that has become a real record is not a draft. */
      drafts.discard();
      setResumeHidden(true);
      stepper.goTo(steps.length - 1);
    } catch (error) {
      /* The API answers with the field and the sentence — a NUBAN that is not
         ten digits, an RSA PIN in the wrong shape. Put both on the input rather
         than in a toast the person has to translate back to a field. */
      /* The API names the field, and its names match this form's for everything
         it can refuse — except money, which it reports in kobo under
         `annualRentKobo` and `grossMonthlyKobo`. Mapped rather than shown
         against nothing. */
      const fieldErrors: FormError[] =
        error instanceof ApiError
          ? error.fieldErrors.map((d) => ({
              field:
                d.field === "annualRentKobo"
                  ? "annualRent"
                  : d.field === "grossMonthlyKobo"
                    ? "grossMonthly"
                    : d.field,
              message: d.message,
            }))
          : [];

      if (fieldErrors.length > 0) {
        const target = OWNER[fieldErrors[0].field] ?? "review";
        const index = steps.findIndex((s) => s.id === target);
        if (index >= 0) stepper.goTo(index);
        raise(fieldErrors);
      } else {
        toast.push({
          title: `${name} was not added`,
          tone: "danger",
          detail:
            error instanceof ApiError
              ? error.message
              : "Something went wrong. Try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  /** Returns the new record's id, which is a uuid the server chose. */
  async function createOnApi(): Promise<string> {
    const created = await mutations.create({
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      jobTitle: draft.jobTitle.trim(),
      startDate: draft.startDate,
      /* Omitted, not zeroed, when nobody has agreed a figure. */
      ...(gross === null ? {} : { grossMonthly: gross }),
      /* No field on this form asks for login access directly — granting one is
         the invite flow's decision (the record page, or `/people/attendance`'s
         bulk setup), not this form's. So it is implied by whether an email was
         given, matching what the API actually requires: `canLogin` defaults
         `true`, which demands an email, and most staff being added here have
         no work email and were never going to sign in anywhere. A driver added
         with no email would otherwise fail on that refusal with no field on
         screen to explain it. */
      canLogin: draft.email.trim() !== "",
      /* And send them the invitation, when there is somewhere to send it.
         ------------------------------------------------------------------
         Recording a work address on a staff form is the intent to give
         somebody a login — there is no other reason to type one here — so
         this stops making somebody ask twice, once on this form and again
         from the directory.

         Sent as an instruction rather than inferred by the API, which is why
         there is a flag at all: `POST /employees` must not send mail as a side
         effect for every other caller. The consequence is stated on the form
         beside the email field, so it is a decision somebody can see and undo
         before the click rather than find in a sent folder. */
      invite: draft.email.trim() !== "",
      status: draft.status,
      employmentType: draft.employmentType,
      /* Omitted rather than defaulted: the API falls back to the company's own
         PAYE state, which beats this form guessing Lagos. */
      ...(draft.taxState ? { taxState: draft.taxState } : {}),
      ...(draft.email.trim() ? { email: draft.email.trim() } : {}),
      ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
      ...(draft.dateOfBirth ? { dateOfBirth: draft.dateOfBirth } : {}),
      ...(draft.middleName.trim() ? { middleName: draft.middleName.trim() } : {}),
      ...(draft.departmentId ? { departmentId: draft.departmentId } : {}),
      ...(draft.workLocationId ? { workLocationId: draft.workLocationId } : {}),
      ...(draft.managerId ? { managerId: draft.managerId } : {}),
      ...(draft.bankName ? { bankName: draft.bankName } : {}),
      ...(draft.bankAccount.trim()
        ? { bankAccount: draft.bankAccount.trim() }
        : {}),
      ...(draft.pensionPin.trim() ? { pensionPin: draft.pensionPin.trim() } : {}),
      ...(draft.pensionProvider
        ? { pensionProvider: draft.pensionProvider }
        : {}),
      ...(draft.tin.trim() ? { tin: draft.tin.trim() } : {}),
      ...(draft.nhfNumber.trim() ? { nhfNumber: draft.nhfNumber.trim() } : {}),
      /* Omitted rather than sent empty: the API's schemas treat an absent field
         as "leave it alone" and an empty string as a value. */
      ...(draft.addressLine.trim() ? { addressLine: draft.addressLine.trim() } : {}),
      ...(draft.nin.trim() ? { nin: draft.nin.trim() } : {}),
      ...(draft.stateOfOrigin ? { stateOfOrigin: draft.stateOfOrigin } : {}),
      ...(draft.lgaOfOrigin.trim() ? { lgaOfOrigin: draft.lgaOfOrigin.trim() } : {}),
      ...(draft.religion.trim() ? { religion: draft.religion.trim() } : {}),
      ...(annualRentKobo === null ? {} : { annualRentKobo }),
    });
    return created.id;
  }

  /** Demo mode. A `p-NN` id in this browser, and the screen says so. */
  function createLocally(): string {
    const { id, employeeNo } = nextIdentity(local.all);
    const employee: Employee = {
      id,
      employeeNo,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      middleName: draft.middleName.trim() || null,
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      dateOfBirth: draft.dateOfBirth || null,
      jobTitle: draft.jobTitle.trim(),
      /* The local store holds display names, so the id picked above is turned
         back into the name it belongs to. */
      /* The shared placeholder, not the literal "Unassigned" this used to write.
         One string has to mean "nobody assigned one" or the departments screen
         counts a person as being in a department called Unassigned — see
         `isUnassigned` in `lib/store/demo-structure.ts`. */
      department: departmentName ?? NO_DEPARTMENT,
      managerId: draft.managerId || null,
      location: locationName ?? "Not set",
      employmentType: draft.employmentType,
      startDate: draft.startDate,
      status: draft.status,
      grossMonthly: gross,
      bankName: draft.bankName || null,
      bankAccount: draft.bankAccount.trim() || null,
      pensionPin: draft.pensionPin.trim() || null,
      pensionProvider: draft.pensionProvider || null,
      /* The local store has no company row to fall back to, so the demo keeps
         the old default here and the field says what it is for. */
      taxState: draft.taxState || "Lagos",
      tin: draft.tin.trim() || null,
      nhfNumber: draft.nhfNumber.trim() || null,
      addressLine: draft.addressLine.trim() || null,
      nin: draft.nin.trim() || null,
      stateOfOrigin: draft.stateOfOrigin || null,
      lgaOfOrigin: draft.lgaOfOrigin.trim() || null,
      religion: draft.religion.trim() || null,
      annualRentKobo,
      rentDeclaredAt: annualRentKobo === null ? null : new Date().toISOString(),
      nextOfKin: null,
    };
    local.create(employee);
    return employee.id;
  }

  /* --------------------------------------------------------------- render */

  /* `POST /employees` needs `EDIT_RECORDS`. A form that accepts forty fields and
     then answers 403 on Save has wasted somebody's afternoon, so it is not
     offered — and the sentence says who to ask rather than only refusing. */
  if (connected && !canCreate) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-3">
          <p className="text-body-sm font-medium text-ink">
            You cannot add an employee
          </p>
          <p className="text-body-sm text-body">
            Creating a record changes what payroll will pay, so it needs the
            permission to edit records. Ask whoever manages access.
          </p>
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => router.push("/people")}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to directory
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  const showResume = Boolean(drafts.saved) && !resumeHidden && !finished;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex flex-col gap-5">
        {/* In production this always saves to the API — there is no other
            destination — so the badge said nothing a reader didn't already
            know. Demo mode still needs to be legible: it just does not need a
            badge to say so on a form that will also warn about it below. */}
        {!connected && DEMO_ENABLED && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning" size="sm" dot>
              Saves in this browser only — demo data
            </Badge>
            <span className="text-meta text-muted">
              No API is answering, so this record will not reach a payroll run or
              another device.
            </span>
          </div>
        )}

        {showResume && drafts.saved && (
          <Callout tone="accent" title="You have an unfinished draft">
            <span className="block">
              Saved {savedAgo(drafts.saved.savedAt)}
              {drafts.saved.draft.firstName.trim()
                ? ` for ${drafts.saved.draft.firstName.trim()}`
                : ""}
              . Drafts live in this browser only — they are not on your other
              devices and clearing site data removes them.
            </span>
            <span className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="accent" size="sm" onClick={resumeDraft}>
                Carry on with it
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>
                <Trash2 aria-hidden="true" className="size-3.5" />
                Discard
              </Button>
            </span>
          </Callout>
        )}

        <Card>
          <CardBody className="flex flex-col gap-5">
            <StepIndicator
              steps={displaySteps}
              index={stepper.index}
              furthest={stepper.furthest}
              /* Read-only once added: the form behind it is blank, so letting
                 somebody click back into step one would look like an edit of the
                 record they just created. "Add another" is the way back. */
              onStepSelect={busy || finished ? undefined : stepper.goTo}
            />

            {!finished && (
              /* The legend, once, near the top. Not repeated per field — the
                 asterisk is the reminder and this is the explanation. */
              <p className="border-t border-line pt-4 text-meta text-muted">
                Fields marked <span className="font-semibold text-danger-text">*</span>{" "}
                are required. Everything else can follow later, and the record
                saves without it.
              </p>
            )}
          </CardBody>
        </Card>

        {finished ? (
          /* Cleared. The modal over this names the person; this is what is left
             behind it, and it is deliberately empty of the form. */
          <Card>
            <CardBody className="flex flex-col items-start gap-4 py-10 text-center sm:items-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-success-soft text-success-text">
                <UserRoundCheck aria-hidden="true" className="size-5" />
              </span>
              <div>
                <p className="text-h4 text-ink">
                  {added ? `${added.name} has been added` : "Added"}
                </p>
                <p className="mt-1 text-body-sm text-muted">
                  The form is clear and ready for the next person.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="accent" onClick={blank}>
                  <UserRoundPlus aria-hidden="true" className="size-4" />
                  Add another
                </Button>
                {added && (
                  <ButtonLink href={`/people/${added.id}`} variant="secondary">
                    View their record
                  </ButtonLink>
                )}
              </div>
            </CardBody>
          </Card>
        ) : (
          <form
            /* A real form, so Enter submits the step the way a keyboard user
               expects. Every control that is not the primary action therefore
               carries type="button" — `Button` sets no default type, and an
               HTML button inside a form defaults to submit. */
            onSubmit={(event) => {
              event.preventDefault();
              if (stepId === "review") void submit();
              else forward();
            }}
            className="flex flex-col gap-5"
          >
            {stepId === "who" && (
              <Card>
                <CardHeader
                  title="Who they are"
                  description="Their name is the only thing needed here. The rest helps them get their payslip."
                />
                <CardBody className="grid gap-5 sm:grid-cols-2">
                  <Field label="First name" required error={errorFor("firstName")}>
                    <Input
                      data-employee-field="firstName"
                      value={draft.firstName}
                      onChange={(e) => set("firstName", e.target.value)}
                      autoFocus
                    />
                  </Field>
                  <Field label="Last name" required error={errorFor("lastName")}>
                    <Input
                      data-employee-field="lastName"
                      value={draft.lastName}
                      onChange={(e) => set("lastName", e.target.value)}
                    />
                  </Field>
                  <Field label="Middle name" optional error={errorFor("middleName")}>
                    <Input
                      data-employee-field="middleName"
                      value={draft.middleName}
                      onChange={(e) => set("middleName", e.target.value)}
                    />
                  </Field>
                  {/* The consequence of filling this in, on the field that
                      causes it. An address here sends an invitation on save,
                      and somebody should meet that before they type rather
                      than in a sent folder — the same discipline the setup
                      wizard uses, where every answer that can be "No" carries
                      the cost of that answer on the option itself. */}
                  <Field
                    label="Work email"
                    error={errorFor("email")}
                    help={
                      draft.email.trim()
                        ? "They will be emailed an invitation to set a password and sign in. Clear this to add them without one."
                        : "Optional. Fill it in and they are emailed an invitation to their own portal when you save."
                    }
                  >
                    <Input
                      data-employee-field="email"
                      type="email"
                      value={draft.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="name@schulltech.com"
                    />
                  </Field>
                  <Field label="Phone" error={errorFor("phone")}>
                    <Input
                      data-employee-field="phone"
                      type="tel"
                      value={draft.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      placeholder="+234 803 000 0000"
                    />
                  </Field>
                  <Field label="Date of birth" optional error={errorFor("dateOfBirth")}>
                    <Input
                      data-employee-field="dateOfBirth"
                      type="date"
                      value={draft.dateOfBirth}
                      onChange={(e) => set("dateOfBirth", e.target.value)}
                    />
                  </Field>
                  <Field label="Home address" optional error={errorFor("addressLine")}>
                    <Input
                      data-employee-field="addressLine"
                      value={draft.addressLine}
                      onChange={(e) => set("addressLine", e.target.value)}
                      placeholder="14 Bishop Oluwole Street, Victoria Island, Lagos"
                    />
                  </Field>
                  <Field label="NIN" optional error={errorFor("nin")}>
                    <Input
                      data-employee-field="nin"
                      inputMode="numeric"
                      digits={11}
                      value={draft.nin}
                      onChange={(e) => set("nin", e.target.value)}
                      placeholder="12345678901"
                    />
                  </Field>
                  <Field label="State of origin" optional error={errorFor("stateOfOrigin")}>
                    <Picker
                      data-employee-field="stateOfOrigin"
                      value={draft.stateOfOrigin}
                      onChange={(value) => set("stateOfOrigin", value)}
                      placeholder="Not recorded"
                      options={NIGERIAN_STATES.map((state) => ({
                        value: state,
                        label: state,
                      }))}
                    />
                  </Field>
                  <Field
                    label="Local government area"
                    optional
                    error={errorFor("lgaOfOrigin")}
                  >
                    <Input
                      data-employee-field="lgaOfOrigin"
                      value={draft.lgaOfOrigin}
                      onChange={(e) => set("lgaOfOrigin", e.target.value)}
                      placeholder="Ikeduru"
                    />
                  </Field>
                  <Field label="Religion" optional error={errorFor("religion")}>
                    <Input
                      data-employee-field="religion"
                      value={draft.religion}
                      onChange={(e) => set("religion", e.target.value)}
                      placeholder="Christianity"
                    />
                  </Field>
                  <Field
                    label="Work location"
                    {...(locations.error
                      ? {
                          help: `${locations.error.message} Locations are unavailable.`,
                        }
                      : {})}
                  >
                    <Picker
                      value={draft.workLocationId}
                      onChange={(v) => set("workLocationId", v)}
                      placeholder="Not set"
                      loading={locations.loading}
                      options={[
                        { value: "", label: "Not set" },
                        ...locations.locations.map((l) => ({
                          value: l.id,
                          label: l.name,
                          ...(l.addressLine ? { hint: l.addressLine } : {}),
                        })),
                      ]}
                      {...(canManageStructure
                        ? {
                            onCreate: {
                              label: "Create a new work location",
                              onSelect: () => {
                                setNewName("");
                                setCreateError(null);
                                setCreating("location");
                              },
                            },
                          }
                        : {})}
                    />
                  </Field>
                </CardBody>
              </Card>
            )}

            {stepId === "job" && (
              <Card>
                <CardHeader
                  title="Job and pay"
                  description="With this and their name, payroll can pay them. Everything after this step is optional."
                />
                <CardBody className="grid gap-5 sm:grid-cols-2">
                  <Field label="Job title" required error={errorFor("jobTitle")}>
                    <Input
                      data-employee-field="jobTitle"
                      value={draft.jobTitle}
                      onChange={(e) => set("jobTitle", e.target.value)}
                      placeholder="Software Engineer"
                      autoFocus
                    />
                  </Field>
                  <Field label="Start date" required error={errorFor("startDate")}>
                    <Input
                      data-employee-field="startDate"
                      type="date"
                      value={draft.startDate}
                      onChange={(e) => set("startDate", e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Gross monthly"
                    optional
                    error={errorFor("grossMonthly")}
                    help="Before PAYE, pension and NHF. Leave it blank until it is agreed — payroll will name them until it is set."
                  >
                    <Input
                      data-employee-field="grossMonthly"
                      inputMode="numeric"
                      value={draft.grossMonthly}
                      onChange={(e) => set("grossMonthly", e.target.value)}
                      placeholder="850,000"
                    />
                  </Field>
                  <Field
                    label="Employment type"
                    help="Contract staff are taxed under withholding tax, not PAYE."
                  >
                    <Select
                      value={draft.employmentType}
                      onChange={(e) =>
                        set("employmentType", e.target.value as EmploymentType)
                      }
                    >
                      {types.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Department"
                    {...(departments.error
                      ? {
                          help: `${departments.error.message} Departments are unavailable.`,
                        }
                      : {})}
                  >
                    <Picker
                      value={draft.departmentId}
                      onChange={(v) => set("departmentId", v)}
                      placeholder="Not assigned"
                      loading={departments.loading}
                      options={[
                        { value: "", label: "Not assigned" },
                        ...departments.flat.map((d) => ({
                          value: d.id,
                          label: d.name,
                        })),
                      ]}
                      {...(canManageStructure
                        ? {
                            onCreate: {
                              label: "Create a new department",
                              onSelect: () => {
                                setNewName("");
                                setCreateError(null);
                                setCreating("department");
                              },
                            },
                          }
                        : {})}
                    />
                  </Field>
                  <Field label="Reports to">
                    <Select
                      value={draft.managerId}
                      onChange={(e) => set("managerId", e.target.value)}
                    >
                      <option value="">No manager</option>
                      {directory.employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {fullName(e)} — {e.jobTitle}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {/* Status, parked with the onboarding tab.
                      ---------------------------------------
                      Everybody added here is **Active**. Nothing asks which of
                      six states a new joiner is in, because the answer was
                      always "Active" or "Onboarding", and Onboarding now leads
                      to a screen that is out of the nav.

                      The draft's default moved from `onboarding` to `active`
                      in the same change — without that, every new joiner would
                      have been created ONBOARDING with nothing left in the
                      interface able to change it. The status is still sent
                      explicitly rather than relying on the column default, so
                      what is written is unchanged in shape.

                      To bring it back, uncomment this and the `statuses` list
                      above it, re-add the `EmploymentStatus` type import, and
                      restore the nav entry in `components/portal/nav.tsx`. */}
                  {/* <Field label="Status">
                    <Select
                      value={draft.status}
                      onChange={(e) =>
                        set("status", e.target.value as EmploymentStatus)
                      }
                    >
                      {statuses.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field> */}
                </CardBody>
              </Card>
            )}

            {stepId === "extras" && (
              <Card>
                <CardHeader title="Extras" />
                <CardBody className="flex flex-col gap-3">
                  {groups.includes("bankDetails") && (
                    <OptionalGroup
                      id="bankDetails"
                      open={open.bankDetails}
                      onToggle={() =>
                        setOpen((o) => ({ ...o, bankDetails: !o.bankDetails }))
                      }
                      filled={
                        [draft.bankName, draft.bankAccount].filter(
                          (v) => v.trim() !== "",
                        ).length
                      }
                      total={2}
                    >
                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field label="Bank">
                          {/*
                           * 255 banks, so a `<select>` would be a wheel to
                           * scroll rather than a list to search. The Picker
                           * turns on its filter past eight options, which is
                           * what makes a list this long usable at all.
                           *
                           * The code shows as the hint because it is the thing
                           * the bank's own portal asks for, and somebody
                           * checking their statement against this needs to see
                           * both. No create action: this list is the NIBSS
                           * register, not something a company adds to.
                           */}
                          <Picker
                            value={draft.bankName}
                            onChange={(v) => set("bankName", v)}
                            placeholder="Not known yet"
                            options={[
                              { value: "", label: "Not known yet" },
                              ...BANKS.map((b) => ({
                                value: b.label,
                                label: b.label,
                                /* No code shown: `Employee` has no bankCode
                                   column, so it was never going to be stored —
                                   see TODO(employee-bank-code) in the API's
                                   payments/file.ts. A number on screen that
                                   nothing keeps is noise. */
                              })),
                            ]}
                          />
                        </Field>
                        <Field
                          label="Account number"
                          error={errorFor("bankAccount")}
                          help="Ten digits."
                        >
                          <Input
                            data-employee-field="bankAccount"
                            digits={10}
                            value={draft.bankAccount}
                            onChange={(e) => set("bankAccount", e.target.value)}
                            placeholder="0123456789"
                          />
                        </Field>
                        <div className="sm:col-span-2">
                          <AccountVerificationHint
                            bankName={draft.bankName}
                            accountNumber={draft.bankAccount}
                          />
                        </div>
                      </div>
                    </OptionalGroup>
                  )}
                  {groups.includes("taxSetup") && (
                    <OptionalGroup
                      id="taxSetup"
                      open={open.taxSetup}
                      onToggle={() =>
                        setOpen((o) => ({ ...o, taxSetup: !o.taxSetup }))
                      }
                      filled={
                        [draft.taxState, draft.tin, draft.annualRent].filter(
                          (v) => v.trim() !== "",
                        ).length
                      }
                      total={3}
                    >
                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field
                          label="Tax state"
                          help={
                            !orgTax.loading && !orgTax.taxState
                              ? "Which state revenue service receives their PAYE. Your company has no default yet — set one below, or pick one for this person here."
                              : "Which state revenue service receives their PAYE. Left blank, your company's own state is used."
                          }
                        >
                          <Select
                            value={draft.taxState}
                            onChange={(e) => set("taxState", e.target.value)}
                          >
                            <option value="">Use the company&rsquo;s state</option>
                            {TAX_STATES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        {!orgTax.loading && !orgTax.taxState && (
                          <div className="rounded-xl border border-warning-line bg-warning-soft p-4 sm:col-span-2">
                            <p className="text-body-sm font-medium text-ink">
                              Set your company&rsquo;s default tax state
                            </p>
                            <p className="mt-1 text-meta text-muted">
                              Nobody has to pick one for this person if the
                              company has its own — set it once, here, and it
                              applies to everybody after this.
                            </p>
                            <div className="mt-3 flex flex-wrap items-end gap-2">
                              <Select
                                value={settingOrgTax}
                                onChange={(e) => setSettingOrgTax(e.target.value)}
                                className="max-w-xs"
                              >
                                <option value="">Choose a state</option>
                                {TAX_STATES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </Select>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                loading={savingOrgTax}
                                disabled={!settingOrgTax}
                                onClick={() => void commitOrgTaxState()}
                              >
                                Save as company default
                              </Button>
                            </div>
                            {orgTaxError && (
                              <p className="mt-2 text-meta text-danger-text">
                                {orgTaxError}
                              </p>
                            )}
                          </div>
                        )}
                        <Field
                          label="TIN"
                          error={errorFor("tin")}
                          help="Ten digits."
                        >
                          <Input
                            data-employee-field="tin"
                            digits={10}
                            value={draft.tin}
                            onChange={(e) => set("tin", e.target.value)}
                            placeholder="1234567890"
                          />
                        </Field>
                        <Field
                          label="Yearly rent they pay"
                          className="sm:col-span-2"
                          error={errorFor("annualRent")}
                          help="Since January 2026 there is no general tax-free allowance — relief is 20% of the rent they declare, up to ₦500,000 a year. Declaring nothing means they get no personal relief and pay more tax."
                        >
                          <Input
                            data-employee-field="annualRent"
                            inputMode="numeric"
                            value={draft.annualRent}
                            onChange={(e) => set("annualRent", e.target.value)}
                            placeholder="1,800,000"
                          />
                        </Field>
                      </div>
                    </OptionalGroup>
                  )}

                  {groups.includes("pensionSetup") && (
                    <OptionalGroup
                      id="pensionSetup"
                      open={open.pensionSetup}
                      onToggle={() =>
                        setOpen((o) => ({ ...o, pensionSetup: !o.pensionSetup }))
                      }
                      filled={
                        [
                          draft.pensionPin,
                          draft.pensionProvider,
                          draft.nhfNumber,
                        ].filter((v) => v.trim() !== "").length
                      }
                      total={3}
                    >
                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field
                          label="Pension PIN"
                          error={errorFor("pensionPin")}
                          help="Their RSA PIN, from their pension provider. PEN followed by 9 to 12 digits."
                        >
                          <Input
                            data-employee-field="pensionPin"
                            value={draft.pensionPin}
                            onChange={(e) => set("pensionPin", e.target.value)}
                            placeholder="PEN000000000"
                          />
                        </Field>
                        <Field label="Pension provider">
                          {providerOtherChosen ||
                          isOtherPensionProvider(draft.pensionProvider) ? (
                            <div className="flex flex-col gap-1.5">
                              <Input
                                value={draft.pensionProvider}
                                onChange={(e) =>
                                  set("pensionProvider", e.target.value)
                                }
                                placeholder="Type their pension provider's name"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="self-start"
                                onClick={() => {
                                  setProviderOtherChosen(false);
                                  set("pensionProvider", "");
                                }}
                              >
                                Choose from the list instead
                              </Button>
                            </div>
                          ) : (
                            <Select
                              value={draft.pensionProvider}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === PENSION_PROVIDER_OTHER) {
                                  setProviderOtherChosen(true);
                                  set("pensionProvider", "");
                                } else {
                                  set("pensionProvider", v);
                                }
                              }}
                            >
                              <option value="">Not known yet</option>
                              {PFAS.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                              <option value={PENSION_PROVIDER_OTHER}>
                                Other (specify)
                              </option>
                            </Select>
                          )}
                        </Field>
                        <Field
                          label="NHF number"
                          help="National Housing Fund. Only if they have one."
                        >
                          <Input
                            data-employee-field="nhfNumber"
                            value={draft.nhfNumber}
                            onChange={(e) => set("nhfNumber", e.target.value)}
                          />
                        </Field>
                      </div>
                    </OptionalGroup>
                  )}

                </CardBody>
              </Card>
            )}

            {stepId === "review" && (
              <Card>
                <CardHeader
                  title="Check this over"
                  description="Nothing has been saved yet. Anything you skipped can be added to their record afterwards."
                />
                <CardBody className="flex flex-col gap-4">
                  <ReviewBlock
                    title="Who they are"
                    onEdit={() => stepper.goTo(0)}
                    rows={[
                      [
                        "Name",
                        `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim() ||
                          "—",
                      ],
                      ["Work email", draft.email.trim() || "Not given"],
                      ["Phone", draft.phone.trim() || "Not given"],
                      ["Work location", locationName ?? "Not set"],
                    ]}
                  />
                  <ReviewBlock
                    title="Job and pay"
                    onEdit={() => stepper.goTo(1)}
                    rows={[
                      ["Job title", draft.jobTitle.trim() || "—"],
                      ["Start date", draft.startDate || "—"],
                      [
                        "Gross monthly",
                        /* `Money` renders the absence itself, so the review
                           line reads "Not set yet" rather than an em dash that
                           says nothing about whether anybody looked. Keyed
                           because this sits inside an array of rows. */
                        <Money key="gross" amount={gross} />,
                      ],
                      ["Department", departmentName ?? "Not assigned"],
                    ]}
                  />
                  {hasExtras && (
                    <ReviewBlock
                      title="Extras"
                      onEdit={() =>
                        stepper.goTo(steps.findIndex((s) => s.id === "extras"))
                      }
                      rows={[
                        ...(groups.includes("taxSetup")
                          ? ([
                              [
                                "Tax state",
                                draft.taxState || "Your company's state",
                              ],
                              ["TIN", draft.tin.trim() || "Not given"],
                              [
                                "Yearly rent declared",
                                rentDeclared ? (
                                  <Money amount={Number(money(draft.annualRent))} />
                                ) : (
                                  "Nothing declared — no personal relief"
                                ),
                              ],
                            ] as [string, React.ReactNode][])
                          : []),
                        ...(groups.includes("pensionSetup")
                          ? ([
                              [
                                "Pension PIN",
                                draft.pensionPin.trim() || "Not given",
                              ],
                              [
                                "NHF number",
                                draft.nhfNumber.trim() || "Not given",
                              ],
                            ] as [string, React.ReactNode][])
                          : []),
                        ...(groups.includes("bankDetails")
                          ? ([
                              [
                                "Bank account",
                                draft.bankAccount.trim()
                                  ? `${draft.bankName || "Bank not set"} · ${draft.bankAccount.trim()}`
                                  : "Not given",
                              ],
                            ] as [string, React.ReactNode][])
                          : []),
                      ]}
                    />
                  )}
                </CardBody>
              </Card>
            )}

            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-1 py-3">
              <div className="flex items-center gap-2">
                {stepper.isFirst ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => router.push("/people")}
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    Cancel
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" onClick={stepper.back}>
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    Back
                  </Button>
                )}
                {/* Explicit, never automatic. A draft that saves itself on every
                    keystroke is a draft nobody can choose not to keep. */}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={saveDraft}
                  disabled={busy}
                >
                  <Save aria-hidden="true" className="size-4" />
                  Save draft
                </Button>
              </div>

              {stepId === "review" ? (
                <Button type="submit" variant="accent" loading={busy}>
                  {!busy && <Check aria-hidden="true" className="size-4" />}
                  Add employee
                </Button>
              ) : (
                <Button type="submit" variant="accent" disabled={busy}>
                  Continue
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Live consequences.
          Gone entirely once the record is added: every panel here describes the
          form, the form is now blank, and a "3 still needed" beside a cleared
          page reads as a complaint about the person who was just created rather
          than about nothing at all. The modal carries what is outstanding for
          the record that actually exists. */}
      <aside
        className={cn(
          "flex flex-col gap-4 lg:sticky lg:top-20",
          finished && "hidden",
        )}
      >
        <Card>
          <CardHeader title="Payroll readiness" />
          <CardBody className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {(
                [
                  ["Bank account", Boolean(draft.bankAccount), "bankDetails", "bankAccount"],
                  ["Pension PIN", Boolean(draft.pensionPin), "pensionSetup", "pensionPin"],
                  ["TIN", Boolean(draft.tin), "taxSetup", "tin"],
                ] as [string, boolean, RecordFieldKey, PayrollGap["field"]][]
              ).map(([label, done, key, field]) => {
                /* `gap` names the actual consequence of this one field being
                   empty — "cannot be paid" for the bank account, a warning
                   for the other two — rather than a checklist that speaks for
                   all three in the same voice. */
                const gap = payrollGaps.find((g) => g.field === field);
                return (
                  <li key={label} className="flex items-start gap-2.5 text-body-sm">
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                        done
                          ? "bg-success text-ink"
                          : "border border-line-strong",
                      )}
                    >
                      {done ? (
                        <Check aria-hidden="true" className="size-2.5" strokeWidth={3} />
                      ) : null}
                    </span>
                    <span className={done ? "text-body" : "text-muted"}>
                      {label}
                      {/* Honest about *why* it is not being asked for. A group
                          switched off in Settings still leaves the field
                          checked by the engine (or, for TIN, checked by
                          nobody at all) — a checklist that quietly omitted the
                          reason would look like the product had changed its
                          mind. */}
                      {!done && !enabled[key] && (
                        <span className="block text-meta text-faint">
                          Not asked for here — switched off in Settings
                        </span>
                      )}
                      {!done && enabled[key] && gap && (
                        <span className="block text-meta text-faint">
                          {gap.consequence}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        {gross !== null && gross > 0 && (
          <FirstPayslip grossKobo={grossKobo} annualRentKobo={annualRentKobo} />
        )}

        <Card>
          <CardBody className="flex items-start gap-3">
            <UserRoundPlus
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-faint"
            />
            {/* Was: "saving with a status of Onboarding adds them to the
                onboarding checklist automatically." That promise is not true
                while the onboarding tab is out of the nav, and a sentence
                describing a screen nobody can reach is worse than none. */}
            <p className="text-meta leading-relaxed text-muted">
              They are added as{" "}
              <Badge tone="success" size="sm">
                Active
              </Badge>
              , so they appear in the directory and on the next payroll
              straight away.
            </p>
          </CardBody>
        </Card>
      </aside>

      {/* The success state. Named, iconed, and offering the only two things
          anybody wants next. Not dismissible into nowhere: closing it leaves the
          cleared page behind, which says the same thing. */}
      {/*
       * Creating a department or a location without leaving the form.
       *
       * One field, because that is all either needs — the API defaults the rest,
       * and asking for an address to record "Head office" is how somebody
       * abandons this and leaves the field blank instead. Anything more detailed
       * is edited in Settings afterwards.
       */}
      <Modal
        open={creating !== null}
        onClose={() => setCreating(null)}
        size="sm"
        title={
          creating === "department"
            ? "New department"
            : "New work location"
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              loading={creatingBusy}
              onClick={() => void commitCreate()}
            >
              Create and use it
            </Button>
          </div>
        }
      >
        <Field
          label={creating === "department" ? "Department name" : "Location name"}
          required
          {...(createError ? { error: createError } : {})}
        >
          <Input
            autoFocus
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setCreateError(null);
            }}
            /* Enter submits. A one-field dialog that needs a mouse to finish is
               slower than the Settings trip it exists to avoid. */
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commitCreate();
              }
            }}
            placeholder={
              creating === "department" ? "Finance" : "Head office"
            }
          />
        </Field>
      </Modal>

      <Modal
        open={added !== null}
        onClose={() => setAdded(null)}
        size="sm"
        title={added ? `${added.name} has been added` : "Added"}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success-text">
            <UserRoundCheck aria-hidden="true" className="size-6" />
          </span>
          <p className="text-body-sm leading-relaxed text-body">
            {connected
              ? "Their record is saved and they are in the directory."
              : "Their record is saved in this browser. It will not reach payroll or another device."}
          </p>

          {added && (added.blocking.length > 0 || added.advisory.length > 0) && (
            <div className="flex w-full flex-col gap-2 text-left text-meta leading-relaxed">
              {added.blocking.length > 0 && (
                <p className="rounded-md bg-canvas p-3 text-muted">
                  Still needed to pay them: {added.blocking.join(", ")}. Payroll
                  will hold them back until{" "}
                  {added.blocking.length > 1 ? "these are" : "this is"} on the
                  record —{" "}
                  <Link
                    href={`/people/${added.id}`}
                    className="font-medium text-accent-text underline decoration-accent-line underline-offset-4 hover:decoration-accent"
                  >
                    add {added.blocking.length > 1 ? "them" : "it"} now
                  </Link>
                  .
                </p>
              )}
              {added.advisory.length > 0 && (
                <p className="rounded-md bg-canvas p-3 text-muted">
                  Also worth adding: {added.advisory.join(", ")}. This does not
                  hold their pay back —{" "}
                  <Link
                    href={`/people/${added.id}`}
                    className="font-medium text-accent-text underline decoration-accent-line underline-offset-4 hover:decoration-accent"
                  >
                    add {added.advisory.length > 1 ? "them" : "it"} now
                  </Link>
                  .
                </p>
              )}
            </div>
          )}

          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="accent"
              block
              onClick={() => {
                setAdded(null);
                blank();
              }}
            >
              <UserRoundPlus aria-hidden="true" className="size-4" />
              Add another
            </Button>
            {added && (
              <ButtonLink href={`/people/${added.id}`} variant="secondary" block>
                View their record
              </ButtonLink>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One collapsed, opt-in group of statutory fields.
 *
 * The mechanics moved to `Disclosure` in `components/ui/disclosure.tsx` when the
 * leave screen needed the same thing for a twelve-month calendar. This is now
 * only the copy: title, count, and the consequence of leaving the group shut.
 *
 * Two of the flags matter and are not defaults:
 *
 * - `keepMounted`, because closing a group must not throw away what somebody
 *   typed into it.
 * - `region={false}`, because three landmarks inside one wizard step is not what
 *   a landmark is for. These are field groups, so `role="group"`.
 */
function OptionalGroup({
  id,
  open,
  onToggle,
  filled,
  total,
  children,
}: {
  id: RecordFieldKey;
  open: boolean;
  onToggle: () => void;
  /** How many of this group's fields have something in them. */
  filled: number;
  total: number;
  children: React.ReactNode;
}) {
  const copy = GROUP_COPY[id];

  return (
    <Disclosure
      open={open}
      onToggle={onToggle}
      keepMounted
      region={false}
      title={copy.title}
      meta={
        <Badge tone={filled > 0 ? "success" : "neutral"} size="sm">
          {filled > 0 ? `${filled} of ${total} filled` : "Optional"}
        </Badge>
      }
      hint={SKIP_CONSEQUENCE[id]}
      openHint={copy.purpose}
    >
      {children}
    </Disclosure>
  );
}

function ReviewBlock({
  title,
  rows,
  onEdit,
}: {
  title: string;
  rows: [string, React.ReactNode][];
  onEdit: () => void;
}) {
  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-center justify-between gap-4 border-b border-line px-3.5 py-2.5">
        <h3 className="text-body-sm font-semibold text-ink">{title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>
      <dl className="divide-y divide-line">
        {rows.map(([term, value]) => (
          <div
            key={term}
            className="flex items-baseline justify-between gap-4 px-3.5 py-2.5"
          >
            <dt className="text-meta text-muted">{term}</dt>
            <dd className="min-w-0 text-right text-body-sm text-ink">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * What this salary actually pays, worked out by the API.
 *
 * `POST /payroll/quote` with no settings block, so the figures come back on the
 * company's **saved** settings — which are the ones a real run will use, and
 * therefore the only ones worth showing somebody about to create the record.
 *
 * The declared rent rides along in the variation, so the panel answers the
 * question the rent field raises: declaring ₦1.8m of rent is worth ₦360,000 of
 * relief, and until this shipped there was nowhere in the product to enter the
 * figure at all — while the payroll run raised a `rent_relief_unclaimed` warning
 * about exactly that. A warning nobody can act on is worse than none.
 *
 * This panel used to run a copy of the payroll engine in the browser. That copy
 * was left on the 2011 PAYE bands when the Nigeria Tax Act 2025 went into the
 * API, so it quoted ₦63,266.67 on ₦500,000 a month against a correct ₦63,950 —
 * and nothing on screen could have told you which one you were looking at. With
 * no API there is now no figure, which is the honest version of the same state.
 */
function FirstPayslip({
  grossKobo,
  annualRentKobo,
}: {
  grossKobo: number;
  annualRentKobo: number | null;
}) {
  const { quote, loading, error, available } = usePayslipQuote(
    useMemo(
      () => ({
        grossMonthlyKobo: grossKobo,
        ...(annualRentKobo === null ? {} : { variation: { annualRentKobo } }),
      }),
      [grossKobo, annualRentKobo],
    ),
  );
  const slip = quote?.slip ?? null;

  return (
    <Card>
      <CardHeader
        title="First payslip"
        description={
          available ? "Calculated on your company settings." : "Needs the API."
        }
      />
      <CardBody className="flex flex-col gap-2.5">
        {!available ? (
          <p className="text-body-sm leading-relaxed text-muted">
            PAYE, pension and NHF are worked out by the payroll engine on the
            server. There is no second copy of it in this browser — there was
            once, and it spent a while quoting the wrong year&rsquo;s tax. The
            record still saves; the figures appear once the API is reachable.
          </p>
        ) : loading || !slip ? (
          <>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
            <span className="sr-only">Working out the first payslip</span>
            {error && (
              <p className="text-body-sm leading-relaxed text-danger-text">
                {error.message}
              </p>
            )}
          </>
        ) : (
          <>
            <Row label="Gross" value={naira(slip.grossKobo)} strong />
            <div className="h-px bg-line" />
            <Row label="Pension" value={-naira(slip.pensionEmployeeKobo)} />
            <Row label="NHF" value={-naira(slip.nhfKobo)} />
            <Row label="PAYE" value={-naira(slip.payeKobo)} />
            <div className="h-px bg-line" />
            <Row label="Net monthly" value={naira(slip.netKobo)} strong />
            <p className="mt-1 rounded-md bg-canvas p-2.5 text-meta leading-relaxed text-muted">
              Employer pension of{" "}
              <Money amount={naira(slip.pensionEmployerKobo)} /> is paid on top
              and is not deducted.
              {slip.reliefUnclaimed
                ? " No yearly rent is declared, so they get no personal relief and the PAYE above is the full amount. Open “Set up tax” to declare it."
                : ""}
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={
          strong
            ? "text-body-sm font-medium text-ink"
            : "text-body-sm text-body"
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? "tabular text-body font-semibold text-ink"
            : "tabular text-body-sm text-body"
        }
      >
        <Money amount={Math.round(value)} />
      </span>
    </div>
  );
}
