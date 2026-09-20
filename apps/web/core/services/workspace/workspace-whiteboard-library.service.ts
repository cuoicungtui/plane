/**
 * The shared Excalidraw Library for a workspace: one set of library items
 * synced across every whiteboard embed and every member of the workspace.
 */
import { API_BASE_URL } from "@plane/constants";

import { APIService } from "@/services/api.service";

export type TWorkspaceWhiteboardLibrary = {
  id: string;
  workspace: string;
  library_items: unknown[];
  created_at: string;
  updated_at: string;
};

export class WorkspaceWhiteboardLibraryService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private url(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/whiteboard-library/`;
  }

  async retrieve(workspaceSlug: string) {
    return this.get(this.url(workspaceSlug)).then((response) => response.data as TWorkspaceWhiteboardLibrary);
  }

  async update(workspaceSlug: string, libraryItems: unknown[]) {
    return this.put(this.url(workspaceSlug), { library_items: libraryItems }).then(
      (response) => response.data as TWorkspaceWhiteboardLibrary
    );
  }
}

export const workspaceWhiteboardLibraryService = new WorkspaceWhiteboardLibraryService();
