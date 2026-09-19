/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState } from "react";
import type { TIssue } from "@plane/types";

import { IssueService } from "@/services/issue";

const issueService = new IssueService();

export type TTaskItemIssueStatus = "loading" | "ready" | "not-found" | "no-access";

// Shared by every small work-item-aware control a checklist item's trailer
// renders (state, assignee, dates, delete) — each mounts independently as its
// own NodeView slot, so each needs its own fetch of the same work item.
export function useTaskItemIssue(workspaceSlug: string, projectId: string, issueId: string) {
  const [issue, setIssue] = useState<TIssue | null>(null);
  const [status, setStatus] = useState<TTaskItemIssueStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    issueService
      .retrieve(workspaceSlug, projectId, issueId)
      .then((data) => {
        if (cancelled) return;
        setIssue(data);
        setStatus("ready");
        return;
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus(error?.status === 403 ? "no-access" : "not-found");
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId, issueId]);

  const patch = async (data: Partial<TIssue>) => {
    if (!issue) return;
    const previous = issue;
    setIssue({ ...issue, ...data });
    try {
      await issueService.patchIssue(workspaceSlug, projectId, issueId, data);
    } catch {
      setIssue(previous);
    }
  };

  // Lets a caller pull the latest work item after it was changed through a
  // sibling control this hook's own `patch` didn't go through (e.g. the
  // checklist checkbox, which patches state directly via a host callback).
  const refetch = () => {
    issueService
      .retrieve(workspaceSlug, projectId, issueId)
      .then((data) => setIssue(data))
      .catch(() => {});
  };

  return { issue, status, patch, refetch };
}
