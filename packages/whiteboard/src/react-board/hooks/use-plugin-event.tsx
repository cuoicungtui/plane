import {
  BOARD_TO_MOVING_POINT,
  BOARD_TO_MOVING_POINT_IN_BOARD,
  PlaitBoard,
  WritableClipboardOperationType,
  deleteFragment,
  getClipboardData,
  hasInputOrTextareaTarget,
  setFragment,
  toHostPoint,
  toViewBoxPoint,
} from "@plait/core";
import { useEventListener } from "ahooks";
import { canInsertImages, getImageFiles, insertWhiteboardImages } from "../../images";
import { isEventForBoard } from "../board-event-scope";

const useBoardPluginEvent = (
  board: PlaitBoard,
  viewportContainerRef: React.RefObject<HTMLDivElement>,
  hostRef: React.RefObject<SVGSVGElement>
) => {
  useEventListener(
    "pointerdown",
    (event) => {
      board.pointerDown(event);
    },
    { target: hostRef }
  );

  useEventListener(
    "pointermove",
    (event) => {
      BOARD_TO_MOVING_POINT_IN_BOARD.set(board, [event.x, event.y]);
      board.pointerMove(event);
    },
    { target: viewportContainerRef }
  );

  useEventListener(
    "pointerleave",
    (event) => {
      BOARD_TO_MOVING_POINT_IN_BOARD.delete(board);
      board.pointerLeave(event);
    },
    { target: viewportContainerRef }
  );

  useEventListener(
    "pointerup",
    (event) => {
      board.pointerUp(event);
    },
    { target: viewportContainerRef }
  );

  useEventListener(
    "touchstart",
    (event) => {
      board.touchStart(event);
    },
    { target: viewportContainerRef }
  );

  useEventListener(
    "touchmove",
    (event) => {
      board.touchMove(event);
    },
    { target: viewportContainerRef }
  );

  useEventListener(
    "touchend",
    (event) => {
      board.touchEnd(event);
    },
    { target: viewportContainerRef }
  );

  useEventListener(
    "dblclick",
    (event) => {
      if (PlaitBoard.isFocus(board) && !PlaitBoard.hasBeenTextEditing(board)) {
        board.dblClick(event);
      }
    },
    { target: hostRef }
  );

  useEventListener("pointermove", (event) => {
    BOARD_TO_MOVING_POINT.set(board, [event.x, event.y]);
    board.globalPointerMove(event);
  });

  useEventListener("pointerup", (event) => {
    board.globalPointerUp(event);
  });

  useEventListener("keydown", (event) => {
    if (!isEventForBoard(board, event)) return;
    board.globalKeyDown(event);
    if (PlaitBoard.isFocus(board) && !PlaitBoard.hasBeenTextEditing(board) && !hasInputOrTextareaTarget(event.target)) {
      board.keyDown(event);
    }
  });

  useEventListener("keyup", (event) => {
    if (!isEventForBoard(board, event)) return;
    if (PlaitBoard.isFocus(board) && !PlaitBoard.hasBeenTextEditing(board)) {
      board?.keyUp(event);
    }
  });

  useEventListener("copy", (event) => {
    if (!isEventForBoard(board, event)) return;
    if (PlaitBoard.isFocus(board) && !PlaitBoard.hasBeenTextEditing(board)) {
      event.preventDefault();
      setFragment(board, WritableClipboardOperationType.copy, event.clipboardData);
    }
  });

  useEventListener("paste", async (clipboardEvent) => {
    if (!isEventForBoard(board, clipboardEvent)) return;
    if (PlaitBoard.isFocus(board) && !PlaitBoard.isReadonly(board) && !PlaitBoard.hasBeenTextEditing(board)) {
      // vendor patch: image files are uploaded and added as stored images. Plait's own path would insert a
      // `blob:` URL that is gone after a reload, so this branch always returns, even when uploads are off.
      const imageFiles = getImageFiles(clipboardEvent.clipboardData);
      if (imageFiles.length > 0) {
        clipboardEvent.preventDefault();
        if (canInsertImages(board)) {
          const movingPoint = PlaitBoard.getMovingPointInBoard(board);
          const point = movingPoint
            ? toViewBoxPoint(board, toHostPoint(board, movingPoint[0], movingPoint[1]))
            : undefined;
          await insertWhiteboardImages(board, imageFiles, point);
        }
        return;
      }
      const mousePoint = PlaitBoard.getMovingPointInBoard(board);
      if (mousePoint) {
        const targetPoint = toViewBoxPoint(board, toHostPoint(board, mousePoint[0], mousePoint[1]));
        const clipboardData = await getClipboardData(clipboardEvent.clipboardData);
        board.insertFragment(clipboardData, targetPoint, WritableClipboardOperationType.paste);
      }
    }
  });

  useEventListener("cut", (event) => {
    if (!isEventForBoard(board, event)) return;
    if (PlaitBoard.isFocus(board) && !PlaitBoard.isReadonly(board) && !PlaitBoard.hasBeenTextEditing(board)) {
      event.preventDefault();
      setFragment(board, WritableClipboardOperationType.cut, event.clipboardData);
      deleteFragment(board);
    }
  });

  useEventListener(
    "drop",
    async (event) => {
      if (!PlaitBoard.isReadonly(board)) {
        event.preventDefault();
        // vendor patch: `board.drop` does nothing in Plait; dropped image files are uploaded and added here.
        const imageFiles = getImageFiles(event.dataTransfer);
        if (imageFiles.length > 0) {
          if (canInsertImages(board)) {
            await insertWhiteboardImages(
              board,
              imageFiles,
              toViewBoxPoint(board, toHostPoint(board, event.x, event.y))
            );
          }
          return;
        }
        board.drop(event);
      }
    },
    { target: viewportContainerRef }
  );

  useEventListener(
    "dragover",
    (event) => {
      event.preventDefault();
    },
    { target: viewportContainerRef }
  );
};

export default useBoardPluginEvent;
