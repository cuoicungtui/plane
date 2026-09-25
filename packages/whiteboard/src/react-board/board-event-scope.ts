import { PlaitBoard } from "@plait/core";

/**
 * vendor patch: Plait listens for keyboard and clipboard events on `window` and only asks whether the board has a
 * selection, never whether the event was aimed at it. Embedded in a page editor, a Delete typed in
 * the paragraph next to the board would delete the board's shapes and pasted text would land in it.
 * The board's selection is only cleared by a pointer-up outside it, so a keyboard move away leaves
 * it in place. Accept the event only if its target is inside the board's scope (the nearest
 * `[data-whiteboard-scope]` ancestor, else the board container) or is the page itself.
 *
 * Lives in its own file, apart from the hook that uses it, so a test can import it without pulling in the
 * image and drawing plugins.
 */
export const isEventForBoard = (board: PlaitBoard, event: Event): boolean => {
  const { target } = event;
  if (!(target instanceof Node)) return true;
  if (target === document || target === document.body || target === document.documentElement) return true;
  const container = PlaitBoard.getBoardContainer(board);
  return (container.closest("[data-whiteboard-scope]") ?? container).contains(target);
};
