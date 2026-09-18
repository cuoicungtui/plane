/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue } from "@plane/types";

export type TGanttHierarchyRow = {
  id: string;
  depth: number;
  hasChildren: boolean;
};

/**
 * Flattens the visible work items into a stable parent/child order. A parent
 * outside the current filter is deliberately treated as absent, so its child
 * remains accessible at the root level. `visited` also makes corrupt circular
 * parent data safe to render.
 */
export const getGanttHierarchyRows = (
  issueIds: string[],
  issues: Record<string, TIssue | undefined>,
  collapsedIssueIds: Set<string> = new Set(),
): TGanttHierarchyRow[] => {
  const visibleIssueIds = new Set(issueIds);
  const childrenByParentId = new Map<string, string[]>();
  const rootIssueIds: string[] = [];

  for (const issueId of issueIds) {
    const parentId = issues[issueId]?.parent_id;
    if (parentId && parentId !== issueId && visibleIssueIds.has(parentId)) {
      const children = childrenByParentId.get(parentId) ?? [];
      children.push(issueId);
      childrenByParentId.set(parentId, children);
    } else rootIssueIds.push(issueId);
  }

  const rows: TGanttHierarchyRow[] = [];
  const visitedIssueIds = new Set<string>();
  const visit = (issueId: string, depth: number) => {
    if (visitedIssueIds.has(issueId)) return;

    visitedIssueIds.add(issueId);
    const childIds = childrenByParentId.get(issueId) ?? [];
    rows.push({ id: issueId, depth, hasChildren: childIds.length > 0 });

    if (collapsedIssueIds.has(issueId)) return;
    for (const childId of childIds) visit(childId, depth + 1);
  };

  for (const rootIssueId of rootIssueIds) visit(rootIssueId, 0);
  // A cycle has no root. Render its first encountered member as a root rather
  // than dropping work items or recursing forever.
  const isHiddenByCollapsedAncestor = (issueId: string) => {
    const ancestors = new Set<string>();
    let parentId = issues[issueId]?.parent_id;

    while (parentId && visibleIssueIds.has(parentId) && !ancestors.has(parentId)) {
      // In a corrupt parent cycle, retain the first item as the visible root
      // even when it is collapsed, then hide its descendants normally.
      if (parentId === issueId) return false;
      if (collapsedIssueIds.has(parentId)) return true;
      ancestors.add(parentId);
      parentId = issues[parentId]?.parent_id;
    }

    return false;
  };
  for (const issueId of issueIds) {
    if (!isHiddenByCollapsedAncestor(issueId)) visit(issueId, 0);
  }

  return rows;
};
