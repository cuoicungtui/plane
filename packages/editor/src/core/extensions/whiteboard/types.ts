export enum EWhiteboardEmbedAttributeNames {
  ID = "id",
  BOARD_IDENTIFIER = "board_identifier",
  PAGE_IDENTIFIER = "page_identifier",
  WORKSPACE_IDENTIFIER = "workspace_identifier",
  SCHEMA_VERSION = "schema_version",
  HEIGHT = "height",
}

export const WHITEBOARD_DEFAULT_HEIGHT = 420;
export const WHITEBOARD_MIN_HEIGHT = 200;
export const WHITEBOARD_MAX_HEIGHT = 1200;

export type TWhiteboardEmbedAttributes = {
  [EWhiteboardEmbedAttributeNames.ID]: string | undefined;
  [EWhiteboardEmbedAttributeNames.BOARD_IDENTIFIER]: string | undefined;
  [EWhiteboardEmbedAttributeNames.PAGE_IDENTIFIER]: string | undefined;
  [EWhiteboardEmbedAttributeNames.WORKSPACE_IDENTIFIER]: string | undefined;
  [EWhiteboardEmbedAttributeNames.SCHEMA_VERSION]: number | undefined;
  // D09: the canvas lives in the page's content flow and is resizable, so the
  // height a user dragged it to belongs to the document, not to the board.
  [EWhiteboardEmbedAttributeNames.HEIGHT]: number | undefined;
};
