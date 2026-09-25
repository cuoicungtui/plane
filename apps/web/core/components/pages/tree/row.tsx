/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachInstruction, extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { observer } from "mobx-react";
import { ChevronRight, Plus } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { DragHandle, DropIndicator } from "@plane/ui";
import type { TPageDropInstruction, TPageTreeRow } from "@plane/utils";
import { cn, getPageName } from "@plane/utils";
// components
import { ListItem } from "@/components/core/list";
import { BlockItemAction, HOVER_ONLY_CLASS } from "@/components/pages/list/block-item-action";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
import type { EPageStoreType } from "@/hooks/store";
import { usePage, usePageStore } from "@/hooks/store";

export const PAGE_TREE_DRAG_TYPE = "wiki-page";
const INDENT_PER_LEVEL = 20;
const HOVER_EXPAND_DELAY = 600;

type TDropHint = "before" | "after" | "child";

type Props = {
  row: TPageTreeRow;
  storeType: EPageStoreType;
  /** Archived tab: the tree can be read but not changed. */
  isReadOnly: boolean;
  /** True while a search or filter is applied, because the visible order is then not the real order. */
  isDragDisabled: boolean;
  /** True for a page whose real parent is unknown to the client (D18). */
  isOrphan: boolean;
  onToggle: (pageId: string) => void;
  onExpand: (pageId: string) => void;
  onAddChild: (pageId: string) => void;
  /** Returns whether dropping `dragId` on `targetId` with `instruction` would change the tree. */
  canDropOn: (dragId: string, targetId: string, instruction: TPageDropInstruction) => boolean;
  onDrop: (dragId: string, targetId: string, instruction: TPageDropInstruction) => void;
};

const toDropInstruction = (type: string | undefined, isExpanded: boolean): TPageDropInstruction | undefined => {
  if (type === "reorder-above") return "before";
  if (type === "reorder-below") return "after";
  if (type === "make-child") return isExpanded ? "first-child" : "child";
  return undefined;
};

const toDropHint = (instruction: TPageDropInstruction): TDropHint =>
  instruction === "before" || instruction === "after" ? instruction : "child";

export const PageTreeRow = observer(function PageTreeRow(props: Props) {
  const { row, storeType, isReadOnly, isDragDisabled, isOrphan, onToggle, onExpand, onAddChild, canDropOn, onDrop } =
    props;
  const { id, depth, hasChildren, isExpanded } = row;
  // states
  const [isDragging, setIsDragging] = useState(false);
  const [dropHint, setDropHint] = useState<TDropHint | undefined>(undefined);
  // refs
  const listItemRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLButtonElement>(null);
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // hooks
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();
  const page = usePage({ pageId: id, storeType });
  const { canCurrentUserCreatePage } = usePageStore(storeType);
  // derived values
  const canDrag = !isReadOnly && !isDragDisabled && !isOrphan && !!page?.isContentEditable;
  const canAddChild =
    !isReadOnly && canCurrentUserCreatePage && !!page && !page.archived_at && page.canCurrentUserAccessPage;

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    const clearExpandTimer = () => {
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
      expandTimerRef.current = undefined;
    };
    const getInstruction = (
      self: { data: Record<string | symbol, unknown> },
      source: { data: Record<string, unknown> }
    ) => {
      const dragId = source.data.id as string;
      const instruction = toDropInstruction(extractInstruction(self.data)?.type, isExpanded);
      return instruction && canDropOn(dragId, id, instruction) ? instruction : undefined;
    };

    return combine(
      draggable({
        element,
        dragHandle: dragHandleRef.current ?? undefined,
        canDrag: () => canDrag,
        getInitialData: () => ({ type: PAGE_TREE_DRAG_TYPE, id }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => !isReadOnly && source.data.type === PAGE_TREE_DRAG_TYPE && source.data.id !== id,
        getData: ({ input, element: targetElement }) =>
          attachInstruction(
            { id },
            {
              input,
              element: targetElement,
              currentLevel: depth,
              indentPerLevel: INDENT_PER_LEVEL,
              mode: isExpanded ? "expanded" : "standard",
            }
          ),
        onDrag: ({ self, source }) => {
          const instruction = getInstruction(self, source);
          setDropHint(instruction ? toDropHint(instruction) : undefined);
          const isOverCollapsedBranch = instruction === "child" && hasChildren && !isExpanded;
          if (isOverCollapsedBranch) {
            expandTimerRef.current ??= setTimeout(() => onExpand(id), HOVER_EXPAND_DELAY);
          } else {
            clearExpandTimer();
          }
        },
        onDragLeave: () => {
          setDropHint(undefined);
          clearExpandTimer();
        },
        onDrop: ({ self, source }) => {
          const instruction = getInstruction(self, source);
          setDropHint(undefined);
          clearExpandTimer();
          if (instruction) onDrop(source.data.id as string, id, instruction);
        },
      })
    );
  }, [id, depth, hasChildren, isExpanded, isReadOnly, canDrag, canDropOn, onDrop, onExpand]);

  useEffect(
    () => () => {
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
    },
    []
  );

  if (!page) return null;
  const { name, logo_props, getRedirectionLink } = page;
  const toggleLabel = isExpanded ? t("page_tree.collapse") : t("page_tree.expand");

  return (
    <div
      ref={rowRef}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={false}
      aria-expanded={hasChildren ? isExpanded : undefined}
      className={cn("relative flex items-center", { "opacity-50": isDragging })}
    >
      <div className="flex flex-shrink-0 items-center gap-1" style={{ paddingLeft: depth * INDENT_PER_LEVEL }}>
        <span className="flex w-5 justify-center">
          {canDrag ? (
            <Tooltip tooltipContent={t("page_tree.drag")} isMobile={isMobile}>
              <span className="flex">
                <DragHandle ref={dragHandleRef} className="bg-transparent" />
              </span>
            </Tooltip>
          ) : null}
        </span>
        <button
          type="button"
          aria-label={toggleLabel}
          tabIndex={hasChildren ? 0 : -1}
          disabled={!hasChildren}
          onClick={() => onToggle(id)}
          className={cn("grid h-5 w-5 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover", {
            invisible: !hasChildren,
          })}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", { "rotate-90": isExpanded })} />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <ListItem
          prependTitleElement={
            logo_props?.in_use ? (
              <Logo logo={logo_props} size={16} type="lucide" />
            ) : (
              <PageIcon className="h-4 w-4 text-tertiary" />
            )
          }
          title={getPageName(name)}
          itemLink={getRedirectionLink()}
          actionableItems={
            <>
              {canAddChild && (
                <Tooltip tooltipContent={t("page_tree.add_child")} isMobile={isMobile}>
                  <button
                    type="button"
                    aria-label={t("page_tree.add_child")}
                    onClick={() => onAddChild(id)}
                    className={cn(
                      "grid h-5 w-5 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-primary",
                      HOVER_ONLY_CLASS
                    )}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </Tooltip>
              )}
              <BlockItemAction page={page} parentRef={listItemRef} storeType={storeType} />
            </>
          }
          isMobile={isMobile}
          parentRef={listItemRef}
        />
      </div>
      {dropHint === "before" && (
        <DropIndicator isVisible classNames="pointer-events-none absolute inset-x-0 top-0 z-10" />
      )}
      {dropHint === "after" && (
        <DropIndicator isVisible classNames="pointer-events-none absolute inset-x-0 bottom-0 z-10" />
      )}
      {dropHint === "child" && (
        <div className="pointer-events-none absolute inset-0 z-10 rounded-sm border-2 border-accent-strong" />
      )}
    </div>
  );
});
