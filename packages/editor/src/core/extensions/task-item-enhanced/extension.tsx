/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import TiptapTaskItem from "@tiptap/extension-task-item";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { cn } from "@plane/utils";
// local imports
import { ETaskItemAttributeNames } from "./types";
import type { TTaskItemAttributes } from "./types";

export type TTaskItemEnhancedProps = {
  // D18: never called for plain text — only once a user is @mentioned inside
  // the item. Returns the created work item's id, or undefined on failure
  // (the item then stays a plain checklist item, no partial state saved).
  onAutoCreate: (args: { itemId: string; title: string; assigneeId: string }) => Promise<string | undefined>;
  onToggle: (entityIdentifier: string, checked: boolean) => void;
  onTitleChange: (entityIdentifier: string, title: string) => void;
  // D18.2: rendered before the text, host owns fetching the work item's real
  // state and driving `onStateGroupChange` so the checkbox (and therefore the
  // strikethrough) stays in sync however the state was changed — from the
  // checkbox itself or from this dropdown. `checked` is this node's own local
  // attribute, passed through so the host can refetch when it changes from
  // the checkbox side (which patches state without going through the host's
  // own fetched copy of the issue).
  stateCallback: (props: {
    entityIdentifier: string;
    checked: boolean;
    onStateGroupChange: (isCompleted: boolean) => void;
  }) => React.ReactNode;
  // D18.2: `onDeleted` is bound to this node's own `deleteNode` — deleting the
  // *text* of a checklist item must never delete the work item, so host code
  // only calls it once a real, user-confirmed delete has actually succeeded.
  metaCallback: (props: { entityIdentifier: string; checked: boolean; onDeleted: () => void }) => React.ReactNode;
};

// Finds the first @mention of a user directly inside this item's own
// paragraph content (not inside a nested list) that isn't already resolved.
// Deliberately shallow: mentioning someone inside a nested sub-item should
// not promote the parent.
function findUserMentionId(node: ProseMirrorNode): string | null {
  let found: string | null = null;
  node.forEach((child) => {
    if (found || child.type.name !== "paragraph") return;
    child.forEach((inline) => {
      if (found) return;
      if (
        inline.type.name === "mention" &&
        inline.attrs.entity_name === "user_mention" &&
        inline.attrs.entity_identifier
      ) {
        found = inline.attrs.entity_identifier as string;
      }
    });
  });
  return found;
}

function plainTitle(node: ProseMirrorNode): string {
  return node.textContent.trim();
}

// D18: guards against duplicate onAutoCreate calls for the same item within
// this client. Kept as plain module state — not a ProseMirror node attribute
// — because the document is Yjs/Hocuspocus-synced: writing the in-flight
// flag as a node attribute round-trips through the collab provider
// asynchronously. A plain Set, keyed by the item's stable `id` attribute
// (never mutated by Yjs, unique per item, not copied on split), is settled
// the instant `.add()` returns.
//
// This alone doesn't stop a *cross-client* race though: `is_creating` is a
// synced attribute, so a second client can still read it as `false` within
// the sync latency window and independently decide to create the same item.
// The actual cross-client guard is `createAutoCreateClaimPlugin` below,
// which only ever runs the eligibility check and the create call for the one
// client whose own local edit produced the change.
const inFlightTaskItemIds = new Set<string>();

