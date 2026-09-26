/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TPageComment } from "@plane/types";
import { Avatar } from "@plane/ui";
import { calculateTimeAgo, getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// local imports
import { CommentComposer } from "./comment-composer";

type Props = {
  comment: TPageComment;
  canDelete: boolean;
  canEdit: boolean;
  /** Deleting the first comment of a thread takes its replies with it. */
  deletesReplies?: boolean;
  onDelete: () => Promise<void>;
  onEdit: (body: string) => Promise<void>;
};

export const PageCommentItem = observer(function PageCommentItem(props: Props) {
  const { comment, canDelete, canEdit, deletesReplies, onDelete, onEdit } = props;
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const author = getUserDetails(comment.actor);

  return (
    <div className="flex gap-2">
      <Avatar size="sm" name={author?.display_name} src={getFileURL(author?.avatar_url ?? "")} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-12 font-medium">{author?.display_name ?? "—"}</span>
          <span className="text-11 text-tertiary">{calculateTimeAgo(comment.created_at)}</span>
          {comment.edited_at && <span className="text-11 text-tertiary">({t("page_comments.edited")})</span>}
        </div>
        {isEditing ? (
          <CommentComposer
            focusOnMount
            initialValue={comment.body}
            submitLabel={t("page_comments.save")}
            onCancel={() => setIsEditing(false)}
            onSubmit={async (body) => {
              await onEdit(body);
              setIsEditing(false);
            }}
          />
        ) : (
          <>
            <p className="mt-0.5 text-13 break-words whitespace-pre-wrap">{comment.body}</p>
            {(canEdit || canDelete) && (
              <div className="mt-1 flex gap-3 text-11 text-tertiary">
                {canEdit && (
                  <button type="button" className="hover:text-primary" onClick={() => setIsEditing(true)}>
                    {t("page_comments.edit")}
                  </button>
                )}
                {canDelete && !isConfirmingDelete && (
                  <button
                    type="button"
                    className="hover:text-danger-primary"
                    onClick={() => setIsConfirmingDelete(true)}
                  >
                    {t("page_comments.delete")}
                  </button>
                )}
              </div>
            )}
            {canDelete && isConfirmingDelete && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-11">
                <span className="text-secondary">
                  {t(deletesReplies ? "page_comments.delete_confirm_thread" : "page_comments.delete_confirm")}
                </span>
                <button
                  type="button"
                  className="font-medium text-danger-primary"
                  onClick={() => {
                    setIsConfirmingDelete(false);
                    void onDelete();
                  }}
                >
                  {t("page_comments.delete_yes")}
                </button>
                <button
                  type="button"
                  className="text-tertiary hover:text-primary"
                  onClick={() => setIsConfirmingDelete(false)}
                >
                  {t("page_comments.cancel")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
