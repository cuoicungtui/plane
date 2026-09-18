export enum EWhiteboardEmbedAttributeNames {
  ID = "id",
  BOARD_IDENTIFIER = "board_identifier",
  PAGE_IDENTIFIER = "page_identifier",
  WORKSPACE_IDENTIFIER = "workspace_identifier",
  SCHEMA_VERSION = "schema_version",
}

export type TWhiteboardEmbedAttributes = {
  [EWhiteboardEmbedAttributeNames.ID]: string | undefined;
  [EWhiteboardEmbedAttributeNames.BOARD_IDENTIFIER]: string | undefined;
  [EWhiteboardEmbedAttributeNames.PAGE_IDENTIFIER]: string | undefined;
  [EWhiteboardEmbedAttributeNames.WORKSPACE_IDENTIFIER]: string | undefined;
  [EWhiteboardEmbedAttributeNames.SCHEMA_VERSION]: number | undefined;
};
