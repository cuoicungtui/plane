/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
// local imports
import { WorkItemEmbedExtensionConfig } from "./extension-config";
import type { TWorkItemEmbedAttributes } from "./types";
import { EWorkItemEmbedAttributeNames } from "./types";

type Props = {
  widgetCallback: ({
    issueId,
    projectId,
    workspaceSlug,
    updateAttributes,
    deleteNode,
  }: {
    // undefined while the block is a draft that hasn't resolved to a real work item yet (D05)
    issueId: string | undefined;
    projectId: string | undefined;
    workspaceSlug: string | undefined;
    updateAttributes: (attrs: Partial<TWorkItemEmbedAttributes>) => void;
    deleteNode: () => void;
  }) => React.ReactNode;
};

export function WorkItemEmbedExtension(props: Props) {
  return WorkItemEmbedExtensionConfig.extend({
    addNodeView() {
      return ReactNodeViewRenderer((issueProps: NodeViewProps) => {
        const attrs = issueProps.node.attrs as TWorkItemEmbedAttributes;
        return (
          <NodeViewWrapper key={attrs[EWorkItemEmbedAttributeNames.ID]} className="block">
            {props.widgetCallback({
              issueId: attrs[EWorkItemEmbedAttributeNames.ENTITY_IDENTIFIER],
              projectId: attrs[EWorkItemEmbedAttributeNames.PROJECT_IDENTIFIER],
              workspaceSlug: attrs[EWorkItemEmbedAttributeNames.WORKSPACE_IDENTIFIER],
              updateAttributes: issueProps.updateAttributes,
              deleteNode: issueProps.deleteNode,
            })}
          </NodeViewWrapper>
        );
      });
    },
  });
}
