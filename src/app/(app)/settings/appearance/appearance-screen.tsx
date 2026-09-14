"use client";

import { Card, CardBody, SegmentedControl } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { type ThemeChoice, useThemeChoice } from "@/lib/store/theme";

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Personal, not company-wide — deliberately no permission gate. Nothing here
 * is org-visible, so unlike every other card on /settings, nobody needs to
 * let you change it.
 */
export function AppearanceScreen() {
  const { choice, setChoice } = useThemeChoice();

  return (
    <>
      <PageHeader
        title="Appearance"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
      />
      <PageBody className="flex flex-col gap-6">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <div>
              <h2 className="text-body-md font-semibold text-ink">Theme</h2>
              <p className="mt-1 text-body-sm leading-relaxed text-body">
                Light by default. Switch to dark here whenever you want it —
                this does not follow your device&apos;s own setting, so it stays
                whichever you pick regardless of what your OS is doing. Nobody
                else&apos;s screen changes, and nobody needs to let you do this.
              </p>
              <p className="text-body-sm leading-relaxed text-body">
                In this browser only — it will not be here on another device.
                Signing in somewhere else starts back on Light.
              </p>
            </div>
            <SegmentedControl<ThemeChoice>
              label="Theme"
              options={OPTIONS}
              value={choice}
              onChange={setChoice}
            />
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
