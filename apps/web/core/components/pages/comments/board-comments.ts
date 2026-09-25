/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useSyncExternalStore } from "react";

/**
 * Connects whiteboards to the comments of their page. A whiteboard is drawn inside the editor by a lazily
 * loaded component, so neither the editor nor the Comments tab can reach it directly: the page's comment
 * controller publishes the open thread counts here, and every mounted whiteboard registers a handle the
 * Comments tab uses to check for and select an element.
 */

export type TBoardCommentCounts = Record<string, Record<string, number>>;

type TBoardCommentState = { pageId: string | null; counts: TBoardCommentCounts };

export type TCommentBoardHandle = {
  hasElement: (elementId: string) => boolean;
  /** Selects the element and brings the whiteboard into view. */
  locateElement: (elementId: string) => boolean;
};

const EMPTY_STATE: TBoardCommentState = { pageId: null, counts: {} };

let state = EMPTY_STATE;
let revision = 0;
const listeners = new Set<() => void>();
const boards = new Map<string, TCommentBoardHandle>();

const notify = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const countsEqual = (a: TBoardCommentCounts, b: TBoardCommentCounts) => JSON.stringify(a) === JSON.stringify(b);

export const setBoardCommentCounts = (pageId: string, counts: TBoardCommentCounts) => {
  if (state.pageId === pageId && countsEqual(state.counts, counts)) return;
  state = { pageId, counts };
  notify();
};

export const clearBoardCommentCounts = (pageId: string) => {
  if (state.pageId !== pageId) return;
  state = EMPTY_STATE;
  notify();
};

export const registerCommentBoard = (boardId: string, handle: TCommentBoardHandle) => {
  boards.set(boardId, handle);
  revision += 1;
  notify();
  return () => {
    if (boards.get(boardId) !== handle) return;
    boards.delete(boardId);
    revision += 1;
    notify();
  };
};

/** Tells the Comments tab to look again: elements were added or removed on a whiteboard. */
export const notifyCommentBoardsChanged = () => {
  revision += 1;
  notify();
};

/** False when the element is gone; null when the whiteboard is not on screen, so nothing can be said. */
export const hasCommentBoardElement = (boardId: string, elementId: string): boolean | null =>
  boards.get(boardId)?.hasElement(elementId) ?? null;

export const locateCommentBoardElement = (boardId: string, elementId: string): boolean =>
  boards.get(boardId)?.locateElement(elementId) ?? false;

const EMPTY_COUNTS: Record<string, number> = {};

/** Whether the page has comments switched on, and the open thread count of each commented element. */
export const useBoardComments = (pageId: string | undefined, boardId: string) => {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY_STATE
  );
  const enabled = !!pageId && current.pageId === pageId;
  return { enabled, counts: (enabled && current.counts[boardId]) || EMPTY_COUNTS };
};

/** Changes whenever a whiteboard mounts, unmounts or reports that its elements changed. */
export const useCommentBoardsRevision = () =>
  useSyncExternalStore(
    subscribe,
    () => revision,
    () => 0
  );
