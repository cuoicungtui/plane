/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { AnyExtension } from "@tiptap/core";
import { SlashCommands, WhiteboardEmbedExtension, WorkItemEmbedExtension } from "@/extensions";
import type { TSlashCommandAdditionalOption } from "@/extensions";
// types
import type { IEditorProps, TExtensions, TUserDetails } from "@/types";

export type TDocumentEditorAdditionalExtensionsProps = Pick<
  IEditorProps,
  "disabledExtensions" | "flaggedExtensions" | "fileHandler" | "extendedEditorProps"
> & {
  isEditable: boolean;
  provider?: HocuspocusProvider;
  userDetails: TUserDetails;
};

export type TDocumentEditorAdditionalExtensionsRegistry = {
  isEnabled: (disabledExtensions: TExtensions[], flaggedExtensions: TExtensions[]) => boolean;
  getExtension: (props: TDocumentEditorAdditionalExtensionsProps) => AnyExtension | undefined;
};

const extensionRegistry: TDocumentEditorAdditionalExtensionsRegistry[] = [
  {
    isEnabled: (disabledExtensions) => !disabledExtensions.includes("slash-commands"),
    getExtension: ({ disabledExtensions, flaggedExtensions, extendedEditorProps }) =>
      SlashCommands({
        disabledExtensions,
        flaggedExtensions,
        additionalOptions: extendedEditorProps?.slashCommandOptions as TSlashCommandAdditionalOption[] | undefined,
      }),
  },
  {
    isEnabled: (disabledExtensions) => !disabledExtensions.includes("issue-embed"),
    getExtension: ({ extendedEditorProps }) => {
      const widgetCallback = extendedEditorProps?.embed?.issue?.widgetCallback;
      return widgetCallback ? WorkItemEmbedExtension({ widgetCallback }) : undefined;
    },
  },
  {
    isEnabled: (disabledExtensions) => !disabledExtensions.includes("whiteboard"),
    getExtension: ({ extendedEditorProps }) => {
      const widgetCallback = extendedEditorProps?.embed?.whiteboard?.widgetCallback;
      return widgetCallback ? WhiteboardEmbedExtension({ widgetCallback }) : undefined;
    },
  },
];

export function DocumentEditorAdditionalExtensions(props: TDocumentEditorAdditionalExtensionsProps) {
  const { disabledExtensions, flaggedExtensions } = props;

  const documentExtensions = extensionRegistry
    .filter((config) => config.isEnabled(disabledExtensions, flaggedExtensions))
    .map((config) => config.getExtension(props))
    .filter((extension): extension is AnyExtension => extension !== undefined);

  return documentExtensions;
}
