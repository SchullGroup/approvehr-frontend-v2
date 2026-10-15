"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ApiError, tokens } from "@/lib/api/client";
import {
  careersApi,
  careersUrl,
  type ApiCareersSettings,
  type ApiPosting,
  type ApiShareLink,
  type ApiShareLinks,
  type UpdateCareersSettingsBody,
} from "@/lib/api/careers";
import {
  definitionFromApi,
  problemsFromApi,
  putBodyFromDefinition,
} from "@/lib/hiring/form-wire";
import { QUESTIONS_MAX, type FormDefinition } from "@/lib/marketing/apply-form";
import { demoBook } from "@/lib/store/careers";
import {
  DEMO_SETTINGS,
  demoQuestions,
  seededDemoForm,
} from "@/lib/hiring/demo-form";
import { createPersistedState } from "@/lib/store/persisted";
import { useRevalidation } from "@/lib/revalidate";

/**
 * The advert's application form, the company's careers settings and the links to
 * share — the staff side of the apply flow.
 *
 * ## Two homes, one shape
 *
 * Connected, everything here is the API's. In demo mode there is no API, and the
 * form builder still has to be something a person can try on a laptop in a room
 * with no network, so the demo keeps forms **in this browser** (`createPersistedState`)
 * and says so wherever it shows them. That is a different decision from the one
 * `store/careers.ts` makes for adverts, and the difference is deliberate: an
 * advert is a public statement and screening somebody in writes into another
 * module, so those refuse in a demo; a list of questions on a form is a local
 * thing whose whole use in a demo is to be edited and previewed.
 *
 * The company's settings (its name, its privacy notice) are read-only in a demo:
 * they stand for what the company has already told applicants, and a demo has no
 * company to have told them.
 *
 * ## No `setState` in an effect body
 *
 * Every loader is called from an effect and writes its answer keyed by the attempt
 * it belongs to, the pattern `useCareersAnalytics` explains. `loading` falls out of
 * "no answer for this attempt yet", so there is no window in which one advert's
 * form is shown under another's name.
 */

const connected = (): boolean => tokens.has();

/* ------------------------------------------------------------------ demo data */

export { DEMO_SETTINGS, demoQuestions, seededDemoForm };

const demoForms = createPersistedState<{
  forms: Record<string, FormDefinition>;
}>({
  key: "approvehr.careers.demo-forms.store",
  empty: { forms: {} },
  version: 1,
});

/** The demo form for an advert: what was saved, else the seed. */
export function demoFormFor(
  postingId: string,
  stored: Record<string, FormDefinition>,
): FormDefinition {
  return stored[postingId] ?? seededDemoForm();
}

/* ----------------------------------------------------------------- the loader */

type Loaded<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Ask again. Resolves nothing; the new answer arrives as `data`. */
  reload: () => void;
  /** The attempt the answer in `data` belongs to, or -1 before the first. */
  settled: number;
  /** The attempt a `reload()` made now would be. */
  nextAttempt: () => number;
};

/**
 * Ask for something when the key changes or the person comes back to the window,
 * and keep the answer keyed by the attempt it belongs to.
 */
function useLoaded<T>(
  key: string,
  enabled: boolean,
  load: (signal: AbortSignal) => Promise<T>,
): Loaded<T> {
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(0);
  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    data: T | null;
    error: ApiError | null;
  } | null>(null);
  const revalidation = useRevalidation();

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await load(controller.signal);
        if (!controller.signal.aborted)
          setResult({ key, attempt, data, error: null });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key,
            attempt,
            data: null,
            error: error instanceof ApiError ? error : null,
          });
      }
    })();
    return () => controller.abort();
    // `load` is rebuilt every render by its caller; the key is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, attempt, revalidation]);

  const matched =
    result !== null && result.key === key && result.attempt === attempt;
  const reload = useCallback(() => {
    attemptRef.current += 1;
    setAttempt(attemptRef.current);
  }, []);
  const nextAttempt = useCallback(() => attemptRef.current + 1, []);
  return {
    data: matched ? result.data : null,
    error: matched ? result.error : null,
    loading: enabled && !matched,
    reload,
    settled: matched ? result.attempt : -1,
    nextAttempt,
  };
}

