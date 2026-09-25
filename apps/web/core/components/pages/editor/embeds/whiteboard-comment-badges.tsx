/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from "react";
import { PAGE_COMMENT_OPEN_EVENT } from "@plane/editor";
import type { TPageCommentAnchorEventDetail } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import { getWhiteboardElementClientPoint } from "@plane/whiteboard";
import type { PlaitBoard } from "@plane/whiteboard";

type Props = {
  board: PlaitBoard;
  boardId: string;
  /** Open thread count per element ID. */
  counts: Record<string, number>;
};

/**
 * A count badge on the top-right corner of every element that has open comments. The parent renders this
 * again whenever the board changes (pan and zoom included), which is what keeps the badges in place.
 */
export function WhiteboardCommentBadges({ board, boardId, counts }: Props) {
  const { t } = useTranslation();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const origin = container?.getBoundingClientRect();

  const open = (elementId: string) =>
    window.dispatchEvent(
      new CustomEvent<TPageCommentAnchorEventDetail>(PAGE_COMMENT_OPEN_EVENT, {
        detail: { anchorType: "board_element", anchorId: elementId, anchorBoardId: boardId },
      })
    );

  return (
    <div ref={setContainer} className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {origin &&
        Object.entries(counts).map(([elementId, count]) => {
          const point = getWhiteboardElementClientPoint(board, elementId);
          if (!point) return null;
          return (
            <button
              key={elementId}
              type="button"
              title={t("page_whiteboard.props.comment")}
              aria-label={t("page_whiteboard.props.comment")}
              onClick={() => open(elementId)}
              onPointerDown={(event) => event.stopPropagation()}
              style={{ left: point.x - origin.left, top: point.y - origin.top }}
              className="shadow pointer-events-auto absolute flex h-5 min-w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[rgb(250_204_21)] px-1 text-11 font-semibold text-[rgb(63_46_0)]"
            >
              {count}
            </button>
          );
        })}
    </div>
  );
}
