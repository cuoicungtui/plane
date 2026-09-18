// @ts-nocheck
import { describe, expect, it } from "vitest";
import type { TIssue, TIssueRelationMap } from "@plane/types";
import { getGanttIssueDependencies } from "./dependencies";

const issue = (
  id: string,
  start_date: string | null = "2026-01-01",
  target_date: string | null = "2026-01-02",
) => ({ id, start_date, target_date }) as TIssue;

describe("getGanttIssueDependencies", () => {
  it("draws each blocking relation once, from blocker to blocked task", () => {
    const dependencies = getGanttIssueDependencies(
      ["blocked", "blocker"],
      {
        blocked: { blocked_by: ["blocker", "blocker"] },
        blocker: { blocking: ["blocked"] },
      } as TIssueRelationMap,
      { blocked: issue("blocked"), blocker: issue("blocker") },
    );

    expect(dependencies).toEqual([
      { blockerId: "blocker", blockedId: "blocked" },
    ]);
  });

  it("excludes relations whose task is hidden or has an incomplete schedule", () => {
    const dependencies = getGanttIssueDependencies(
      ["blocked", "blocker"],
      { blocked: { blocked_by: ["blocker", "outside"] } } as TIssueRelationMap,
      {
        blocked: issue("blocked"),
        blocker: issue("blocker", "2026-01-01", null),
        outside: issue("outside"),
      },
    );

    expect(dependencies).toEqual([]);
  });

  it("keeps an on-schedule dependency", () => {
    const dependencies = getGanttIssueDependencies(
      ["blocked", "blocker"],
      { blocked: { blocked_by: ["blocker"] } } as TIssueRelationMap,
      {
        blocked: issue("blocked", "2026-01-03", "2026-01-05"),
        blocker: issue("blocker", "2026-01-01", "2026-01-03"),
      },
    );

    expect(dependencies[0]).toMatchObject({
      blockerId: "blocker",
      blockedId: "blocked",
    });
  });
});
