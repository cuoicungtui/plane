/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Bold,
  BringToFront,
  Copy,
  Italic,
  MessageSquare,
  AlignCenter,
  PaintBucket,
  SendToBack,
  Strikethrough,
  Trash2,
  Underline,
  MoveDown,
  MoveUp,
  Baseline,
  Pencil,
} from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import {
  WHITEBOARD_ARROW_MARKERS,
  WHITEBOARD_ARROW_SHAPES,
  WHITEBOARD_BASIC_SHAPES,
  WHITEBOARD_BRANCH_SHAPES,
  WHITEBOARD_BRANCH_WIDTHS,
  WHITEBOARD_FLOWCHART_SHAPES,
  WHITEBOARD_FONT_SIZES,
  WHITEBOARD_MIND_LAYOUTS,
  WHITEBOARD_MIND_SHAPES,
  WHITEBOARD_STROKE_STYLES,
  WHITEBOARD_STROKE_WIDTHS,
  alignWhiteboardSelection,
  deleteWhiteboardSelection,
  distributeWhiteboardSelection,
  duplicateWhiteboardSelection,
  moveWhiteboardSelectionLayer,
  setWhiteboardArrowMarker,
  setWhiteboardArrowShape,
  setWhiteboardBranchShape,
  setWhiteboardBranchWidth,
  setWhiteboardFill,
  setWhiteboardFontSize,
  setWhiteboardMindLayout,
  setWhiteboardMindShape,
  setWhiteboardShape,
  setWhiteboardStrokeColor,
  setWhiteboardStrokeStyle,
  setWhiteboardStrokeWidth,
  setWhiteboardTextAlign,
  setWhiteboardTextColor,
  toggleWhiteboardTextMark,
} from "@plane/whiteboard";
import type {
  PlaitBoard,
  WhiteboardAlignment,
  WhiteboardArrowMarker,
  WhiteboardArrowShape,
  WhiteboardBranchShape,
  WhiteboardMindShape,
  WhiteboardSelection,
  WhiteboardShape,
  WhiteboardStrokeStyle,
  WhiteboardTextAlign,
  WhiteboardTextMark,
} from "@plane/whiteboard";
import { ColorControl, ControlButton, Divider, PLAIT_ATTACHED_CLASS, SelectField } from "./whiteboard-controls";

const key = (value: string) => value.replaceAll("-", "_");

const TEXT_MARKS: { mark: WhiteboardTextMark; labelKey: string; icon: typeof Bold }[] = [
  { mark: "bold", labelKey: "bold", icon: Bold },
  { mark: "italic", labelKey: "italic", icon: Italic },
  { mark: "underline", labelKey: "underline", icon: Underline },
  { mark: "strike", labelKey: "strike", icon: Strikethrough },
];

const TEXT_ALIGNS: { align: WhiteboardTextAlign; icon: typeof AlignLeft }[] = [
  { align: "left", icon: AlignLeft },
  { align: "center", icon: AlignCenter },
  { align: "right", icon: AlignRight },
];

const ALIGNMENTS: { alignment: WhiteboardAlignment; labelKey: string; icon: typeof AlignLeft }[] = [
  { alignment: "left", labelKey: "align_left", icon: AlignStartVertical },
  { alignment: "horizontalCenter", labelKey: "align_horizontal_center", icon: AlignCenterVertical },
  { alignment: "right", labelKey: "align_right", icon: AlignEndVertical },
  { alignment: "top", labelKey: "align_top", icon: AlignStartHorizontal },
  { alignment: "verticalCenter", labelKey: "align_vertical_center", icon: AlignCenterHorizontal },
  { alignment: "bottom", labelKey: "align_bottom", icon: AlignEndHorizontal },
];

const ALL_SHAPES: readonly WhiteboardShape[] = [...WHITEBOARD_BASIC_SHAPES, ...WHITEBOARD_FLOWCHART_SHAPES];

type Props = {
  board: PlaitBoard;
  selection: WhiteboardSelection;
  /** Starts a comment on the selected element; the button is offered only for a single selection. */
  onComment?: () => void;
};