/* --------------------------------------------------------------- the settings */

export function useCareersSettings() {
  const online = connected();
  const loaded = useLoaded<ApiCareersSettings>(
    `settings:${online}`,
    online,
    (signal) => careersApi.getSettings(signal),
  );

  const save = useCallback(
    async (body: UpdateCareersSettingsBody) => {
      if (!connected())
        throw new ApiError(
          0,
          "offline",
          DEMO_ENABLED
            ? "Settings are read-only in demo mode. They stand for what your company has already told applicants."
            : "These settings cannot be changed without a connection to the server.",
        );
      const next = await careersApi.updateSettings(body);
      loaded.reload();
      return next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded.reload],
  );

  return {
    settings: online ? loaded.data : DEMO_SETTINGS,
    loading: online ? loaded.loading : false,
    error: online ? loaded.error : null,
    /** False in demo mode. */
    editable: online,
    reload: loaded.reload,
    save,
  };
}

/* --------------------------------------------------------------- the advert */

/**
 * One advert, by id. Connected it is the API's; in demo mode it is found in the
 * seeded book.
 */
export function usePosting(id: string) {
  const online = connected();
  const loaded = useLoaded<ApiPosting>(
    `posting:${online}:${id}`,
    online,
    (signal) => careersApi.getPosting(id, signal),
  );
  const demo = useMemo(
    () =>
      online ? null : (demoBook().postings.find((p) => p.id === id) ?? null),
    [online, id],
  );
  return {
    posting: online ? loaded.data : demo,
    loading: online ? loaded.loading : false,
    error: online
      ? loaded.error
      : demo
        ? null
        : new ApiError(404, "not_found", "That advert is not here."),
    reload: loaded.reload,
    live: online,
  };
}

/* ----------------------------------------------------------------- the form */

export type SaveFormResult =
  | { ok: true; definition: FormDefinition }
  | {
      ok: false;
      message: string;
      problems: { questions: Record<string, string>; form: string | null };
    };

/**
 * An advert's application form: what the builder edits, and how it is saved.
 *
 * `save` never throws. It answers with the form as it now stands (carrying the
 * ids the API gave any new question) or with the refusal sorted into the
 * question it was about, so the builder can mark the exact input.
 */
