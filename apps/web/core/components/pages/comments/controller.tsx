/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
// plane imports
import { PAGE_COMMENT_OPEN_EVENT, PAGE_COMMENT_REQUEST_EVENT } from "@plane/editor";
import type { TPageCommentAnchorEventDetail } from "@plane/editor";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
import { useQueryParams } from "@/hooks/use-query-params";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM } from "../navigation-pane";
import { countOpenThreadsByAnchor } from "./thread-utils";
import { usePageComments } from "./use-page-comments";

type Props = {
  page: TPageInstance;
};

// Bridges the editor (which only raises window events) and the Comments tab, and keeps the editor's markers in step with the threads.
export const PageCommentsController = observer(function PageCommentsController(props: Props) {
  const { page } = props;
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const { updateQueryParams } = useQueryParams();
  const { threads } = usePageComments(page);
  const {
    editor: { editorRef, setCommentDraft, focusCommentAnchor },
  } = page;

  const openCommentsTab = useCallback(() => {
    if (searchParams.get(PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM) === "comments") return;
    router.push(updateQueryParams({ paramsToAdd: { [PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM]: "comments" } }));
  }, [router, searchParams, updateQueryParams]);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<TPageCommentAnchorEventDetail>).detail;
      if (!detail?.anchorId) return;
      setCommentDraft({ anchorType: detail.anchorType, anchorId: detail.anchorId, quote: detail.quote });
      openCommentsTab();
    };
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<TPageCommentAnchorEventDetail>).detail;
      if (!detail?.anchorId) return;
      focusCommentAnchor(detail.anchorType, detail.anchorId);
      openCommentsTab();
    };
    window.addEventListener(PAGE_COMMENT_REQUEST_EVENT, onRequest);
    window.addEventListener(PAGE_COMMENT_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(PAGE_COMMENT_REQUEST_EVENT, onRequest);
      window.removeEventListener(PAGE_COMMENT_OPEN_EVENT, onOpen);
    };
  }, [focusCommentAnchor, openCommentsTab, setCommentDraft]);

  useEffect(() => {
    editorRef?.setCommentedBlocks(countOpenThreadsByAnchor(threads, "block"));
  }, [editorRef, threads]);

  return null;
});
