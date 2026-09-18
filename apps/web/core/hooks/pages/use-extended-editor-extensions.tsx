/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { ListTodo, PenTool } from "lucide-react";
import type { IEditorPropsExtended } from "@plane/editor";

import { PageIssueEmbed, PageWhiteboardEmbed } from "@/components/pages/editor/embeds";
import { PageWhiteboardService } from "@/services/page";
import type { TPageInstance } from "@/store/pages/base-page";
import type { EPageStoreType } from "@/hooks/store";

const whiteboardService = new PageWhiteboardService();

export type TExtendedEditorExtensionsHookParams = {
  workspaceSlug: string;
  page: TPageInstance;
  storeType: EPageStoreType;
  fetchEntity: (payload: any) => Promise<any>;
  getRedirectionLink: (pageId?: string) => string;
  extensionHandlers?: Map<string, unknown>;
  projectId?: string;
};

export type TExtendedEditorExtensionsConfig = IEditorPropsExtended;

/** Page-only embeds. Project routing is deliberately passed from the route,
 * never inferred from page.project_ids: global Pages are unsupported in v1. */
export const useExtendedEditorProps = (params: TExtendedEditorExtensionsHookParams): TExtendedEditorExtensionsConfig => {
  const { workspaceSlug, page, projectId } = params;
  return useMemo(() => {
    const taskEvent = `plane:page-task-embed:${page.id}`;
    // The editor package intentionally exposes slash options as `unknown` to
    // host applications; keep their concrete shape local to the Page host.
    const options: any[] = [];
    if (projectId) {
      options.push({
        commandKey: "issue-embed", key: "page-task", title: "Work item", description: "Embed a work item from this project",
        searchTerms: ["task", "issue", "work item"], icon: <ListTodo className="size-3.5" />, section: "general", pushAfter: "image",
        command: ({ editor, range }: any) => window.dispatchEvent(new CustomEvent(taskEvent, { detail: { editor, range } })),
      });
      options.push({
        commandKey: "whiteboard", key: "page-whiteboard", title: "Whiteboard", description: "Insert an Excalidraw whiteboard",
        searchTerms: ["board", "draw", "canvas", "excalidraw"], icon: <PenTool className="size-3.5" />, section: "general", pushAfter: "issue-embed",
        command: async ({ editor, range }: any) => {
          const board = await whiteboardService.create(workspaceSlug, projectId, page.id, {
            creation_key: crypto.randomUUID(), scene: { elements: [], appState: {}, files: {} }, asset_ids: [],
          });
          editor.chain().focus().deleteRange(range).insertContent({
            type: "whiteboard-embed-component",
            attrs: { id: crypto.randomUUID(), board_identifier: board.id, page_identifier: page.id,
              workspace_identifier: workspaceSlug, schema_version: board.schema_version },
          }).run();
        },
      });
    }
    return {
      slashCommandOptions: options,
      embed: {
        issue: { widgetCallback: ({ issueId, projectId: issueProjectId, workspaceSlug: issueWorkspaceSlug }) =>
          <PageIssueEmbed issueId={issueId} projectId={issueProjectId ?? projectId} workspaceSlug={issueWorkspaceSlug ?? workspaceSlug} /> },
        whiteboard: { widgetCallback: ({ boardId, pageId, workspaceSlug: boardWorkspaceSlug }) =>
          <PageWhiteboardEmbed boardId={boardId} pageId={pageId ?? page.id} currentPageId={page.id} projectId={projectId} workspaceSlug={boardWorkspaceSlug ?? workspaceSlug} readOnly={!page.isContentEditable} /> },
      },
    };
  }, [page.id, page.isContentEditable, projectId, workspaceSlug]);
};
