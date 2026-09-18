/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { ISearchIssueResponse } from "@plane/types";

import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";

type InsertContext = { editor: Editor; range: { from: number; to: number } };
type Props = { eventName: string; projectId?: string; workspaceSlug: string };

export function PageTaskEmbedPicker({ eventName, projectId, workspaceSlug }: Props) {
  const [context, setContext] = useState<InsertContext | null>(null);

  useEffect(() => {
    const handleOpen = (event: Event) => setContext((event as CustomEvent<InsertContext>).detail);
    window.addEventListener(eventName, handleOpen);
    return () => window.removeEventListener(eventName, handleOpen);
  }, [eventName]);

  if (!projectId) return null;
  const insert = async (issues: ISearchIssueResponse[]) => {
    const issue = issues[0];
    if (!issue || !context) return;
    context.editor
      .chain()
      .focus()
      .deleteRange(context.range)
      .insertContent({
        type: "issue-embed-component",
        attrs: {
          id: crypto.randomUUID(), entity_identifier: issue.id, project_identifier: projectId,
          workspace_identifier: workspaceSlug, entity_name: "issue",
        },
      })
      .run();
  };

  return (
    <ExistingIssuesListModal
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      isOpen={context !== null}
      handleClose={() => setContext(null)}
      searchParams={{}}
      workspaceLevelToggle={false}
      handleOnSubmit={insert}
    />
  );
}
