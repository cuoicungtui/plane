/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { Link, useParams } from "react-router";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TPageTreeRow } from "@plane/utils";
import { cn, getPageAncestors, getPageName, getPageTreeRows } from "@plane/utils";
// hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePage, usePageStore } from "@/hooks/store";
import { getValueFromLocalStorage, setValueIntoLocalStorage } from "@/hooks/use-local-storage";
// local imports
import { useAddChildPage } from "./use-add-child-page";
import { usePageTreeExpansion } from "./use-tree-expansion";

const COLLAPSED_STORAGE_KEY = "wiki-page-tree-panel-collapsed";
const INDENT_PER_LEVEL = 12;

type RowProps = {
  row: TPageTreeRow;
  storeType: EPageStoreType;
  isActive: boolean;
  onToggle: (pageId: string) => void;
  onAddChild: (pageId: string) => void;
};

const PanelRow = observer(function PanelRow({ row, storeType, isActive, onToggle, onAddChild }: RowProps) {
  const { id, depth, hasChildren, isExpanded } = row;
  const { t } = useTranslation();
  const page = usePage({ pageId: id, storeType });
  const { canCurrentUserCreatePage } = usePageStore(storeType);
  if (!page) return null;
  const canAddChild = canCurrentUserCreatePage && !page.archived_at && page.canCurrentUserAccessPage;

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isActive}
      aria-expanded={hasChildren ? isExpanded : undefined}
      className={cn(
        "group/row flex items-center gap-0.5 rounded-sm pr-1 hover:bg-layer-transparent-hover",
        isActive && "bg-layer-transparent-active"
      )}
      style={{ paddingLeft: 4 + depth * INDENT_PER_LEVEL }}
    >
      <button
        type="button"
        aria-label={isExpanded ? t("page_tree.collapse") : t("page_tree.expand")}
        tabIndex={hasChildren ? 0 : -1}
        disabled={!hasChildren}
        onClick={() => onToggle(id)}
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover",
          { invisible: !hasChildren }
        )}
      >
        <ChevronRight className={cn("size-3.5 transition-transform", { "rotate-90": isExpanded })} />
      </button>
      <Link
        to={page.getRedirectionLink()}
        className={cn("flex min-w-0 flex-1 items-center gap-1.5 py-1 text-13 text-secondary", {
          "font-medium text-primary": isActive,
        })}
      >
        <span className="grid size-4 shrink-0 place-items-center">
          {page.logo_props?.in_use ? (
            <Logo logo={page.logo_props} size={14} type="lucide" />
          ) : (
            <PageIcon className="size-4 text-tertiary" />
          )}
        </span>
        <span className="truncate">{getPageName(page.name)}</span>
      </Link>
      {canAddChild && (
        <Tooltip tooltipContent={t("page_tree.add_child")}>
          <button
            type="button"
            aria-label={t("page_tree.add_child")}
            onClick={() => onAddChild(id)}
            className="grid size-5 shrink-0 place-items-center rounded-sm text-tertiary opacity-0 group-hover/row:opacity-100 hover:bg-layer-transparent-hover focus-visible:opacity-100"
          >
            <Plus className="size-3.5" />
          </button>
        </Tooltip>
      )}
    </div>
  );
});

type Props = {
  storeType: EPageStoreType;
};

/**
 * @description the project's page tree beside the page being read, so a page can be reached without going back to the
 * list. Render it with `key={projectId}` so the remembered open branches are read again for each project.
 */
export const PageTreePanel = observer(function PageTreePanel({ storeType }: Props) {
  const { workspaceSlug, projectId, pageId } = useParams();
  const { t } = useTranslation();
  const { getProjectPageTree } = usePageStore(storeType);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(
    () => getValueFromLocalStorage(COLLAPSED_STORAGE_KEY, false) === true
  );
  const projectIdValue = projectId ?? "";
  const { expandedIds, toggle, expand } = usePageTreeExpansion(projectIdValue);
  const handleAddChild = useAddChildPage(storeType, expand);
  const tree = getProjectPageTree(projectIdValue);
  const rows = useMemo(() => getPageTreeRows(tree, { expandedIds }), [tree, expandedIds]);
  const ancestorKey = pageId ? getPageAncestors(tree, pageId).ancestorIds.join(",") : "";

  // open the branches that lead to the page being read; the user can close them again afterwards
  useEffect(() => {
    for (const ancestorId of ancestorKey ? ancestorKey.split(",") : []) expand(ancestorId);
  }, [ancestorKey, expand]);

  const setCollapsed = (value: boolean) => {
    setIsCollapsed(value);
    setValueIntoLocalStorage(COLLAPSED_STORAGE_KEY, value);
  };

  if (isCollapsed) {
    return (
      <aside className="hidden shrink-0 border-r border-subtle bg-surface-1 p-1 md:block">
        <Tooltip tooltipContent={t("page_tree.show_panel")}>
          <button
            type="button"
            aria-label={t("page_tree.show_panel")}
            onClick={() => setCollapsed(false)}
            className="grid size-7 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        </Tooltip>
      </aside>
    );
  }

  return (
    <aside
      aria-label={t("page_tree.panel_label")}
      className="hidden h-full w-64 shrink-0 flex-col border-r border-subtle bg-surface-1 md:flex"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-2 py-2">
        <Link
          to={`/${workspaceSlug}/projects/${projectIdValue}/pages`}
          className="truncate rounded-sm px-1 text-13 font-medium text-secondary hover:text-primary"
        >
          {t("page_tree.all_pages")}
        </Link>
        <Tooltip tooltipContent={t("page_tree.hide_panel")}>
          <button
            type="button"
            aria-label={t("page_tree.hide_panel")}
            onClick={() => setCollapsed(true)}
            className="grid size-6 shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover"
          >
            <PanelLeftClose className="size-4" />
          </button>
        </Tooltip>
      </div>
      <div role="tree" aria-label={t("page_tree.label")} className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {rows.map((row) => (
          <PanelRow
            key={row.id}
            row={row}
            storeType={storeType}
            isActive={row.id === pageId}
            onToggle={toggle}
            onAddChild={handleAddChild}
          />
        ))}
      </div>
    </aside>
  );
});
