/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// local imports
import { CommentComposer } from "./comment-composer";
import { PageCommentItem } from "./comment-item";
import type { TCommentThread } from "./use-page-comments";

type Props = {
  thread: TCommentThread;
  currentUserId: string | undefined;
  isAdmin: boolean;
  isFocused: boolean;
  isOrphan: boolean;
  canComment: boolean;
  canReattach: boolean;
  isReattaching: boolean;
  onReattach: () => void;
  onLocate: () => void;
  onReply: (parentId: string, body: string) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onToggleResolved: (threadId: string, resolved: boolean) => Promise<void>;
};

export const PageCommentThread = observer(
  forwardRef<HTMLDivElement, Props>(function PageCommentThread(props, ref) {
    const {
      thread,
      currentUserId,
      isAdmin,
      isFocused,
      isOrphan,
      canComment,
      canReattach,
      isReattaching,
      onReattach,
      onLocate,
      onReply,
      onEdit,
      onDelete,
      onToggleResolved,
    } = props;
    const { root, replies } = thread;
    const { t } = useTranslation();
    const [isReplying, setIsReplying] = useState(false);
    const isResolved = !!root.resolved_at;
    const anchorLabel = root.quote || t(`page_comments.anchor.${root.anchor_type || "block"}`);

    return (
      <div
        ref={ref}
        className={cn("space-y-2.5 rounded-lg border border-subtle bg-surface-1 p-2.5", {
          "border-accent-strong": isFocused,
          "opacity-70": isResolved,
        })}
      >
        <button
          type="button"
          disabled={isOrphan}
          onClick={onLocate}
          className="border-yellow-500 block w-full border-l-2 pl-2 text-left text-11 text-tertiary hover:text-secondary disabled:cursor-default"
        >
          <span className="line-clamp-2 break-words">{anchorLabel}</span>
        </button>
        {isOrphan && (
          <div className="space-y-1">
            <p className="text-11 font-medium text-warning-primary">{t("page_comments.orphan")}</p>
            {canReattach && (
              <button
                type="button"
                className={cn(
                  "text-11 font-medium hover:underline",
                  isReattaching ? "text-tertiary" : "text-accent-primary"
                )}
                onClick={onReattach}
              >
                {isReattaching ? t("page_comments.reattach_cancel") : t("page_comments.reattach")}
              </button>
            )}
          </div>
        )}
        <PageCommentItem
          comment={root}
          canEdit={root.actor === currentUserId}
          canDelete={root.actor === currentUserId || isAdmin}
          deletesReplies={replies.length > 0}
          onEdit={(body) => onEdit(root.id, body)}
          onDelete={() => onDelete(root.id)}
        />
        {replies.map((reply) => (
          <div key={reply.id} className="ml-3 border-l border-subtle pl-2">
            <PageCommentItem
              comment={reply}
              canEdit={reply.actor === currentUserId}
              canDelete={reply.actor === currentUserId || isAdmin}
              onEdit={(body) => onEdit(reply.id, body)}
              onDelete={() => onDelete(reply.id)}
            />
          </div>
        ))}
        {isReplying && (
          <CommentComposer
            focusOnMount
            placeholder={t("page_comments.reply_placeholder")}
            submitLabel={t("page_comments.reply")}
            onCancel={() => setIsReplying(false)}
            onSubmit={async (body) => {
              await onReply(root.id, body);
              setIsReplying(false);
            }}
          />
        )}
        <div className="flex gap-3 text-11 font-medium text-tertiary">
          {canComment && !isReplying && (
            <button type="button" className="hover:text-primary" onClick={() => setIsReplying(true)}>
              {t("page_comments.reply")}
            </button>
          )}
          {canComment && (
            <button
              type="button"
              className="hover:text-primary"
              onClick={() => void onToggleResolved(root.id, !isResolved)}
            >
              {isResolved ? t("page_comments.reopen") : t("page_comments.resolve")}
            </button>
          )}
        </div>
      </div>
    );
  })
);
