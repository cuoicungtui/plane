/**
 * Page-owned whiteboard API client. The document editor persists only the
 * board ID; the scene is fetched and saved through this service.
 */
import { API_BASE_URL } from "@plane/constants";

import { APIService } from "@/services/api.service";

export type TPageWhiteboard = {
  id: string;
  page: string;
  workspace: string;
  engine: "excalidraw";
  schema_version: number;
  scene: Record<string, unknown>;
  asset_ids: string[];
  revision: number;
  creation_key: string | null;
  created_at: string;
  updated_at: string;
};

export type TCreatePageWhiteboardPayload = Pick<TPageWhiteboard, "scene" | "asset_ids"> & {
  creation_key: string;
  engine?: "excalidraw";
  schema_version?: number;
};

export type TUpdatePageWhiteboardPayload = Partial<Pick<TPageWhiteboard, "scene" | "asset_ids" | "schema_version">> & {
  expected_revision: number;
};

export class PageWhiteboardService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private url(workspaceSlug: string, projectId: string, pageId: string, boardId?: string) {
    const base = `/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/whiteboards/`;
    return boardId ? `${base}${boardId}/` : base;
  }

  async create(workspaceSlug: string, projectId: string, pageId: string, payload: TCreatePageWhiteboardPayload) {
    return this.post(this.url(workspaceSlug, projectId, pageId), payload).then((response) => response.data as TPageWhiteboard);
  }

  async retrieve(workspaceSlug: string, projectId: string, pageId: string, boardId: string) {
    return this.get(this.url(workspaceSlug, projectId, pageId, boardId)).then((response) => response.data as TPageWhiteboard);
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    boardId: string,
    payload: TUpdatePageWhiteboardPayload
  ) {
    return this.patch(this.url(workspaceSlug, projectId, pageId, boardId), payload).then(
      (response) => response.data as TPageWhiteboard
    );
  }
}
