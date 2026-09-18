import { mergeAttributes, Node } from "@tiptap/core";

export const WhiteboardEmbedExtensionConfig = Node.create({
  name: "whiteboard-embed-component",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      id: { default: undefined },
      board_identifier: { default: undefined },
      page_identifier: { default: undefined },
      workspace_identifier: { default: undefined },
      schema_version: { default: 1 },
    };
  },
  parseHTML() {
    return [{ tag: "whiteboard-embed-component" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["whiteboard-embed-component", mergeAttributes(HTMLAttributes)];
  },
});
