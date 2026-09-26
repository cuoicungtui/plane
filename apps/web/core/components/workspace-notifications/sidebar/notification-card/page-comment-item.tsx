/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Avatar, Row } from "@plane/ui";
import { cn, calculateTimeAgo, renderFormattedDate, renderFormattedTime, getFileURL } from "@plane/utils";
// hooks
import { useWorkspaceNotifications } from "@/hooks/store/notifications";
import { useNotification } from "@/hooks/store/notifications/use-notification";
// local imports
import { NotificationOption } from "./options";

type TPageCommentNotificationData = {
  page?: { id: string; name: string };
  comment?: { id: string; root_id: string; snippet: string };
  kind?: "mention" | "reply";
};

type Props = {
  workspaceSlug: string;
  notificationId: string;
};

export const PageCommentNotificationItem = observer(function PageCommentNotificationItem(props: Props) {
  const { workspaceSlug, notificationId } = props;
  // hooks
  const { t } = useTranslation();
  const router = useRouter();
  const { currentSelectedNotificationId, setCurrentSelectedNotificationId } = useWorkspaceNotifications();
  const { asJson: notification, markNotificationAsRead } = useNotification(notificationId);
  // states
  const [isSnoozeStateModalOpen, setIsSnoozeStateModalOpen] = useState(false);
  const [customSnoozeModal, setCustomSnoozeModal] = useState(false);

  const data = notification?.data as unknown as TPageCommentNotificationData | undefined;
  const pageId = data?.page?.id;
  const projectId = notification?.project;
  const triggeredBy = notification?.triggered_by_details;
  const actorName = triggeredBy?.display_name || triggeredBy?.first_name || "";

  if (!notification?.id || !pageId || !projectId) return <></>;

  const handleOpen = async () => {
    if (isSnoozeStateModalOpen || customSnoozeModal) return;
    setCurrentSelectedNotificationId(notificationId);
    if (notification.read_at === null) {
      try {
        await markNotificationAsRead(workspaceSlug);
      } catch (error) {
        console.error(error);
      }
    }
    router.push(`/${workspaceSlug}/projects/${projectId}/pages/${pageId}?paneTab=comments`);
  };

  return (
    <Row
      className={cn(
        "group relative flex cursor-pointer items-center gap-2 border-b border-subtle py-4 transition-all",
        {
          "bg-layer-1/30": currentSelectedNotificationId === notification.id,
          "bg-accent-primary/5": notification.read_at === null,
        }
      )}
      onClick={handleOpen}
    >
      {notification.read_at === null && (
        <div className="absolute top-[50%] left-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-primary" />
      )}

      <div className="relative flex w-full gap-2">
        <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-layer-1">
          {triggeredBy && (
            <Avatar
              name={actorName}
              src={getFileURL(triggeredBy.avatar_url)}
              size={42}
              shape="circle"
              className="bg-layer-1 text-body-sm-medium"
            />
          )}
        </div>

        <div className="-mt-2 w-full space-y-1">
          <div className="relative flex h-8 items-center gap-3">
            <div className="line-clamp-1 w-full truncate overflow-hidden text-body-xs-medium break-all whitespace-normal text-primary">
              <span className="text-secondary">
                {t(
                  data?.kind === "mention"
                    ? "notification.page_comment.mentioned"
                    : "notification.page_comment.replied",
                  {
                    name: actorName,
                  }
                )}
              </span>{" "}
              <span className="font-medium text-primary">{data?.page?.name}</span>
            </div>
            <NotificationOption
              workspaceSlug={workspaceSlug}
              notificationId={notification.id}
              isSnoozeStateModalOpen={isSnoozeStateModalOpen}
              setIsSnoozeStateModalOpen={setIsSnoozeStateModalOpen}
              customSnoozeModal={customSnoozeModal}
              setCustomSnoozeModal={setCustomSnoozeModal}
            />
          </div>

          <div className="relative flex items-center gap-3 text-caption-sm-regular text-secondary">
            <div className="line-clamp-1 w-full truncate overflow-hidden break-words whitespace-normal">
              {data?.comment?.snippet}
            </div>
            <div className="flex-shrink-0">
              {notification.snoozed_till ? (
                <p className="flex flex-shrink-0 items-center justify-end gap-x-1 text-tertiary">
                  <Clock className="h-4 w-4" />
                  <span>
                    {renderFormattedDate(notification.snoozed_till)},&nbsp;
                    {renderFormattedTime(notification.snoozed_till, "12-hour")}
                  </span>
                </p>
              ) : (
                <p className="mt-auto flex-shrink-0 text-tertiary">
                  {notification.created_at && calculateTimeAgo(notification.created_at)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Row>
  );
});
