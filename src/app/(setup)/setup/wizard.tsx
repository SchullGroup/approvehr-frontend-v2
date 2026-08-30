"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Lock, MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Button,
  ButtonLink,
  Callout,
  Field,
  Input,
  ProgressMeter,
  Select,
  Skeleton,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { invitesApi } from "@/lib/api/invites";
import type {
  ApiWizardOption,
  ApiWizardQuestion,
  FeatureKey,
} from "@/lib/api/setup";
import { MODULE_FEATURE_KEYS } from "@/lib/api/setup";
import { NIGERIAN_STATES } from "@/lib/reference/lists";
import { usePermissions } from "@/lib/permissions";
import { useOrgTaxState } from "@/lib/store/company";
import { useDeductionSwitches } from "@/lib/store/payroll-deductions";
import { useWorkLocationList, useWorkLocationMutations } from "@/lib/store/work-locations";
import type { ApiWorkLocation } from "@/lib/api/attendance";
import { useRoles } from "@/lib/store/permissions";
import {
  PositionError,
  readPosition,
  type PositionFix,
} from "@/lib/geolocation";
import { FEATURE_COPY, useFeatures, useWizard } from "@/lib/store/features";
import { CreateRoleDialog } from "@/app/(app)/settings/roles/create-role";
import { failureMessage } from "@/components/portal/load-failure";
import {
  takePendingVerification,
  type PendingVerification,
} from "@/lib/pending-email-verification";
import { VerificationNudge } from "./verification-nudge";

/**
 * Setup.
 *
 * The second thing a customer sees, and the screen that decides how big the
 * rest of the product looks. Seven questions, one per screen, each answerable
 * from memory by somebody who has never used HR software: how many people you
 * pay, whether you run appraisals, whether you deduct PAYE, whether you run a
 * pension scheme, whether staff check in and out, any extra roles this company
 * needs beyond the eight built in ones, and whether gross pay splits into
 * basic, housing and transport. `shifts`, `loans` and `expenses` used to be
 * three more questions here and are not any more — they still exist as
 * Settings toggles, just no longer asked about during onboarding. See
 * `QUESTION_IDS`'s own header on the API for why that is the one case where a
 * question was removed rather than only ever appended.
 *
 * Three kinds, worth knowing apart. Three decide which **modules** exist and
 * cost nothing to get wrong, because Settings turns them back on. Three decide
 * what the **payroll engine computes**, and getting those wrong is a wrong
 * payslip — a company with no pension scheme, asked nothing, has 8% taken off
 * every salary it runs, and one asked nothing about its salary structure gets
 * a single basic-salary line rather than a guessed three-way split. PAYE and
 * pension's "No" carries the API's own sentence about what it means, on
 * screen, before the click — the salary question has no such sentence,
 * because neither a single line nor a three-way split is unlawful; what the
 * split affects is only which base NHF is charged on, and that lives beside
 * the fields it actually changes, in the sub-form below, rather than blocking
 * the initial click. The last — roles — sets nothing at all; see `RolesStep`
 * below for why it exists here anyway and why it is the one step that can be
 * skipped.
 *
 * ## Three rules it follows
 *
 * **One question per step.** Not a form of five fields. A form invites you to
 * study it; a question invites you to answer it. The answer is a button, never
 * a dropdown-plus-Save.
 *
 * **There is no skip — with one deliberate exception.** Every question gets an
 * answer before the next one shows, and no option is pre-marked as the current
 * or default state — this used to be skippable with a "Now" badge showing what
 * skipping would leave in place, and both let somebody get through setup
 * without deciding anything. The one exception is the roles step: unlike every
 * question above it, getting it wrong is not a wrong payslip or a missing
 * module, so it is allowed to say "skip this, I'll do it later" instead of
 * forcing a decision that has no real consequence either way.
 *
 * **A "yes" that needs a fact gets asked for the fact.** Turning PAYE on is not
 * enough to compute it: `Organization.taxState` decides which state every
 * employee files to, and it used to be possible to answer "Yes" here and land
 * on the dashboard with no state set at all — a blocker that surfaced only
 * when somebody tried to run payroll for real. Answering "Yes" to the PAYE
 * question now asks which state, on the same screen, before letting the
 * wizard move on, so the gap closes at setup time rather than at payroll time.
 *
 * **Progress is the truth.** The bar measures questions *answered on the
 * server*, so a resumed wizard opens where it stopped and the bar agrees with
 * it. It never rounds up to look encouraging.
 *
 * ## The questions are not in this file
 *
 * They come from `GET /setup/wizard` — wording, order, options and the exact
 * flags each answer writes. That is what lets the wording improve without a
 * frontend release, and it is why nothing below hardcodes a question or
 * recomputes what an answer does. (`lib/store/features.ts` keeps one mirrored
 * copy for demonstrations with no API, and says so.)
 */
