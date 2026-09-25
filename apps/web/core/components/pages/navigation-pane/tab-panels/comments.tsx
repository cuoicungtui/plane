/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { EUserProjectRoles } from "@plane/types";
import { cn } from "@plane/utils";
// components
import {
  hasCommentBoardElement,
  locateCommentBoardElement,
  useCommentBoardsRevision,
} from "@/components/pages/comments/board-comments";
import { CommentComposer } from "@/components/pages/comments/comment-composer";
import { PageCommentThread } from "@/components/pages/comments/comment-thread";
import { pageCommentService, usePageComments } from "@/components/pages/comments/use-page-comments";
// hooks
import { useUser, useUserPermissions } from "@/hooks/store/user";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
};

type TFilter = "open" | "resolved";

export const PageNavigationPaneCommentsTabPanel = observer(function PageNavigationPaneCommentsTabPanel(props: Props) {
  const { page } = props;
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const { workspaceSlug, projectId, pageId, threads, mutate, isLoading } = usePageComments(page);
  const {
    editor: { editorRef, commentDraft, setCommentDraft, focusedCommentAnchor },
  } = page;
  const [filter, setFilter] = useState<TFilter>("open");
  const [, setTick] = useState(0);
  // whiteboards report element changes here, since they are not part of the editor document
  useCommentBoardsRevision();
  const threadRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const isAdmin = allowPermissions([EUserProjectRoles.ADMIN], EUserPermissionsLevel.PROJECT);
  const canComment =
    !page.archived_at &&
    allowPermissions(
      [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER, EUserProjectRoles.GUEST],
      EUserPermissionsLevel.PROJECT
    );

  // the block behind a comment can be deleted while the page is edited, so the check reruns as the document changes
  useEffect(() => {
    if (!editorRef) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = editorRef.onStateChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setTick((value) => value + 1), 800);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [editorRef]);

  const openThreads = threads.filter(({ root }) => !root.resolved_at);
  const resolvedThreads = threads.filter(({ root }) => !!root.resolved_at);
  const visibleThreads = filter === "open" ? openThreads : resolvedThreads;

  // clicking a marker in the document brings its thread into view
  useEffect(() => {
    if (!focusedCommentAnchor) return;
    const target = threads.find(
      ({ root }) =>
        root.anchor_type === focusedCommentAnchor.anchorType &&
        root.anchor_id === focusedCommentAnchor.anchorId &&
        (root.anchor_board_id || undefined) === (focusedCommentAnchor.anchorBoardId || undefined) &&
        !root.resolved_at
    );
    if (!target) return;
    setFilter("open");
    setHighlightedId(target.root.id);
    requestAnimationFrame(() =>
      threadRefs.current.get(target.root.id)?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
    const timer = setTimeout(() => setHighlightedId(null), 2500);
    return () => clearTimeout(timer);
  }, [focusedCommentAnchor, threads]);

  // rerenders after the document changes (see setTick), so the flags always reflect the current blocks
  const orphanFlags = new Map(
    threads.map(({ root }) => {
      if (root.anchor_type === "board_element") {
        return [root.id, hasCommentBoardElement(root.anchor_board_id, root.anchor_id) === false] as const;
      }
      return [
        root.id,
        !!editorRef &&
          (root.anchor_type === "block" || root.anchor_type === "text") &&
          !editorRef.hasCommentAnchor(root.anchor_type, root.anchor_id),
      ] as const;
    })
  );

  if (!workspaceSlug || !projectId || !pageId) return null;

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await mutate();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("page_comments.error_title"),
        message: (error as { error?: string })?.error ?? t("page_comments.error_message"),
      });
      throw error;
    }
  };

  const draftAnchorLabel =
    commentDraft?.quote || (commentDraft ? t(`page_comments.anchor.${commentDraft.anchorType}`) : "");

  return (
    <div className="flex h-full flex-col px-4">
      <div className="mb-2 flex gap-1 text-12 font-medium">
        {(["open", "resolved"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn("rounded-md px-2 py-1 text-tertiary hover:bg-layer-transparent-hover", {
              "bg-layer-transparent-hover text-primary": filter === value,
            })}
          >
            {t(`page_comments.filter.${value}`)} ({value === "open" ? openThreads.length : resolvedThreads.length})
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-2.5 overflow-y-auto pb-4">
        {commentDraft && (
          <div className="space-y-1.5 rounded-lg border border-accent-strong bg-surface-1 p-2.5">
            <p className="border-yellow-500 line-clamp-2 border-l-2 pl-2 text-11 break-words text-tertiary">
              {draftAnchorLabel}
            </p>
            <CommentComposer
              focusOnMount
              placeholder={t("page_comments.placeholder")}
              submitLabel={t("page_comments.comment")}
              onCancel={() => {
                if (commentDraft.anchorType === "text") editorRef?.removeCommentMark(commentDraft.anchorId);
                setCommentDraft(null);
              }}
              onSubmit={async (body) => {
                await run(() =>
                  pageCommentService.createComment(workspaceSlug, projectId, pageId, {
                    body,
                    anchor_type: commentDraft.anchorType,
                    anchor_id: commentDraft.anchorId,
                    anchor_board_id: commentDraft.anchorBoardId,
                    quote: commentDraft.quote,
                  })
                );
                setCommentDraft(null);
                setFilter("open");
              }}
            />
          </div>
        )}
        {!isLoading && visibleThreads.length === 0 && !commentDraft && (
          <div className="grid place-items-center px-2 pt-10 text-center">
            <div className="space-y-2.5">
              <h4 className="text-14 font-medium">{t(`page_comments.empty.${filter}.title`)}</h4>
              <p className="text-13 font-medium text-secondary">{t(`page_comments.empty.${filter}.description`)}</p>
            </div>
          </div>
        )}
        {visibleThreads.map((thread) => (
          <PageCommentThread
            key={thread.root.id}
            ref={(node) => {
              if (node) threadRefs.current.set(thread.root.id, node);
              else threadRefs.current.delete(thread.root.id);
            }}
            thread={thread}
            currentUserId={currentUser?.id}
            isAdmin={isAdmin}
            isFocused={highlightedId === thread.root.id}
            isOrphan={orphanFlags.get(thread.root.id) ?? false}
            canComment={canComment}
            onLocate={() => {
              const { anchor_type, anchor_id, anchor_board_id } = thread.root;
              if (anchor_type === "board_element") locateCommentBoardElement(anchor_board_id, anchor_id);
              if (anchor_type === "block" || anchor_type === "text")
                editorRef?.scrollToCommentAnchor(anchor_type, anchor_id);
            }}
            onReply={(parentId, body) =>
              run(() => pageCommentService.createComment(workspaceSlug, projectId, pageId, { body, parent: parentId }))
            }
            onEdit={(commentId, body) =>
              run(() => pageCommentService.updateComment(workspaceSlug, projectId, pageId, commentId, body))
            }
            onDelete={(commentId) =>
              run(() => pageCommentService.deleteComment(workspaceSlug, projectId, pageId, commentId)).catch(
                () => undefined
              )
            }
            onToggleResolved={(threadId, resolved) =>
              run(() =>
                pageCommentService.setCommentResolved(workspaceSlug, projectId, pageId, threadId, resolved)
              ).catch(() => undefined)
            }
          />
        ))}
      </div>
    </div>
  );
});
