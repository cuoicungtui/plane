import type { KeyboardEvent } from "react";

// The board sits inside the page editor's contenteditable host, and its text fields are
// contenteditable too. `closest` must stop at the board, or the host would always match.
const boardTextFieldOf = (event: KeyboardEvent<HTMLElement>): HTMLElement | null => {
  const field = (event.target as HTMLElement).closest?.<HTMLElement>('[contenteditable="true"]');
  return field && event.currentTarget.contains(field) ? field : null;
};

// Plait handles undo/redo from a window listener but never calls preventDefault(), so the
// browser also fires a native `beforeinput historyUndo` on the enclosing rich-text host and
// undoes text typed in the page. Block that default unless a text field inside the board
// owns the keystroke.
//
// A text field nested in the page's contenteditable counts as one editing region for Chrome,
// so its native Ctrl+A selects the whole page and moves focus there: further typing lands in
// the page paragraph. Select just the field's own text instead.
export const guardNativeKeyDefaults = (event: KeyboardEvent<HTMLElement>): void => {
  if (!event.ctrlKey && !event.metaKey) return;
  const key = event.key.toLowerCase();
  const textField = boardTextFieldOf(event);
  if (key === "a") {
    if (!textField) return;
    event.preventDefault();
    window.getSelection()?.selectAllChildren(textField);
    return;
  }
  if ((key === "z" || key === "y") && !textField) event.preventDefault();
};
