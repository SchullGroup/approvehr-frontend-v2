"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Card, CardBody } from "@/components/ui";

/**
 * The surface a payroll success moment sits on, and the guarantee that it is
 * seen.
 *
 * Both moments in this folder arrive after a click somebody made a long way
 * from where the answer appears: the Approve button is in a sticky footer, so
 * a reader can press it from anywhere down the page, and the moment lands at
 * the top of the column. Leaving the page where it was would show them
 * whatever happened to be at that scroll position and nothing to say the
 * approval had taken. A toast did not have this problem because it floated.
 *
 * `nearest` rather than `start`: a moment that is already on screen — the
 * recorded-payment card replaces the one the reader was looking at — does not
 * move at all, and one that is not comes in by the shortest route. The browser
 * honours the reader's reduced-motion setting for the scroll itself.
 */
export function MomentCard({ children }: { children: ReactNode }) {
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    surface.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <div ref={surface} className="scroll-mt-24">
      <Card>
        <CardBody className="px-5 py-8 sm:px-8">{children}</CardBody>
      </Card>
    </div>
  );
}
