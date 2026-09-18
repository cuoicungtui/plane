/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import type { IGanttBlock, TIssue } from "@plane/types";
import { cn } from "@plane/utils";
import { BLOCK_HEIGHT } from "@/components/gantt-chart/constants";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
import { getGanttIssueDependencies } from "./dependencies";
import { getGanttDependencyRoutes, type TGanttDependencyRect } from "./dependency-routing";

type Props = {
  blockIds: string[];
  width: number;
  activeDependencyKey?: string;
  onHoverDependency: (dependencyKey?: string) => void;
  onSelectDependency: (dependencyKey: string) => void;
};

export const DEPENDENCY_COLORS = {
  blocking: "#DC2626",
};

const getBlockCenterY = (blockIds: string[], blockId: string) => {
  const index = blockIds.indexOf(blockId);
  return index < 0 ? undefined : index * BLOCK_HEIGHT + BLOCK_HEIGHT / 2;
};

const getBlockRect = (
  blockIds: string[],
  block: IGanttBlock | undefined,
): TGanttDependencyRect | undefined => {
  if (!block?.position) return undefined;
  const centerY = getBlockCenterY(blockIds, block.id);
  if (centerY === undefined) return undefined;

  return { left: block.position.marginLeft, width: block.position.width, centerY };
};

export const IssueGanttDependencyOverlay = observer(function IssueGanttDependencyOverlay(props: Props) {
  const { blockIds, width, activeDependencyKey, onHoverDependency, onSelectDependency } = props;
  const [hoveredDependencyKey, setHoveredDependencyKey] = useState<string>();
  const {
    issue: { getIssueById },
    relation: { relationMap },
  } = useIssueDetail();
  const { getBlockById } = useTimeLineChartStore();

  const issues = blockIds.reduce<Record<string, TIssue | undefined>>((accumulator, blockId) => {
    accumulator[blockId] = getIssueById(blockId);
    return accumulator;
  }, {});
  const dependencies = getGanttIssueDependencies(blockIds, relationMap, issues);
  const routes = useMemo(
    () =>
      getGanttDependencyRoutes(
        dependencies,
        blockIds.reduce<Record<string, TGanttDependencyRect | undefined>>((accumulator, blockId) => {
          accumulator[blockId] = getBlockRect(blockIds, getBlockById(blockId));
          return accumulator;
        }, {}),
      ),
    [blockIds, dependencies, getBlockById],
  );
  const height = blockIds.length * BLOCK_HEIGHT;
  const hoveredRoute = routes.find((route) => route.key === hoveredDependencyKey);

  if (!routes.length || !width || !height) return null;

  return (
    <div className="absolute top-0 left-0 z-[4]" style={{ height, width }}>
      <svg aria-label="Quan hệ chặn giữa các task" height={height} width={width} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <marker id="gantt-issue-dependency-arrow-blocking" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
            <path d="M 0 0 L 7 3.5 L 0 7 z" fill={DEPENDENCY_COLORS.blocking} />
          </marker>
        </defs>
        {routes.map((route) => {
          const isActive = route.key === activeDependencyKey || route.key === hoveredDependencyKey;
          const blocker = issues[route.blockerId];
          const blocked = issues[route.blockedId];
          const relationLabel = `${blocker?.name ?? route.blockerId} đang chặn ${blocked?.name ?? route.blockedId}`;

          return (
            <g key={route.key} data-gantt-dependency={route.key}>
              <path
                d={route.path}
                fill="none"
                markerEnd="url(#gantt-issue-dependency-arrow-blocking)"
                stroke={DEPENDENCY_COLORS.blocking}
                strokeOpacity={activeDependencyKey && !isActive ? 0.22 : 1}
                strokeWidth={isActive ? 3 : 1.5}
              />
              <path
                aria-label={relationLabel}
                d={route.path}
                fill="none"
                role="button"
                stroke="transparent"
                strokeWidth="14"
                tabIndex={0}
                className="cursor-pointer"
                onBlur={() => {
                  setHoveredDependencyKey(undefined);
                  onHoverDependency(undefined);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectDependency(route.key);
                }}
                onFocus={() => {
                  setHoveredDependencyKey(route.key);
                  onHoverDependency(route.key);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectDependency(route.key);
                  }
                }}
                onMouseEnter={() => {
                  setHoveredDependencyKey(route.key);
                  onHoverDependency(route.key);
                }}
                onMouseLeave={() => {
                  setHoveredDependencyKey(undefined);
                  onHoverDependency(undefined);
                }}
              >
                <title>{relationLabel}</title>
              </path>
            </g>
          );
        })}
      </svg>
      {hoveredRoute && (
        <div
          className={cn(
            "pointer-events-none absolute z-[6] -translate-x-1/2 -translate-y-full rounded-md border border-danger-primary/30 bg-surface-1 px-2.5 py-1.5 text-12 text-primary shadow-md",
          )}
          style={{ left: hoveredRoute.tooltipX, top: hoveredRoute.tooltipY - 8 }}
        >
          <strong>{issues[hoveredRoute.blockerId]?.name ?? hoveredRoute.blockerId}</strong>
          <span className="mx-1 text-danger-primary">→</span>
          <strong>{issues[hoveredRoute.blockedId]?.name ?? hoveredRoute.blockedId}</strong>
          <p className="mt-0.5 text-secondary">Task đầu đang chặn task sau.</p>
        </div>
      )}
    </div>
  );
});