/** Contextual formatting for whatever is selected; renders nothing while the selection is empty. */
export function WhiteboardPropertyBar({ board, selection, onComment }: Props) {
  const { t } = useTranslation();
  const label = (name: string) => t(`page_whiteboard.props.${name}`);

  if (selection.count === 0) return null;

  const markActive: Record<WhiteboardTextMark, boolean> = {
    bold: selection.bold,
    italic: selection.italic,
    underline: selection.underline,
    strike: selection.strike,
  };

  return (
    <div
      role="toolbar"
      aria-label={label("label")}
      className={cn(
        PLAIT_ATTACHED_CLASS,
        "pointer-events-auto flex w-fit max-w-full flex-wrap items-center gap-x-0.5 gap-y-1 rounded-md border border-subtle bg-surface-1 px-2 py-1 shadow-raised-200"
      )}
    >
      {selection.canStyleText && (
        <>
          {TEXT_MARKS.map(({ mark, labelKey, icon: Icon }) => (
            <ControlButton
              key={mark}
              label={label(labelKey)}
              active={markActive[mark]}
              onClick={() => toggleWhiteboardTextMark(board, mark)}
            >
              <Icon className="size-4" />
            </ControlButton>
          ))}
          <SelectField
            label={label("font_size")}
            value={selection.fontSize}
            options={WHITEBOARD_FONT_SIZES.map((size) => ({ value: size, label: String(size) }))}
            onChange={(size) => setWhiteboardFontSize(board, size)}
          />
          <ColorControl
            label={label("text_color")}
            value={selection.textColor}
            icon={<Baseline className="size-4" />}
            onChange={(color) => setWhiteboardTextColor(board, color)}
          />
          {TEXT_ALIGNS.map(({ align, icon: Icon }) => (
            <ControlButton
              key={align}
              label={label(`align_text_${align}`)}
              active={selection.textAlign === align}
              onClick={() => setWhiteboardTextAlign(board, align)}
            >
              <Icon className="size-4" />
            </ControlButton>
          ))}
          <Divider />
        </>
      )}

      {selection.canFill && (
        <ColorControl
          label={label("fill")}
          value={selection.fill}
          clearLabel={label("no_fill")}
          icon={<PaintBucket className="size-4" />}
          onChange={(color) => setWhiteboardFill(board, color)}
        />
      )}
      {selection.canStroke && (
        <>
          <ColorControl
            label={label("stroke_color")}
            value={selection.strokeColor}
            icon={<Pencil className="size-4" />}
            onChange={(color) => color && setWhiteboardStrokeColor(board, color)}
          />
          <SelectField
            label={label("stroke_width")}
            value={selection.strokeWidth}
            options={WHITEBOARD_STROKE_WIDTHS.map((width) => ({ value: width, label: `${width}px` }))}
            onChange={(width) => setWhiteboardStrokeWidth(board, width)}
          />
          <SelectField<WhiteboardStrokeStyle>
            label={label("stroke_style")}
            value={selection.strokeStyle}
            options={WHITEBOARD_STROKE_STYLES.map((style) => ({ value: style, label: label(`style_${style}`) }))}
            onChange={(style) => setWhiteboardStrokeStyle(board, style)}
          />
          <Divider />
        </>
      )}

      {selection.hasGeometry && selection.shape !== "text" && (
        <>
          <SelectField<string>
            label={label("shape")}
            value={selection.shape}
            options={ALL_SHAPES.map((shape) => ({ value: shape, label: t(`page_whiteboard.shapes.${shape}`) }))}
            onChange={(shape) => setWhiteboardShape(board, shape as WhiteboardShape)}
          />
          <Divider />
        </>
      )}

      {selection.hasArrow && (
        <>
          <SelectField<WhiteboardArrowShape>
            label={label("arrow_shape")}
            value={selection.arrowShape}
            options={WHITEBOARD_ARROW_SHAPES.map((shape) => ({ value: shape, label: label(`arrow_${shape}`) }))}
            onChange={(shape) => setWhiteboardArrowShape(board, shape)}
          />
          <SelectField<WhiteboardArrowMarker>
            label={label("arrow_start")}
            value={selection.arrowSource}
            options={WHITEBOARD_ARROW_MARKERS.map((marker) => ({
              value: marker,
              label: label(`marker_${key(marker)}`),
            }))}
            onChange={(marker) => setWhiteboardArrowMarker(board, "source", marker)}
          />
          <SelectField<WhiteboardArrowMarker>
            label={label("arrow_end")}
            value={selection.arrowTarget}
            options={WHITEBOARD_ARROW_MARKERS.map((marker) => ({
              value: marker,
              label: label(`marker_${key(marker)}`),
            }))}
            onChange={(marker) => setWhiteboardArrowMarker(board, "target", marker)}
          />
          <Divider />
        </>
      )}

      {selection.hasMind && (
        <>
          <SelectField<string>
            label={label("mind_layout")}
            value={selection.mindLayout}
            options={WHITEBOARD_MIND_LAYOUTS.map((layout) => ({
              value: layout,
              label: label(`layout_${key(layout)}`),
            }))}
            onChange={(layout) => setWhiteboardMindLayout(board, layout)}
          />
          <SelectField<WhiteboardMindShape>
            label={label("mind_shape")}
            value={selection.mindShape}
            options={WHITEBOARD_MIND_SHAPES.map((shape) => ({
              value: shape,
              label: label(`mind_shape_${key(shape)}`),
            }))}
            onChange={(shape) => setWhiteboardMindShape(board, shape)}
          />
          <SelectField<WhiteboardBranchShape>
            label={label("branch_shape")}
            value={selection.branchShape}
            options={WHITEBOARD_BRANCH_SHAPES.map((shape) => ({ value: shape, label: label(`branch_${shape}`) }))}
            onChange={(shape) => setWhiteboardBranchShape(board, shape)}
          />
          <SelectField
            label={label("branch_width")}
            value={selection.branchWidth}
            options={WHITEBOARD_BRANCH_WIDTHS.map((width) => ({ value: width, label: `${width}px` }))}
            onChange={(width) => setWhiteboardBranchWidth(board, width)}
          />
          <Divider />
        </>
      )}

      {selection.canReorder && (
        <>
          <ControlButton label={label("layer_front")} onClick={() => moveWhiteboardSelectionLayer(board, "front")}>
            <BringToFront className="size-4" />
          </ControlButton>
          <ControlButton label={label("layer_forward")} onClick={() => moveWhiteboardSelectionLayer(board, "forward")}>
            <MoveUp className="size-4" />
          </ControlButton>
          <ControlButton
            label={label("layer_backward")}
            onClick={() => moveWhiteboardSelectionLayer(board, "backward")}
          >
            <MoveDown className="size-4" />
          </ControlButton>
          <ControlButton label={label("layer_back")} onClick={() => moveWhiteboardSelectionLayer(board, "back")}>
            <SendToBack className="size-4" />
          </ControlButton>
          <Divider />
        </>
      )}

      {selection.canAlign && (
        <>
          {ALIGNMENTS.map(({ alignment, labelKey, icon: Icon }) => (
            <ControlButton
              key={alignment}
              label={label(labelKey)}
              onClick={() => alignWhiteboardSelection(board, alignment)}
            >
              <Icon className="size-4" />
            </ControlButton>
          ))}
          {selection.canDistribute && (
            <>
              <ControlButton
                label={label("distribute_horizontal")}
                onClick={() => distributeWhiteboardSelection(board, "horizontal")}
              >
                <AlignHorizontalSpaceAround className="size-4" />
              </ControlButton>
              <ControlButton
                label={label("distribute_vertical")}
                onClick={() => distributeWhiteboardSelection(board, "vertical")}
              >
                <AlignVerticalSpaceAround className="size-4" />
              </ControlButton>
            </>
          )}
          <Divider />
        </>
      )}

      {onComment && selection.count === 1 && (
        <ControlButton label={label("comment")} onClick={onComment}>
          <MessageSquare className="size-4" />
        </ControlButton>
      )}
      <ControlButton label={label("duplicate")} onClick={() => duplicateWhiteboardSelection(board)}>
        <Copy className="size-4" />
      </ControlButton>
      <ControlButton label={label("delete")} onClick={() => deleteWhiteboardSelection(board)}>
        <Trash2 className="size-4" />
      </ControlButton>
    </div>
  );
}
