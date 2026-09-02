"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { MODULES, type ModuleId } from "@/lib/marketing/modules";
import { Pill } from "./pill";
import {
  DeskMockup,
  LeaveMockup,
  PayrollMockup,
  PipelineMockup,
  RecordMockup,
  ReviewMockup,
} from "./mockups";

const PANELS: Record<ModuleId, (props: { className?: string }) => React.ReactElement> = {
  payroll: PayrollMockup,
  hiring: PipelineMockup,
  "core-hr": RecordMockup,
  time: LeaveMockup,
  performance: ReviewMockup,
  desk: DeskMockup,
};

/* Order the rail by what a buyer wants to see first, not alphabetically. */
const ORDER: ModuleId[] = [
  "payroll",
  "core-hr",
  "hiring",
  "time",
  "performance",
  "desk",
];

/**
 * The platform rail. Pick a module on the left, see it on the right.
 *
 * It advances on its own every eight seconds so a passive visitor still sees
 * the range — but the moment someone chooses a module the rotation stops for
 * good. Auto-play that fights the user is worse than no auto-play.
 */
export function PlatformOverview() {
  const [active, setActive] = useState<ModuleId>("payroll");
  const [locked, setLocked] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (locked) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /* Only rotate while the section is actually on screen. */
    const node = railRef.current;
    if (!node) return;

    let timer: number | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        window.clearInterval(timer);
        if (entry.isIntersecting) {
          timer = window.setInterval(() => {
            setActive((current) => {
              const i = ORDER.indexOf(current);
              return ORDER[(i + 1) % ORDER.length];
            });
          }, 8000);
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [locked]);

  const current = MODULES.find((m) => m.id === active)!;
  const Panel = PANELS[active];

  function choose(id: ModuleId) {
    setActive(id);
    setLocked(true);
  }

  return (
    <div ref={railRef} className="grid gap-10 lg:grid-cols-[190px_minmax(0,1fr)_300px] lg:gap-12">
      {/* Rail */}
      <div
        role="tablist"
        aria-label="Platform modules"
        aria-orientation="vertical"
        className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible"
      >
        {ORDER.map((id) => {
          const mod = MODULES.find((m) => m.id === id)!;
          const on = id === active;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={on}
              aria-controls="platform-panel"
              onClick={() => choose(id)}
              className={cn(
                "group flex shrink-0 items-center gap-2.5 rounded-full px-3 py-2 text-left text-body transition-colors duration-200 lg:rounded-none lg:bg-transparent lg:px-0",
                on
                  ? "bg-slate/6 font-medium text-slate"
                  : "text-slate-muted hover:text-slate",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 shrink-0 rounded-full transition-all duration-300",
                  on ? "scale-100 bg-slate" : "scale-0 bg-transparent lg:scale-100 lg:bg-slate/20",
                )}
              />
              {mod.label}
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <div
        id="platform-panel"
        role="tabpanel"
        className="relative min-h-70 lg:min-h-85"
      >
        {/* Keyed so the mockup animates in on each change. */}
        <div key={active} className="animate-scale-in">
          <Panel />
        </div>
      </div>

      {/* Copy */}
      <div key={`${active}-copy`} className="animate-fade flex flex-col justify-center">
        <h3 className="text-h2 text-slate">{current.label}</h3>
        <p className="mt-4 text-body leading-relaxed">
          {current.blurb}
        </p>
        {current.statutory && (
          <p className="mt-4 inline-flex w-fit rounded-full bg-wash-green px-3 py-1 text-meta font-medium text-success-text">
            {current.statutory}
          </p>
        )}
        <Pill
          href={`/product/${current.id}`}
          variant="dark"
          arrow
          className="mt-7 w-fit"
        >
          Find out more
        </Pill>
      </div>
    </div>
  );
}
