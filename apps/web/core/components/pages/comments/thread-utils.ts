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
