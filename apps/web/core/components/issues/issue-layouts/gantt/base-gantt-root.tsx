/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import {
  ALL_ISSUES,
  EUserPermissions,
  EUserPermissionsLevel,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  EIssuesStoreType,
  IBlockUpdateData,
  IssuePaginationOptions,
  TIssue,
} from "@plane/types";
import { EIssueLayoutTypes, GANTT_TIMELINE_TYPE } from "@plane/types";
import { renderFormattedPayloadDate } from "@plane/utils";
// components
import { TimeLineTypeContext } from "@/components/gantt-chart/contexts";
import { GanttChartRoot } from "@/components/gantt-chart/root";
import { IssueGanttSidebar } from "@/components/gantt-chart/sidebar/issues/sidebar";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import { useTimeLineChart } from "@/hooks/use-timeline-chart";
import { useBulkOperationStatus } from "@/hooks/use-bulk-operation-status";
// local imports
import { IssueLayoutHOC } from "../issue-layout-HOC";
import { GanttQuickAddIssueButton, QuickAddIssueRoot } from "../quick-add";
import { IssueGanttBlock } from "./blocks";
import { IssueGanttDependencyLegend } from "./dependency-legend";
import { IssueGanttDependencyOverlay } from "./dependency-overlay";
import { getGanttHierarchyRows } from "./hierarchy";

interface IBaseGanttRoot {
  viewId?: string | undefined;
  isCompletedCycle?: boolean;
  isEpic?: boolean;
}

export type GanttStoreType =
  | EIssuesStoreType.PROJECT
  | EIssuesStoreType.MODULE
  | EIssuesStoreType.CYCLE
  | EIssuesStoreType.PROJECT_VIEW
  | EIssuesStoreType.EPIC;

