/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export enum ETaskItemAttributeNames {
  CHECKED = "checked",
  ENTITY_IDENTIFIER = "entity_identifier",
  IS_CREATING = "is_creating",
}

export type TTaskItemAttributes = {
  [ETaskItemAttributeNames.CHECKED]: boolean;
  // set once the checklist item has been auto-created as a real work item
  // (D18: triggered by @mentioning a user inside the item, never on plain text)
  [ETaskItemAttributeNames.ENTITY_IDENTIFIER]: string | null;
  // true while an onAutoCreate call for this item is in flight. Persisted on
  // the node (not a component ref) so the guard survives the NodeView being
  // torn down and remounted mid-request, e.g. by an Enter-split transaction.
  [ETaskItemAttributeNames.IS_CREATING]: boolean;
};
