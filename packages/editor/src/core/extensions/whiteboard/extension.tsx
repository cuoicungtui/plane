import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";

import { WhiteboardEmbedExtensionConfig } from "./extension-config";
import { EWhiteboardEmbedAttributeNames, type TWhiteboardEmbedAttributes } from "./types";

type Props = {
  widgetCallback: (props: {
    boardId: string;
    pageId: string | undefined;
    workspaceSlug: string | undefined;
    schemaVersion: number | undefined;
  }) => React.ReactNode;
};

export function WhiteboardEmbedExtension(props: Props) {
  return WhiteboardEmbedExtensionConfig.extend({
    addNodeView() {
      return ReactNodeViewRenderer((nodeViewProps: NodeViewProps) => {
        const attrs = nodeViewProps.node.attrs as TWhiteboardEmbedAttributes;
        return (
          <NodeViewWrapper key={attrs[EWhiteboardEmbedAttributeNames.ID]}>
            {props.widgetCallback({
              boardId: attrs[EWhiteboardEmbedAttributeNames.BOARD_IDENTIFIER] ?? "",
              pageId: attrs[EWhiteboardEmbedAttributeNames.PAGE_IDENTIFIER],
              workspaceSlug: attrs[EWhiteboardEmbedAttributeNames.WORKSPACE_IDENTIFIER],
              schemaVersion: attrs[EWhiteboardEmbedAttributeNames.SCHEMA_VERSION],
            })}
          </NodeViewWrapper>
        );
      });
    },
  });
}
