/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TGanttIssueDependency } from "./dependencies";

export type TGanttDependencyRect = {
  left: number;
  width: number;
  centerY: number;
};

export type TGanttDependencyRoute = TGanttIssueDependency & {
  key: string;
  path: string;
  tooltipX: number;
  tooltipY: number;
};

const ROUTE_GUTTER = 20;
const ROUTE_LANE_GAP = 12;

/**
 * Routes each dependency with three orthogonal segments. Dependencies with a
 * free horizontal gap use that gap; overlapping or backwards dependencies go
 * around the outside of both task bars.
 */
export const getGanttDependencyRoutes = (
  dependencies: TGanttIssueDependency[],
  rectByIssueId: Record<string, TGanttDependencyRect | undefined>,
): TGanttDependencyRoute[] => {
  let outerLeftLane = 0;
  let outerRightLane = 0;

  return dependencies.flatMap((dependency, index) => {
    const blocker = rectByIssueId[dependency.blockerId];
    const blocked = rectByIssueId[dependency.blockedId];
    if (!blocker || !blocked) return [];

    const blockerRight = blocker.left + blocker.width;
    const blockedRight = blocked.left + blocked.width;
    const isForward = blocked.left > blockerRight;
    const isBackward = blockedRight < blocker.left;
    const startX = isBackward ? blocker.left : blockerRight;
    const endX = isBackward ? blockedRight : blocked.left;
    let laneX: number;

    if (isForward) {
      const gap = endX - startX;
      // Spread direct links through the available gap without letting one
      // route spill into a task bar.
      const laneOffset = (index % 3) * ROUTE_LANE_GAP;
      laneX = Math.max(startX + ROUTE_GUTTER, Math.min(endX - ROUTE_GUTTER, startX + gap / 2 + laneOffset));
    } else if (isBackward) {
      laneX = Math.min(blocker.left, blocked.left) - ROUTE_GUTTER - outerLeftLane++ * ROUTE_LANE_GAP;
    } else {
      laneX = Math.max(blockerRight, blockedRight) + ROUTE_GUTTER + outerRightLane++ * ROUTE_LANE_GAP;
    }

    return [{
      ...dependency,
      key: `${dependency.blockerId}:${dependency.blockedId}`,
      path: `M ${startX} ${blocker.centerY} H ${laneX} V ${blocked.centerY} H ${endX}`,
      tooltipX: laneX,
      tooltipY: (blocker.centerY + blocked.centerY) / 2,
    }];
  });
};
