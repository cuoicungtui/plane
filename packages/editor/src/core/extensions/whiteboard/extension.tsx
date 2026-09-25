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
    height: number | undefined;
    onHeightChange: (height: number) => void;
  }) => React.ReactNode;
};

// The whiteboard (widgetCallback renders the Plait board) draws real DOM
// nodes — native mouse-drag drawing on its board, an editable text layer for
// its text tool — inside this NodeView, which sits inside ProseMirror's
// contentEditable root. React's synthetic event system
// only replays handlers once the native event has already fully bubbled up
// to the app's React root — but ProseMirror attaches its own mousedown/
// keydown listeners directly to view.dom with real addEventListener, an
// ancestor of this node view in the actual DOM. That means view.dom's
// listener always fires during real bubbling before any React handler on
// this wrapper ever runs, so calling event.stopPropagation() from a React
// onMouseUp/onKeyDown prop here is too late to stop it — verified empirically
// with the previous whiteboard engine, Excalidraw (its text tool's textarea
// still lost focus and got deleted with that approach in place). ProseMirror
// sees the events, creates a NodeSelection on this atom node, and steals DOM
// focus back onto its contentEditable root: with Excalidraw this happened
// right as it created its editing textarea, and losing focus before any
// character is typed made it treat that as an abandoned empty text box and
// delete it; for keystrokes, ProseMirror's default typing-over-a-selection
// behavior deletes the whole embed and inserts the character in its place.
// The same mechanism applies to any interactive content rendered here.
//
// `stopEvent` is tiptap/ProseMirror's own escape hatch for exactly this: it
// tells the NodeView's owning ProseMirror view to skip ALL of its own
// handling (selection, focus, deletion) for events originating inside this
// node's DOM, without touching the real DOM event at all — so the whiteboard
// still receives and bubbles every event completely normally.
const stopEvent = () => true;

// `stopEvent` alone isn't enough: a text tool that inserts a new editing
// element (a <textarea> in Excalidraw's case) adds a DOM node inside this
// NodeView, which is a childList mutation.
// ProseMirror's view watches all DOM mutations inside its contentEditable
// root via a MutationObserver, and by default treats any mutation it didn't
// cause itself as a sign that content may have changed out from under it —
// so it re-reads the DOM/selection and calls view.focus(), stealing focus
// right back from the element the board just created and focused. This is
// a *separate* PM mechanism from event dispatch, so overriding it needs its
// own escape hatch: `ignoreMutation` tells PM to skip that DOM-mutation
// re-sync entirely for mutations inside this node's DOM.
const ignoreMutation = () => true;

export function WhiteboardEmbedExtension(props: Props) {
  return WhiteboardEmbedExtensionConfig.extend({
    addNodeView() {
      return ReactNodeViewRenderer(
        (nodeViewProps: NodeViewProps) => {
          const attrs = nodeViewProps.node.attrs as TWhiteboardEmbedAttributes;
          return (
            <NodeViewWrapper key={attrs[EWhiteboardEmbedAttributeNames.ID]}>
              {props.widgetCallback({
                boardId: attrs[EWhiteboardEmbedAttributeNames.BOARD_IDENTIFIER] ?? "",
                pageId: attrs[EWhiteboardEmbedAttributeNames.PAGE_IDENTIFIER],
                workspaceSlug: attrs[EWhiteboardEmbedAttributeNames.WORKSPACE_IDENTIFIER],
                schemaVersion: attrs[EWhiteboardEmbedAttributeNames.SCHEMA_VERSION],
                height: attrs[EWhiteboardEmbedAttributeNames.HEIGHT],
                onHeightChange: (height) =>
                  nodeViewProps.updateAttributes({ [EWhiteboardEmbedAttributeNames.HEIGHT]: height }),
              })}
            </NodeViewWrapper>
          );
        },
        { stopEvent, ignoreMutation }
      );
    },
  });
}
