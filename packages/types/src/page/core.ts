/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";
import type { EPageAccess } from "../enums";
import type { TPageExtended } from "./extended";

export type TPage = {
  access: EPageAccess | undefined;
  archived_at: string | null | undefined;
  color: string | undefined;
  created_at: Date | undefined;
  created_by: string | undefined;
  description_json: object | undefined;
  description_html: string | undefined;
  id: string | undefined;
  is_favorite: boolean;
  is_locked: boolean;
  label_ids: string[] | undefined;
  name: string | undefined;
  owned_by: string | undefined;
  project_ids?: string[] | undefined;
  updated_at: Date | undefined;
  updated_by: string | undefined;
  workspace: string | undefined;
  logo_props: TLogoProps | undefined;
  deleted_at: Date | undefined;
  parent?: string | null;
  sort_order?: number;
  verified_at?: string | null;
  verified_by?: string | null;
  verify_expires_at?: string | null;
} & TPageExtended;

export type TPageBacklink = {
  id: string;
  name: string | null;
  logo_props: TLogoProps | null;
  updated_at: string;
};

export type TPageCommentAnchorType = "block" | "text" | "board_element";

export type TPageComment = {
  id: string;
  page: string;
  parent: string | null;
  actor: string;
  body: string;
  anchor_type: TPageCommentAnchorType | "";
  anchor_id: string;
  anchor_board_id: string;
  quote: string;
  resolved_at: string | null;
  resolved_by: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TPageCommentCreatePayload = {
  body: string;
  parent?: string;
  anchor_type?: TPageCommentAnchorType;
  anchor_id?: string;
  anchor_board_id?: string;
  quote?: string;
};

export type TPageVerification = Pick<TPage, "verified_at" | "verified_by" | "verify_expires_at">;

export type TPagePositionPayload = {
  parent_id: string | null;
  prev_sibling_id: string | null;
};

export type TPagePositionResponse = {
  id: string;
  parent: string | null;
  sort_order: number;
  renumbered: Record<string, number>;
};

// page filters
export type TPageNavigationTabs = "public" | "private" | "archived";

export type TPageFiltersSortKey = "name" | "created_at" | "updated_at" | "opened_at";

export type TPageFiltersSortBy = "asc" | "desc";

export type TPageFilterProps = {
  created_at?: string[] | null;
  created_by?: string[] | null;
  favorites?: boolean;
  labels?: string[] | null;
};

export type TPageFilters = {
  searchQuery: string;
  sortKey: TPageFiltersSortKey;
  sortBy: TPageFiltersSortBy;
  filters?: TPageFilterProps;
};

export type TPageEmbedType = "mention" | "issue";

export type TPageVersion = {
  created_at: string;
  created_by: string;
  deleted_at: string | null;
  description_binary?: string | null;
  description_html?: string | null;
  description_json?: object;
  id: string;
  last_saved_at: string;
  owned_by: string;
  page: string;
  updated_at: string;
  updated_by: string;
  workspace: string;
};

export type TDocumentPayload = {
  description_binary: string;
  description_html: string;
  description_json: object;
};

export type TWebhookConnectionQueryParams = {
  documentType: "project_page" | "team_page" | "workspace_page";
  projectId?: string;
  teamId?: string;
  workspaceSlug: string;
};
