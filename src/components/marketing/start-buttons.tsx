import { Pill } from "@/components/marketing/pill";
import { SIGN_UP_URL, newTabIfApp } from "@/lib/marketing/links";

/**
 * "Start free" goes to sign-up, and the demo is its own button (UAT 23 Nov,
 * U59 / NC-18).
 *
 * Every "Start free, book a demo" button went to the demo form, though a
 * company can sign itself up. Where there is no app to sign up to (the
 * standalone marketing build), the demo is the one button.
 */
export function StartButtons({
  onNight = false,
}: {
  /** Inside a dark (night) section, where the second button needs `ghost`. */
  onNight?: boolean;
}) {
  if (!SIGN_UP_URL) {
    return (
      <Pill href="/demo" variant="solid" size="lg" arrow>
        Book a demo
      </Pill>
    );
  }
  return (
    <>
      <Pill
        href={SIGN_UP_URL}
        variant="solid"
        size="lg"
        arrow
        {...newTabIfApp(SIGN_UP_URL)}
      >
        Start free
      </Pill>
      <Pill href="/demo" variant={onNight ? "ghost" : "quiet"} size="lg">
        Book a demo
      </Pill>
    </>
  );
}

/** The one primary button: Start free where sign-up exists, else the demo. */
export function StartFreePill() {
  return SIGN_UP_URL ? (
    <Pill
      href={SIGN_UP_URL}
      variant="solid"
      size="lg"
      arrow
      {...newTabIfApp(SIGN_UP_URL)}
    >
      Start free
    </Pill>
  ) : (
    <Pill href="/demo" variant="solid" size="lg" arrow>
      Book a demo
    </Pill>
  );
}
