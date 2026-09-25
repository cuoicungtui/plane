/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useRef } from "react";
import type { ChangeEvent } from "react";
import {
  CornerDownRight,
  Hand,
  ImagePlus,
  Maximize,
  Minus,
  MousePointer2,
  MoveUpRight,
  Network,
  Plus,
  Redo2,
  Shapes,
  Spline,
  Type,
  Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Popover } from "@plane/propel/popover";
import { cn } from "@plane/utils";
import {
  WHITEBOARD_BASIC_SHAPES,
  WHITEBOARD_FLOWCHART_SHAPES,
  WHITEBOARD_IMAGE_TYPES,
  isWhiteboardShape,
  whiteboardZoomPercent,
} from "@plane/whiteboard";
import type { WhiteboardShape, WhiteboardTool } from "@plane/whiteboard";
import { CONTROL_BUTTON_CLASS, ControlButton, Divider, PLAIT_ATTACHED_CLASS } from "./whiteboard-controls";
import { WhiteboardShapeGlyph } from "./whiteboard-shape-glyph";

type TToolButton = { tool: WhiteboardTool; labelKey: string; icon: LucideIcon };

const NAVIGATION_TOOLS: TToolButton[] = [
  { tool: "select", labelKey: "page_whiteboard.tools.select", icon: MousePointer2 },
  { tool: "hand", labelKey: "page_whiteboard.tools.hand", icon: Hand },
];

const CREATION_TOOLS: TToolButton[] = [
  { tool: "mind", labelKey: "page_whiteboard.tools.mind", icon: Network },
  { tool: "text", labelKey: "page_whiteboard.tools.text", icon: Type },
];

const LINE_TOOLS: TToolButton[] = [
  { tool: "arrow", labelKey: "page_whiteboard.tools.arrow", icon: MoveUpRight },
  { tool: "elbowArrow", labelKey: "page_whiteboard.tools.elbow_arrow", icon: CornerDownRight },
  { tool: "curveArrow", labelKey: "page_whiteboard.tools.curve_arrow", icon: Spline },
];

const shapeLabelKey = (shape: WhiteboardShape) => `page_whiteboard.shapes.${shape}`;

type ShapePickerProps = {
  activeShape: WhiteboardShape | null;
  onPick: (shape: WhiteboardShape) => void;
};

function ShapePicker({ activeShape, onPick }: ShapePickerProps) {
  const { t } = useTranslation();
  const renderGroup = (title: string, shapes: readonly WhiteboardShape[]) => (
    <div>
      <p className="text-xs mb-1 font-medium text-tertiary">{title}</p>
      <div className="grid grid-cols-6 gap-0.5">
        {shapes.map((shape) => (
          <ControlButton
            key={shape}
            label={t(shapeLabelKey(shape))}
            active={activeShape === shape}
            onClick={() => onPick(shape)}
          >
            <WhiteboardShapeGlyph shape={shape} className="size-4" />
          </ControlButton>
        ))}
      </div>
    </div>
  );

  return (
    <Popover>
      <Popover.Button
        title={t("page_whiteboard.tools.shapes")}
        aria-label={t("page_whiteboard.tools.shapes")}
        className={cn(CONTROL_BUTTON_CLASS, activeShape && "bg-accent-subtle text-accent-primary")}
        onMouseDown={(event) => event.preventDefault()}
      >
        {activeShape ? <WhiteboardShapeGlyph shape={activeShape} className="size-4" /> : <Shapes className="size-4" />}
      </Popover.Button>
      <Popover.Panel
        side="bottom"
        align="start"
        positionerClassName="z-[130]"
        className={cn(
          PLAIT_ATTACHED_CLASS,
          "flex w-56 flex-col gap-2 rounded-md border border-subtle bg-surface-1 p-2 shadow-raised-200"
        )}
      >
        {renderGroup(t("page_whiteboard.tools.basic_shapes"), WHITEBOARD_BASIC_SHAPES)}
        {renderGroup(t("page_whiteboard.tools.flowchart"), WHITEBOARD_FLOWCHART_SHAPES)}
      </Popover.Panel>
    </Popover>
  );
}

