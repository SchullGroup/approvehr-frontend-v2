"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useIsClient } from "@/hooks/use-is-client";

/*
 * Toasts announce through a polite live region so they are heard without
 * stealing focus. Anything requiring a decision uses a dialog instead.
 */

type ToastTone = "success" | "warning" | "danger" | "info";

type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  detail?: string;
};

const ToastContext = createContext<{
  push: (t: Omit<Toast, "id">) => void;
} | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Keeps callers safe outside the provider, for example in tests.
    return { push: () => {} };
  }
  return ctx;
}

const ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
} as const;

const TONES = {
  success: "border-success-line bg-success-soft text-success-text",
  warning: "border-warning-line bg-warning-soft text-warning-text",
  danger: "border-danger-line bg-danger-soft text-danger-text",
  info: "border-info-line bg-info-soft text-info-text",
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const isClient = useIsClient();

  const remove = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((list) => [...list, { ...toast, id }]);
      window.setTimeout(() => remove(id), 6000);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {isClient &&
        createPortal(
          <div
            aria-live="polite"
            aria-atomic="false"
            className="pointer-events-none fixed bottom-0 right-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4"
          >
            {toasts.map((toast) => {
              const Icon = ICONS[toast.tone];
              return (
                <div
                  key={toast.id}
                  role="status"
                  className={cn(
                    "animate-scale-in pointer-events-auto flex items-start gap-3 rounded-lg border p-3.5 shadow-lg",
                    TONES[toast.tone],
                  )}
                >
                  <Icon aria-hidden="true" className="mt-px size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-semibold">
                      {toast.title}
                    </p>
                    {toast.detail && (
                      <p className="mt-0.5 text-meta leading-relaxed text-ink/80">
                        {toast.detail}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(toast.id)}
                    aria-label="Dismiss notification"
                    className="shrink-0 rounded-sm p-0.5 opacity-60 hover:opacity-100"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
