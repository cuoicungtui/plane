/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPageComment, TPageCommentAnchorType } from "@plane/types";

export type TCommentThread = { root: TPageComment; replies: TPageComment[] };

export const groupCommentThreads = (comments: TPageComment[]): TCommentThread[] => {
  const replies = new Map<string, TPageComment[]>();
  comments.forEach((comment) => {
    if (comment.parent) replies.set(comment.parent, [...(replies.get(comment.parent) ?? []), comment]);
  });
  return comments.filter((comment) => !comment.parent).map((root) => ({ root, replies: replies.get(root.id) ?? [] }));
};

/** Unresolved threads on whiteboard elements, counted per element and grouped by whiteboard. */
export const countOpenBoardElementThreads = (threads: TCommentThread[]): Record<string, Record<string, number>> => {
  const counts: Record<string, Record<string, number>> = {};
  threads.forEach(({ root }) => {
    if (root.resolved_at || root.anchor_type !== "board_element" || !root.anchor_board_id) return;
    const board = (counts[root.anchor_board_id] ??= {});
    board[root.anchor_id] = (board[root.anchor_id] ?? 0) + 1;
  });
  return counts;
};

/** Number of unresolved threads per anchor id, for one kind of anchor. */
export const countOpenThreadsByAnchor = (
  threads: TCommentThread[],
  anchorType: TPageCommentAnchorType
): Record<string, number> => {
  const counts: Record<string, number> = {};
  threads.forEach(({ root }) => {
    if (root.resolved_at || root.anchor_type !== anchorType) return;
    counts[root.anchor_id] = (counts[root.anchor_id] ?? 0) + 1;
  });
  return counts;
};

export type TCommentThreadFilter = { actorId?: string; query?: string };

/** Threads where any comment was written by `actorId` and any comment (or the quoted text) contains `query`. */
export const filterCommentThreads = (threads: TCommentThread[], { actorId, query }: TCommentThreadFilter) => {
  const needle = query?.trim().toLowerCase();
  if (!actorId && !needle) return threads;
  return threads.filter(({ root, replies }) => {
    const comments = [root, ...replies];
    if (actorId && !comments.some((comment) => comment.actor === actorId)) return false;
    if (!needle) return true;
    return (
      root.quote.toLowerCase().includes(needle) ||
      comments.some((comment) => comment.body.toLowerCase().includes(needle))
    );
  });
};

/** IDs of everyone who wrote in these threads, in order of first appearance. */
export const getThreadActorIds = (threads: TCommentThread[]): string[] => {
  const ids = new Set<string>();
  threads.forEach(({ root, replies }) => [root, ...replies].forEach((comment) => ids.add(comment.actor)));
  return [...ids];
};
