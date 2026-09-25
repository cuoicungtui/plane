/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TPagePositionPayload } from "@plane/types";

/** Same default the API gives every page (`Page.DEFAULT_SORT_ORDER`). */
export const PAGE_TREE_DEFAULT_SORT_ORDER = 65535;

export type TPageTreeInput = {
  id: string;
  parent?: string | null;
  sort_order?: number;
  created_at?: Date | string;
};

export type TPageTree = {
  rootIds: string[];
  /** Ids of the children shown under each page, in display order. */
  childrenIds: Record<string, string[]>;
  /** Parent each page is shown under. `null` for root pages and for orphans. */
  parentIds: Record<string, string | null>;
  /**
   * Pages whose real parent is not in the input (hidden private page, or bad data). They are shown at the root
   * and must not be dragged or used as an ordering anchor, because their real parent is unknown to the client.
   */
  orphanIds: Set<string>;
};

export type TPageDropInstruction = "before" | "after" | "child";

export type TPageDropPosition = TPagePositionPayload & {
  /** True when the drop would leave the page where it already is, so no request is needed. */
  isNoop: boolean;
};

const toTime = (value: Date | string | undefined): number => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const comparePages = (a: TPageTreeInput, b: TPageTreeInput): number => {
  const orderDiff = (a.sort_order ?? PAGE_TREE_DEFAULT_SORT_ORDER) - (b.sort_order ?? PAGE_TREE_DEFAULT_SORT_ORDER);
  if (orderDiff !== 0) return orderDiff;
  const timeDiff = toTime(a.created_at) - toTime(b.created_at);
  if (timeDiff !== 0) return timeDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * @description builds the page tree the wiki panel shows. Children are ordered like the API orders siblings
 * (`sort_order`, `created_at`, `id`). A page whose parent is missing from `pages`, or that sits in a parent loop,
 * is put at the root and flagged as an orphan.
 * @param {TPageTreeInput[]} pages
 * @returns {TPageTree}
 */
export const buildPageTree = (pages: TPageTreeInput[]): TPageTree => {
  const byId = new Map<string, TPageTreeInput>();
  for (const page of pages) byId.set(page.id, page);

  const childrenIds: Record<string, string[]> = {};
  const parentIds: Record<string, string | null> = {};
  const rootIds: string[] = [];
  const orphanIds = new Set<string>();

  for (const page of byId.values()) {
    childrenIds[page.id] = [];
    parentIds[page.id] = null;
  }
  for (const page of byId.values()) {
    if (!page.parent) {
      rootIds.push(page.id);
    } else if (page.parent !== page.id && byId.has(page.parent)) {
      parentIds[page.id] = page.parent;
      childrenIds[page.parent].push(page.id);
    } else {
      rootIds.push(page.id);
      orphanIds.add(page.id);
    }
  }

  const reached = new Set<string>();
  const markReached = (startId: string) => {
    const stack = [startId];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (reached.has(id)) continue;
      reached.add(id);
      stack.push(...childrenIds[id]);
    }
  };
  rootIds.forEach(markReached);

  // Pages left over sit in a parent loop: break each loop at its first page in tree order.
  const leftovers = [...byId.values()].filter((page) => !reached.has(page.id)).toSorted(comparePages);
  for (const page of leftovers) {
    if (reached.has(page.id)) continue;
    const parentId = parentIds[page.id];
    if (parentId) childrenIds[parentId] = childrenIds[parentId].filter((id) => id !== page.id);
    parentIds[page.id] = null;
    rootIds.push(page.id);
    orphanIds.add(page.id);
    markReached(page.id);
  }

  const sortIds = (ids: string[]) =>
    ids.sort((a, b) => comparePages(byId.get(a) as TPageTreeInput, byId.get(b) as TPageTreeInput));
  sortIds(rootIds);
  Object.values(childrenIds).forEach(sortIds);

  return { rootIds, childrenIds, parentIds, orphanIds };
};

/**
 * @description ancestors of a page that are present in the tree, from the root down to its parent.
 * `hasHiddenAncestor` is true when the chain stops at an orphan, i.e. some ancestor is not visible to the user.
 * @param {TPageTree} tree
 * @param {string} pageId
 */
