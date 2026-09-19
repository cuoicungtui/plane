/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useRef } from "react";
import TiptapTaskItem from "@tiptap/extension-task-item";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
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
  onAutoCreate: (args: { title: string; assigneeId: string }) => Promise<string | undefined>;
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

function TaskItemView(props: NodeViewProps & TTaskItemEnhancedProps) {
  const { node, updateAttributes, deleteNode, onAutoCreate, onToggle, onTitleChange, stateCallback, metaCallback } =
    props;
  const attrs = node.attrs as TTaskItemAttributes;
  const entityIdentifier = attrs[ETaskItemAttributeNames.ENTITY_IDENTIFIER];
  const creatingRef = useRef(false);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // D18: promote to a real work item the moment a user is mentioned — fully
  // automatic, no confirmation step (chosen over a manual "convert" button).
  useEffect(() => {
    if (entityIdentifier || creatingRef.current) return;
    const assigneeId = findUserMentionId(node);
    if (!assigneeId) return;
    creatingRef.current = true;
    void onAutoCreate({ title: plainTitle(node) || "Untitled", assigneeId })
      .then((issueId) => {
        if (issueId) updateAttributes({ [ETaskItemAttributeNames.ENTITY_IDENTIFIER]: issueId });
        return;
      })
      .finally(() => {
        creatingRef.current = false;
      });
  }, [node, entityIdentifier, onAutoCreate, updateAttributes]);

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
      className="relative flex items-center gap-2"
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
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
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
          parseHTML: (element: HTMLElement) => element.getAttribute("data-entity-identifier"),
          renderHTML: (attributes: TTaskItemAttributes) => ({
            "data-entity-identifier": attributes[ETaskItemAttributeNames.ENTITY_IDENTIFIER],
          }),
        },
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer((nodeViewProps: NodeViewProps) => <TaskItemView {...nodeViewProps} {...props} />);
    },
  });
}
