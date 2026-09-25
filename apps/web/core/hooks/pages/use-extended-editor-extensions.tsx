/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useRef } from "react";
import { PenTool } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import type { IEditorPropsExtended } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";

import { PageWhiteboardEmbed, TaskItemMeta, TaskItemState } from "@/components/pages/editor/embeds";
import { useProjectState } from "@/hooks/store/use-project-state";
import { IssueService } from "@/services/issue";
import { PageWhiteboardService, type TPageWhiteboard } from "@/services/page";
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
  // `t` is a new function on every render; read through a ref so it stays out of the memo's
  // dependencies (a changing memo rebuilds the editor extensions).
  const { t } = useTranslation();
  const translateRef = useRef(t);
  translateRef.current = t;

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
        description: "Insert a whiteboard",
        searchTerms: ["board", "draw", "canvas", "diagram", "mind map"],
        icon: <PenTool className="size-3.5" />,
        section: "general",
        pushAfter: "image",
        command: async ({ editor, range }: any) => {
          if (!page.id) return;
          let board: TPageWhiteboard;
          try {
            // The server stores an empty Plait board when no scene is sent.
            board = await whiteboardService.create(workspaceSlug, currentProjectId, page.id, {
              creation_key: uuidv4(),
            });
          } catch {
            // Leave the typed "/whiteboard" in place so the person can retry.
            setToast({
              type: TOAST_TYPE.ERROR,
              title: translateRef.current("toast.error"),
              message: translateRef.current("page_whiteboard.create_error"),
            });
            return;
          }
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "whiteboard-embed-component",
              attrs: {
                id: uuidv4(),
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
            onAutoCreate: async ({ itemId, title, assigneeId }) => {
              try {
                // external_id/external_source key this create off the checklist
                // item's own stable node id, so a duplicate call for the same
                // item (client retry, cross-tab race, etc.) gets back the
                // already-created issue instead of a second one.
                const created = await issueService.createIssue(workspaceSlug, projectId, {
                  name: title,
                  assignee_ids: [assigneeId],
                  external_id: itemId,
                  external_source: "PAGE_TASK_CHECKLIST",
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
