/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import type { FocusEvent, ReactNode } from "react";

type Props = {
  className?: string;
  children?: ReactNode;
  editor: Editor | null;
  id: string;
  tabIndex?: number;
};

export function EditorContentWrapper(props: Props) {
  const { editor, className, children, tabIndex, id } = props;

  // React's onFocus fires on focusin, which bubbles from every descendant —
  // including native-focusable elements a NodeView renders inside its own
  // atom node (e.g. the whiteboard embed's board, whose text tool creates and
  // focuses an editing element). Without the target
  // check, that bubbled focus event would run this handler and call
  // editor.chain().focus(), which re-focuses the ProseMirror root and yanks
  // focus straight back out of the NodeView's own content. Only react when
  // this wrapper div itself is the thing that received focus (e.g. via
  // tabIndex or a click landing on its own padding, not on any child).
  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    editor?.chain().focus(undefined, { scrollIntoView: false }).run();
  };

  return (
    <div tabIndex={tabIndex} onFocus={handleFocus} className={className}>
      <EditorContent editor={editor} id={id} />
      {children}
    </div>
  );
}
