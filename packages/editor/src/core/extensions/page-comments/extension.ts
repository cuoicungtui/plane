/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

export const PAGE_COMMENT_OPEN_EVENT = "plane:page-comment-open";
export const PAGE_COMMENT_REQUEST_EVENT = "plane:page-comment-request";

export type TPageCommentAnchorEventDetail = {
  anchorType: "block" | "text" | "board_element";
  anchorId: string;
  /** The whiteboard an element belongs to; only set for `board_element`. */
  anchorBoardId?: string;
  quote?: string;
};

export const PAGE_COMMENT_MARK = "pageComment";

export type TCommentedAnchors = { blocks: Record<string, number>; texts: Record<string, number> };

type TPageCommentsStorage = TCommentedAnchors & { enabled: boolean };

// Wraps commented text. It carries only the comment's id and draws nothing by itself: the highlight comes from the
// decoration below, so a mark whose comment was resolved or never saved stays invisible.
export const PageCommentMark = Mark.create({
  name: PAGE_COMMENT_MARK,
  inclusive: false,
  excludes: "",

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes: { commentId?: string | null }) =>
          attributes.commentId ? { "data-comment-id": attributes.commentId } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

const pluginKey = new PluginKey("pageComments");

const COMMENT_BUTTON_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

// A locked page has no drag handle, yet it can still be commented: a small button follows the hovered block, and
// selected text is commented against the block that holds it (a text comment proper needs a mark, i.e. edit access).
const createReadOnlyCommentButton = (view: EditorView, storage: TPageCommentsStorage) => {
  const button = document.createElement("button");
  button.type = "button";
  button.title = "Comment";
  button.innerHTML = COMMENT_BUTTON_ICON;
  button.style.cssText =
    "position:fixed;display:none;z-index:40;width:24px;height:24px;align-items:center;justify-content:center;border-radius:6px;border:1px solid var(--border-color-subtle, #ddd);background:var(--background-color-surface-1, #fff);color:var(--text-color-secondary, #555);cursor:pointer;";
  document.body.appendChild(button);

  let blockId: string | null = null;
  let quote = "";
  let selecting = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const hide = () => {
    selecting = false;
    button.style.display = "none";
    blockId = null;
  };
  const scheduleHide = () => {
    if (selecting) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 250);
  };

  const onMove = (event: MouseEvent) => {
    if (view.editable || !storage.enabled) return hide();
    if (selecting) return;
    const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (!found) return scheduleHide();
    const $pos = view.state.doc.resolve(found.pos);
    if ($pos.depth < 1) return scheduleHide();
    const node = $pos.node(1);
    const id = node.attrs?.id as string | undefined;
    const dom = view.nodeDOM($pos.before(1));
    if (!id || !(dom instanceof HTMLElement)) return scheduleHide();
    clearTimeout(hideTimer);
    blockId = id;
    quote = node.textContent.slice(0, 200);
    const rect = dom.getBoundingClientRect();
    button.style.display = "flex";
    button.style.top = `${rect.top + 2}px`;
    button.style.left = `${rect.right - 28}px`;
  };
  const showForSelection = () => {
    if (view.editable || !storage.enabled) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!view.dom.contains(range.startContainer) || !view.dom.contains(range.endContainer)) return;
    const text = selection.toString().trim();
    if (!text) return;
    let id: string | undefined;
    try {
      const $pos = view.state.doc.resolve(view.posAtDOM(range.startContainer, range.startOffset));
      if ($pos.depth >= 1) id = $pos.node(1).attrs?.id as string | undefined;
    } catch {
      return;
    }
    if (!id) return;
    const rects = range.getClientRects();
    const last = rects[rects.length - 1] ?? range.getBoundingClientRect();
    clearTimeout(hideTimer);
    selecting = true;
    blockId = id;
    quote = text.slice(0, 200);
    button.style.display = "flex";
    button.style.top = `${last.bottom + 4}px`;
    button.style.left = `${Math.min(last.right, window.innerWidth - 32)}px`;
  };
  const onMouseUp = () => setTimeout(showForSelection, 0);
  const onSelectionChange = () => {
    if (!selecting) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    selecting = false;
    hide();
  };
  const onClick = () => {
    if (!blockId) return;
    window.dispatchEvent(
      new CustomEvent<TPageCommentAnchorEventDetail>(PAGE_COMMENT_REQUEST_EVENT, {
        detail: { anchorType: "block", anchorId: blockId, quote },
      })
    );
    selecting = false;
    window.getSelection()?.removeAllRanges();
    hide();
  };

  view.dom.addEventListener("mousemove", onMove);
  view.dom.addEventListener("mouseup", onMouseUp);
  document.addEventListener("selectionchange", onSelectionChange);
  button.addEventListener("mousedown", (event) => event.preventDefault());
  view.dom.addEventListener("mouseleave", scheduleHide);
  button.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  button.addEventListener("mouseleave", scheduleHide);
  button.addEventListener("click", onClick);

  return {
    destroy() {
      clearTimeout(hideTimer);
      view.dom.removeEventListener("mousemove", onMove);
      view.dom.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      view.dom.removeEventListener("mouseleave", scheduleHide);
      button.remove();
    },
  };
};