export function SetupWizard() {
  const wizard = useWizard();
  const features = useFeatures();
  const orgTax = useOrgTaxState();
  /* Only `save` is used here — the wizard writes a fresh split, it does not
     read one back to display, so the hook's own fetch effect (gated on
     `VIEW_SALARIES`) is simply unused rather than worked around. */
  const deductions = useDeductionSwitches();
  /* Not `useWorkLocations()`: that convenience wrapper exposes a create that
     reloads itself but no way to reload after an *update*, and this screen
     needs both — see `confirmOffice` below, which now does either. */
  const offices = useWorkLocationList(false);
  const officeMutations = useWorkLocationMutations();
  const toast = useToast();

  /**
   * Where the user has navigated to by hand. `null` means "wherever the server
   * says we got to".
   *
   * Position is **derived**, not synchronised in an effect. Copying the server's
   * step into state on arrival needs a `setState` inside `useEffect`, which is
   * a cascading render and is what `react-hooks/set-state-in-effect` exists to
   * stop. So `resumeAt` is computed every render and this override — only ever
   * written by a click — sits on top of it.
   */
  const [movedTo, setMovedTo] = useState<number | null>(null);
  /**
   * The "confirm your email" nudge, handed off from the register screen.
   *
   * A real side effect (reading and consuming `sessionStorage`), not derived
   * render data, so this is the one piece of state on this screen that
   * belongs in an effect rather than computed inline — same reasoning as the
   * `started` ref on `verify-email-screen.tsx`. Guarded the same way, against
   * the double-invoke React does in development. Rendered from `Frame`
   * rather than threaded through every branch below it as a prop: `Frame` is
   * already the one wrapper every branch but `Done` returns through, and this
   * screen has no persistent shell around it to fall back on — `(setup)`'s
   * own `layout.tsx` is deliberately chrome-free, so
   * `components/portal/verification-banner.tsx` never reaches this route.
   */
  const [pending, setPending] = useState<PendingVerification | null>(null);
  const pendingChecked = useRef(false);
  useEffect(() => {
    if (pendingChecked.current) return;
    pendingChecked.current = true;
    setPending(takePendingVerification());
  }, []);
  const nudge = pending && (
    <VerificationNudge
      email={pending.email}
      hint={pending.hint}
      onDismiss={() => setPending(null)}
    />
  );
  /**
   * `null` until something happens: the wizard has not been finished *in this
   * visit*. That is a different fact from "setup is complete", which the server
   * owns, and the two produce different sentences on the last screen.
   */
  const [phase, setPhase] = useState<"done" | null>(null);
  /** The option currently being saved, so only that button spins. */
  const [busy, setBusy] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  /**
   * Set the moment an option that turns PAYE on is chosen and the
   * organisation has no tax state on file yet. While this holds a value, the
   * wizard does not advance — the state prompt below is the only next step,
   * not an extra screen to click past.
   */
  const [awaitingTaxState, setAwaitingTaxState] = useState(false);
  const [taxStateChoice, setTaxStateChoice] = useState("");
  const [savingTaxState, setSavingTaxState] = useState(false);
  const [taxStateError, setTaxStateError] = useState<string | null>(null);
  /**
   * Same shape as the tax-state prompt above, for the same reason: turning
   * attendance on raises a question that has to be answered *here*, because
   * a clock-in with nowhere to clock in to is a feature that looks switched
   * on and does nothing. The company's first office is that answer.
   */
  const [awaitingOffice, setAwaitingOffice] = useState(false);
  const [officeName, setOfficeName] = useState("Head office");
  const [officeAddress, setOfficeAddress] = useState("");
  const [officeFix, setOfficeFix] = useState<PositionFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [savingOffice, setSavingOffice] = useState(false);
  const [officeError, setOfficeError] = useState<string | null>(null);
  /**
   * Reopening the office form to change what was already saved, rather than
   * creating a second office — `null` while the form (if open at all) is
   * making the *first* one. Set only by the "Edit" line under an answered
   * attendance question, never by the initial "Yes".
   */
  const [editingLocationId, setEditingLocationId] = useState<string | null>(
    null,
  );
  /**
   * Same shape as the tax-state and office prompts above, for the same
   * reason: "yes, I split gross pay" is not answerable by clicking an option,
   * it needs three numbers a person has to type and check sum to 100 —
   * exactly the shape `sets`/`payroll` cannot express, which is why the
   * question itself writes nothing (see `QUESTIONS.salaryStructure` on the
   * API). "No" needs none of this: 100% basic is already the default a fresh
   * `PayrollSettings` row gets.
   */
  const [awaitingSalarySplit, setAwaitingSalarySplit] = useState(false);
  const [splitBasic, setSplitBasic] = useState("");
  const [splitHousing, setSplitHousing] = useState("");
  const [splitTransport, setSplitTransport] = useState("");
  const [savingSplit, setSavingSplit] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);

  const total = wizard.questions.length;
  /* `step` counts answers and is 1-based, so it is already the index of the
     first unanswered question. Clamped, because a completed wizard reports the
     total. */
  const resumeAt = total === 0 ? 0 : Math.min(wizard.step, total - 1);
  const index = movedTo ?? resumeAt;
  const done =
    phase === "done" || (!wizard.loading && wizard.setupCompletedAt !== null);

  const finish = useCallback(async () => {
    setFinishing(true);
    try {
      await wizard.complete();
      setPhase("done");
    } catch (error) {
      toast.push({
        title: "Could not finish setup",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setFinishing(false);
    }
  }, [wizard, toast]);

  /** What "answer accepted" does next — the shared tail of both paths below. */
  const advance = useCallback(async () => {
    if (index + 1 < total) setMovedTo(index + 1);
    else await finish();
  }, [index, total, finish]);

  const choose = async (
    question: ApiWizardQuestion,
    option: ApiWizardOption,
  ) => {
    setBusy(option.value);
    try {
      await wizard.answer(question.id, option.value);
      if (option.payroll?.payeEnabled && !orgTax.taxState) {
        setTaxStateChoice("");
        setTaxStateError(null);
        setAwaitingTaxState(true);
      } else if (
        question.id === "attendance" &&
        option.sets.attendance === true &&
        offices.locations.length === 0
      ) {
        /* Only when they have no office on file. A company coming back to
           change this answer already has somewhere to clock in, and asking
           again would create a second one. */
        setOfficeError(null);
        setAwaitingOffice(true);
      } else if (question.id === "salaryStructure" && option.value === "yes") {
        setSplitBasic("");
        setSplitHousing("");
        setSplitTransport("");
        setSplitError(null);
        setAwaitingSalarySplit(true);
      } else {
        await advance();
      }
    } catch (error) {
      toast.push({
        title: "Could not save that answer",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(null);
    }
  };

  const confirmTaxState = async () => {
    if (!taxStateChoice) return;
    setSavingTaxState(true);
    setTaxStateError(null);
    const ok = await orgTax.setTaxState(taxStateChoice);
    setSavingTaxState(false);
    if (!ok) {
      setTaxStateError("That could not be saved. Try again.");
      return;
    }
    setAwaitingTaxState(false);
    await advance();
  };

  const confirmSalarySplit = async () => {
    const basic = Number(splitBasic) || 0;
    const housing = Number(splitHousing) || 0;
    const transport = Number(splitTransport) || 0;
    if (Math.abs(basic + housing + transport - 100) > 0.01) return;
    setSavingSplit(true);
    setSplitError(null);
    try {
      await deductions.save({
        basicPercent: basic / 100,
        housingPercent: housing / 100,
        transportPercent: transport / 100,
      });
      setAwaitingSalarySplit(false);
      await advance();
    } catch (error) {
      setSplitError(
        error instanceof ApiError
          ? error.message
          : "That could not be saved. Try again.",
      );
    } finally {
      setSavingSplit(false);
    }
  };

  /**
   * Capture where the office is from the browser, rather than asking for
   * latitude.
   *
   * There is no geocoding in this product — no maps key, no places API — so
   * an address cannot be turned into coordinates. What is available is the
   * device's own position, and the person setting a company up is very often
   * sitting in the office they are describing. One tap beats reading two
   * six-decimal numbers off a maps app, which is what the settings screen
   * has to ask for later.
   *
   * Entirely optional. Without it the office is still created and staff can
   * still clock in; what is missing is only the check on *where* from.
   */
  const captureOfficeLocation = async () => {
    setLocating(true);
    setOfficeError(null);
    try {
      setOfficeFix(await readPosition());
    } catch (error) {
      setOfficeFix(null);
      setOfficeError(
        error instanceof PositionError
          ? error.message
          : "Your browser would not say where you are. You can set this later in Settings.",
      );
    } finally {
      setLocating(false);
    }
  };

  const confirmOffice = async () => {
    if (!officeName.trim()) return;
    setSavingOffice(true);
    setOfficeError(null);
    try {
      /* All three together or none — the API refuses a half-built fence, and
         `readPosition` gives both coordinates at once. 150m covers a building
         and its car park, which is the settings screen's own guidance for a
         first radius. */
      const fence = officeFix
        ? {
            latitude: officeFix.latitude,
            longitude: officeFix.longitude,
            radiusMetres: 150,
          }
        : {};
      if (editingLocationId) {
        /* A correction to what is already on file, not a second office —
           `null` clears the address rather than a blank string leaving the
           old one in place, which is what `WorkLocationPatch` means by
           "absent leaves a field alone; `null` clears it". */
        await officeMutations.update(editingLocationId, {
          name: officeName.trim(),
          addressLine: officeAddress.trim() ? officeAddress.trim() : null,
          ...fence,
        });
        offices.reload();
        setAwaitingOffice(false);
        setEditingLocationId(null);
        /* Correcting an answer already on this question does not move
           forward — only a fresh "Yes" does that. */
        return;
      }
      await officeMutations.create({
        name: officeName.trim(),
        ...(officeAddress.trim() ? { addressLine: officeAddress.trim() } : {}),
        ...fence,
      });
      offices.reload();
      setAwaitingOffice(false);
      await advance();
    } catch (error) {
      setOfficeError(
        error instanceof ApiError
          ? error.message
          : "That could not be saved. Try again.",
      );
    } finally {
      setSavingOffice(false);
    }
  };

  /**
   * Reopen the office form on what is already saved, rather than the blank
   * "Head office" a fresh answer starts from. Only reachable once an office
   * exists — see the preview line below, which is the only thing that renders
   * this button.
   */
  const openEditOffice = (office: ApiWorkLocation) => {
    setOfficeName(office.name);
    setOfficeAddress(office.addressLine ?? "");
    setOfficeFix(
      office.latitude !== null && office.longitude !== null
        ? {
            latitude: office.latitude,
            longitude: office.longitude,
            /* Not a real reading — the office has no stored accuracy, only a
               fence. `accuracyMetres` is never sent to the API or shown on
               screen; it exists purely as `PositionFix`'s third field. */
            accuracyMetres: 0,
          }
        : null,
    );
    setOfficeError(null);
    setEditingLocationId(office.id);
    setAwaitingOffice(true);
  };

  /* ------------------------------------------------------------ loading */

  if (wizard.loading) {
    return (
      <Frame nudge={nudge}>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-4 h-2 w-full" />
        <Skeleton className="mt-10 h-9 w-4/5" />
        <Skeleton className="mt-3 h-4 w-3/5" />
        <div className="mt-9 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </Frame>
    );
  }

  if (wizard.error) {
    return (
      <Frame nudge={nudge}>
        <Callout tone="danger" title="Setup could not load">
          {failureMessage(wizard.error, "your setup")}
        </Callout>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="accent" onClick={wizard.reload}>
            Try again
          </Button>
          <ButtonLink href="/dashboard" variant="secondary">
            Go to the dashboard
          </ButtonLink>
        </div>
      </Frame>
    );
  }

  if (done) {
    return (
      <Done
        /* Modules only. The three employee-record field groups are switchable
           in Settings and default on, so listing them here would report
           "you turned on Bank accounts" to somebody who answered five
           questions about shifts and loans. */
        flags={MODULE_FEATURE_KEYS.filter((key) => features[key])}
        returning={phase !== "done"}
        nudge={nudge}
      />
    );
  }

  const question = wizard.questions[index];
  if (!question) {
    return (
      <Frame nudge={nudge}>
        <Callout tone="warning" title="Nothing to ask">
          There are no setup questions right now.
        </Callout>
        <div className="mt-5">
          <ButtonLink href="/dashboard" variant="accent">
            Go to the dashboard
          </ButtonLink>
        </div>
      </Frame>
    );
  }

  /* Somebody without settings access can see the questions and not answer them.
     Saying so once, plainly, beats five failing buttons. */
  if (!wizard.canAnswer) {
    return (
      <Frame nudge={nudge}>
        <span className="flex size-10 items-center justify-center rounded-full bg-sunken text-muted">
          <Lock aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-5 text-h3 text-ink">
          Whoever manages settings does this part
        </h1>
        <p className="mt-2.5 text-body-sm leading-relaxed text-body">
          Ask them to finish setup. Everything you can use already works.
        </p>
        <div className="mt-6">
          <ButtonLink href="/dashboard" variant="accent">
            Go to the dashboard
          </ButtonLink>
        </div>
      </Frame>
    );
  }

  /* `step` counts answers, so a question at or below it has been answered —
     which is what makes marking its answer honest rather than a default
     dressed up as one. See `chosenOption`. */
  const answered = question.step <= wizard.step;
  const chosen = answered
    ? chosenOption(
        question,
        features as unknown as Record<string, unknown>,
        wizard.deductions as unknown as Record<string, unknown> | null,
      )
    : null;

  return (
    <Frame nudge={nudge}>
      <p className="text-body-sm font-medium text-muted">
        Question {index + 1} of {total}
      </p>

      <ProgressMeter
        value={index}
        max={total}
        showValue={false}
        tone="accent"
        size="sm"
        className="mt-3"
      />

      <div className="mt-10">
        <h1 className="text-h3 text-ink sm:text-h2">{question.question}</h1>
        <p className="mt-3 text-lead text-body">{question.help}</p>
      </div>

      {answered && (
        <p className="mt-4 text-body-sm text-muted">
          You answered this already. Pick again to change it.
        </p>
      )}

      {question.id === "roles" ? (
        <RolesStep
          disabled={busy !== null || finishing}
          onContinue={() => void choose(question, question.options[0]!)}
        />
      ) : (
        <div
          className={cn(
            "mt-9 grid gap-3",
            /* An option carrying a consequence is a paragraph, not a chip, and two
               paragraphs side by side in a 36rem column read as a wall. One
               column whenever any option has one. */
            question.options.length > 1 &&
              !question.options.some((option) => option.consequence) &&
              "sm:grid-cols-2",
          )}
        >
          {question.options.map((option) => (
            <OptionButton
              key={option.value}
              option={option}
              chosen={answered && chosen === option.value}
              busy={busy === option.value}
              disabled={
                busy !== null ||
                finishing ||
                awaitingTaxState ||
                awaitingOffice ||
                awaitingSalarySplit
              }
              onSelect={() => void choose(question, option)}
            />
          ))}
        </div>
      )}

      {/* The two questions whose answer is not only an option.
          Answering them wrote a *fact* — a filing state, an office — through a
          different store, and coming back to find the option marked but the
          fact itself invisible is the same "did that save?" moment one level
          down. Both are shown, and the one that is a single editable value
          offers a way back into its own prompt. */}
      {answered &&
        question.id === "paye" &&
        orgTax.taxState &&
        !awaitingTaxState && (
          <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-body">
            <span>
              Filing to{" "}
              <span className="font-medium text-ink">{orgTax.taxState}</span>.
            </span>
            <button
              type="button"
              className="font-medium text-accent-text underline-offset-4 hover:underline"
              disabled={busy !== null || finishing}
              onClick={() => {
                setTaxStateChoice(orgTax.taxState ?? "");
                setTaxStateError(null);
                setAwaitingTaxState(true);
              }}
            >
              Change
            </button>
          </p>
        )}

      {answered &&
        question.id === "attendance" &&
        offices.locations.length === 1 &&
        !awaitingOffice &&
        (() => {
          const office = offices.locations[0]!;
          return (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-body-sm text-body">
                Clocking in at{" "}
                <span className="font-medium text-ink">{office.name}</span>
                {office.addressLine && (
                  <span className="text-muted"> — {office.addressLine}</span>
                )}
                . You can add branches in Settings.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEditOffice(office)}
              >
                Edit
              </Button>
            </div>
          );
        })()}

      {/* More than one office already exists — the wizard made one, Settings
          made the rest. Editing any of them by name here would be guessing
          which "Head office" somebody means; Settings has the real list. */}
      {answered &&
        question.id === "attendance" &&
        offices.locations.length > 1 &&
        !awaitingOffice && (
          <p className="mt-5 text-body-sm text-body">
            Clocking in at{" "}
            <span className="font-medium text-ink">
              {offices.locations.map((office) => office.name).join(", ")}
            </span>
            . Manage branches in Settings.
          </p>
        )}

      {awaitingTaxState && (
        <div className="mt-6 rounded-lg border border-accent-line bg-accent-soft p-5">
          <Field
            label="Which state do you file PAYE to?"
            help="The state every employee falls back to when their own record does not say."
            {...(taxStateError ? { error: taxStateError } : {})}
          >
            <Select
              value={taxStateChoice}
              disabled={savingTaxState}
              onChange={(e) => setTaxStateChoice(e.target.value)}
            >
              <option value="" disabled>
                Choose a state
              </option>
              {NIGERIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            variant="accent"
            size="sm"
            className="mt-4"
            loading={savingTaxState}
            disabled={!taxStateChoice}
            onClick={() => void confirmTaxState()}
          >
            Continue
          </Button>
        </div>
      )}

      {awaitingOffice && (
        <div className="mt-6 flex flex-col gap-4 rounded-lg border border-accent-line bg-accent-soft p-5">
          <div>
            <p className="text-body font-semibold text-ink">
              {editingLocationId
                ? "Change where people clock in"
                : "Where do people clock in?"}
            </p>
            <p className="mt-1 text-body-sm leading-relaxed text-body">
              {editingLocationId
                ? "This updates the office already on file — it does not add a second one."
                : "Staff pick a place when they clock in, so there has to be at least one. You can add branches later."}
            </p>
          </div>

          <Field label="What it is called" required>
            <Input
              value={officeName}
              disabled={savingOffice}
              placeholder="Head office"
              onChange={(e) => setOfficeName(e.target.value)}
            />
          </Field>

          <Field
            label="Address"
            optional
            help="For the record. It appears on the clock-in screen."
          >
            <Input
              value={officeAddress}
              disabled={savingOffice}
              placeholder="12 Allen Avenue, Ikeja, Lagos"
              onChange={(e) => setOfficeAddress(e.target.value)}
            />
          </Field>

          {/* The geofence, offered rather than demanded. An address cannot be
              turned into coordinates — there is no geocoding here — but the
              browser knows where this device is, and whoever is setting the
              company up is usually sitting in the office they are describing. */}
          <div className="rounded-md border border-line bg-surface p-4">
            {officeFix ? (
              <p className="text-body-sm text-ink">
                Clock-ins will be checked against this spot, within 150m.{" "}
                <button
                  type="button"
                  className="text-accent-text underline-offset-2 hover:underline"
                  onClick={() => setOfficeFix(null)}
                >
                  Undo
                </button>
              </p>
            ) : (
              <>
                <p className="text-body-sm leading-relaxed text-body">
                  If you are at the office now, ApproveHR can record where it
                  is, and then only accept clock-ins from nearby.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  loading={locating}
                  disabled={savingOffice}
                  onClick={() => void captureOfficeLocation()}
                >
                  <MapPin aria-hidden="true" className="size-3.5" />
                  Use my current location
                </Button>
              </>
            )}
          </div>

          {officeError && (
            <p
              role="status"
              className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-ink"
            >
              {officeError}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="accent"
              size="sm"
              loading={savingOffice}
              disabled={!officeName.trim()}
              onClick={() => void confirmOffice()}
            >
              {editingLocationId ? "Save" : "Continue"}
            </Button>
            {editingLocationId && (
              <Button
                variant="ghost"
                size="sm"
                disabled={savingOffice}
                onClick={() => {
                  setAwaitingOffice(false);
                  setEditingLocationId(null);
                  setOfficeError(null);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {awaitingSalarySplit &&
        (() => {
          const basic = Number(splitBasic) || 0;
          const housing = Number(splitHousing) || 0;
          const transport = Number(splitTransport) || 0;
          const splitTotal = basic + housing + transport;
          const complete =
            splitBasic !== "" && splitHousing !== "" && splitTransport !== "";
          return (
            <div className="mt-6 flex flex-col gap-4 rounded-lg border border-accent-line bg-accent-soft p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-body font-semibold text-ink">
                  How does gross pay split up?
                </p>
                {complete && (
                  <span
                    className={cn(
                      "text-body-sm font-medium",
                      Math.abs(splitTotal - 100) < 0.01
                        ? "text-success-text"
                        : "text-danger-text",
                    )}
                  >
                    {splitTotal}%
                  </span>
                )}
              </div>
              <p className="text-body-sm leading-relaxed text-body">
                Pension and the National Housing Fund are charged on whichever
                parts you use — NHF on basic by default, so a bigger basic share
                means more NHF on the same gross.
              </p>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Basic" required>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={splitBasic}
                    disabled={savingSplit}
                    suffix="%"
                    onChange={(e) => setSplitBasic(e.target.value)}
                  />
                </Field>
                <Field label="Housing" required>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={splitHousing}
                    disabled={savingSplit}
                    suffix="%"
                    onChange={(e) => setSplitHousing(e.target.value)}
                  />
                </Field>
                <Field label="Transport" required>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={splitTransport}
                    disabled={savingSplit}
                    suffix="%"
                    onChange={(e) => setSplitTransport(e.target.value)}
                  />
                </Field>
              </div>

              {splitError && (
                <p
                  role="status"
                  className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-ink"
                >
                  {splitError}
                </p>
              )}

              <div>
                <Button
                  variant="accent"
                  size="sm"
                  loading={savingSplit}
                  disabled={!complete || Math.abs(splitTotal - 100) > 0.01}
                  onClick={() => void confirmSalarySplit()}
                >
                  Continue
                </Button>
              </div>
            </div>
          );
        })()}

      {index > 0 &&
        !awaitingTaxState &&
        !awaitingOffice &&
        !awaitingSalarySplit && (
          <div className="mt-7 border-t border-line pt-5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMovedTo(index - 1)}
              disabled={busy !== null || finishing}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back
            </Button>
          </div>
        )}
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Which option this company is already on, or `null`.
 *
 * ## Read the call site before changing this
 *
 * It is consulted **only for a question that has already been answered** —
 * `question.step <= wizard.step`. That restriction is the whole reason this
 * is safe to have at all, given that this file's own header says no option is
 * pre-marked as the current state.
 *
 * The thing that rule was written against was a "Now" badge marking a
 * *default* on a question nobody had answered yet, which let somebody click
 * through setup without ever deciding anything. Marking what you actually
 * chose, on a question you actually answered, is the opposite of that: going
 * Back and finding both options blank reads as though the answer was thrown
 * away, and the answer was not thrown away — it is on the server, which is
 * where the values compared below come from.
 *
 * ## Matching on what the answer *wrote*, not on a stored answer
 *
 * There is no "which option did they pick" column anywhere: `POST
 * /wizard/answer` applies `option.sets` to `OrgFeatures` and `option.payroll`
 * to `PayrollSettings` and keeps no record of the option itself. So the
 * option is identified by its effect — the one whose whole patch agrees with
 * the current state. An option that constrains nothing is skipped rather than
 * matching vacuously.
 */
function chosenOption(
  question: ApiWizardQuestion,
  features: Record<string, unknown>,
  deductions: Record<string, unknown> | null,
): string | null {
  for (const option of question.options) {
    const sets = Object.entries(option.sets);
    const payroll = Object.entries(option.payroll ?? {});
    if (sets.length + payroll.length === 0) continue;
    const agrees =
      sets.every(([key, value]) => features[key] === value) &&
      payroll.every(([key, value]) => deductions?.[key] === value);
    if (agrees) return option.value;
  }
  return null;
}

/**
 * The calm container: one column, centred, nothing else on screen.
 *
 * No `PageHeader`. A page title above a question would be a second heading
 * competing with the only thing being asked.
 */
function Frame({
  nudge,
  children,
}: {
  /** From `SetupWizard`'s own `pending` state — see the note there. */
  nudge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-5 py-12 sm:px-7 sm:py-16">
      {nudge}
      {children}
    </div>
  );
}

/**
 * One answer.
 *
 * `option.consequence` is the API's own sentence about what switching a
 * statutory deduction off means, rendered **verbatim and before the click**.
 * PAYE deduction is an employer obligation under the Personal Income Tax Act and
 * a pension scheme is compulsory at fifteen employees, so "No" here is a real
 * choice with a real consequence — a configurable product is fine, one that
 * quietly helps somebody be non-compliant is not. It is not paraphrased locally:
 * two wordings for one legal fact is how they stop agreeing.
 *
 * No option is pre-marked as the current or default state: setup is meant to
 * be answered, not glanced at and left, and a "Now" badge on one option reads
 * as permission to do exactly that.
 */
function OptionButton({
  option,
  chosen,
  busy,
  disabled,
  onSelect,
}: {
  option: ApiWizardOption;
  /** Only ever true on a question already answered — see `chosenOption`. */
  chosen: boolean;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={chosen}
      aria-busy={busy || undefined}
      className={cn(
        "flex min-h-16 flex-col gap-1.5 rounded-lg border px-5 py-4 text-left",
        "transition-[border-color,background-color,box-shadow] duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
        "disabled:cursor-not-allowed disabled:opacity-60",
        chosen
          ? "border-accent-line bg-accent-soft"
          : "border-line bg-surface hover:border-control-line hover:bg-canvas",
        !option.consequence && "justify-center",
      )}
    >
      <span className="flex w-full items-center justify-between gap-3">
        <span className="text-body-sm font-medium text-ink">
          {option.label}
        </span>
        {busy ? (
          <span className="shrink-0 text-meta text-muted">Saving…</span>
        ) : (
          chosen && (
            <span className="flex shrink-0 items-center gap-1 text-meta font-medium text-accent-text">
              <Check
                aria-hidden="true"
                strokeWidth={2.5}
                className="size-3.5"
              />
              Chosen
            </span>
          )
        )}
      </span>
      {option.consequence && (
        <span className="text-body-sm leading-relaxed text-body">
          {option.consequence}
        </span>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The roles question, rendered as a sub-form rather than a choice of options —
 * see the entry for `roles` in the API's own `QUESTIONS` for why this one
 * question is answered by clicking "Continue" no matter what happened above
 * it, and why it is the wizard's one deliberate exception to "there is no
 * skip".
 *
 * Reuses `CreateRoleDialog` from the settings screen whole, unchanged. It is
 * already decoupled from that screen's drawers and member management, and
 * already trims a copied role's permissions to what the caller can actually
 * grant — the founder holds every permission at this point, so nothing is
 * ever trimmed here, but the same code path stays correct for whoever answers
 * this on a company where somebody other than the founder finishes setup.
 */
function RolesStep({
  disabled,
  onContinue,
}: {
  disabled: boolean;
  onContinue: () => void;
}) {
  const access = usePermissions();
  const held = [...access.permissions];
  const roles = useRoles(held);
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  /* What this step actually adds. The eight built-in roles exist before
     anybody answers a single wizard question, so counting them here would
     make "Continue" read as though nothing had been done yet. */
  const custom = roles.roles.filter((role) => !role.isSystem);

  return (
    <div className="mt-9 flex flex-col gap-4">
      {custom.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {custom.map((role) => (
            <li key={role.id} className="px-3.5 py-2.5">
              <p className="text-body-sm font-medium text-ink">{role.name}</p>
              <p className="mt-0.5 text-body-sm text-muted">
                {role.description || "No description yet"}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add a role
        </Button>
      </div>

      <div className="mt-3 border-t border-line pt-5">
        <Button variant="accent" disabled={disabled} onClick={onContinue}>
          {custom.length > 0 ? "Continue" : "Skip for now — I'll do this later"}
        </Button>
      </div>

      {creating && (
        <CreateRoleDialog
          roles={roles.roles}
          held={access.permissions}
          from={null}
          onClose={() => setCreating(false)}
          onCreate={async (body, people) => {
            try {
              const made = await roles.create(body);
              /* The role first, then the invitations — a refused address
                 leaves the role standing, which is the right way round: the
                 role cannot be retried without colliding on its own name. */
              const result =
                people.length > 0
                  ? await invitesApi.sendByEmail(people, [made.id])
                  : null;
              toast.push({
                title: `${body.name} created`,
                tone:
                  result && result.failed.length > 0 ? "warning" : "success",
                ...(result
                  ? {
                      detail:
                        result.failed.length > 0
                          ? `${result.sent.length} invited. ${result.failed
                              .map((one) => `${one.name}: ${one.message}`)
                              .join(" ")}`
                          : `${result.sent.length} invited.`,
                    }
                  : {}),
              });
              setCreating(false);
              return true;
            } catch (error) {
              toast.push({
                title: "That did not work",
                tone: "danger",
                detail:
                  error instanceof ApiError
                    ? error.message
                    : "Something went wrong. Try again.",
              });
              return false;
            }
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The last step: what is on, and one way forward.
 *
 * Only what was turned **on** is listed. A list of what a company does not do is
 * a list of things to feel behind about, and the settings page exists for the
 * day one of them becomes true.
 *
 * The primary action is adding a first employee, not the dashboard. A
 * dashboard with nobody on it is an empty room — the concrete next step is
 * putting somebody real into the system, and the getting-started checklist
 * there picks up from here for whatever comes after that.
 */
function Done({
  flags,
  returning,
  nudge,
}: {
  flags: FeatureKey[];
  returning: boolean;
  nudge?: React.ReactNode;
}) {
  return (
    <Frame nudge={nudge}>
      <span className="flex size-10 items-center justify-center rounded-full bg-success-soft text-success-text">
        <Check aria-hidden="true" strokeWidth={2.5} className="size-5" />
      </span>

      <h1 className="mt-5 text-h3 text-ink sm:text-h2">
        {returning ? "You are set up" : "That is it — you are set up"}
      </h1>
      <p className="mt-3 text-lead text-body">
        Paying people, payslips and leave are on for everybody. You also have:
      </p>

      <ul className="mt-6 flex flex-col gap-3.5">
        {flags.map((key) => (
          <li key={key} className="flex gap-3">
            <Check
              aria-hidden="true"
              strokeWidth={2.5}
              className="mt-0.5 size-4 shrink-0 text-success-text"
            />
            <span className="min-w-0">
              <span className="block text-body-sm font-medium text-ink">
                {FEATURE_COPY[key].label}
              </span>
              <span className="mt-0.5 block text-body-sm text-muted">
                {FEATURE_COPY[key].line}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
        <ButtonLink href="/people/new" variant="accent" size="lg">
          Add your first employee
        </ButtonLink>
        <Link
          href="/dashboard"
          className="text-body-sm font-medium text-accent-text underline decoration-accent-line underline-offset-4 hover:decoration-accent"
        >
          Go to the dashboard
        </Link>
        <Link
          href="/settings/features"
          className="text-body-sm font-medium text-accent-text underline decoration-accent-line underline-offset-4 hover:decoration-accent"
        >
          Turn on more features
        </Link>
      </div>
    </Frame>
  );
}
