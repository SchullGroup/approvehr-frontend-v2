"use client";

import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/cn";
import { useThemeChoice } from "@/lib/store/theme";

/**
 * Light or dark, from the navbar.
 *
 * The preference, the persistence and the two halves that apply it all already
 * existed — `lib/store/theme.ts`, `lib/theme-init-script.ts` and
 * `components/portal/theme-effect.tsx`. The only place to change it was
 * Settings → Appearance, which is three clicks and a page load away from
 * wherever somebody actually notices the room has got dark. This is the same
 * control, where the decision gets made.
 *
 * It sets nothing itself. `ThemeEffect` subscribes to the store and applies the
 * attribute, so this writes the preference and the existing mechanism does the
 * rest — one place applies a theme, which is what stops the navbar and the
 * Appearance screen ever disagreeing about what is on.
 *
 * **The Appearance screen stays.** A preference worth having in the chrome is
 * still worth explaining somewhere, and that screen is where the "this browser
 * only" sentence lives — the theme is not synced through the API, because there
 * is no user-preferences endpoint in this codebase. Two doors to one setting is
 * fine; two settings would not be.
 *
 * Shaped on `MoneyPrivacyToggle` beside it, down to the `aria-pressed` and the
 * icon showing the *current* state while the label says what pressing does.
 * Two adjacent icon buttons in one navbar that behaved differently would be
 * worse than either convention.
 *
 * Before hydration this renders the light icon, because the store returns its
 * seed until then — same as its neighbour. The *page* does not flash: the
 * blocking init script sets the attribute before first paint. Only this
 * button's icon settles a moment late.
 */
export function ThemeToggle({
  className,
  /** Shows the words beside the icon. Off in the navbar, on in a menu. */
  labelled = false,
}: {
  className?: string;
  labelled?: boolean;
}) {
  const { choice, setChoice } = useThemeChoice();
  const dark = choice === "dark";
  const Icon = dark ? Moon : Sun;
  const label = dark ? "Switch to light" : "Switch to dark";

  return (
    <button
      type="button"
      onClick={() => setChoice(dark ? "light" : "dark")}
      aria-pressed={dark}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-meta text-muted",
        "transition-colors hover:bg-canvas hover:text-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {labelled ? label : <span className="sr-only">{label}</span>}
    </button>
  );
}
