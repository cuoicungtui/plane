/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { PenTool } from "lucide-react";
import type { IEditorPropsExtended } from "@plane/editor";

import { PageWhiteboardEmbed, TaskItemMeta, TaskItemState } from "@/components/pages/editor/embeds";
import { useProjectState } from "@/hooks/store/use-project-state";
import { IssueService } from "@/services/issue";
import { PageWhiteboardService } from "@/services/page";
import type { TPageInstance } from "@/store/pages/base-page";
import type { EPageStoreType } from "@/hooks/store";

const whiteboardService = new PageWhiteboardService();
const issueService = new IssueService();

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
export const useExtendedEditorProps = (
  params: TExtendedEditorExtensionsHookParams
): TExtendedEditorExtensionsConfig => {
  const { workspaceSlug, page, projectId } = params;
  const { getProjectStates } = useProjectState();

  return useMemo(() => {
    // The editor package intentionally exposes slash options as `unknown` to
    // host applications; keep their concrete shape local to the Page host.
    const options: any[] = [];
    if (projectId) {
      // Narrowed once here so async closures below (which TS doesn't narrow
      // captured outer `const`s into) get a definite string, not string|undefined.
      const currentProjectId = projectId;
      options.push({
        commandKey: "whiteboard",
        key: "page-whiteboard",
        title: "Whiteboard",
        description: "Insert an Excalidraw whiteboard",
        searchTerms: ["board", "draw", "canvas", "excalidraw"],
        icon: <PenTool className="size-3.5" />,
        section: "general",
        pushAfter: "image",
        command: async ({ editor, range }: any) => {
          if (!page.id) return;
          const board = await whiteboardService.create(workspaceSlug, currentProjectId, page.id, {
            creation_key: crypto.randomUUID(),
            scene: { elements: [], appState: {}, files: {} },
            asset_ids: [],
          });
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "whiteboard-embed-component",
              attrs: {
                id: crypto.randomUUID(),
                board_identifier: board.id,
                page_identifier: page.id,
                workspace_identifier: workspaceSlug,
                schema_version: board.schema_version,
              },
            })
            .run();
        },
      });
    }
    return {
      slashCommandOptions: options,
      embed: {
        whiteboard: {
          widgetCallback: ({ boardId, pageId, workspaceSlug: boardWorkspaceSlug, height, onHeightChange }) => (
            <PageWhiteboardEmbed
              boardId={boardId}
              pageId={pageId ?? page.id}
              currentPageId={page.id}
              projectId={projectId}
              workspaceSlug={boardWorkspaceSlug ?? workspaceSlug}
              readOnly={!page.isContentEditable}
              height={height}
              onHeightChange={onHeightChange}
            />
          ),
        },
      },
      // D18: a native to-do list item becomes a real work item the moment
      // someone @mentions a user inside it — no separate "/task" node, no
      // popover, nothing that competes with ProseMirror for input focus.
      taskChecklist: projectId
        ? {
            onAutoCreate: async ({ title, assigneeId }) => {
              try {
                const created = await issueService.createIssue(workspaceSlug, projectId, {
                  name: title,
                  assignee_ids: [assigneeId],
                });
                return created.id;
              } catch {
                return undefined;
              }
            },
            onToggle: (entityIdentifier, checked) => {
              const projectStates = getProjectStates(projectId) ?? [];
              const targetGroup = checked ? "completed" : "unstarted";
              const fallbackGroup = "backlog";
              const nextStateId =
                projectStates.find((s) => s.group === targetGroup)?.id ??
                (checked ? undefined : projectStates.find((s) => s.group === fallbackGroup)?.id);
              if (nextStateId)
                void issueService.patchIssue(workspaceSlug, projectId, entityIdentifier, { state_id: nextStateId });
            },
            onTitleChange: (entityIdentifier, title) => {
              if (!title) return;
              void issueService.patchIssue(workspaceSlug, projectId, entityIdentifier, { name: title });
            },
            stateCallback: ({ entityIdentifier, checked, onStateGroupChange }) => (
              <TaskItemState
                issueId={entityIdentifier}
                projectId={projectId}
                workspaceSlug={workspaceSlug}
                readOnly={!page.isContentEditable}
                checked={checked}
                onStateGroupChange={onStateGroupChange}
              />
            ),
            metaCallback: ({ entityIdentifier, checked, onDeleted }) => (
              <TaskItemMeta
                issueId={entityIdentifier}
                projectId={projectId}
                workspaceSlug={workspaceSlug}
                readOnly={!page.isContentEditable}
                checked={checked}
                onDeleted={onDeleted}
              />
            ),
          }
        : undefined,
    };
  }, [page.id, page.isContentEditable, projectId, workspaceSlug, getProjectStates]);
};
