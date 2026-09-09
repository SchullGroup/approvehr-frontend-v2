"use client";

import { PageBody, PageHeader } from "@/components/portal/shell";
import { Card, CardBody } from "@/components/ui";
import { FrameworkDisclosure, HowItWorksBody } from "../how-it-works";

/**
 * The whole explanation, on a page somebody chooses to open.
 *
 * ## Why it moved off the performance screen
 *
 * It was a disclosure on `now.tsx` — the screen an employee opens to do their
 * own self-review — and it ran to seven sections, including the rules about
 * weights summing to exactly 100%, shares being frozen when a period opens, and
 * an unscored part being left out rather than counted as nought.
 *
 * Every one of those is true and none of them is an employee's business. They
 * cannot set the weights, cannot freeze them, and cannot do anything about an
 * unrecorded part. Put in front of somebody who came to write four sentences
 * about their own year, it reads as the product explaining its internals rather
 * than telling them what to do.
 *
 * So the screen keeps four lines — what a period is, what they do, what their
 * mark is made of, what happens at the end — and this page holds the rest, for
 * whoever runs a period and for anybody who wants it.
 */
export function HowAppraisalsWorkScreen() {
  return (
    <>
      <PageHeader
        title="How appraisals work"
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
      />
      <PageBody className="flex flex-col gap-6">
        <Card>
          <CardBody>
            <HowItWorksBody />
          </CardBody>
        </Card>

        {/* The four competency groups. It was a closed reveal on the
            performance landing, was taken off it, and then rendered
            **nowhere** — exported with no importers, so a real piece of
            reference had quietly left the product.

            Here rather than back there: it is a framework, it does not change
            between periods, and nobody has to act on it, which is the test for
            reference content. This is the page for that, and the landing page
            is for the one thing somebody came to do. */}
        <Card>
          <CardBody>
            <FrameworkDisclosure />
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