export const BaseGanttRoot = observer(function BaseGanttRoot(
  props: IBaseGanttRoot,
) {
  const { viewId, isCompletedCycle = false, isEpic = false } = props;
  const { t } = useTranslation();
  // router
  const { workspaceSlug, projectId } = useParams();

  const storeType = useIssueStoreType() as GanttStoreType;
  const isProjectGantt = storeType === ("PROJECT" as EIssuesStoreType);
  const { issues, issuesFilter } = useIssues(storeType);
  const { fetchIssues, fetchNextIssues, updateIssue, quickAddIssue } =
    useIssuesActions(storeType);
  const { initGantt } = useTimeLineChart(GANTT_TIMELINE_TYPE.ISSUE);
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  // store hooks
  const { allowPermissions } = useUserPermissions();

  const appliedDisplayFilters = issuesFilter.issueFilters?.displayFilters;
  // plane web hooks
  const isBulkOperationsEnabled = useBulkOperationStatus();
  // derived values
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 1);

  useEffect(() => {
    fetchIssues(
      "init-loader",
      {
        canGroup: false,
        perPageCount: 100,
        includeRelations: isProjectGantt && !isEpic,
      } as IssuePaginationOptions & { includeRelations: boolean },
      viewId,
    );
  }, [fetchIssues, isEpic, isProjectGantt, storeType, viewId]);

  useEffect(() => {
    initGantt();
  }, []);

  const issuesIds = (issues.groupedIssueIds?.[ALL_ISSUES] as string[]) ?? [];
  const [collapsedIssueIds, setCollapsedIssueIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [hoveredDependencyKey, setHoveredDependencyKey] = useState<string>();
  const [selectedDependencyKey, setSelectedDependencyKey] = useState<string>();
  const issueById = issuesIds.reduce<Record<string, TIssue | undefined>>(
    (accumulator, issueId) => {
      accumulator[issueId] = getIssueById(issueId);
      return accumulator;
    },
    {},
  );
  const hierarchyRows = useMemo(
    () =>
      isProjectGantt && !isEpic
        ? getGanttHierarchyRows(issuesIds, issueById, collapsedIssueIds)
        : issuesIds.map((id) => ({ id, depth: 0, hasChildren: false })),
    [collapsedIssueIds, isEpic, isProjectGantt, issueById, issuesIds],
  );
  const visibleIssueIds = hierarchyRows.map((row) => row.id);
  const activeDependencyKey = selectedDependencyKey ?? hoveredDependencyKey;
  const highlightedIssueIds = useMemo(() => {
    if (!activeDependencyKey) return new Set<string>();
    const [blockerId, blockedId] = activeDependencyKey.split(":");
    return new Set([blockerId, blockedId]);
  }, [activeDependencyKey]);
  const nextPageResults = issues.getPaginationData(
    undefined,
    undefined,
  )?.nextPageResults;

  const { enableIssueCreation } = issues?.viewFlags || {};

  const loadMoreIssues = useCallback(() => {
    fetchNextIssues();
  }, [fetchNextIssues]);

  const toggleIssueChildren = useCallback((issueId: string) => {
    setCollapsedIssueIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(issueId)) nextIds.delete(issueId);
      else nextIds.add(issueId);
      return nextIds;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedDependencyKey(undefined);
        setHoveredDependencyKey(undefined);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const updateIssueBlockStructure = async (
    issue: TIssue,
    data: IBlockUpdateData,
  ) => {
    if (!workspaceSlug) return;

    const payload: any = { ...data };
    if (data.sort_order) payload.sort_order = data.sort_order.newSortOrder;

    updateIssue && (await updateIssue(issue.project_id, issue.id, payload));
  };

  const isAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
  );
  const updateBlockDates = useCallback(
    (
      updates: {
        id: string;
        start_date?: string;
        target_date?: string;
      }[],
    ) =>
      issues
        .updateIssueDates(
          workspaceSlug.toString(),
          updates,
          projectId.toString(),
        )
        .catch(() => {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
            message:
              "Error while updating work item dates, Please try again Later",
          });
        }),
    [issues, projectId, workspaceSlug],
  );

  const quickAdd =
    enableIssueCreation && isAllowed && !isCompletedCycle ? (
      <QuickAddIssueRoot
        layout={EIssueLayoutTypes.GANTT}
        QuickAddButton={GanttQuickAddIssueButton}
        containerClassName="sticky bottom-0 z-[1]"
        prePopulatedData={{
          start_date: renderFormattedPayloadDate(new Date()),
          target_date: renderFormattedPayloadDate(targetDate),
        }}
        quickAddCallback={quickAddIssue}
        isEpic={isEpic}
      />
    ) : undefined;

  return (
    <IssueLayoutHOC layout={EIssueLayoutTypes.GANTT}>
      <TimeLineTypeContext.Provider value={GANTT_TIMELINE_TYPE.ISSUE}>
        <div className="h-full w-full">
          <GanttChartRoot
            border={false}
            title={
              isEpic
                ? t("epic.label", { count: 2 })
                : t("issue.label", { count: 2 })
            }
            loaderTitle={
              isEpic
                ? t("epic.label", { count: 2 })
                : t("issue.label", { count: 2 })
            }
            blockIds={visibleIssueIds}
            blockUpdateHandler={updateIssueBlockStructure}
            blockToRender={(data: TIssue) => (
              <IssueGanttBlock
                issueId={data.id}
                isDependencyHighlighted={highlightedIssueIds.has(data.id)}
                isEpic={isEpic}
              />
            )}
            sidebarToRender={(props) => (
              <IssueGanttSidebar
                {...props}
                collapsedIssueIds={collapsedIssueIds}
                hierarchyRows={hierarchyRows}
                highlightedIssueIds={highlightedIssueIds}
                onToggleIssueChildren={toggleIssueChildren}
                showAllBlocks
                isEpic={isEpic}
              />
            )}
            enableBlockLeftResize={isAllowed}
            enableBlockRightResize={isAllowed}
            enableBlockMove={isAllowed}
            enableReorder={
              appliedDisplayFilters?.order_by === "sort_order" && isAllowed
            }
            enableAddBlock={isAllowed}
            enableSelection={isBulkOperationsEnabled && isAllowed}
            quickAdd={quickAdd}
            loadMoreBlocks={loadMoreIssues}
            canLoadMoreBlocks={nextPageResults}
            updateBlockDates={updateBlockDates}
            showAllBlocks
            enableDependency
            isEpic={isEpic}
            chartOverlay={
              isProjectGantt && !isEpic
                ? (width) => (
                    <IssueGanttDependencyOverlay
                      activeDependencyKey={activeDependencyKey}
                      blockIds={visibleIssueIds}
                      onHoverDependency={setHoveredDependencyKey}
                      onSelectDependency={setSelectedDependencyKey}
                      width={width}
                    />
                  )
                : undefined
            }
            floatingOverlay={
              isProjectGantt && !isEpic ? <IssueGanttDependencyLegend /> : undefined
            }
            onGanttBackgroundPointerDown={() => {
              setSelectedDependencyKey(undefined);
              setHoveredDependencyKey(undefined);
            }}
          />
        </div>
      </TimeLineTypeContext.Provider>
    </IssueLayoutHOC>
  );
});
