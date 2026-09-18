/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState } from "react";
import { ExternalLink, ListTodo } from "lucide-react";
import type { TIssue } from "@plane/types";

import { IssueService } from "@/services/issue";

const issueService = new IssueService();

type Props = { issueId: string; projectId?: string; workspaceSlug?: string };

export function PageIssueEmbed({ issueId, projectId, workspaceSlug }: Props) {
  const [issue, setIssue] = useState<TIssue | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!issueId || !projectId || !workspaceSlug) return;
    issueService
      .retrieve(workspaceSlug, projectId, issueId)
      .then(setIssue)
      .catch(() => setFailed(true));
  }, [issueId, projectId, workspaceSlug]);

  if (failed) return <div className="my-2 rounded border border-subtle p-3 text-sm text-secondary">Work item is unavailable.</div>;
  if (!issue) return <div className="my-2 animate-pulse rounded bg-layer-1 p-4 text-sm text-secondary">Loading work item…</div>;

  const href = `/${workspaceSlug}/projects/${projectId}/issues/${issue.id}`;
  return (
    <a className="my-2 flex items-center justify-between rounded border border-subtle bg-layer-1 p-3 hover:bg-layer-2" href={href}>
      <span className="flex min-w-0 items-center gap-2"><ListTodo className="size-4 shrink-0" /><span className="truncate"><b>{issue.identifier}-{issue.sequence_id}</b> {issue.name}</span></span>
      <ExternalLink className="size-4 shrink-0 text-tertiary" />
    </a>
  );
}
