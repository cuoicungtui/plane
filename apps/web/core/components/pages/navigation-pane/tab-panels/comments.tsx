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
import { filterCommentThreads, getThreadActorIds } from "@/components/pages/comments/thread-utils";
import { pageCommentService, usePageComments } from "@/components/pages/comments/use-page-comments";
// hooks
import { useMember } from "@/hooks/store/use-member";
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
  const { getUserDetails } = useMember();
  const { allowPermissions } = useUserPermissions();
  const { workspaceSlug, projectId, pageId, threads, mutate, isLoading } = usePageComments(page);
  const {
    editor: { editorRef, commentDraft, setCommentDraft, focusedCommentAnchor },
  } = page;
  const [filter, setFilter] = useState<TFilter>("open");
  const [query, setQuery] = useState("");
  const [actorId, setActorId] = useState("");
  const [reattachId, setReattachId] = useState<string | null>(null);
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

  const matchingThreads = filterCommentThreads(threads, { actorId: actorId || undefined, query });
  const openThreads = matchingThreads.filter(({ root }) => !root.resolved_at);
  const resolvedThreads = matchingThreads.filter(({ root }) => !!root.resolved_at);
  const actorIds = getThreadActorIds(threads);
  const isFiltering = !!actorId || !!query.trim();
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

  // while a thread is being re-attached, the next comment request from the page (block, text or board element)
  // moves that thread there instead of opening a new draft
  useEffect(() => {
    if (!reattachId || !commentDraft || !workspaceSlug || !projectId || !pageId) return;
    const anchor = commentDraft;
    setCommentDraft(null);
    setReattachId(null);
    pageCommentService
      .reattachComment(workspaceSlug, projectId, pageId, reattachId, {
        anchor_type: anchor.anchorType,
        anchor_id: anchor.anchorId,
        anchor_board_id: anchor.anchorBoardId,
        quote: anchor.quote,
      })
      .then(() => mutate())
      .catch((error: { error?: string }) => {
        if (anchor.anchorType === "text") editorRef?.removeCommentMark(anchor.anchorId);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("page_comments.error_title"),
          message: error?.error ?? t("page_comments.error_message"),
        });
      });
  }, [reattachId, commentDraft, workspaceSlug, projectId, pageId, setCommentDraft, mutate, editorRef, t]);

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

  const orphanOpenThreads = openThreads.filter(({ root }) => orphanFlags.get(root.id));

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
      <div className="mb-2 flex gap-1.5">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("page_comments.search_placeholder")}
          className="min-w-0 flex-1 rounded-md border border-subtle bg-surface-1 px-2 py-1 text-12 outline-none focus:border-accent-strong"
        />
        <select
          value={actorId}
          onChange={(event) => setActorId(event.target.value)}
          aria-label={t("page_comments.all_people")}
          className="max-w-[40%] rounded-md border border-subtle bg-surface-1 px-1 py-1 text-12 outline-none focus:border-accent-strong"
        >
          <option value="">{t("page_comments.all_people")}</option>
          {actorIds.map((id) => (
            <option key={id} value={id}>
              {getUserDetails(id)?.display_name ?? id}
            </option>
          ))}
        </select>
      </div>
      {reattachId && (
        <p className="mb-2 rounded-md bg-layer-transparent-hover px-2 py-1.5 text-11 text-secondary">
          {t("page_comments.reattach_hint")}
        </p>
      )}
      {canComment && filter === "open" && orphanOpenThreads.length > 0 && (
        <button
          type="button"
          className="mb-2 self-start text-11 font-medium text-warning-primary hover:underline"
          onClick={() =>
            void run(() =>
              Promise.all(
                orphanOpenThreads.map(({ root }) =>
                  pageCommentService.setCommentResolved(workspaceSlug, projectId, pageId, root.id, true)
                )
              )
            ).catch(() => undefined)
          }
        >
          {t("page_comments.resolve_orphans", { count: orphanOpenThreads.length })}
        </button>
      )}
      <div className="flex-1 space-y-2.5 overflow-y-auto pb-4">
        {commentDraft && !reattachId && (
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
            {isFiltering ? (
              <h4 className="text-14 font-medium">{t("page_comments.no_match")}</h4>
            ) : (
              <div className="space-y-2.5">
                <h4 className="text-14 font-medium">{t(`page_comments.empty.${filter}.title`)}</h4>
                <p className="text-13 font-medium text-secondary">{t(`page_comments.empty.${filter}.description`)}</p>
              </div>
            )}
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
            canReattach={canComment && (thread.root.actor === currentUser?.id || isAdmin)}
            isReattaching={reattachId === thread.root.id}
            onReattach={() => {
              setCommentDraft(null);
              setReattachId((current) => (current === thread.root.id ? null : thread.root.id));
            }}
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
            onDelete={async (commentId) => {
              const isTextRoot = thread.root.id === commentId && thread.root.anchor_type === "text";
              try {
                await run(() => pageCommentService.deleteComment(workspaceSlug, projectId, pageId, commentId));
                if (isTextRoot) editorRef?.removeCommentMark(thread.root.anchor_id);
              } catch {
                // run() already reported the error
              }
            }}
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