export function usePostingForm(postingId: string) {
  const online = connected();
  const settings = useCareersSettings();
  const loaded = useLoaded(`form:${online}:${postingId}`, online, (signal) =>
    careersApi.getForm(postingId, signal),
  );
  const { forms: stored } = useSyncExternalStore(
    demoForms.subscribe,
    demoForms.read,
    demoForms.getServerSnapshot,
  );
  /* What was just saved, shown until the re-read of it arrives. Without it the
     builder would flash the form as it was a moment ago, and read as unsaved. */
  const [justSaved, setJustSaved] = useState<{
    definition: FormDefinition;
    until: number;
  } | null>(null);

  const fromApi = useMemo<FormDefinition | null>(() => {
    if (!loaded.data) return null;
    return definitionFromApi(loaded.data, settings.settings?.consent ?? null);
  }, [loaded.data, settings.settings]);

  const definition = !online
    ? demoFormFor(postingId, stored)
    : justSaved && loaded.settled < justSaved.until
      ? justSaved.definition
      : fromApi;

  const save = useCallback(
    async (next: FormDefinition): Promise<SaveFormResult> => {
      if (!connected()) {
        demoForms.commit({
          forms: { ...demoForms.current().forms, [postingId]: next },
        });
        return { ok: true, definition: next };
      }
      try {
        const saved = await careersApi.putForm(
          postingId,
          putBodyFromDefinition(next),
        );
        const confirmed = definitionFromApi(
          saved,
          settings.settings?.consent ?? null,
        );
        setJustSaved({ definition: confirmed, until: loaded.nextAttempt() });
        loaded.reload();
        return { ok: true, definition: confirmed };
      } catch (error) {
        if (error instanceof ApiError) {
          return {
            ok: false,
            message: error.message,
            problems: problemsFromApi(error.fieldErrors, next),
          };
        }
        return {
          ok: false,
          message: "Something went wrong. Try again.",
          problems: { questions: {}, form: null },
        };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [postingId, loaded.reload, loaded.nextAttempt, settings.settings],
  );

  return {
    definition,
    /** Whether a file box would work: a bucket is set up. */
    filesAvailable: online
      ? (settings.settings?.deployment.fileUploads ?? true)
      : DEMO_SETTINGS.deployment.fileUploads,
    /** How many applications this advert has taken, for the "live form" warning. */
    applications: online ? (loaded.data?.applications ?? 0) : 0,
    maxQuestions: online
      ? (loaded.data?.limits.maxQuestions ?? QUESTIONS_MAX)
      : QUESTIONS_MAX,
    loading: online ? loaded.loading || settings.loading : false,
    error: online ? (loaded.error ?? settings.error) : null,
    /** False in demo mode only in the sense that it is saved in this browser. */
    local: !online,
    reload: loaded.reload,
    save,
  };
}

/* ------------------------------------------------------------- share links */

/** The channels a demo lists, the same ones the API does. */
const DEMO_CHANNELS: { channel: string; label: string }[] = [
  { channel: "careers-page", label: "Your careers page" },
  { channel: "linkedin", label: "LinkedIn" },
  { channel: "x", label: "X" },
  { channel: "whatsapp", label: "WhatsApp" },
  { channel: "facebook", label: "Facebook" },
  { channel: "email", label: "Email" },
];

/** `?src=` on a link, the way the API writes it. */
export function withSource(page: string, channel: string): string {
  const url = new URL(page, "https://example.invalid");
  url.searchParams.set("src", channel);
  return page.startsWith("http")
    ? url.toString()
    : `${url.pathname}${url.search}`;
}

function demoShareLinks(posting: ApiPosting, extra: string[]): ApiShareLinks {
  const page = careersUrl(posting.publicPath);
  const links: ApiShareLink[] = [
    ...DEMO_CHANNELS,
    ...extra.map((channel) => ({ channel, label: channel })),
  ].map(({ channel, label }) => ({
    channel,
    label,
    url: withSource(page, channel),
    shareUrl: null,
  }));
  return {
    postingId: posting.id,
    live: posting.status === "PUBLISHED",
    page,
    links,
  };
}

export function useShareLinks(posting: ApiPosting | null) {
  const online = connected();
  const [extra, setExtra] = useState<string[]>([]);
  const id = posting?.id ?? "";
  const loaded = useLoaded<ApiShareLinks>(
    `share:${online}:${id}:${extra.join(",")}`,
    online && id !== "",
    async (signal) => {
      /* The API takes one extra channel a call; the earlier ones are asked for in
         turn and merged, so adding "jobberman" does not lose "campus". */
      let result = await careersApi.shareLinks(id, undefined, signal);
      for (const channel of extra) {
        const next = await careersApi.shareLinks(id, channel, signal);
        const known = new Set(result.links.map((link) => link.channel));
        result = {
          ...next,
          links: [
            ...result.links,
            ...next.links.filter((link) => !known.has(link.channel)),
          ],
        };
      }
      return result;
    },
  );

  const demo = useMemo(
    () => (!online && posting ? demoShareLinks(posting, extra) : null),
    [online, posting, extra],
  );

  return {
    links: online ? loaded.data : demo,
    loading: online ? loaded.loading : false,
    error: online ? loaded.error : null,
    reload: loaded.reload,
    /** One more channel by name — a job board, a campus group. */
    addChannel: useCallback((name: string) => {
      const cleaned = name
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9.-]/g, "")
        .replace(/-{2,}/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "")
        .slice(0, 40);
      if (cleaned === "") return false;
      setExtra((current) =>
        current.includes(cleaned) ? current : [...current, cleaned],
      );
      return true;
    }, []),
  };
}
