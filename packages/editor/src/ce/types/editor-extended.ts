/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type IEditorExtensionOptions = unknown;

export type IEditorPropsExtended = {
  embed?: {
    issue?: {
      widgetCallback: (props: {
        // undefined while the block is a draft that hasn't resolved to a real work item yet
        issueId: string | undefined;
        projectId: string | undefined;
        workspaceSlug: string | undefined;
        updateAttributes: (attrs: Record<string, unknown>) => void;
        deleteNode: () => void;
      }) => React.ReactNode;
    };
    whiteboard?: {
      widgetCallback: (props: {
        boardId: string;
        pageId: string | undefined;
        workspaceSlug: string | undefined;
        schemaVersion: number | undefined;
        // D09: the canvas renders inline in the document flow (no modal), so
        // its height is a document-level layout choice a user can drag to
        // resize, persisted on the node itself.
        height: number | undefined;
        onHeightChange: (height: number) => void;
      }) => React.ReactNode;
    };
  };
  slashCommandOptions?: Array<unknown>;
  // D18: promotes a native checklist item to a real work item once a user is
  // @mentioned inside it — see task-item-enhanced extension.
  taskChecklist?: {
    onAutoCreate: (args: { itemId: string; title: string; assigneeId: string }) => Promise<string | undefined>;
    onToggle: (entityIdentifier: string, checked: boolean) => void;
    onTitleChange: (entityIdentifier: string, title: string) => void;
    stateCallback: (props: {
      entityIdentifier: string;
      checked: boolean;
      onStateGroupChange: (isCompleted: boolean) => void;
    }) => React.ReactNode;
    metaCallback: (props: { entityIdentifier: string; checked: boolean; onDeleted: () => void }) => React.ReactNode;
  };
};

export type ICollaborativeDocumentEditorPropsExtended = unknown;

export type TExtendedEditorCommands = never;

export type TExtendedCommandExtraProps = unknown;

export type TExtendedEditorRefApi = unknown;
