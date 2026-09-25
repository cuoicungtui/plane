/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPageNavigationTabs } from "@plane/types";
import type { TPageDropInstruction } from "@plane/utils";
import { filterPageTree, getPageDropPosition, getPageTreeRows } from "@plane/utils";
// components
import { ListLayout } from "@/components/core/list";
// hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";
// local imports
import { PageTreeRow } from "./row";
import { useAddChildPage } from "./use-add-child-page";
import { usePageTreeExpansion } from "./use-tree-expansion";

type Props = {
  pageType: TPageNavigationTabs;
  storeType: EPageStoreType;
};

/**
 * @description the pages of a tab as a tree that can be opened, closed and rearranged by drag and drop.
 * Render it with `key={projectId}` so the remembered open branches are read again for each project.
 */
export const PagesTreeRoot = observer(function PagesTreeRoot(props: Props) {
  const { pageType, storeType } = props;
  // router
  const { workspaceSlug, projectId } = useParams();
  // hooks
  const { t } = useTranslation();
  const {
    getCurrentProjectTabPageTree,
    getCurrentProjectPageIdsByTab,
    getCurrentProjectFilteredPageIdsByTab,
    getProjectPageTree,
    getPageById,
    updatePagePosition,
  } = usePageStore(storeType);
  // derived values
  const workspaceSlugValue = workspaceSlug?.toString() ?? "";
  const projectIdValue = projectId?.toString() ?? "";
  const { expandedIds, toggle: handleToggle, expand: handleExpand } = usePageTreeExpansion(projectIdValue);
  const isReadOnly = pageType === "archived";
  const tabPageIds = getCurrentProjectPageIdsByTab(pageType);
  const filteredPageIds = getCurrentProjectFilteredPageIdsByTab(pageType);
  const tabTree = getCurrentProjectTabPageTree(pageType);
  const projectTree = getProjectPageTree(projectIdValue);
  const isFiltering = !!tabPageIds && !!filteredPageIds && filteredPageIds.length !== tabPageIds.length;
  const filter = useMemo(() => {
    if (!isFiltering || !filteredPageIds) return undefined;
    const matchingIds = new Set(filteredPageIds);
    return filterPageTree(tabTree, (pageId) => matchingIds.has(pageId));
  }, [isFiltering, filteredPageIds, tabTree]);
  const rows = getPageTreeRows(tabTree, {
    expandedIds: filter ? new Set([...expandedIds, ...filter.expandedIds]) : expandedIds,
    visibleIds: filter?.visibleIds,
  });

  const handleAddChild = useAddChildPage(storeType, handleExpand);

  const getDropPosition = useCallback(
    (dragId: string, targetId: string, instruction: TPageDropInstruction) => {
      const tree = getProjectPageTree(projectIdValue);
      const isChildDrop = instruction === "child" || instruction === "first-child";
      // the real parent of an orphan is unknown, so a page can only be dropped inside it (D20)
      if (!isChildDrop && tree.orphanIds.has(targetId)) return null;
      // a page can only be put inside a page the user can edit (D21)
      if (isChildDrop && !getPageById(targetId)?.isContentEditable) return null;
      const position = getPageDropPosition(tree, { dragId, targetId, instruction });
      return position && !position.isNoop ? position : null;
    },
    [getPageById, getProjectPageTree, projectIdValue]
  );

  const canDropOn = useCallback(
    (dragId: string, targetId: string, instruction: TPageDropInstruction) =>
      !!getDropPosition(dragId, targetId, instruction),
    [getDropPosition]
  );

  const handleDrop = useCallback(
    async (dragId: string, targetId: string, instruction: TPageDropInstruction) => {
      const position = getDropPosition(dragId, targetId, instruction);
      if (!position) return;
      try {
        await updatePagePosition(workspaceSlugValue, projectIdValue, dragId, {
          parent_id: position.parent_id,
          prev_sibling_id: position.prev_sibling_id,
        });
        if (position.parent_id === targetId) handleExpand(targetId);
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: t("common.error.label"), message: t("page_tree.move_error") });
      }
    },
    [getDropPosition, handleExpand, projectIdValue, t, updatePagePosition, workspaceSlugValue]
  );

  if (!tabPageIds) return <></>;
  return (
    <ListLayout>
      <div role="tree" aria-label={t("page_tree.label")}>
        {rows.map((row) => (
          <PageTreeRow
            key={row.id}
            row={row}
            storeType={storeType}
            isReadOnly={isReadOnly}
            isDragDisabled={isFiltering}
            isOrphan={projectTree.orphanIds.has(row.id)}
            onToggle={handleToggle}
            onExpand={handleExpand}
            onAddChild={handleAddChild}
            canDropOn={canDropOn}
            onDrop={handleDrop}
          />
        ))}
      </div>
    </ListLayout>
  );
});
