/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type { EditorRefApi, TEditorAsset } from "@plane/editor";
import type { TPageCommentAnchorType } from "@plane/types";

export type TPageCommentDraft = {
  anchorType: TPageCommentAnchorType;
  anchorId: string;
  anchorBoardId?: string;
  quote?: string;
};

export type TPageEditorInstance = {
  // observables
  assetsList: TEditorAsset[];
  editorRef: EditorRefApi | null;
  commentDraft: TPageCommentDraft | null;
  focusedCommentAnchor: { anchorType: TPageCommentAnchorType; anchorId: string; nonce: number } | null;
  // actions
  setCommentDraft: (draft: TPageCommentDraft | null) => void;
  focusCommentAnchor: (anchorType: TPageCommentAnchorType, anchorId: string) => void;
  setEditorRef: (editorRef: EditorRefApi | null) => void;
  updateAssetsList: (assets: TEditorAsset[]) => void;
};

export class PageEditorInstance implements TPageEditorInstance {
  // observables
  editorRef: EditorRefApi | null = null;
  assetsList: TEditorAsset[] = [];
  commentDraft: TPageCommentDraft | null = null;
  focusedCommentAnchor: TPageEditorInstance["focusedCommentAnchor"] = null;

  constructor() {
    makeObservable(this, {
      // observables
      editorRef: observable.ref,
      assetsList: observable,
      commentDraft: observable.ref,
      focusedCommentAnchor: observable.ref,
      // actions
      setCommentDraft: action,
      focusCommentAnchor: action,
      setEditorRef: action,
      updateAssetsList: action,
    });
  }

  setEditorRef: TPageEditorInstance["setEditorRef"] = (editorRef) => {
    runInAction(() => {
      this.editorRef = editorRef;
    });
  };

  updateAssetsList: TPageEditorInstance["updateAssetsList"] = (assets) => {
    runInAction(() => {
      this.assetsList = assets;
    });
  };

  setCommentDraft: TPageEditorInstance["setCommentDraft"] = (draft) => {
    this.commentDraft = draft;
  };

  focusCommentAnchor: TPageEditorInstance["focusCommentAnchor"] = (anchorType, anchorId) => {
    this.focusedCommentAnchor = { anchorType, anchorId, nonce: Date.now() };
  };
}
