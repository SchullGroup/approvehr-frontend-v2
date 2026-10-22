"use client";

import { useState } from "react";
import { CalendarPlus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  ColumnChart,
  Disclosure,
  Field,
  Input,
  LoadState,
  Modal,
  Select,
  useToast,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import {
  BACKFILL_DAYS,
  METRIC_LABEL,
  WELLNESS_LIMITS,
  consentRequired,
  consentStale,
  type ApiConsent,
  type ApiConsents,
  type ApiLogEntry,
  type ApiSummary,
  type WellnessMetric,
} from "@/lib/api/wellness";
import { useOrgTimezone } from "@/lib/store/session";
import {
  useMyConsents,
  useMyLogs,
  useMySummary,
  useWellnessActions,
  useWellnessSettings,
} from "@/lib/store/wellness";
import { addDays } from "@/lib/projects/dates";
import { formatDateShort } from "@/lib/time";
import { useToday } from "@/lib/use-today";
import {
  amountText,
  compactCount,
  dayWord,
  entryProblem,
  valueOn,
  weekEndingOn,
  weekPoints,
  weekTotals,
} from "@/lib/wellness/format";
import { YourDataMenu } from "./your-data";

/**
 * Overview: today's water and steps, the week, and the consent behind both.
 *
 * ## Nothing is logged until the person says so
 *
 * The first thing here, for somebody who has not agreed, is the consent and
 * nothing else: no empty log, no entry form, no chart of nothing. The wording is
 * the API's own and is shown in full with the version it came from, because what
 * a person agreed to has to be recoverable from the words they were shown. The
 * floor is shown beside it (the API makes it readable to everybody for exactly
 * this screen), since "your employer sees results only when enough people take
 * part" is only honest if the number is the real one.
 *
 * ## What is not on this page
 *
 * A target. There is no "8 glasses" and no ring to close: the limits the server
 * enforces are sanity bounds against a typo, not a claim about health, so the
 * screen shows what was logged and nothing about whether it was enough.
 */

/**
 * The amounts one press adds. Conveniences, not targets: nothing here says what
 * a person should log, and the server's limits are a separate matter.
 */
const QUICK = {
  WATER_ML: [250, 500],
  STEPS: [1000, 5000],
} as const;

export function OverviewScreen() {
  const consents = useMyConsents();

  const tracking = consents.data?.consents.find(
    (consent) => consent.purpose === "SELF_TRACKING",
  );

  return (
    <LoadState
      loading={consents.loading}
      error={consents.error}
      onRetry={consents.reload}
      hasData={consents.data !== null}
      subject="your wellness record"
      skeleton="list"
    >
      {consents.data && tracking ? (
        tracking.granted ? (
          <Tracking consents={consents.data} onChanged={consents.reload} />
        ) : (
          <ConsentCard
            consent={tracking}
            version={consents.data.version}
            onGranted={consents.reload}
          />
        )
      ) : null}
    </LoadState>
  );
}

/* ----------------------------------------------------------------- consent */

function ConsentCard({
  consent,
  version,
  onGranted,
}: {
  consent: ApiConsent;
  version: string;
  onGranted: () => void;
}) {
  /* The floor is part of what a person agrees to, so the card does not offer
     the agreement while it cannot say what the number is. Only this card needs
     it: somebody who is already tracking has no use for the setting here. */
  const settings = useWellnessSettings();
  const actions = useWellnessActions();
  const toast = useToast();
  const timeZone = useOrgTimezone();
  const [busy, setBusy] = useState(false);

  const grant = async () => {
    setBusy(true);
    try {
      await actions.grantConsent("SELF_TRACKING", version);
      onGranted();
    } catch (error) {
      if (consentStale(error)) {
        /* The wording moved on while this was open. Showing the new text is the
           whole point of refusing, so the screen reloads and asks again. */
        toast.push({
          tone: "info",
          title: "The wording changed",
          detail: "Read it again before you agree.",
        });
        onGranted();
      } else {
        toast.push({
          tone: "warning",
          title: "That did not work",
          detail:
            error instanceof ApiError
              ? error.message
              : "Something went wrong. Try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <LoadState
      loading={settings.loading}
      error={settings.error}
      onRetry={settings.reload}
      hasData={settings.data !== null}
      subject="the privacy floor"
      skeleton="detail"
    >
      {settings.data && (
        <Card className="max-w-2xl">
          <CardHeader level={2} title={consent.title} />
          <CardBody className="flex flex-col gap-3">
            <p className="text-body-sm leading-relaxed text-body">
              {consent.statement}
            </p>
            <p className="flex items-center gap-2 text-body-sm text-muted">
              Your employer sees totals only once at least{" "}
              {settings.data.privacyFloor} people take part.
              <InfoTooltip
                id="wellness-floor"
                label="About what your employer sees"
                text={`Counts and totals, never anybody's own figures. The number is set for the company and can never be lower than ${String(settings.data.privacyFloorMinimum)}.`}
              />
            </p>
          </CardBody>
          <CardFooter>
            <span className="text-meta text-muted">
              {consent.withdrawnAt
                ? `You turned this off on ${formatDateShort(consent.withdrawnAt, timeZone)}.`
                : `Wording ${version}`}
            </span>
            <Button
              variant="accent"
              loading={busy}
              onClick={() => void grant()}
            >
              Turn on tracking
            </Button>
          </CardFooter>
        </Card>
      )}
    </LoadState>
  );
}

/* ---------------------------------------------------------------- tracking */

function Tracking({
  consents,
  onChanged,
}: {
  consents: ApiConsents;
  onChanged: () => void;
}) {
  const today = useToday();
  const timeZone = useOrgTimezone();
  const days = weekEndingOn(today);
  const filedFrom = addDays(today, -BACKFILL_DAYS);

  const summary = useMySummary(days[0] ?? today, today);
  const logs = useMyLogs(filedFrom);

  const tracking = consents.consents.find(
    (consent) => consent.purpose === "SELF_TRACKING",
  );
  const deviceSync = consents.consents.find(
    (consent) => consent.purpose === "DEVICE_SYNC",
  );
  const hasDeviceTotal = (logs.data ?? []).some(
    (entry) => entry.source === "DEVICE",
  );

  const reload = () => {
    summary.reload();
    logs.reload();
  };

  const [earlier, setEarlier] = useState(false);
  const week = summary.data;
  const entries = logs.data;

  return (
    <LoadState
      loading={summary.loading || logs.loading}
      error={summary.error ?? logs.error}
      onRetry={reload}
      hasData={week !== null && entries !== null}
      subject="your week"
      skeleton="list"
    >
      {week && entries && (
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 lg:grid-cols-2">
            {(["WATER_ML", "STEPS"] as const).map((metric) => (
              <MetricCard
                key={metric}
                metric={metric}
                today={today}
                days={days}
                summary={week}
                deviceNote={
                  metric === "STEPS" &&
                  (hasDeviceTotal || deviceSync?.granted === true)
                }
                onAdded={reload}
                onConsentGone={onChanged}
              />
            ))}
          </div>

          <Entries
            entries={entries}
            today={today}
            onChanged={reload}
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEarlier(true)}
              >
                <CalendarPlus aria-hidden="true" className="size-4" />
                Add for another day
              </Button>
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-3 text-meta text-muted">
            <span>
              {tracking?.grantedAt
                ? `Tracking on since ${formatDateShort(tracking.grantedAt, timeZone)}`
                : "Tracking is on"}
            </span>
            <YourDataMenu
              trackingOn
              deviceSyncOn={deviceSync?.granted === true}
              onChanged={() => {
                onChanged();
                reload();
              }}
            />
          </div>

          {earlier && (
            <EarlierDayDialog
              today={today}
              onClose={() => setEarlier(false)}
              onAdded={() => {
                setEarlier(false);
                reload();
              }}
            />
          )}
        </div>
      )}
    </LoadState>
  );
}

function MetricCard({
  metric,
  today,
  days,
  summary,
  deviceNote,
  onAdded,
  onConsentGone,
}: {
  metric: WellnessMetric;
  today: string;
  days: readonly string[];
  summary: ApiSummary;
  /** Steps only, and only when a phone has sent a total. */
  deviceNote: boolean;
  onAdded: () => void;
  onConsentGone: () => void;
}) {
  const actions = useWellnessActions();
  const limits = WELLNESS_LIMITS[metric];
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const todayValue = valueOn(summary, metric, today);
  const week = weekTotals(summary, metric, days);

  const add = async (raw: string) => {
    const invalid = entryProblem(metric, raw);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await actions.addLog({ metric, value: Number(raw.trim()) });
      setText("");
      onAdded();
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
      /* Consent can be withdrawn from another tab or the phone. The API says so
         with its own code, and the screen goes back to asking. */
      if (consentRequired(error)) onConsentGone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader
        level={2}
        title={METRIC_LABEL[metric]}
        description={
          <span aria-live="polite">
            {todayValue === null
              ? "Nothing logged today"
              : `Today, ${amountText(metric, todayValue)}`}
          </span>
        }
        action={
          deviceNote ? (
            <InfoTooltip
              id={`wellness-device-${metric}`}
              label="About steps from your phone"
              text="A total sent from your phone counts for that day instead of the steps you type here. Delete the phone's total and yours count again."
            />
          ) : undefined
        }
      />
      <CardBody className="flex flex-1 flex-col gap-4">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add(text);
          }}
        >
          <div className="flex items-start gap-2">
            <Field
              label={`Add ${limits.noun}`}
              hideLabel
              {...(problem ? { error: problem } : {})}
              className="min-w-0 flex-1"
            >
              <Input
                inputMode="numeric"
                autoComplete="off"
                suffix={limits.unit}
                value={text}
                placeholder={QUICK[metric][0].toLocaleString("en-NG")}
                onChange={(event) => {
                  setText(event.target.value);
                  setProblem(null);
                }}
              />
            </Field>
            <Button type="submit" variant="accent" loading={busy}>
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK[metric].map((amount) => (
              <Button
                key={amount}
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void add(String(amount))}
              >
                +{amount.toLocaleString("en-NG")} {limits.unit}
              </Button>
            ))}
          </div>
        </form>

        {/* Seven dashed outlines say nothing a line cannot, so the chart waits
            for a day with something in it. */}
        {week.daysLogged > 0 && (
          <ColumnChart
            points={weekPoints(summary, metric, days)}
            height={140}
            format={compactCount}
            caption={`${METRIC_LABEL[metric]} per day, last 7 days. A dashed column means nothing was logged.`}
          />
        )}
      </CardBody>
      <CardFooter>
        <span className="text-body-sm text-muted">
          {week.daysLogged === 0
            ? "Nothing logged in the last 7 days"
            : `Last 7 days, ${amountText(metric, week.total)} over ${String(week.daysLogged)} ${week.daysLogged === 1 ? "day" : "days"}`}
        </span>
      </CardFooter>
    </Card>
  );
}