// D18: runs as part of every transaction dispatch, so — unlike a React
// effect, which only ever sees the resulting attributes — it can tell
// whether the change that produced them was this client's own local edit or
// a remote Yjs sync update (`y-sync$` meta). Only the former ever claims an
// item and fires onAutoCreate, so a remote peer's own copy of this plugin
// never re-fires for a change it didn't originate — the race is closed
// structurally rather than by timing.
function createAutoCreateClaimPlugin(getEditor: () => Editor, onAutoCreate: TTaskItemEnhancedProps["onAutoCreate"]) {
  return new Plugin({
    key: new PluginKey("taskItemEnhancedAutoCreate"),
    appendTransaction(transactions, _oldState, newState) {
      const hasYSync = transactions.some((tr) => tr.getMeta("y-sync$"));
      const hasDocChanged = transactions.some((tr) => tr.docChanged);
      if (hasYSync) return null;
      if (!hasDocChanged) return null;

      const claims: { itemId: string; title: string; assigneeId: string }[] = [];
      const { tr } = newState;
      newState.doc.descendants((node, pos) => {
        if (node.type.name !== "taskItem") return;
        const attrs = node.attrs as TTaskItemAttributes;
        if (attrs[ETaskItemAttributeNames.ENTITY_IDENTIFIER] || attrs[ETaskItemAttributeNames.IS_CREATING]) return;
        const itemId = node.attrs.id as string | null;
        if (!itemId || inFlightTaskItemIds.has(itemId)) return;
        const assigneeId = findUserMentionId(node);
        if (!assigneeId) return;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, [ETaskItemAttributeNames.IS_CREATING]: true });
        inFlightTaskItemIds.add(itemId);
        claims.push({ itemId, title: plainTitle(node) || "Untitled", assigneeId });
      });

      if (!claims.length) return null;

      // Bookkeeping, not a user edit: if it stayed undoable, a ctrl+z could
      // revert entity_identifier/is_creating back to their "never claimed"
      // defaults on an item that's already a real work item, re-opening it
      // to `createAutoCreateClaimPlugin` on the next edit and creating a
      // second work item for the same checklist row.
      tr.setMeta("addToHistory", false);

      // appendTransaction must return synchronously, so the actual async
      // create calls are deferred to a microtask rather than awaited here.
      queueMicrotask(() => {
        claims.forEach(({ itemId, title, assigneeId }) => {
          void onAutoCreate({ itemId, title, assigneeId }).then((issueId) => {
            inFlightTaskItemIds.delete(itemId);
            const editor = getEditor();
            if (editor.isDestroyed) return undefined;
            editor.state.doc.descendants((node, pos) => {
              if (node.attrs.id !== itemId) return;
              editor.view.dispatch(
                editor.state.tr
                  .setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    [ETaskItemAttributeNames.IS_CREATING]: false,
                    ...(issueId ? { [ETaskItemAttributeNames.ENTITY_IDENTIFIER]: issueId } : {}),
                  })
                  .setMeta("addToHistory", false)
              );
            });
            return undefined;
          });
        });
      });

      return tr;
    },
  });
}