// Marks blocks that carry open comment threads, keyed by the block's UniqueID.
export const PageCommentsExtension = Extension.create<unknown, TPageCommentsStorage>({
  name: "pageComments",

  addExtensions() {
    return [PageCommentMark];
  },

  addStorage() {
    return { blocks: {}, texts: {}, enabled: false };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        key: pluginKey,
        view: (view) => createReadOnlyCommentButton(view, storage),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const { blocks, texts } = storage;
            if (Object.keys(blocks).length === 0 && Object.keys(texts).length === 0) return DecorationSet.empty;
            state.doc.descendants((node, pos) => {
              if (node.isText) {
                node.marks.forEach((mark) => {
                  if (mark.type.name === PAGE_COMMENT_MARK && texts[mark.attrs.commentId]) {
                    decorations.push(
                      Decoration.inline(pos, pos + node.nodeSize, {
                        class: "has-page-comment-text",
                        "data-comment-id": mark.attrs.commentId,
                      })
                    );
                  }
                });
                return;
              }
              const id = node.attrs?.id;
              if (id && blocks[id]) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "has-page-comment",
                    "data-comment-count": String(blocks[id]),
                  })
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
          handleDOMEvents: {
            // The count badge is drawn outside the block's right edge, so a click there belongs to the block.
            click(view, event) {
              const target = event.target;
              if (!(target instanceof HTMLElement)) return false;
              const markedText = target.closest<HTMLElement>(".has-page-comment-text[data-comment-id]");
              if (markedText) {
                window.dispatchEvent(
                  new CustomEvent<TPageCommentAnchorEventDetail>(PAGE_COMMENT_OPEN_EVENT, {
                    detail: { anchorType: "text", anchorId: markedText.getAttribute("data-comment-id") ?? "" },
                  })
                );
                return false;
              }
              const block = target.closest<HTMLElement>(".has-page-comment");
              if (!block || event.clientX <= block.getBoundingClientRect().right) return false;
              const id = block.getAttribute("data-id");
              if (!id) return false;
              window.dispatchEvent(
                new CustomEvent<TPageCommentAnchorEventDetail>(PAGE_COMMENT_OPEN_EVENT, {
                  detail: { anchorType: "block", anchorId: id },
                })
              );
              return true;
            },
          },
        },
      }),
    ];
  },
});

export const findCommentMarkRanges = (doc: ProseMirrorNode, commentId: string) => {
  const ranges: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (
      node.isText &&
      node.marks.some((mark) => mark.type.name === PAGE_COMMENT_MARK && mark.attrs.commentId === commentId)
    ) {
      ranges.push({ from: pos, to: pos + node.nodeSize });
    }
  });
  return ranges;
};

type TEditorLike = { storage: Record<string, any>; view: { dispatch: (tr: any) => void; state: { tr: any } } };

export const refreshPageComments = (editor: TEditorLike, anchors: TCommentedAnchors) => {
  Object.assign(editor.storage.pageComments, anchors, { enabled: true });
  editor.view.dispatch(editor.view.state.tr.setMeta(pluginKey, true));
};
