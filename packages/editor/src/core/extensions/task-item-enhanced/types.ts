/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export enum ETaskItemAttributeNames {
  CHECKED = "checked",
  ENTITY_IDENTIFIER = "entity_identifier",
}

export type TTaskItemAttributes = {
  [ETaskItemAttributeNames.CHECKED]: boolean;
  // set once the checklist item has been auto-created as a real work item
  // (D18: triggered by @mentioning a user inside the item, never on plain text)
  [ETaskItemAttributeNames.ENTITY_IDENTIFIER]: string | null;
};