/* ----------------------------------------------------------------- entries */

function Entries({
  entries,
  today,
  onChanged,
  action,
}: {
  entries: ApiLogEntry[];
  today: string;
  onChanged: () => void;
  action: React.ReactNode;
}) {
  const actions = useWellnessActions();
  const toast = useToast();
  const [removing, setRemoving] = useState<string | null>(null);

  const remove = async (entry: ApiLogEntry) => {
    setRemoving(entry.id);
    try {
      await actions.deleteLog(entry.id);
      toast.push({ tone: "info", title: "Entry deleted" });
      onChanged();
    } catch (error) {
      toast.push({
        tone: "warning",
        title: "That did not work",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Disclosure
      title="Your entries"
      level={3}
      meta={
        <span className="text-meta text-muted">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <div>{action}</div>
        {entries.length === 0 ? (
          <p className="text-body-sm text-muted">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                    {amountText(entry.metric, entry.value)}
                    {entry.source === "DEVICE" && (
                      <Badge tone="neutral" size="sm">
                        From phone
                      </Badge>
                    )}
                  </p>
                  <p className="text-meta text-muted">
                    {METRIC_LABEL[entry.metric]}, {dayWord(entry.day, today)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={removing === entry.id}
                  onClick={() => void remove(entry)}
                  aria-label={`Delete ${amountText(entry.metric, entry.value)}, ${dayWord(entry.day, today)}`}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Disclosure>
  );
}

/* ---------------------------------------------------------- another day */

function EarlierDayDialog({
  today,
  onClose,
  onAdded,
}: {
  today: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const actions = useWellnessActions();
  const earliest = addDays(today, -BACKFILL_DAYS);
  const [metric, setMetric] = useState<WellnessMetric>("STEPS");
  const [day, setDay] = useState(addDays(today, -1));
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const invalid = entryProblem(metric, text);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    if (day < earliest || day > today) {
      setProblem(
        `Choose a day from the last ${String(BACKFILL_DAYS)} days, up to today.`,
      );
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await actions.addLog({ metric, value: Number(text.trim()), day });
      onAdded();
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add for another day"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void submit()}>
            Add
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field
          label="What"
          help={`You can fill in up to ${String(BACKFILL_DAYS)} days back, never a day that has not happened.`}
        >
          <Select
            value={metric}
            onChange={(event) =>
              setMetric(event.target.value as WellnessMetric)
            }
          >
            <option value="STEPS">{METRIC_LABEL.STEPS}</option>
            <option value="WATER_ML">{METRIC_LABEL.WATER_ML}</option>
          </Select>
        </Field>
        <Field label="Day">
          <Input
            type="date"
            value={day}
            min={earliest}
            max={today}
            onChange={(event) => setDay(event.target.value)}
          />
        </Field>
        <Field label="How many" {...(problem ? { error: problem } : {})}>
          <Input
            inputMode="numeric"
            autoComplete="off"
            suffix={WELLNESS_LIMITS[metric].unit}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setProblem(null);
            }}
          />
        </Field>
      </form>
    </Modal>
  );
}
