/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue, TIssueRelationMap } from "@plane/types";

export type TGanttIssueDependency = {
  blockerId: string;
  blockedId: string;
};

type TDependencyIssues = Record<string, TIssue | undefined>;

const hasCompleteSchedule = (
  issue: TIssue | undefined,
): issue is TIssue & { start_date: string; target_date: string } =>
  !!issue?.start_date && !!issue?.target_date;

/**
 * Converts the relation store's `blocked_by` entries into directed Gantt edges.
 * The blocker always points to the work item waiting for it.
 */
export const getGanttIssueDependencies = (
  blockIds: string[],
  relationMap: TIssueRelationMap,
  issues: TDependencyIssues,
): TGanttIssueDependency[] => {
  const visibleBlockIds = new Set(blockIds);
  const dependencies = new Map<string, TGanttIssueDependency>();

  for (const blockedId of blockIds) {
    const blockedByIds = relationMap[blockedId]?.blocked_by ?? [];
    const blockedIssue = issues[blockedId];

    for (const blockerId of blockedByIds) {
      const blockerIssue = issues[blockerId];
      if (
        blockerId === blockedId ||
        !visibleBlockIds.has(blockerId) ||
        !hasCompleteSchedule(blockerIssue) ||
        !hasCompleteSchedule(blockedIssue)
      )
        continue;

      const key = `${blockerId}:${blockedId}`;
      dependencies.set(key, {
        blockerId,
        blockedId,
      });
    }
  }

  return [...dependencies.values()];
};
