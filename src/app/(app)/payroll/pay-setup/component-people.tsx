"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Callout,
  Checkbox,
  Input,
  Spinner,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  payComponentsApi,
  type ApiComponentPeople,
} from "@/lib/api/pay-components";

/**
 * Who has this component: everyone, or the people ticked.
 *
 * One list per allowance or deduction, ticked where it applies this month. A
 * deduction that does not apply to everybody (an HMO plan only some staff are
 * on) is switched to "Selected people" and the right ones are ticked; saving
 * puts the missing ones on it and takes the unticked ones off. A payroll that
 * has already been calculated picks the change up the next time it is run.
 */
export function ComponentPeople({
  componentId,
  canEdit,
  onChanged,
}: {
  componentId: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<ApiComponentPeople | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [everyone, setEveryone] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const apply = useCallback((result: ApiComponentPeople) => {
    setError(null);
    setData(result);
    setEveryone(result.everyone);
    setTicked(
      new Set(result.people.filter((p) => p.on).map((p) => p.employeeId)),
    );
  }, []);

  const message = (caught: unknown, fallback: string) =>
    caught instanceof ApiError ? caught.message : fallback;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await payComponentsApi.people(componentId);
        if (!cancelled) apply(result);
      } catch (caught) {
        if (!cancelled)
          setError(message(caught, "Could not read who has this."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [componentId, apply]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.people ?? []).filter(
      (p) =>
        needle === "" ||
        p.name.toLowerCase().includes(needle) ||
        p.employeeNo.toLowerCase().includes(needle),
    );
  }, [data, query]);

  const changed = useMemo(() => {
    if (!data) return false;
    if (everyone !== data.everyone) return true;
    if (everyone) return false;
    const before = new Set(
      data.people.filter((p) => p.on).map((p) => p.employeeId),
    );
    return (
      before.size !== ticked.size || [...ticked].some((id) => !before.has(id))
    );
  }, [data, everyone, ticked]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await payComponentsApi.setPeople(
        componentId,
        everyone
          ? { everyone: true }
          : { everyone: false, employeeIds: [...ticked] },
      );
      toast.push({
        title: "Saved",
        tone: "success",
        detail:
          "A payroll already calculated picks this up when you run it again.",
      });
      apply(await payComponentsApi.people(componentId));
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!data && !error) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-body-sm font-semibold text-ink">Who has it</h3>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-body-sm text-body">
          <input
            type="radio"
            name={`who-${componentId}`}
            checked={everyone}
            disabled={!canEdit || saving}
            onChange={() => setEveryone(true)}
          />
          Everyone
        </label>
        <label className="flex items-center gap-2 text-body-sm text-body">
          <input
            type="radio"
            name={`who-${componentId}`}
            checked={!everyone}
            disabled={!canEdit || saving}
            onChange={() => setEveryone(false)}
          />
          Selected people
        </label>
      </div>

      {!everyone && data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Find a person"
              placeholder="Find a person"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="max-w-xs"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canEdit || saving}
              onClick={() =>
                setTicked(
                  (was) => new Set([...was, ...shown.map((p) => p.employeeId)]),
                )
              }
            >
              Tick all shown
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canEdit || saving}
              onClick={() => {
                const hide = new Set(shown.map((p) => p.employeeId));
                setTicked(
                  (was) => new Set([...was].filter((id) => !hide.has(id))),
                );
              }}
            >
              Untick all shown
            </Button>
          </div>
          <p className="text-body-sm text-muted">
            {ticked.size} of {data.people.length} have it.
          </p>
          <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line px-3">
            {shown.map((person) => (
              <li key={person.employeeId} className="py-2">
                <Checkbox
                  label={person.name}
                  description={[person.employeeNo, person.department]
                    .filter(Boolean)
                    .join(" · ")}
                  checked={ticked.has(person.employeeId)}
                  disabled={!canEdit || saving}
                  onChange={(event) => {
                    const on = event.target.checked;
                    setTicked((was) => {
                      const next = new Set(was);
                      if (on) next.add(person.employeeId);
                      else next.delete(person.employeeId);
                      return next;
                    });
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <Callout tone="danger">{error}</Callout>}

      {canEdit && (
        <div>
          <Button
            type="button"
            variant="accent"
            size="sm"
            loading={saving}
            disabled={!changed || saving}
            onClick={() => void save()}
          >
            Save who has it
          </Button>
        </div>
      )}
    </div>
  );
}
