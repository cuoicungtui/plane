/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
// services
import { ProjectPageService } from "@/services/page/project-page.service";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { groupCommentThreads } from "./thread-utils";
import type { TCommentThread } from "./thread-utils";

export const pageCommentService = new ProjectPageService();

export type { TCommentThread };

export const usePageComments = (page: TPageInstance) => {
  const { workspaceSlug } = useParams();
  const projectId = page.project_ids?.[0];
  const key = workspaceSlug && projectId && page.id ? `PAGE_COMMENTS_${workspaceSlug}_${projectId}_${page.id}` : null;

  const { data, mutate, isLoading } = useSWR(
    key,
    () => pageCommentService.fetchComments(workspaceSlug!.toString(), projectId!, page.id!),
    { revalidateOnFocus: true }
  );

  const threads: TCommentThread[] = useMemo(() => groupCommentThreads(data ?? []), [data]);

  return {
    workspaceSlug: workspaceSlug?.toString(),
    projectId,
    pageId: page.id,
    threads,
    mutate,
    isLoading,
  };
};