type Props = {
  activeTool: WhiteboardTool;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  canAddImages: boolean;
  uploading: boolean;
  onPickTool: (tool: WhiteboardTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  onPickImages: (files: File[]) => void;
};

export function WhiteboardToolbar({
  activeTool,
  zoom,
  canUndo,
  canRedo,
  canAddImages,
  uploading,
  onPickTool,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFit,
  onPickImages,
}: Props) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesPicked = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Reset so that picking the same file again still fires `change`.
    event.target.value = "";
    if (files.length > 0) onPickImages(files);
  };

  const renderTool = ({ tool, labelKey, icon: Icon }: TToolButton) => (
    <ControlButton key={tool} label={t(labelKey)} active={activeTool === tool} onClick={() => onPickTool(tool)}>
      <Icon className="size-4" />
    </ControlButton>
  );

  return (
    <div
      role="toolbar"
      aria-label={t("page_whiteboard.toolbar")}
      className={cn(
        PLAIT_ATTACHED_CLASS,
        "flex shrink-0 flex-wrap items-center gap-0.5 border-b border-subtle px-2 py-1"
      )}
    >
      {NAVIGATION_TOOLS.map(renderTool)}
      <Divider />
      {CREATION_TOOLS.map(renderTool)}
      <ShapePicker
        activeShape={isWhiteboardShape(activeTool) ? activeTool : null}
        onPick={(shape) => onPickTool(shape)}
      />
      {LINE_TOOLS.map(renderTool)}
      {canAddImages && (
        <>
          <ControlButton label={t("page_whiteboard.tools.image")} onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="size-4" />
          </ControlButton>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept={WHITEBOARD_IMAGE_TYPES.join(",")}
            onChange={handleFilesPicked}
          />
        </>
      )}
      <Divider />
      <ControlButton label={t("page_whiteboard.history.undo")} disabled={!canUndo} onClick={onUndo}>
        <Undo2 className="size-4" />
      </ControlButton>
      <ControlButton label={t("page_whiteboard.history.redo")} disabled={!canRedo} onClick={onRedo}>
        <Redo2 className="size-4" />
      </ControlButton>
      {uploading && (
        <span role="status" className="text-xs ml-2 shrink-0 text-tertiary">
          {t("page_whiteboard.image.uploading")}
        </span>
      )}
      <div role="group" aria-label={t("page_whiteboard.zoom.level")} className="ml-auto flex items-center gap-0.5">
        <button
          type="button"
          title={t("page_whiteboard.zoom.fit")}
          aria-label={t("page_whiteboard.zoom.fit")}
          className="text-xs flex h-7 shrink-0 items-center gap-1 rounded-sm px-1.5 text-secondary hover:bg-layer-transparent-hover"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onFit}
        >
          <Maximize className="size-3.5" />
          <span className="hidden sm:inline">{t("page_whiteboard.zoom.fit")}</span>
        </button>
        <ControlButton label={t("page_whiteboard.zoom.out")} onClick={onZoomOut}>
          <Minus className="size-4" />
        </ControlButton>
        <button
          type="button"
          title={t("page_whiteboard.zoom.reset")}
          aria-label={t("page_whiteboard.zoom.reset")}
          className="text-xs h-7 w-12 shrink-0 rounded-sm text-center text-secondary tabular-nums hover:bg-layer-transparent-hover"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onZoomReset}
        >
          {whiteboardZoomPercent(zoom)}%
        </button>
        <ControlButton label={t("page_whiteboard.zoom.in")} onClick={onZoomIn}>
          <Plus className="size-4" />
        </ControlButton>
      </div>
    </div>
  );
}