export const getPageAncestors = (
  tree: TPageTree,
  pageId: string
): { ancestorIds: string[]; hasHiddenAncestor: boolean } => {
  if (!(pageId in tree.parentIds)) return { ancestorIds: [], hasHiddenAncestor: false };
  const ancestorIds: string[] = [];
  const seen = new Set<string>([pageId]);
  let topId = pageId;
  let parentId = tree.parentIds[pageId];
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    ancestorIds.unshift(parentId);
    topId = parentId;
    parentId = tree.parentIds[parentId];
  }
  return { ancestorIds, hasHiddenAncestor: tree.orphanIds.has(topId) };
};

/**
 * @description ids of every page below `pageId`, in display order (parents before their children).
 * @param {TPageTree} tree
 * @param {string} pageId
 */
export const getPageDescendantIds = (tree: TPageTree, pageId: string): string[] => {
  const result: string[] = [];
  const visit = (id: string) => {
    for (const childId of tree.childrenIds[id] ?? []) {
      result.push(childId);
      visit(childId);
    }
  };
  visit(pageId);
  return result;
};

/**
 * @description keeps the pages that match plus the path down to each of them.
 * `expandedIds` are the ancestors of matches, i.e. the branches that must be open to show the results.
 * @param {TPageTree} tree
 * @param {(pageId: string) => boolean} isMatch
 */
export const filterPageTree = (
  tree: TPageTree,
  isMatch: (pageId: string) => boolean
): { visibleIds: Set<string>; matchIds: Set<string>; expandedIds: Set<string> } => {
  const visibleIds = new Set<string>();
  const matchIds = new Set<string>();
  const expandedIds = new Set<string>();
  for (const pageId of Object.keys(tree.parentIds)) {
    if (!isMatch(pageId)) continue;
    matchIds.add(pageId);
    visibleIds.add(pageId);
    for (const ancestorId of getPageAncestors(tree, pageId).ancestorIds) {
      visibleIds.add(ancestorId);
      expandedIds.add(ancestorId);
    }
  }
  return { visibleIds, matchIds, expandedIds };
};

const lastAnchorId = (tree: TPageTree, ids: string[], draggedId: string): string | null => {
  for (let index = ids.length - 1; index >= 0; index--) {
    const id = ids[index];
    if (id !== draggedId && !tree.orphanIds.has(id)) return id;
  }
  return null;
};

/**
 * @description translates a drop on the tree into the body of the `position/` API call.
 * Returns `null` when the drop is not allowed: onto itself or one of its descendants, an unknown page, or dragging
 * an orphan (its real parent is unknown, so moving it would silently change the parent).
 * @param {TPageTree} tree
 * @param {{ dragId: string; targetId: string; instruction: TPageDropInstruction }} params
 */
export const getPageDropPosition = (
  tree: TPageTree,
  { dragId, targetId, instruction }: { dragId: string; targetId: string; instruction: TPageDropInstruction }
): TPageDropPosition | null => {
  if (dragId === targetId) return null;
  if (!(dragId in tree.parentIds) || !(targetId in tree.parentIds)) return null;
  if (tree.orphanIds.has(dragId)) return null;
  if (getPageAncestors(tree, targetId).ancestorIds.includes(dragId)) return null;

  let parentId: string | null;
  let prevSiblingId: string | null;
  if (instruction === "child") {
    parentId = targetId;
    prevSiblingId = lastAnchorId(tree, tree.childrenIds[targetId], dragId);
  } else {
    parentId = tree.parentIds[targetId];
    const siblings = (parentId ? tree.childrenIds[parentId] : tree.rootIds).filter((id) => id !== dragId);
    const targetIndex = siblings.indexOf(targetId);
    const before = siblings.slice(0, instruction === "before" ? targetIndex : targetIndex + 1);
    prevSiblingId = lastAnchorId(tree, before, dragId);
  }

  const currentParentId = tree.parentIds[dragId];
  const currentSiblings = currentParentId ? tree.childrenIds[currentParentId] : tree.rootIds;
  const currentPrevSiblingId = lastAnchorId(tree, currentSiblings.slice(0, currentSiblings.indexOf(dragId)), dragId);

  return {
    parent_id: parentId,
    prev_sibling_id: prevSiblingId,
    isNoop: parentId === currentParentId && prevSiblingId === currentPrevSiblingId,
  };
};