function TaskItemView(props: NodeViewProps & TTaskItemEnhancedProps) {
  const { node, updateAttributes, deleteNode, onToggle, onTitleChange, stateCallback, metaCallback, editor, getPos } =
    props;
  const attrs = node.attrs as TTaskItemAttributes;
  const entityIdentifier = attrs[ETaskItemAttributeNames.ENTITY_IDENTIFIER];
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRowRef = useRef<HTMLDivElement>(null);

  // The text span is height-capped to one line (see editor.css) so a
  // multi-line-wrapped long title doesn't push the checkbox/state badge off
  // the row. While typing past the edge, the browser auto-scrolls that span
  // to keep the caret visible — landing on the *last* wrapped line — and
  // never scrolls back, so a long title stays showing its tail forever.
  // All task items share one ProseMirror contenteditable, so there's no DOM
  // blur when the cursor moves to another item — only a selection change —
  // so snap the scroll back to the top once the selection actually leaves
  // this node, rather than waiting for a blur that may never come.
  useEffect(() => {
    const resetScrollIfSelectionLeft = () => {
      const pos = getPos();
      const { from, to } = editor.state.selection;
      const isSelectionInsideThisNode = from >= pos && to <= pos + node.nodeSize;
      if (isSelectionInsideThisNode) return;
      const contentEl = contentRowRef.current?.querySelector<HTMLElement>("[data-node-view-content]");
      if (contentEl) contentEl.scrollTop = 0;
    };
    editor.on("selectionUpdate", resetScrollIfSelectionLeft);
    editor.on("blur", resetScrollIfSelectionLeft);
    return () => {
      editor.off("selectionUpdate", resetScrollIfSelectionLeft);
      editor.off("blur", resetScrollIfSelectionLeft);
    };
  }, [editor, getPos, node.nodeSize]);

  // D18: auto-creating the work item on @mention is handled by
  // `createAutoCreateClaimPlugin` (a ProseMirror appendTransaction plugin,
  // see above), not here — a React effect only sees the resulting attribute
  // values and can't tell a local edit apart from a remote Yjs sync update,
  // which let two collaborators both create the same item.

  // Keep the created work item's title in sync with the checklist text.
  useEffect(() => {
    if (!entityIdentifier) return;
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => onTitleChange(entityIdentifier, plainTitle(node)), 500);
    return () => {
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    };
  }, [node, entityIdentifier, onTitleChange]);

  const handleToggle = (checked: boolean) => {
    updateAttributes({ [ETaskItemAttributeNames.CHECKED]: checked });
    if (entityIdentifier) onToggle(entityIdentifier, checked);
  };

  // Keeps the checkbox (and therefore the strikethrough) truthful when the
  // state was changed from the state dropdown rather than the checkbox —
  // the two controls must never disagree about whether the item is done.
  const handleStateGroupChange = (isCompleted: boolean) => {
    updateAttributes({ [ETaskItemAttributeNames.CHECKED]: isCompleted });
  };

  return (
    <NodeViewWrapper
      as="li"
      data-type="taskItem"
      data-checked={!!attrs.checked}
      className="task-item-enhanced relative flex items-center gap-2"
    >
      <label
        contentEditable={false}
        aria-label="Toggle task completion"
        className="flex shrink-0 cursor-pointer select-none"
      >
        <input
          type="checkbox"
          checked={!!attrs.checked}
          onChange={(e) => handleToggle(e.target.checked)}
          onMouseDown={(e) => e.preventDefault()}
        />
      </label>
      {entityIdentifier && (
        <span contentEditable={false} className="inline-flex shrink-0 items-center">
          {stateCallback({ entityIdentifier, checked: !!attrs.checked, onStateGroupChange: handleStateGroupChange })}
        </span>
      )}
      <div ref={contentRowRef} className="flex min-w-0 flex-1 items-center gap-1.5">
        <NodeViewContent
          as="span"
          className={cn("block min-w-0 flex-1 truncate", attrs.checked && "text-tertiary line-through")}
        />
        {entityIdentifier && (
          <span contentEditable={false} className="inline-flex shrink-0 items-center">
            {metaCallback({ entityIdentifier, checked: !!attrs.checked, onDeleted: deleteNode })}
          </span>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// D18: extends the app's existing to-do list item (native, always available
// via the "To-do list" slash command) instead of a separate "/task" node —
// a checklist item only becomes a real work item once someone is @mentioned
// inside it. Registered only for the Page document editor (see
// ce/extensions/document-extensions.tsx), never for the rich text editor
// used in issue descriptions/comments, so this never touches those.
export function TaskItemEnhanced(props: TTaskItemEnhancedProps) {
  return TiptapTaskItem.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        [ETaskItemAttributeNames.ENTITY_IDENTIFIER]: {
          default: null,
          // Without this, Enter-splitting a task item (splitListItem) copies
          // this attribute onto the new sibling too, so both rows point at
          // the same work item and each overwrites the other's title/state.
          keepOnSplit: false,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-entity-identifier"),
          renderHTML: (attributes: TTaskItemAttributes) => ({
            "data-entity-identifier": attributes[ETaskItemAttributeNames.ENTITY_IDENTIFIER],
          }),
        },
        [ETaskItemAttributeNames.IS_CREATING]: {
          default: false,
          // Same reasoning as entity_identifier: a split sibling must start
          // its own fresh auto-create check, not inherit an in-flight one.
          keepOnSplit: false,
          // Purely a runtime guard, never persisted to/parsed from HTML.
          parseHTML: () => false,
          renderHTML: () => ({}),
        },
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer((nodeViewProps: NodeViewProps) => <TaskItemView {...nodeViewProps} {...props} />);
    },
    addProseMirrorPlugins() {
      return [createAutoCreateClaimPlugin(() => this.editor, props.onAutoCreate)];
    },
  });
}
