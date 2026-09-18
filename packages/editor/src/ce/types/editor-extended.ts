/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type IEditorExtensionOptions = unknown;

export type IEditorPropsExtended = {
  embed?: {
    issue?: {
      widgetCallback: (props: { issueId: string; projectId: string | undefined; workspaceSlug: string | undefined }) => React.ReactNode;
    };
    whiteboard?: {
      widgetCallback: (props: { boardId: string; pageId: string | undefined; workspaceSlug: string | undefined; schemaVersion: number | undefined }) => React.ReactNode;
    };
  };
  slashCommandOptions?: Array<unknown>;
};

export type ICollaborativeDocumentEditorPropsExtended = unknown;

export type TExtendedEditorCommands = never;

export type TExtendedCommandExtraProps = unknown;

export type TExtendedEditorRefApi = unknown;
