"use client";

import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { useKpis } from "@/lib/store/performance";

/**
 * The reader's own objectives, each as a name and one progress line.
 *
 * Nothing is drawn when there are none: an empty card on somebody's home is a
 * reminder to a person who may not have been asked for any.
 */
export function MyObjectivesCard() {
  const mine = useKpis("mine");
  const goals = mine.goals
    .filter((goal) => goal.status !== "DONE" && goal.approval === "AGREED")
    .slice(0, 4);
  if (mine.loading || mine.error || goals.length === 0) return null;
  return (
    <Card as="article" className="h-full">
      <CardHeader title="My objectives" level={3} />
      <CardBody className="flex flex-col gap-4">
        <ul className="flex flex-col gap-4">
          {goals.map((goal) => (
            <li key={goal.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href="/performance/kpis?scope=mine"
                  className="min-w-0 truncate text-body-sm font-medium text-ink hover:underline"
                >
                  {goal.title}
                </Link>
                <span className="tabular shrink-0 text-body-sm text-muted">
                  {goal.progress}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${String(Math.min(100, goal.progress))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
