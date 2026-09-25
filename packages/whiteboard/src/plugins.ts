import { withGroup } from "@plait/common";
import type { PlaitBoard, PlaitBoardOptions, PlaitI18nBoard, PlaitPlugin } from "@plait/core";
import { DrawI18nKey, withDraw } from "@plait/draw";
import { MindI18nKey, MindThemeColors, withMind } from "@plait/mind";
import type { WhiteboardImages } from "./images";
import { createWithImage } from "./with-image";

/** The placeholder text Plait puts into newly created elements. */
export type WhiteboardLabels = {
  /** A new text box, and the text of a new shape. */
  text: string;
  /** The text of a new connector. */
  lineText: string;
  /** The root node of a new mind map. */
  mindCentral: string;
  /** A summary node of a mind map. */
  mindSummary: string;
};

/** Plait hard-codes Chinese for these, so the board always supplies its own. */
export const DEFAULT_WHITEBOARD_LABELS: WhiteboardLabels = {
  text: "Text",
  lineText: "Text",
  mindCentral: "Central topic",
  mindSummary: "Summary",
};

const LABEL_BY_I18N_KEY: Record<string, keyof WhiteboardLabels> = {
  [DrawI18nKey.geometryText]: "text",
  [DrawI18nKey.lineText]: "lineText",
  [MindI18nKey.mindCentralText]: "mindCentral",
  [MindI18nKey.abstractNodeText]: "mindSummary",
};

/**
 * Plugins for every whiteboard: shapes, connectors, grouping and mind maps.
 *
 * `getLabels` is read each time Plait needs a label, so translations can change
 * without rebuilding the board. `getImages` is read the same way (see `WhiteboardImages`).
 * The image plugin must follow the draw and mind plugins, and `withLabels` replaces the i18n
 * hook that the upstream Drawnix app supplies.
 */
export const createWhiteboardPlugins = (
  getLabels: () => WhiteboardLabels,
  getImages: () => WhiteboardImages | undefined
): PlaitPlugin[] => {
  const withLabels = (board: PlaitBoard): PlaitBoard => {
    (board as PlaitBoard & PlaitI18nBoard).getI18nValue = (key: string) => {
      const label = LABEL_BY_I18N_KEY[key];
      return label ? getLabels()[label] : null;
    };
    return board;
  };
  return [withDraw, withGroup, withMind, createWithImage(getImages), withLabels];
};

/**
 * `Wrapper` reads options once, when the board is created. To change
 * `readonly` afterwards, remount the board (see `WhiteboardCanvas`).
 *
 * `disabledScrollOnNonFocus` lets the page scroll over an unfocused board
 * instead of the board swallowing the wheel.
 */
export const createWhiteboardOptions = (readonly: boolean): PlaitBoardOptions => ({
  readonly,
  hideScrollbar: true,
  disabledScrollOnNonFocus: true,
  themeColors: MindThemeColors,
});
