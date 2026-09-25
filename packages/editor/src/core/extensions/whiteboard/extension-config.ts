import { mergeAttributes, Node } from "@tiptap/core";
import { WHITEBOARD_DEFAULT_HEIGHT } from "./types";

export const WhiteboardEmbedExtensionConfig = Node.create({
  name: "whiteboard-embed-component",
  group: "block",
  // Not draggable: the board needs raw mouse-drag gestures for drawing
  // (shapes, connectors, freehand, box selection). A draggable node gets a
  // native HTML `draggable` attribute on its whole DOM wrapper, which
  // hijacks any press-and-drag inside the board as a "move this block"
  // gesture before the whiteboard ever sees it.
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      id: { default: undefined },
      board_identifier: { default: undefined },
      page_identifier: { default: undefined },
      workspace_identifier: { default: undefined },
      schema_version: { default: 1 },
      height: {
        default: WHITEBOARD_DEFAULT_HEIGHT,
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute("height");
          return value ? Number(value) : WHITEBOARD_DEFAULT_HEIGHT;
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: "whiteboard-embed-component" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["whiteboard-embed-component", mergeAttributes(HTMLAttributes)];
  },
});
